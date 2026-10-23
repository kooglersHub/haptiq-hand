# Technical handover

## Scope

The deliverable is the maintained HaptIQ source project, its reproducible dependency manifests,
tests, packaged source CAD and documentation. The installed commands are `haptiq` (passive
receiver), `haptiq-viewer`, `haptiq-estimate` and `haptiq-build-viewer`.
The application is a local research and development tool. The geometry limitations in
[issues.md](../issues.md) remain explicit acceptance constraints.

## Onboarding

1. Read [README](../README.md) and [architecture](ARCHITECTURE.md).
2. Install Python 3.14, uv and Node.js 24. The declared Python minimum is 3.13.
3. Run `uv sync --locked --extra sensor-identification --group dev` and `npm ci`.
4. Start `uv run --no-sync haptiq-viewer`; open `http://127.0.0.1:18765/`. Use `--no-browser` for a background viewer.
5. Run the [development checks](TESTING.md), then build and inspect the wheel.

The Windows launcher remains `Start Sensor Identification.cmd`. It installs the project in the
existing environment and reuses a current viewer, or replaces a verified outdated viewer from
this checkout. No additional persistent server is needed for telemetry, taxels or estimation.

## Runtime configuration and data

| Variable | Default | Meaning |
| --- | --- | --- |
| `HAND_IP` | `192.168.123.210` | Receiver's hand endpoint |
| `HAND_PORT` | `6000` | Receiver's Modbus TCP port |
| `HAND_DATA_DIR` | `~/Documents/ChatGPT/hand/probing_situations` | Writable runtime data root |
| `HAND_CAPTURE_DIR` | `<data-root>/received_runs` | Optional received-run directory override |

Set variables in the shell before starting the process. `.env.example` is a reference;
environment files are not loaded implicitly. The viewer address stays `127.0.0.1:18765`.
New telemetry logs go to `telemetry/`, taxel snapshots to `grasp_captures/` and estimator reports
to `estimation/` below the data root. Existing root-level CSV files and historical
`sensor_identification_demo/` results are preserved and are not migrated or automatically loaded.
Original STEP exports/manuals remain under `documents/`; runtime STL files live under
`src/haptiq/assets/models/`. Their hashes and units are in `catalog.json`.

## Change and release procedure

1. Make a focused source change in the owning package; keep measured evidence distinct from priors.
2. Add a behavioral regression test for affected contracts or numerical behavior.
3. Format sources, regenerate the viewer and run all checks in [TESTING](TESTING.md).
4. Build the wheel and run `scripts/check-wheel.py` against it. This verifies imports, entrypoints,
   source CAD hashes, packaged build consistency and temporary server construction outside the checkout.
5. Review changes together with `THIRD_PARTY_NOTICES.md`. Preserve source hashes and attribution.
6. Record release version, environment, test results and remaining physical validation separately.

No remote deployment, Git commit or push is performed by the local handover workflow.
GitHub Actions defines separate source/unit and browser jobs. A local test run does not establish
that those remote jobs have run.

## Acceptance checks

- A fresh environment can install the project and find all four commands.
- Viewer starts at the canonical address, without a hand connection.
- Manual/live/history flows, received captures and estimate snapshots pass browser checks.
- Two in-process listeners do not share state; all test listeners close during teardown.
- Generated outputs match their sources, and the wheel works outside the source checkout.
- No normal application path writes movement commands to the hand.

Physical calibration, pose accuracy, repeatability and continuous collision clearance require
separate experiments; automated software tests do not replace that evidence.

## Troubleshooting

If a viewer reports an estimator revision mismatch, rerun the Windows launcher and reload the
page. If the port belongs to a different application, the launcher stops with an explanation.
Do not terminate the separate hardware-control program. If CAD hashes fail, inspect the asset
change and its provenance before updating catalog hashes. If WebGL2 fails, use an available
supported browser/GPU setup and inspect its console. Browser tests use Edge on Windows and
Chromium on Linux; `PLAYWRIGHT_CHANNEL` overrides that choice.

The local verification record is in [VALIDATION.md](VALIDATION.md).
