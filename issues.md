# Known limitations

- Electrode positions and the kinematic model remain approximate and uncalibrated.
- Open hand meshes and sampled motion checks do not certify continuous collision clearance.
- Estimation is a finite local search; a rejected fit is not a global impossibility proof.
- The viewer has one shared estimation job per local server, not per browser tab.
- Browser rendering requires WebGL2. CI uses Linux/Chromium; local Windows tests use Edge.
- Automatic replacement of a verified outdated viewer is supported on Windows.

Historical issues are retained in [docs/archive/issues.md](docs/archive/issues.md).
Current architecture and extension rules are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
