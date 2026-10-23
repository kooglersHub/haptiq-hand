"""Local telemetry bridge for the 3D RH56DFTP hand viewer.

Start: python bridge_server.py
Viewer: http://127.0.0.1:18765/
Python program: POST JSON to http://127.0.0.1:18765/api/state

The server NEVER opens a Modbus connection or sends commands to hardware.
No third-party dependencies. Listens ONLY on 127.0.0.1.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import time
from copy import deepcopy
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from haptiq.capture.runs import ReceivedRuns
from haptiq.server.config import HOST, PORT, WORKSPACE, source_signature
from haptiq.server.state import ApplicationState
from haptiq.server.validation import normalize
from haptiq.settings import VIEWER_DIRECTORY, data_directory
from haptiq.tactile import REGIONS

SERVER_SIGNATURE = source_signature()

TAXEL_IDS = {f"{key}:{i}" for key, (rows, cols) in REGIONS.items() for i in range(rows * cols)}
HTML = VIEWER_DIRECTORY / "hand_twin_6dof.html"
TACTILE_HTML = VIEWER_DIRECTORY / "tactile_2d.html"


def identification_service(server):
    # Optional numerical dependencies are loaded only when estimation is requested.
    with server.app_state.service_lock:
        if not hasattr(server, "sensor_identification"):
            from haptiq.estimation.web_service import IdentificationService

            server.sensor_identification = IdentificationService(server.estimation_directory)
        return server.sensor_identification


def received_runs(server):
    # Callers hold the instance state lock, including initialization.
    if not hasattr(server, "received_runs"):
        server.received_runs = ReceivedRuns(server.capture_directory)
    return server.received_runs


STATIC_FILES = {
    "/sensor_identification/" + name
    for name in ("measurements.js", "history.js", "boundaries.js", "runs.js")
} | {
    "/frontend/" + name
    for name in (
        "runtime.js",
        "api_client.js",
        "estimate_feedback.js",
        "layout.js",
        "application.js",
        "candidates.js",
    )
}


class HandServer(ThreadingHTTPServer):
    """Own all mutable state and resources for one local HTTP listener."""

    def __init__(self, address, *, capture_directory=None, estimation_directory=None, view="3d"):
        self.app_state = ApplicationState()
        self.capture_directory = Path(
            capture_directory
            or os.environ.get("HAND_CAPTURE_DIR")
            or data_directory() / "received_runs"
        )
        self.estimation_directory = Path(estimation_directory or data_directory() / "estimation")
        self.viewer_html = TACTILE_HTML if view == "tactile" else HTML
        super().__init__(address, Handler)

    def server_close(self):
        # Finish request handlers before flushing their capture resource.
        super().server_close()
        with self.app_state.lock:
            if hasattr(self, "received_runs"):
                self.received_runs.close()


def create_server(host=HOST, port=PORT, **options):
    """Construct without starting threads; tests use port=0 and own teardown."""
    return HandServer((host, port), **options)


class Handler(BaseHTTPRequestHandler):
    server_version = "HandTwinBridge/1.0"

    def log_message(self, *args):
        pass

    def send_data(self, body, code=200, ctype="application/json; charset=utf-8"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache, no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def respond_json(self, data, code=200):
        self.send_data(json.dumps(data, ensure_ascii=False, allow_nan=False).encode("utf-8"), code)

    def do_OPTIONS(self):
        self.send_data(b"", 204)

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path in STATIC_FILES:
            self.send_data(
                VIEWER_DIRECTORY.joinpath(url.path.lstrip("/")).read_bytes(),
                ctype="text/javascript; charset=utf-8",
            )
            return
        if url.path == "/api/candidates":
            from haptiq.candidates import load_catalog

            self.respond_json([candidate.metadata() for candidate in load_catalog()])
            return
        if url.path == "/api/probing-runs" or url.path.startswith("/api/probing-runs/"):
            try:
                with self.server.app_state.lock:
                    capture = received_runs(self.server)
                    if url.path == "/api/probing-runs":
                        data = capture.snapshot()
                    else:
                        data = capture.read(url.path.removeprefix("/api/probing-runs/"))
                if isinstance(data, bytes):
                    self.send_data(data, ctype="text/csv; charset=utf-8")
                else:
                    self.respond_json(data)
            except FileNotFoundError:
                self.respond_json({"error": "Capture not found"}, 404)
            except (OSError, ValueError) as error:
                self.respond_json({"error": str(error)}, 400)
            return
        if url.path in ("/api/identification", "/identification/report"):
            try:
                service = identification_service(self.server)
                if url.path == "/api/identification":
                    self.respond_json(service.snapshot())
                else:
                    report = service.report()
                    if report is None:
                        self.respond_json({"error": "Run identification first"}, 404)
                    else:
                        self.send_data(report, ctype="text/html; charset=utf-8")
            except ImportError:
                self.respond_json(
                    {"error": "Install geometry tools: uv sync --extra sensor-identification"}, 503
                )
            return
        if url.path in ("/api/taxels", "/api/taxels/"):
            try:
                after = float(parse_qs(url.query).get("after", ["0"])[0])
                if not math.isfinite(after):
                    raise ValueError("Invalid after timestamp")
            except ValueError:
                self.respond_json({"error": "Invalid after timestamp"}, 400)
                return
            with self.server.app_state.lock:
                fresh = (
                    0 <= time.time() - self.server.app_state.taxels_received_at <= 4
                    and self.server.app_state.taxels_received_at > after
                )
                points = deepcopy(self.server.app_state.taxels) if fresh else []
            self.respond_json(points)
        elif self.path in ("/tactile", "/tactile/", "/tactile_2d.html"):
            try:
                self.send_data(TACTILE_HTML.read_bytes(), 200, "text/html; charset=utf-8")
            except FileNotFoundError:
                self.respond_json(
                    {"error": "2D map missing: restore tactile_2d.html from the package"}, 404
                )
        elif self.path in ("/3d", "/hand_twin_6dof.html"):
            try:
                self.send_data(
                    (VIEWER_DIRECTORY / "hand_twin_6dof.html").read_bytes(),
                    200,
                    "text/html; charset=utf-8",
                )
            except FileNotFoundError:
                self.respond_json({"error": "3D viewer missing"}, 404)
        elif self.path in ("/", "/index.html"):
            try:
                self.send_data(
                    self.server.viewer_html.read_bytes(), 200, "text/html; charset=utf-8"
                )
            except FileNotFoundError:
                self.respond_json({"error": "HTML file not found"}, 404)
        elif self.path in ("/api/state", "/api/state/"):
            with self.server.app_state.lock:
                self.respond_json(dict(self.server.app_state.telemetry))
        elif self.path == "/health":
            self.respond_json(
                {
                    "status": "ok",
                    "mode": "read-only-from-hand",
                    "workspace": str(WORKSPACE),
                    "pid": os.getpid(),
                    "source_signature": SERVER_SIGNATURE,
                }
            )
        else:
            self.respond_json({"error": "Not found"}, 404)

    def do_POST(self):
        if self.path == "/api/probing-runs":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 1 <= length <= 128:
                    raise ValueError("Expected a capture action")
                request = json.loads(self.rfile.read(length))
                origin = self.headers.get("Origin")
                if origin is not None and origin not in (
                    f"http://127.0.0.1:{self.server.server_port}",
                    f"http://localhost:{self.server.server_port}",
                ):
                    self.respond_json({"error": "Use the local capture controls"}, 403)
                    return
                if not isinstance(request, dict) or request.get("action") not in (
                    "start",
                    "finish",
                    "auto",
                ):
                    raise ValueError("Expected start or finish")
                with self.server.app_state.lock:
                    capture = received_runs(self.server)
                    if request["action"] == "auto":
                        if type(request.get("enabled")) is not bool:
                            raise ValueError("Expected boolean enabled")
                        capture.set_auto(request["enabled"])
                    elif request["action"] == "start":
                        capture.start_manual()
                    else:
                        capture.finish_manual()
                    result = capture.snapshot()
                self.respond_json(result)
            except (OSError, ValueError, UnicodeDecodeError) as error:
                self.respond_json({"error": str(error)}, 400)
            return
        if self.path == "/api/identification":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 1 <= length <= 8 * 1024 * 1024:
                    raise ValueError("Identification JSON must be 1 byte..8 MiB")
                origin = self.headers.get("Origin")
                if origin is not None and origin not in (
                    f"http://127.0.0.1:{self.server.server_port}",
                    f"http://localhost:{self.server.server_port}",
                ):
                    # Consume the bounded body so Windows can deliver the 403
                    # before closing, rather than resetting an unread socket.
                    self.rfile.read(length)
                    self.respond_json({"error": "Open identification in the local simulation"}, 403)
                    return
                request = json.loads(self.rfile.read(length))
                service = identification_service(self.server)
                state = service.start(request)
                self.respond_json(state if state else service.snapshot(), 202 if state else 409)
            except ImportError:
                self.respond_json(
                    {"error": "Install geometry tools: uv sync --extra sensor-identification"}, 503
                )
            except (TypeError, ValueError, UnicodeDecodeError) as error:
                self.respond_json({"error": str(error)}, 400)
            return
        if self.path in ("/api/taxels", "/api/taxels/"):
            self.receive_taxels()
            return
        if self.path not in ("/api/state", "/api/state/"):
            self.respond_json({"error": "Not found"}, 404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 1 <= length <= 65536:
                raise ValueError("JSON must contain 1 to 65536 bytes")
            msg = json.loads(self.rfile.read(length))
            changes = normalize(msg)
            with self.server.app_state.lock:
                if "angles" in changes and "angles_set" not in changes:
                    changes["angles_set"] = changes.pop("angles")
                changes.pop("angles", None)
                now = time.time()
                self.server.app_state.telemetry["field_received_at"] = {
                    **self.server.app_state.telemetry["field_received_at"],
                    **{key: now for key in changes},
                }
                # A new position snapshot explicitly invalidates absent actual values.
                if "angles_set" in changes and "angles_act" not in changes:
                    changes["angles_act"] = None
                    self.server.app_state.telemetry["field_received_at"]["angles_act"] = 0
                self.server.app_state.telemetry.update(changes)
                self.server.app_state.telemetry["received_at"] = time.time()
                self.server.app_state.telemetry["seq"] += 1
                seq = self.server.app_state.telemetry["seq"]
                received_runs(self.server).add(changes, now)
            self.respond_json({"ok": True, "seq": seq})
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            self.respond_json({"ok": False, "error": str(exc)}, 400)

    def receive_taxels(self):
        """Cache viewer positions/pressure; never recompute FK or alter telemetry."""
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 1 <= length <= 8 * 1024 * 1024:
                raise ValueError("Taxel JSON must contain 1 to 524288 bytes")
            points = json.loads(self.rfile.read(length))
            if not isinstance(points, list) or len(points) != len(TAXEL_IDS):
                raise ValueError("Expected all 1062 taxel positions")
            for p in points:
                if (
                    not isinstance(p, dict)
                    or set(p) != {"id", "x", "y", "z", "pressure"}
                    or not isinstance(p["id"], str)
                ):
                    raise ValueError("Expected {id,x,y,z,pressure} for each taxel")
                if any(
                    isinstance(p[k], bool)
                    or not isinstance(p[k], (int, float))
                    or not math.isfinite(p[k])
                    for k in ("x", "y", "z")
                ):
                    raise ValueError("Taxel coordinates must be finite numbers")
                value = p["pressure"]
                if value is not None and (
                    isinstance(value, bool)
                    or not isinstance(value, (int, float))
                    or not math.isfinite(value)
                    or not 0 <= value <= 4095
                ):
                    raise ValueError("Pressure must be null or a finite number in 0..4095")
            if {p["id"] for p in points} != TAXEL_IDS:
                raise ValueError("Taxel IDs are missing, duplicated, or unknown")
            with self.server.app_state.lock:
                self.server.app_state.taxels = points
                self.server.app_state.taxels_received_at = time.time()
            self.respond_json({"ok": True})
        except (ValueError, UnicodeDecodeError) as exc:
            self.respond_json({"error": str(exc)}, 400)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Read-only telemetry bridge for RH56DFTP viewer")
    ap.add_argument("--port", type=int, default=PORT)
    ap.add_argument("--open-browser", action="store_true", help="Open the local viewer")
    ap.add_argument("--view", choices=["3d", "tactile"], default="3d")
    args = ap.parse_args(argv)
    if not 1 <= args.port <= 65535:
        ap.error("Invalid TCP port")
    server = create_server(port=args.port, view=args.view)
    print(f"Hand viewer ({args.view}) available at: http://127.0.0.1:{args.port}/", flush=True)
    print(f"POST endpoint: http://127.0.0.1:{args.port}/api/state (localhost only)", flush=True)
    print("This bridge does NOT send motor commands.", flush=True)
    if args.open_browser:
        import webbrowser

        webbrowser.open(f"http://127.0.0.1:{args.port}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
