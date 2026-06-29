# Weibo Agent Dashboard

Free-first Weibo CLI personal content dashboard for archive, analytics, and draft generation.

Weibo Agent Dashboard is a small personal open-source project for syncing your own Weibo posts, archiving them locally, reviewing lightweight analytics, and generating draft posts for manual copy/paste publishing. It is mock-first for public demos and read-only for real CLI smoke testing.

- Repository: https://github.com/conanxin/weibo-agent-dashboard
- Live Demo: https://conanxin.github.io/weibo-agent-dashboard/

## Screenshots

Dashboard:

```text
[screenshot placeholder: CLI status, auth status, local post count, rate limit]
```

Posts:

```text
[screenshot placeholder: searchable post archive, raw JSON, export buttons]
```

Analytics:

```text
[screenshot placeholder: keyword frequency, averages, topic suggestions]
```

Drafts:

```text
[screenshot placeholder: draft generator and copy buttons]
```

## Core Features

- React + Vite web dashboard with Dashboard, Posts, Analytics, Drafts, and Settings views.
- Fastify API server for local full-stack use.
- SQLite local archive for synced posts, generated drafts, and sync logs.
- Whitelisted Weibo CLI bridge only: no arbitrary shell execution.
- Mock mode for demos, development, CI, and GitHub Pages.
- Free Mode posture: low-frequency calls, current-user data only, no auto-publishing.
- JSON and Markdown export from the local post archive.

## Runtime Modes

| Mode | Where it runs | Data source | Backend required | Intended use |
| --- | --- | --- | --- | --- |
| Mock Demo | GitHub Pages or local Vite | Built-in mock data | No | Public showcase |
| Local Server | Your machine | Mock data or local SQLite | Yes | Full local workflow |
| Tencent Cloud | Personal server | SQLite + Weibo CLI | Yes | Future private deployment |
| Real Weibo CLI | Local/Tencent backend | Official Weibo CLI | Yes | Read-only smoke testing |

## Architecture

```text
GitHub Pages static demo
        |
        | VITE_MOCK_MODE=1
        v
apps/web -----------------------+
React + Vite                    |
                                |
Local full-stack mode           |
        | HTTP /api             |
        v                       |
apps/server                     |
Fastify + SQLite                |
        | whitelist calls       |
        v                       |
packages/weibo-bridge           |
execa -> official Weibo CLI     |
```

## Local Start

Install dependencies:

```bash
npm install
```

Run the full local app:

```bash
npm run dev
```

Default local URLs:

- Web app: `http://localhost:5173`
- API server: `http://localhost:3000`

Production-style local run:

```bash
npm run build
npm run start
```

Then open `http://localhost:3000`.

## Mock Mode

Backend mock mode is enabled in `.env.example`:

```env
MOCK_WEIBO=1
FREE_MODE=1
```

Copy `.env.example` to `.env` for local backend use. When `MOCK_WEIBO=1`, the server never calls the real Weibo CLI and returns sample user/post data.

Frontend static demo mode is controlled by:

```env
VITE_MOCK_MODE=1
```

When `VITE_MOCK_MODE=1`, `apps/web` does not call the backend. It renders built-in mock status, posts, analytics, and draft generation data.

## GitHub Pages Static Demo

GitHub Pages can only run the mock demo because it is a static hosting environment. It cannot run the Fastify server, create or read SQLite databases, access local `.env` files, or execute `weibo-cli`.

The Pages workflow builds only `apps/web` with:

```env
VITE_MOCK_MODE=1
VITE_BASE_PATH=/weibo-agent-dashboard/
```

This produces a static demo for:

```text
https://conanxin.github.io/weibo-agent-dashboard/
```

Manual local static demo:

```powershell
$env:VITE_MOCK_MODE="1"
npm run dev -w apps/web
```

Open `http://localhost:5173`.

## Free Mode

The project assumes a conservative free-tier posture:

- Treat the Weibo CLI Free edition as 5 calls per hour.
- Limit backend data calls to 4 per hour.
- Only sync the current user's own data.
- Do not fetch hot searches by default.
- Do not perform full-network search by default.
- Do not monitor competitor accounts by default.
- Do not auto-publish posts.

See [docs/FREE_MODE.md](docs/FREE_MODE.md).

## Real CLI Smoke Test (v0.2.0)

The project includes a probe script to detect your local `weibo-cli` installation and test which commands are available:

```bash
npm run probe:weibo-cli
```

This outputs:

- Whether `weibo-cli` is installed.
- Which commands are available.
- Which commands require authentication.
- Whether commands return JSON or raw text.
- Recommended next steps.

Switching to real CLI mode:

1. Install and authenticate the official Weibo CLI:

```bash
weibo-cli login
```

2. Copy `.env.example` to `.env` and set:

```env
MOCK_WEIBO=0
FREE_MODE=1
```

3. Run the probe:

```bash
npm run probe:weibo-cli
```

4. Start the server:

```bash
npm run build
npm run start
```

v0.2.0 remains read-only. It does not post, comment, repost, search the public network, fetch hot searches, or monitor competitor accounts.

## CLI Command Calibration

The current real CLI commands are assumptions. They must be calibrated against the official CLI available on your machine.

Run:

```bash
npm run probe:weibo-cli
```

Then update `REAL_CLI_COMMANDS` in:

```text
packages/weibo-bridge/src/index.ts
```

See [docs/WEIBO_CLI_ADAPTER.md](docs/WEIBO_CLI_ADAPTER.md).

## Public Demo Health (v0.2.1)

v0.2.1 hardens the public demo path:

- Explicit GitHub Pages base path support through `VITE_BASE_PATH`.
- Pages workflow uses `VITE_MOCK_MODE=1`.
- Dashboard and Settings clearly identify GitHub Pages as Mock Demo mode.
- `npm run check:public-demo` verifies README links, dist files, asset references, and Pages workflow settings without network access.

## Tencent Cloud

The full backend version can later run on a small Tencent Cloud server. See [docs/DEPLOY_TENCENT_CLOUD.md](docs/DEPLOY_TENCENT_CLOUD.md).

This project intentionally avoids Docker, Nginx, HTTPS, backups, and rollback workflows for v0.2.x.

## Security Notes

- Do not commit `.env`.
- Do not commit `data/*.sqlite`.
- Do not commit `node_modules` or `dist`.
- Weibo credentials should remain in the official CLI or local environment only.
- The server exposes fixed API routes and does not provide arbitrary shell execution.

## Roadmap

| Version | Goal | Status |
| --- | --- | --- |
| v0.1.0 | Mock-first local MVP | Complete |
| v0.1.1 | Open-source showcase + GitHub Pages demo | Complete |
| v0.2.0 | Real Weibo CLI read-only smoke test | Complete |
| v0.2.1 | Public demo health and GitHub Pages hardening | Current |
| v0.3.0 | Tencent Cloud deployment | Planned |
| v0.4.0 | AI draft enhancement | Planned |
| v0.5.0 | Hermes / OpenClaw Agent workflow integration | Planned |

See [docs/ROADMAP.md](docs/ROADMAP.md).

## License

MIT. See [LICENSE](LICENSE).
