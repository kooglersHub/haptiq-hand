# Development and verification

Install dependencies from the committed lockfiles:

```sh
uv sync --locked --extra sensor-identification --group dev
npm ci
```

Apply formatting and rebuild whenever viewer sources change:

```sh
uv run --no-sync ruff check . --fix
uv run --no-sync ruff format .
npm run format
uv run --no-sync haptiq-build-viewer
```

Required checks:

```sh
uv run --no-sync ruff check .
uv run --no-sync ruff format --check .
npm run format:check
uv run --no-sync haptiq-build-viewer --check
uv run --no-sync python -B -m unittest discover -s tests -v
npm test
uv run --no-sync python scripts/test-browser.py
uv build --wheel
uv run --no-sync python scripts/check-wheel.py dist
```

`npm test` runs native Node suites. Browser suites are an explicit separate step; unittest
discovery alone does not execute them. On Linux install Chromium with
`npx playwright install --with-deps chromium`. Windows defaults to installed Microsoft Edge.
Use `PLAYWRIGHT_CHANNEL` to override and `PLAYWRIGHT_PACKAGE` to select an existing package.
Run one integration with `python scripts/test-browser.py --suite test_tidy_ui_browser.js`.

Each browser suite gets its own in-process listener on port 0, an isolated recording/report
directory and temporary screenshots. It closes the listener in teardown. Tests never need
the normal viewer on port 18765 and never connect to real hardware. Old Python browser
entrypoints forward to the same runner. Keep screenshots in temporary/maintenance paths.

Tests cover independent server state, strict transport validity, receive-only hardware calls,
candidate fallback including three models, geometry frames, exact surface queries, collision
limits, estimate cache recovery, immutable frozen input and current user flows. Build tests
delete generated HTML before rebuilding to prove independence from previous output.

GitHub Actions runs these checks in separate unit/package and browser jobs. Its tested baseline
is Python 3.14, Node.js 24 and Linux/Chromium; local validation may additionally use Windows/Edge.

Keep local browser screenshots with `python scripts/test-browser.py --artifacts maintenance/browser-artifacts`.

The wheel verifier also compares every packaged runtime file to the current source. If it
reports a stale member after a rename/removal, remove this checkout's generated `build/`
directory and rebuild. Setuptools can otherwise retain obsolete files from an earlier build.
