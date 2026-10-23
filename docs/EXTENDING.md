# Extending the project

## Add a sensor candidate

1. Place the source binary STL in `src/haptiq/assets/models/`. Keep provenance and source exports.
2. Add an entry to `catalog.json`: unique `id` and `viewer_id`, display `name`, relative `file`,
   `color`, explicit `units` (`mm` or `m`) and the source file's `sha256`.
3. Run `haptiq-estimate --inspect` to inspect geometry. Do not infer STL units from an observed grasp.
4. Rebuild the viewer. Python geometry loading, CLI choices, browser display metadata and
   report candidate iteration all use the same catalog; candidate order is not an identity lookup.
5. Add a distinguishing dataset and a regression test. Compare all plausible candidates and
   retain ambiguity when evidence is insufficient. The existing estimator requires at least two.

Empirical initialization is optional and remains in `haptiq.estimation.grasp_prior`, bound to
the exact CAD hash and `left_base_link`. A new model does not inherit another model's prior.
The thumb preference is an ordering heuristic, never identity confirmation. More candidates
increase total search cost; there is no promise of constant run time.

## Add a measurement source

Normalize it to the existing frame contract with explicit units, validity, normals and provenance.
Use `measurements.js`/`history.js` for browser sources and `estimation.adapter` for offline
sources. Capture an immutable frame before submitting a job. Add a malformed-input case and a
cross-source equivalence test; do not couple file parsing to rendering or numerical optimization.

## Add an HTTP feature

Keep validation in `server.validation`, resources in the owning service and state on the
server instance. Add the route to `server.http` and test through `create_server(port=0)`.
Keep static routes explicit. Use `frontend/api_client.js` for application requests and keep
network operations out of pure feedback/geometry functions.

## Change geometry or presentation

Change source modules/assets/templates, then rebuild and run the geometry plus browser checks.
Preserve original coordinate frames, units and numerical tolerances unless the change explicitly
addresses them. Presentation transforms do not enter evidence exports. Retain CAD, recorded
datasets and reference assets; do not replace them with generated approximations during cleanup.
