# Changelog

## v0.4.0

- Calibrated the real Weibo CLI read-only bridge against the official binary name `weibo` and the official `--output json` flag.
- Default `WEIBO_CLI_BIN` is now `weibo`. Detection order: `WEIBO_CLI_BIN` env override, then `weibo`, then `weibo-cli`, then `wb` (only if not wandb).
- Added wandb detection: the bridge and probe refuse to shadow `wb` when it is Weights & Biases, and never recommend `npm --force`.
- Rewrote `scripts/probe-weibo-cli.mjs`: prioritised read-only commands (`version`, `doctor`, `doctor --output json`, `auth --help`, `auth whoami`, `auth whoami --output json`, `me`, `me --output json`, `commands list`, `commands list --output json`), with legacy candidates downgraded as informational.
- Added structured readiness classification (`CLI_NOT_FOUND`, `WAND_DETECTED`, `CLI_INSTALLED_BUT_NOT_READY`, `CLI_READY_FOR_REAL_CLI_MODE`) and a JSON report at `reports/weibo-cli-probe-latest.json`.
- Added sensitive-field redaction (token, cookie, authorization, secret, bearer, api_key, refresh_token, etc.) for both stdout/stderr previews and JSON responses.
- Reworked `weibo-bridge`:
  - `getAuthStatus` now uses `weibo doctor --output json` as the canonical readiness signal and returns `{ ready, steps, nextAction, code, hint }`.
  - `getCurrentUser` prefers `weibo auth whoami --output json` with `weibo me --output json` as fallback. Returns `code: AUTH_NOT_READY` when login is missing.
  - `syncMyPosts` is intentionally uncalibrated in v0.4.0 and returns `code: COMMAND_NOT_CALIBRATED` with a hint to run `weibo commands list --output json` after login.
  - Added `getCliReadiness` for aggregated readiness (resolvedBin, statusCategory, wandbDetected, steps).
- Added `npm run test:real-cli:smoke` (the `scripts/real-cli-smoke.mjs`): SKIP / UNAVAILABLE / PASS based on real-CLI readiness, never fails the project.
- Updated documentation: `docs/WEIBO_CLI_ADAPTER.md`, `docs/DEPLOY_TENCENT_CLOUD.md`, `README.md`, `CHANGELOG.md`, `docs/ROADMAP.md`.
- Bumped workspace package versions to `0.4.0`.
- Auto-publishing remains disabled. Free Mode rate limits unchanged.

## v0.3.0

- Added Tencent Cloud lite deployment script.
- Added server health check script.
- Expanded Tencent Cloud deployment documentation.
- Added startup logging for server URL, mock mode, and database path.

## v0.2.2

- Added showcase screenshots.
- Added screenshot capture script.
- Replaced README screenshot placeholders with real mock demo images.

## v0.2.1

- Hardened GitHub Pages public demo configuration with explicit `VITE_BASE_PATH`.
- Added a no-network public demo health check script.
- Clarified Dashboard and Settings copy for GitHub Pages Mock Demo mode.
- Updated README with live demo links, runtime modes, and CLI calibration notes.

## v0.2.0

- Added real Weibo CLI read-only smoke probe.
- Centralized real CLI command mapping in `REAL_CLI_COMMANDS`.
- Added CLI adapter documentation.
- Improved real CLI unavailable/error display paths while preserving mock mode.

## v0.1.1

- Prepared the project as an open-source showcase.
- Added GitHub Pages static demo support with `VITE_MOCK_MODE=1`.
- Added GitHub Actions workflow for Pages deployment.
- Improved README, screenshot placeholders, and project documentation.
- Added MIT License.

## v0.1.0

- Mock-first MVP.
- Added React + Vite web app.
- Added Fastify API server.
- Added SQLite archive tables.
- Added whitelisted Weibo CLI bridge with mock mode and Free Mode rate limiting.
