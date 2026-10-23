# Data and service contracts

## Shared conventions

The hand base frame is `left_base_link`. Viewer exports use metres (`m` or `metres`, as specified
by that export); estimator normalization converts positions to millimetres. Rigid CAD fit
transforms map source CAD millimetres into observation millimetres. Never apply camera rotation,
display scaling or marker lift to exported evidence. Normals are unit directions in the same
frame as their points. Pressure is calibrated sensor counts, not a physical pressure unit.
Zero is a valid reading; null/missing/invalid pressure is unknown.

## HTTP endpoints

| Endpoint | Behavior |
| --- | --- |
| `GET /health` | Process/workspace identity and runtime source signature |
| `GET/POST /api/state` | Current normalized telemetry / bounded validated update |
| `GET/POST /api/taxels` | Fresh shared positions / complete 1,062-cell snapshot |
| `GET /api/candidates` | Candidate IDs, names, CAD metadata, source units and hashes |
| `GET /api/probing-runs` | Received-run list and capture state |
| `GET /api/probing-runs/<id>` | Saved CSV for the selected local run |
| `POST /api/probing-runs` | Start, finish or configure automatic passive capture |
| `GET/POST /api/identification` | Job snapshot / submit one frozen estimation request |
| `GET /identification/report` | Current completed report |

Canonical telemetry fields include `angles_act`, `force_act`, `tactile_regions`, `source`,
`simulated`, and optional run metadata (`state`, `source_id`, `sample_index`, `slip_detected`).
Angles contain six actual readings in 0..1000. A raw `tactile_matrix` forwarding adapter accepts
the complete 112-by-17 matrix plus explicit `tactile_valid` flags; missing validity never creates
contact evidence. The canonical shape/order definitions are in `haptiq.tactile`.

Taxel relay records contain exactly `{id, x, y, z, pressure}`. All 1,062 unique wire IDs are
required. Local estimation may additionally retain normals; these are not transmitted as extra
fields in the relay contract. The relay never recomputes FK. Its cache expires after four seconds.

An identification request uses mode `current`, a frozen `frame`, thresholds, tolerances,
point spacing and quick/detailed choice. A running job returns 409 for another submission;
successful submission returns 202. Job snapshots carry `estimator_revision`, progress and
the frozen estimate frame. The shared revision is defined once in `haptiq.contracts` and is
embedded in the viewer at build time. Change it when interpretation changes, not for cosmetic edits.

## Evidence and persistence

Recorded frame validity, geometry identity, sample provenance and units travel with the data.
Fresh actual-angle and pressure timing is required for live contact evidence. A saved frame is
interpreted at its recorded pose, rather than aged as a live packet. CSV cannot invent
calibration or hardware-capture synchronization. Empirical priors are bound to CAD hashes and
the explicit base frame. They are search initialization, not identity evidence.

`AMBIGUOUS`, provisional placement and rejected comparison are distinct outcomes. A rejected
pose is displayed only through explicit inspection, including after a reload. The UI does not
promote its unverified physical geometry to calibrated identity. Completed job state and report
hashes are saved together for recovery; failures to persist do not fabricate a saved job.
