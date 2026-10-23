# Geometry, taxels and telemetry

The active left-hand model uses the Tactile Toolkit URDF hierarchy. It renders 1,062 taxels
across 17 sensor fields. Source attribution, pinned revisions and geometry hashes are recorded
in `src/haptiq/digital_twin/joint_asset_manifest.json`; original URDF files remain under
`profile_sources/`. Source CAD is preserved through builds. See [third-party notices](../THIRD_PARTY_NOTICES.md).

## Field dimensions and wire order

| Field | Shape | Cells |
| --- | --- | --- |
| Each of four fingers: tip | 3 x 3 | 9 |
| Each of four fingers: nail | 12 x 8 | 96 |
| Each of four fingers: proximal pad | 10 x 8 | 80 |
| Thumb tip | 3 x 3 | 9 |
| Thumb nail | 12 x 8 | 96 |
| Thumb intermediate | 3 x 3 | 9 |
| Thumb pad | 12 x 8 | 96 |
| Palm | 8 x 14 | 112 |

Four fingers contribute 740 cells, the thumb 210 and the palm 112. The canonical Python names
and dimensions are in `haptiq.tactile`. IDs are `region:wire_index`. Finger and thumb acquisition
use row-major order. Palm acquisition runs bottom-to-top through successive columns: wire 0
is row 7/column 0, wire 7 is row 0/column 0, wire 8 is row 7/column 1 and wire 111 is row 0/column 13.
Transport wire index is distinct from the physical grid row/column.

## Approximate electrode positions

Each field's grid is fitted inside a minimum-area oriented rectangle of its sensor STL, inset
by 12 percent. Surface rays place the cell centers and obtain triangle normals. This estimates
electrode positions from the housing mesh; it is not measured electrode calibration.

Forward kinematics composes URDF parent-relative origin transforms with local-axis rotations,
using `Rz Ry Rx` for the origin RPY values. Thumb mimic joints retain their own drivers.
Sensor points follow their own sensor-link frames. Exported coordinates are transformed into
`left_base_link`, in metres. Display uses a separate presentation rotation and millimetre scale;
camera centering and the 0.35 mm rendering lift never enter exported evidence.

## Pressure and display

Receiver values are `max(0, raw - sensor_offset)` where applicable, in calibrated counts
(0..4095). Failed, absent or stale readings are unknown; zero is a valid inactive reading.
Activation is strictly above the chosen threshold (default 200). The current 3D scene uses
red for contacts, blue for taxel positions/unknown non-contact pressure, and purple for hand
limits. Region pressure status remains separate. Force readouts are separate from taxel counts.

Live contact export requires fresh actual-angle and tactile fields, no more than four seconds
old, with bridge reception times within 500 ms. These are bridge reception times, not hardware
capture synchronization. Target angles do not replace actual feedback. A held pose can still
show fresh pressure; stale or skewed evidence produces an invalid contact frame.

## Exports and recordings

Native contact exports retain field IDs, wire ordering, positions/normals, pressure, pose,
reference hashes, geometry status and simulation provenance. The current geometry status is
`APPROXIMATE_UNCALIBRATED`. Weighted contact centers summarize active cells without replacing
their original measurements. Saved captures use the recorded pose and do not expire as live data.

`getTaxelPositions()` and the HTTP relay use exactly `{id,x,y,z,pressure}` for all 1,062 cells.
Local `getTaxelMeasurements()` also retains normals for estimation. Neither API applies camera
transforms. The browser remains the shared FK implementation; the relay does not calculate
a second set of taxel positions. Recorded CSV reconstruction uses each row's actual angles.

## Remaining physical validation

Validate field identity, palm wire ordering and mirroring with single-cell activation.
Measure electrode centers/active areas, joint origins/endpoints, thumb coupling and timing.
Open hand links, sampled pose coverage and approximate surfaces limit collision interpretation.
Search priors and a provisional CAD placement never establish sensor identity.
See [estimation](ESTIMATION.md) and [contracts](CONTRACTS.md) for evidence handling.

## Build and verification

Run `uv run --no-sync haptiq-build-viewer` after source changes and `--check` for consistency.
The generated HTML uses neighboring browser modules; keep those files together for offline
file viewing in a WebGL2 browser. Live telemetry and estimation require the normal local server.
See [testing](TESTING.md) for geometry, transport and browser checks.
