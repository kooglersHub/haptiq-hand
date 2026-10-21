# Contributing

Keep changes focused and preserve the distinction between measured contacts,
search heuristics, and validated geometry. In particular, an empirical starting
pose or a promising contact fit must never be presented as confirmed identity.

Use descriptive names, short coherent functions, and comments that explain why
an operation is necessary. Remove dead code rather than leaving commented-out
implementations. Avoid abstractions until there is a concrete need for them.
Preserve numerical tolerances and coordinate frames when refactoring geometry.

## Development checks

```sh
uv sync --extra sensor-identification --group dev --no-install-project --inexact
uv run --no-sync ruff check .
uv run --no-sync ruff format --check .
uv run --no-sync python -B -m unittest discover -s tests -v
npm install
npm run format:check
npm test
```

Use `ruff format .` and `npm run format` to apply the repository's formatting.
Regenerate embedded viewer modules with:

```sh
uv run --no-sync python digital_twin/rebuild_joint_viewer.py
```

Keep source meshes and calibration data intact when rebuilding. The generated
HTML is excluded from general-purpose formatting so mesh data stays stable.

Add meaningful regression tests for behavior changes. Existing geometry tests
cover coordinate frames, exact triangle queries, first-surface visibility,
independent shaft rotation, and partial hand-volume checks. Browser tests can
use Playwright; install Chromium with `npx playwright install chromium` on Linux.
On Windows they use Microsoft Edge by default. `PLAYWRIGHT_CHANNEL` overrides
the browser channel, and `PLAYWRIGHT_PACKAGE` can select an existing package.

Automated HTTP checks must bind an in-process server to port 0 and close it in
teardown. Keep the normal viewer on `http://127.0.0.1:18765/`. Tests and viewer
maintenance must never stop the separate hardware-control program.

Do not commit credentials, local environments, recordings, generated reports,
or caches. Check asset provenance and redistribution permission before adding
third-party geometry or documents.

## References

- [Google: what to look for in a code review](https://google.github.io/eng-practices/review/reviewer/looking-for.html)
- [Ruff configuration](https://docs.astral.sh/ruff/configuration/)
- [Prettier configuration](https://prettier.io/docs/configuration)
