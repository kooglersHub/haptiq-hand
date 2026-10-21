<p align="center">
  <img src="logo-v2.svg" alt="HaptIQ Logo" width="280" />
</p>

# HaptIQ Hand

Receive-only telemetry, a tactile 3D hand viewer, and CAD-based sensor fitting
for the Inspire-Robots RH56DFTP dexterous hand.

This application receives measured joint angles and tactile readings. Hardware
motion is controlled by the separate Blackforest program. The receiver sends
Modbus read requests; this application's normal startup does not command hand
motion, calibration, or configuration writes. Virtual hand sliders affect only
the rendered model.

## Start the viewer

Use Python 3.13 or newer and [uv](https://docs.astral.sh/uv/). The project is
tested with Python 3.14. On Windows, run **Start Sensor Identification.cmd**.
The launcher reuses the current viewer or replaces a verified outdated viewer
from this checkout at the same address:

**http://127.0.0.1:18765/**

For a terminal-based start:

```sh
uv sync --extra sensor-identification --no-install-project --inexact
uv run --no-sync python digital_twin/start_sensor_simulation.py
```

The viewer supports manual poses, live telemetry, saved captures, and recorded
CSV runs. The passive telemetry receiver can be started separately with:

```sh
uv run --no-sync python src/main.py
```

The default hand endpoint is `192.168.123.210:6000`; configure it in
`src/main.py` for your installation. Viewer and receiver are separate from the
external program that moves the hardware.

## Sensor estimation

The estimator fits the supplied VEGABAR 29 and VEGABAR 38 CAD models against
observed tactile contacts. It uses contact normals, region-balanced residuals,
first-surface visibility, cached triangle queries, and multiple starting poses.
The shaft rotation search covers a full turn and refines promising angular
basins independently of insertion tilt. The small sensor's starting roll
includes the corrected 180-degree rotation about its own shaft.

Contacts, hand limits, and model geometry use explicit coordinate frames and
units. A provisional placement is not a confirmed sensor identity. Open hand
parts, sampled collision coverage, and unverified calibration remain explicit
limitations. Similar candidates are shown for comparison rather than treated
as a definite classification.

See [the estimation guide](digital_twin/sensor_identification/README.md) for
recording formats, search behavior, tolerances, and interpretation of results.
For offline use without hardware:

```sh
uv run --no-sync python -m digital_twin.sensor_identification --inspect
```

## Source layout

| Path | Purpose |
|---|---|
| `src/main.py` | Passive telemetry and capture loop |
| `src/interface/` | Modbus reads and dataset logging |
| `src/logic/` | Grasp capture, telemetry publishing, and retained analysis modules |
| `digital_twin/` | Local server, kinematics, tactile geometry, and browser viewer |
| `digital_twin/sensor_identification/` | CAD registration and identification service |
| `documents/` | Bundled sensor CAD and reference documents |
| `tests/` | Python, native Node, and browser integration checks |

The source modules are maintained separately from generated embedded viewer
code. See [CONTRIBUTING.md](CONTRIBUTING.md) for formatting, tests, rebuilding,
and the single-server workflow. GitHub Actions runs lint, formatting, Python
tests, and native JavaScript tests on pushes and pull requests.

## Provenance and assets

This repository is a cleaned snapshot of the current HaptIQ application,
derived from the [original project](https://github.com/rht2001/haptiq).
It starts with a new snapshot history; local recordings, credentials, virtual
environments, and development caches are excluded.

Bundled hand geometry, sensor CAD, and documents retain their source provenance.
See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). No blanket license is
assigned to third-party material by this repository.
