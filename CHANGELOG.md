# Changelog

## Unreleased — modular project handover

- Installable `haptiq` package with telemetry, capture, estimation, server and browser boundaries.
- Documented CLI commands, environment configuration and writable runtime data directories.
- Independent viewer templates/assets, deterministic rebuild and generated-output checks.
- Shared candidate catalog, stable ID lookup and fitting support for more than two candidates.
- Per-server state and shared test runners using temporary listeners on port 0.
- Separate CI browser job, dependency lockfiles and wheel/source verification.
- Fixed relay payloads containing unexpected normals, completion/persistence races, ignored
  reconstructed-taxel visibility and display of incompatible captured hand geometry.

### Migration

Use absolute imports below `haptiq.*`; former top-level `logic`, `interface` and
`digital_twin.sensor_identification` Python imports have moved to their owning packages.
The Windows launcher and the established direct-script launchers remain supported.
Runtime STL paths have moved from `documents/` to `src/haptiq/assets/models/`, with bytes and
hashes preserved. Existing recordings, root-level CSV files, source STEP files and historical
estimator outputs are preserved. New data locations are documented in `docs/HANDOVER.md`.
