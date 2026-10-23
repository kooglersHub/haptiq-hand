"""Receive hand telemetry and publish it to the browser viewer without a desktop GUI."""

import argparse
import time
from contextlib import ExitStack

from haptiq.capture.taxels import GraspCapture
from haptiq.logic.grasp_manager import GraspManager
from haptiq.settings import Settings
from haptiq.telemetry.publisher import TwinPublisher, robot_snapshot
from haptiq.telemetry.receiver import RobotHandController
from haptiq.telemetry.storage import RobotDatabase

STEP_TIME = Settings.step_seconds


def main(settings=None):
    """Keep logging and browser telemetry running until the receiver is stopped."""
    settings = settings or Settings.from_environment()
    with ExitStack() as resources:
        robot = RobotHandController(
            ip=settings.hand_ip, port=settings.hand_port, mock=settings.mock
        )
        if robot.client is not None:
            resources.callback(robot.client.close)
        capture = GraspCapture()
        resources.callback(capture.close)
        grasp_manager = GraspManager(on_grasp_closed=capture.submit)
        db = RobotDatabase()
        resources.callback(db.on_close)
        publisher = TwinPublisher(settings.viewer_url + "/api/state")
        resources.callback(publisher.close)

        try:
            while True:
                start = time.monotonic()
                results_data = robot.poll()
                results_data = grasp_manager.step(robot, results_data)
                db.main(data=results_data)
                publisher.submit(robot_snapshot(robot, results_data))
                elapsed = time.monotonic() - start
                time.sleep(max(settings.step_seconds - elapsed, 0))
        except KeyboardInterrupt:
            pass


def cli(argv=None):
    defaults = Settings.from_environment()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hand-ip", default=defaults.hand_ip)
    parser.add_argument("--hand-port", type=int, default=defaults.hand_port)
    parser.add_argument(
        "--mock",
        action="store_true",
        help="Use the disconnected receiver transport without hardware IO",
    )
    args = parser.parse_args(argv)
    main(Settings(hand_ip=args.hand_ip, hand_port=args.hand_port, mock=args.mock))


if __name__ == "__main__":
    cli()
