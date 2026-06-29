# Weibo Agent Dashboard

Free-first personal Weibo content workspace powered by a whitelisted Weibo CLI bridge.

Weibo Agent Dashboard is a small open-source starter for syncing your own Weibo posts, archiving them locally, reviewing lightweight analytics, and generating draft posts for manual copy/paste publishing. The project is intentionally mock-first so the web UI and GitHub Pages demo can run without a Weibo account.

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
- Mock mode for demos, development, and GitHub Pages.
- Free Mode posture: low-frequency calls, current-user data only, no auto-publishing.
- JSON and Markdown export from the local post archive.

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

The backend mock mode is enabled in `.env.example`:

```env
MOCK_WEIBO=1
FREE_MODE=1
```

Copy `.env.example` to `.env` for local backend use. When `MOCK_WEIBO=1`, the server never calls the real Weibo CLI and returns sample user/post data.

The frontend static demo mode is controlled by:

```env
VITE_MOCK_MODE=1
```

When `VITE_MOCK_MODE=1`, `apps/web` does not call the backend at all. It renders built-in mock status, posts, analytics, and draft generation data.

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

## GitHub Pages Static Demo

GitHub Pages should publish only the static web demo. It does not need the Fastify server, SQLite, Weibo credentials, or the Weibo CLI.

The included GitHub Actions workflow builds `apps/web` with:

```env
VITE_MOCK_MODE=1
```

If the repository is named `weibo-agent-dashboard`, Vite uses `/weibo-agent-dashboard/` as the asset base during GitHub Actions builds.

Manual local static demo:

```powershell
$env:VITE_MOCK_MODE="1"
npm run dev -w apps/web
```

Open `http://localhost:5173`.

## Tencent Cloud

The full backend version can later run on a small Tencent Cloud server. See [docs/DEPLOY_TENCENT_CLOUD.md](docs/DEPLOY_TENCENT_CLOUD.md).

This project intentionally avoids Docker, Nginx, HTTPS, backups, and rollback workflows for v0.1.x.

## Security Notes

- Do not commit `.env`.
- Do not commit `data/*.sqlite`.
- Do not commit `node_modules` or `dist`.
- Weibo credentials should remain in the official CLI or local environment only.
- The server exposes fixed API routes and does not provide arbitrary shell execution.

## Roadmap

- v0.1.0: Mock-first local MVP.
- v0.1.1: Open-source showcase README and GitHub Pages static demo.
- Next: Adapt the whitelist mapping to the exact official Weibo CLI command shape.
- Later: Add optional scheduled sync with strict Free Mode intervals.

See [docs/ROADMAP.md](docs/ROADMAP.md).

## License

MIT. See [LICENSE](LICENSE).
