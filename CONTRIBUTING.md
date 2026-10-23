# Contributing

Read [architecture](docs/ARCHITECTURE.md) and keep changes in their owning package.
Use English code and documentation, descriptive names, small coherent functions and absolute
`haptiq.*` imports. Add abstractions for concrete shared responsibilities. Preserve concurrent
edits, source CAD, recorded datasets and vendor references.

Measured contacts, search heuristics and validated geometry are different kinds of evidence.
Never present an empirical starting pose or provisional contact fit as confirmed identity.
Preserve numerical tolerances and coordinate frames during structural refactoring.

Follow [development checks](docs/TESTING.md). Format editable sources before rebuilding the
viewer. Add meaningful regression tests for behavior changes and contracts; keep geometry
sources and generated products separate. The package verification must work outside the checkout.

Use one persistent local server at `http://127.0.0.1:18765/`. Automated checks construct an
in-process server on port 0 and shut it down in teardown. Never stop the separate Blackforest
hardware-control program as viewer cleanup. Use `maintenance/` for staging, logs and recovery.

Do not commit local environments, credentials, recordings, caches or generated test screenshots.
Preserve attribution and provenance for third-party assets. See [handover](docs/HANDOVER.md)
for configuration, acceptance and release steps, and [extension guide](docs/EXTENDING.md)
for adding candidates or measurement sources.
