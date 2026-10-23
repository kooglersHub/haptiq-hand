# Current roadmap

The maintained application receives telemetry and estimates CAD placement. The external
Blackforest application controls physical motion. Historical hackathon planning is retained
in [docs/archive/](docs/archive/) and does not describe the current implementation.

- [ ] Measure taxel centers, wire orientation and joint calibration on the physical hand.
- [ ] Validate estimator tolerances against held-out recordings with known poses.
- [ ] Establish reference error, run time and repeatability targets for release acceptance.
- [ ] Extend candidate catalog and add candidate-specific evidence only when measured.
- [ ] Expand CI coverage to Windows and the declared Python 3.13 minimum.

See [handover](docs/HANDOVER.md) for the current technical acceptance procedure.
