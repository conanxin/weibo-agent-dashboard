# Roadmap

## MVP

- Mock mode that runs without a Weibo account.
- Whitelisted Weibo CLI bridge.
- Local SQLite archive.
- Dashboard, posts, analytics, drafts, and settings pages.
- Manual sync and manual copy/paste publishing.

## v0.1.1 Showcase

- GitHub-friendly README and screenshot placeholders.
- GitHub Pages static demo using `VITE_MOCK_MODE=1`.
- MIT License and changelog.

## v0.2.1 Public Demo Health

- Explicit GitHub Pages base path through `VITE_BASE_PATH`.
- Public demo health check script.
- Dashboard and Settings make static mock mode visible.

## v0.2.2 Showcase Screenshots

- README screenshot placeholders replaced with captured mock demo screenshots.
- Screenshot capture script added for repeatable showcase updates.

## v0.3.0 Tencent Cloud Lite

- Minimal Tencent Cloud Ubuntu deployment path.
- Full backend mode with Fastify, SQLite, and static frontend serving.
- Server health check script for quick deployment verification.
- Real Weibo CLI remains reserved for probe-based calibration.

## v0.4.0 Real Weibo CLI Calibration

- Canonical CLI binary name `weibo`; legacy alias `weibo-cli`; `wb` is checked and refused if it is wandb.
- Real CLI commands use `--output json` (the official flag), not legacy `--json`.
- `weibo doctor --output json` is the canonical readiness signal; the bridge returns `{ ready, steps.{login,developerVerification,subscription}, nextAction, code, hint }`.
- `getAuthStatus` reads `doctor` JSON; `getCurrentUser` uses `auth whoami --output json` with `me --output json` as fallback.
- `myPosts` is intentionally uncalibrated in v0.4.0 and returns `COMMAND_NOT_CALIBRATED` until the operator runs `weibo commands list --output json` after login and updates `REAL_CLI_COMMANDS`.
- New `scripts/probe-weibo-cli.mjs` with structured readiness categories and a JSON report at `reports/weibo-cli-probe-latest.json`.
- New `scripts/real-cli-smoke.mjs` (`npm run test:real-cli:smoke`) with SKIP / UNAVAILABLE / PASS outcomes that never fail the project.
- Sensitive-field redaction (token / cookie / authorization / secret / bearer / api_key / refresh_token / etc.) applied to probe and bridge output.
- Documentation updated: `docs/WEIBO_CLI_ADAPTER.md`, `docs/DEPLOY_TENCENT_CLOUD.md`, `README.md`, `CHANGELOG.md`, `docs/ROADMAP.md`.

## Next

- Calibrate `myPosts` after login by running `weibo commands list --output json` and updating `REAL_CLI_COMMANDS.myPosts`.
- Add import/export for local archive portability.
- Improve Chinese keyword extraction.
- Add richer draft templates.

## Later

- Optional scheduled sync with strict free-mode intervals.
- Multi-device deployment on a personal Tencent Cloud server.
- More local analytics and content review workflows.
