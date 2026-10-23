"""Behavioral guarantees at the package, server and candidate boundaries."""

import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.request import ProxyHandler, Request, build_opener

from haptiq.candidates import load_catalog
from haptiq.estimation.classifier import identify_sensor
from haptiq.server.http import create_server
from haptiq.telemetry.receiver import RobotHandController


class ArchitectureTests(unittest.TestCase):
    def test_two_servers_do_not_share_telemetry_taxels_or_capture_state(self):
        opener = build_opener(ProxyHandler({}))
        with tempfile.TemporaryDirectory() as folder:
            servers = [
                create_server(port=0, capture_directory=Path(folder) / str(i)) for i in range(2)
            ]
            workers = [
                threading.Thread(target=server.serve_forever, daemon=True) for server in servers
            ]
            for worker in workers:
                worker.start()
            try:
                base = f"http://127.0.0.1:{servers[0].server_port}"
                with opener.open(
                    Request(
                        base + "/api/state",
                        json.dumps({"angles_act": [123] * 6}).encode(),
                        {"Content-Type": "application/json"},
                    )
                ) as response:
                    self.assertEqual(response.status, 200)
                with opener.open(
                    f"http://127.0.0.1:{servers[1].server_port}/api/state"
                ) as response:
                    self.assertIsNone(json.load(response)["angles_act"])
                servers[0].app_state.taxels.append({"id": "fixture"})
                self.assertEqual(servers[1].app_state.taxels, [])
                self.assertEqual(servers[1].app_state.telemetry["seq"], 0)
                self.assertNotEqual(servers[0].capture_directory, servers[1].capture_directory)
            finally:
                for server in servers:
                    server.shutdown()
                    server.server_close()
                for worker in workers:
                    worker.join()

    def test_catalog_rejects_duplicate_identity_and_changed_cad(self):
        candidates = load_catalog()
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            records = [candidate.metadata() for candidate in candidates]
            records[1]["id"] = records[0]["id"]
            (root / "catalog.json").write_text(json.dumps(records), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "unique"):
                load_catalog(root)
            (root / candidates[0].file).write_bytes(b"changed geometry")
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                candidates[0].source(root)

    def test_three_candidates_keep_the_ambiguity_gate(self):
        # All candidates must be considered even though identity lacks contact evidence.
        result = identify_sensor([], {"small": object(), "medium": object(), "large": object()})
        self.assertEqual(result["classification"], "AMBIGUOUS")
        self.assertEqual(result["reason"], "insufficient_contacts")

    def test_raw_matrix_requires_explicit_pressure_validity(self):
        from haptiq.server.validation import normalize

        packet = {"angles": [500] * 6, "tactile_matrix": [[123] * 17 for _ in range(112)]}
        self.assertEqual(normalize(packet)["tactile_regions"], {})
        packet["tactile_valid"] = [True] * 17
        self.assertEqual(len(normalize(packet)["tactile_regions"]), 17)
        packet["tactile_valid"][0] = "yes"
        with self.assertRaises(ValueError):
            normalize(packet)

    def test_launcher_reuses_only_current_workspace_and_rejects_foreign_port(self):
        from haptiq.server import launcher

        with (
            patch.object(
                launcher,
                "read_state",
                return_value={"workspace": str(launcher.WORKSPACE), "source_signature": "current"},
            ),
            patch.object(launcher, "source_signature", return_value="current"),
            patch.object(launcher, "stop_stale_server") as stop,
            patch.object(launcher.webbrowser, "open") as browser,
        ):
            launcher.main(["--no-browser"])
            stop.assert_not_called()
            browser.assert_not_called()
        with (
            patch.object(launcher, "read_state", return_value={"workspace": "unrelated"}),
            patch.object(launcher, "stop_stale_server") as stop,
        ):
            with self.assertRaisesRegex(RuntimeError, "another application"):
                launcher.main(["--no-browser"])
            stop.assert_not_called()

    def test_receiver_cli_parses_without_opening_hardware(self):
        from haptiq import main

        with patch.object(main, "main") as loop:
            main.cli(["--hand-ip", "127.0.0.2", "--hand-port", "6500", "--mock"])
        settings = loop.call_args.args[0]
        self.assertEqual(
            (settings.hand_ip, settings.hand_port, settings.mock), ("127.0.0.2", 6500, True)
        )

    def test_receivers_do_not_share_mutable_measurements(self):
        with patch("haptiq.telemetry.receiver.ModbusTcpClient"):
            first = RobotHandController(mock=True)
            second = RobotHandController(mock=True)
        self.assertIsNot(first.results, second.results)


if __name__ == "__main__":
    unittest.main()
