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

## Next

- Adapt whitelist commands to the exact official Weibo CLI command shape.
- Add import/export for local archive portability.
- Improve Chinese keyword extraction.
- Add richer draft templates.

## Later

- Optional scheduled sync with strict free-mode intervals.
- Multi-device deployment on a personal Tencent Cloud server.
- More local analytics and content review workflows.
