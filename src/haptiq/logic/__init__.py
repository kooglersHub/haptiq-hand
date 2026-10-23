"""Logic package for state representation, grip confirmation, and slip detection."""

from haptiq.logic.grasp_manager import GraspManager
from haptiq.logic.grip_logic import confirm_grip, get_pad_pressures, is_empty_grasp

__all__ = [
    "confirm_grip",
    "is_empty_grasp",
    "get_pad_pressures",
    "GraspManager",
]
