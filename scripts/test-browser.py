"""Run each browser integration with an isolated, temporary HTTP server."""

import argparse
import os
import subprocess
import tempfile
import threading
from pathlib import Path

from haptiq.server.http import create_server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--suite", help="Run one test_*_browser.js filename")
    parser.add_argument(
        "--artifacts", type=Path, help="Keep per-suite screenshots in this directory"
    )
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    suites = sorted((root / "tests").glob("test_*_browser.js"))
    if args.suite:
        suites = [suite for suite in suites if suite.name == args.suite]
        if not suites:
            parser.error("Unknown browser suite")
    failures = []
    for suite in suites:
        with tempfile.TemporaryDirectory(prefix="haptiq-browser-") as folder:
            server = create_server(
                port=0,
                capture_directory=Path(folder) / "captures",
                estimation_directory=Path(folder) / "estimation",
            )
            artifacts = args.artifacts.resolve() / suite.stem if args.artifacts else Path(folder)
            artifacts.mkdir(parents=True, exist_ok=True)
            worker = threading.Thread(target=server.serve_forever, daemon=True)
            worker.start()
            try:
                env = {
                    **os.environ,
                    "TEST_RECEIVER_URL": f"http://127.0.0.1:{server.server_port}",
                    "HAND_VIEWER_ARTIFACT_DIR": str(artifacts),
                    "HAND_VERIFICATION_DIR": str(artifacts),
                }
                print(f"Browser suite: {suite.name}", flush=True)
                result = subprocess.run(["node", str(suite)], cwd=root, env=env, timeout=240)
                if result.returncode:
                    failures.append(suite.name)
            except subprocess.TimeoutExpired:
                failures.append(suite.name + " (timeout)")
            finally:
                server.shutdown()
                server.server_close()
                worker.join(timeout=5)
    print(f"{len(suites)} browser suites; {len(failures)} failures")
    if failures:
        raise SystemExit("Failed: " + ", ".join(failures))


if __name__ == "__main__":
    main()
