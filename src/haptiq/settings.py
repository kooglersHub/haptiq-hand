"""Runtime paths and endpoints, independent of the current working directory."""

import math
import os
from dataclasses import dataclass
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parent
MODEL_DIRECTORY = PACKAGE_ROOT / "assets" / "models"
VIEWER_DIRECTORY = PACKAGE_ROOT / "digital_twin"
HOST = "127.0.0.1"
PORT = 18765
URL = f"http://{HOST}:{PORT}"


def workspace_root():
    for parent in PACKAGE_ROOT.parents:
        if (parent / "pyproject.toml").is_file() and (parent / "src" / "haptiq").is_dir():
            return parent
    return PACKAGE_ROOT


def data_directory():
    configured = os.environ.get("HAND_DATA_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path.home() / "Documents" / "ChatGPT" / "hand" / "probing_situations"


@dataclass(frozen=True)
class Settings:
    hand_ip: str = "192.168.123.210"
    hand_port: int = 6000
    viewer_url: str = URL
    step_seconds: float = 0.03
    mock: bool = False

    def __post_init__(self):
        if not isinstance(self.hand_ip, str) or not self.hand_ip.strip():
            raise ValueError("HAND_IP must be nonempty")
        if (
            isinstance(self.hand_port, bool)
            or not isinstance(self.hand_port, int)
            or not 1 <= self.hand_port <= 65535
        ):
            raise ValueError("HAND_PORT must be an integer in 1..65535")
        if not math.isfinite(self.step_seconds) or self.step_seconds <= 0:
            raise ValueError("Receiver step duration must be finite and positive")

    @classmethod
    def from_environment(cls):
        return cls(
            hand_ip=os.environ.get("HAND_IP", cls.hand_ip),
            hand_port=int(os.environ.get("HAND_PORT", cls.hand_port)),
        )
