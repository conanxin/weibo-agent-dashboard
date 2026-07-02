# Deploy To Tencent Cloud

This is the shortest deployment path for a small personal Tencent Cloud Ubuntu server.

This guide intentionally avoids Docker, Nginx, HTTPS, backup, rollback, and other production operations.

## Fit

- GitHub Pages runs only the static Mock Demo.
- Tencent Cloud runs the full Fastify backend, SQLite database, local API, and the real `weibo` CLI bridge.
- v0.4.0 calibrates the real Weibo CLI read-only path against the official binary.

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
WEIBO_CLI_BIN=weibo
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

## Real CLI Reserved Steps (v0.4.0)

Do this only after mock backend mode works.

### 1. Install the official `weibo` CLI independently

To avoid colliding with system-wide binaries (notably `wandb`, which is `wb`):

```bash
npm install -g @weibo-ai/weibo-cli --prefix ~/.local/weibo-cli
ln -sf ~/.local/weibo-cli/bin/weibo ~/.local/bin/weibo
export PATH="$HOME/.local/bin:$PATH"
```

Verify:

```bash
weibo version
```

Expected:

```text
0.8.2
```

Do **not** try to overwrite an existing system `wb` with `npm --force` — on many systems `wb` is Weights & Biases (wandb).

### 2. Log in with the official CLI

```bash
weibo auth login
```

For SSH / headless / CI environments:

```bash
weibo auth login --device
```

If you see `SLOW_DOWN`, wait **2–5 minutes** and retry. The official CLI rate-limits device-code requests.

### 3. Run the probe to calibrate the bridge

```bash
WEIBO_CLI_BIN=weibo npm run probe:weibo-cli
```

Expected readiness category:

```text
CLI_INSTALLED_BUT_NOT_READY
```

…if login, developer verification, or subscription is incomplete. Once all three doctor steps are `true`, the category becomes `CLI_READY_FOR_REAL_CLI_MODE`.

The probe writes a structured report to `reports/weibo-cli-probe-latest.json` for review.

### 4. Switch to real CLI mode

Update `.env`:

```env
MOCK_WEIBO=0
FREE_MODE=1
WEIBO_CLI_BIN=weibo
```

Then build and start:

```bash
npm run build
npm run start
```

### 5. Run the real-CLI smoke test

```bash
MOCK_WEIBO=0 WEIBO_CLI_BIN=weibo npm run test:real-cli:smoke
```

Outcomes:

- `SKIP` — mock mode active, or CLI not found, or wandb detected.
- `UNAVAILABLE` — CLI installed but auth/verification/subscription incomplete. **Not a project failure.**
- `PASS` — `doctor.ready=true`; all read-only bridge calls return data.

v0.4.0 does **not** auto-publish Weibo posts and does **not** calibrate `syncMyPosts`. After login, run `weibo commands list --output json` to discover the correct sync command, then update `REAL_CLI_COMMANDS.myPosts` in `packages/weibo-bridge/src/index.ts`.

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

### weibo CLI not found

Keep `MOCK_WEIBO=1` for mock backend mode. For real CLI mode, install the official CLI independently (see step 1 above) and re-run:

```bash
WEIBO_CLI_BIN=weibo npm run probe:weibo-cli
```

### wandb (`wb`) detected instead of weibo

If your system already has `wb` (Weights & Biases / wandb) on `PATH`, the bridge will detect it and refuse to use it. Install weibo independently and symlink it as in step 1, then export `~/.local/bin` on `PATH` so it takes precedence.

### SQLite File Permission

Make sure the app user can write to `data/`:

```bash
mkdir -p data
```

If needed, adjust ownership for your server user.

### GitHub Pages vs Tencent Cloud

- GitHub Pages = static Mock Demo, no backend, no SQLite, no `weibo` CLI.
- Tencent Cloud = full backend mode with Fastify, SQLite, `/api/*`, and real CLI integration.