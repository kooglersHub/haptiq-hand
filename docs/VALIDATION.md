# Local technical acceptance — 2026-10-23

## Environment

Windows, Python 3.14.5, Node.js 24.19.0 and Microsoft Edge through Playwright.
Dependencies were installed in the maintained environment using the committed uv and npm
lockfiles. No physical hardware connection was used by these checks.

## Results

| Check | Result | Local evidence |
| --- | --- | --- |
| Complete Python unittest suite | 193 tests passed | `maintenance/python-tests.log` |
| Focused HTTP contract recheck | 5 tests passed | `maintenance/service-tests.log` |
| Native Node suites | 17 suites passed | `maintenance/node-tests.log` |
| Full browser integration run | 10 suites passed | `maintenance/browser-tests.log` |
| UI check after CSS/HTML formatting | Passed | `maintenance/browser-format-check.log` |
| Ruff lint and Python formatting | Passed | Terminal check |
| Prettier JS/CJS/CSS/HTML formatting | Passed | Terminal check |
| Generated viewer/source consistency | Passed | `haptiq-build-viewer --check` |
| Wheel/source contents and independent import | Passed | `maintenance/wheel-verification.log` |
| Four installed CLI help entrypoints | Passed | Terminal check; no hardware opened |
| Git whitespace check | Passed | `git diff --check` |

The complete Python run preceded the final removal of the unused application-script route;
the focused HTTP suite checked that final route state. The complete browser run includes
visibility behavior for mismatched saved geometry and optional reconstructed taxels. The last
CSS/HTML change was formatting only and received a focused UI recheck. Screenshots are retained
under `maintenance/browser-artifacts/` and are not committed.

## Handover artifact

Wheel: `maintenance/dist/haptiq-0.1.0-py3-none-any.whl`

SHA-256: `25e1426b9ffc8f8bdc21f1f6241e32d91680f103b0258c9caa651f569c970c4e`

The verifier compares every packaged runtime file to current source, checks CAD hashes,
resolves the four CLI entrypoints, verifies generated viewer consistency and imports the
extracted package outside the checkout. Old generated `build/` contents were removed before
the final build to prevent stale package members after renames.

## Scope and remaining validation

The remote GitHub Actions jobs were configured but were not executed by this local handover.
Physical calibration, real-hand pose accuracy and continuous collision clearance remain the
experimental work described in [known limitations](../issues.md). Source CAD bytes, recorded
datasets, original STEP files and historical results were preserved. All temporary browser
servers were closed by their harness; no persistent viewer was started on another port.
