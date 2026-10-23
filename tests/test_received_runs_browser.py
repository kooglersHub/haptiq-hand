"""Compatibility entrypoint for the shared browser test runner."""

import subprocess
import sys
from pathlib import Path

if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    raise SystemExit(
        subprocess.call(
            [
                sys.executable,
                str(root / "scripts/test-browser.py"),
                "--suite",
                "test_received_runs_browser.js",
            ]
        )
    )
