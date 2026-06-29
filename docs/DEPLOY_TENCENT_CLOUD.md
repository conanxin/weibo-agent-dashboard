# Deploy To Tencent Cloud

This is the shortest deployment path for a small personal Tencent Cloud Ubuntu server.

This guide intentionally avoids Docker, Nginx, HTTPS, backup, rollback, and other production operations.

## Fit

- GitHub Pages runs only the static Mock Demo.
- Tencent Cloud runs the full Fastify backend, SQLite database, local API, and future real `weibo-cli` integration.
- v0.3.0 is still personal-project deployment, not a production hardening guide.

## Shortest Steps

Install Node.js 20+ on the server, then:

```bash
git clone https://github.com/conanxin/weibo-agent-dashboard.git
cd weibo-agent-dashboard
cp .env.example .env
npm install
npm run build
npm run start
```

Open:

```text
http://SERVER_IP:3000
```

If you want the scripted path:

```bash
cp .env.example .env
bash deploy/tencent-cloud-start.sh
```

## Mock Backend Mode

Use this first to verify the server without a Weibo account:

```env
PORT=3000
HOST=0.0.0.0
DATABASE_PATH=./data/weibo.sqlite
WEIBO_CLI_BIN=weibo-cli
FREE_MODE=1
MOCK_WEIBO=1
```

`MOCK_WEIBO=1` means the backend does not call the real Weibo CLI.

## Background Run

Optional pm2 run:

```bash
npm install -g pm2
pm2 start apps/server/dist/index.js --name weibo-agent-dashboard
pm2 save
```

Check health:

```bash
npm run check:server-health
```

For a remote URL:

```bash
HEALTH_URL=http://SERVER_IP:3000/api/health npm run check:server-health
```

## Real CLI Reserved Steps

Do this later, only after mock backend mode works:

1. Install the official `weibo-cli`.
2. Log in with `weibo-cli`.
3. Run:

```bash
npm run probe:weibo-cli
```

4. Calibrate `REAL_CLI_COMMANDS` in `packages/weibo-bridge/src/index.ts` based on the probe output.
5. Change `.env`:

```env
MOCK_WEIBO=0
```

v0.3.0 does not calibrate real CLI commands and does not auto-publish Weibo posts.

## Common Issues

### Page Opens But API Fails

Confirm the server is running:

```bash
npm run check:server-health
```

If the health check fails, start the server:

```bash
npm run start
```

### Port Not Open

Make sure Tencent Cloud security group allows inbound TCP `3000`.

### weibo-cli not found

Keep `MOCK_WEIBO=1` for mock backend mode. For real CLI mode, install the official CLI and run:

```bash
npm run probe:weibo-cli
```

### SQLite File Permission

Make sure the app user can write to `data/`:

```bash
mkdir -p data
```

If needed, adjust ownership for your server user.

### GitHub Pages vs Tencent Cloud

- GitHub Pages = static Mock Demo, no backend, no SQLite, no `weibo-cli`.
- Tencent Cloud = full backend mode with Fastify, SQLite, `/api/*`, and future real CLI integration.
