"""Mutable data belongs to one HTTP server instance."""

import threading
from dataclasses import dataclass, field


def initial_telemetry():
    return {
        "angles_set": None,
        "angles_act": None,
        "force_act": None,
        "tactile": {},
        "tactile_regions": {},
        "field_received_at": {},
        "received_at": 0,
        "seq": 0,
    }


@dataclass
class ApplicationState:
    telemetry: dict = field(default_factory=initial_telemetry)
    taxels: list = field(default_factory=list)
    taxels_received_at: float = 0
    lock: object = field(default_factory=threading.RLock, repr=False)
    service_lock: object = field(default_factory=threading.Lock, repr=False)
