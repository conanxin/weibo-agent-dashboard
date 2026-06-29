# Deploy To Tencent Cloud

Shortest deployment path for a small personal Tencent Cloud server.

## Steps

1. Install Node.js 20+.
2. Clone this repository.
3. Install dependencies:

```bash
npm install
```

4. Install the official Weibo CLI.
5. Login with the Weibo CLI on the server.
6. Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

7. Edit `.env`:

```bash
PORT=3000
HOST=0.0.0.0
DATABASE_PATH=./data/weibo.sqlite
WEIBO_CLI_BIN=weibo-cli
FREE_MODE=1
MOCK_WEIBO=0
```

8. Build:

```bash
npm run build
```

9. Start:

```bash
npm run start
```

10. Optional pm2 start:

```bash
npm install -g pm2
pm2 start "npm run start" --name weibo-agent-dashboard
pm2 save
```

This guide intentionally does not include Docker, Nginx, HTTPS, backups, or rollback flow.
