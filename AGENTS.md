# HaptIQ project

Read `docs/ARCHITECTURE.md`, `docs/CONTRACTS.md` and `docs/TESTING.md` before structural changes.
The maintained code is the installable `src/haptiq` package. Keep telemetry, capture, estimation,
HTTP transport and browser modules in their owning packages. Use canonical `haptiq.*` imports.

Use the single normal viewer at `http://127.0.0.1:18765/`, launched by
`Start Sensor Identification.cmd` or `uv run --no-sync haptiq-viewer`.
Tests create in-process servers on port 0 and close them in teardown. Never stop the separate
Blackforest hardware-control application as viewer cleanup.

Edit viewer source modules/templates/assets, then rebuild with `haptiq-build-viewer`.
Do not hand-edit generated `hand_twin_6dof.html` or `tactile_geometry.json`.
Preserve coordinate frames, units, numerical tolerances and the distinction between measured
evidence, priors, provisional placements and confirmed identity.

Preserve recordings, datasets, source CAD, provenance and vendor references. Use `maintenance/`
for patch staging, logs and recovery archives; avoid duplicate repositories/environments.
Preserve concurrent changes. Run meaningful affected tests and required checks before delivery.
