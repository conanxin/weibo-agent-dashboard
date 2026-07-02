# Weibo CLI Adapter Guide

This document explains how the `weibo-bridge` package maps to the real Weibo CLI commands, how the canonical CLI binary is detected, and how to interpret the readiness signals returned by the bridge.

## Canonical CLI Binary Name

The official Weibo CLI installs a binary named **`weibo`** (with `weibo-cli` as a legacy alias). The project never assumes the canonical name blindly — it probes the binary against the user's intent and refuses to shadow an unrelated CLI.

Detection priority (v0.4.0):

1. `WEIBO_CLI_BIN` env override (if set and resolves to a real binary).
2. `weibo` on `PATH`.
3. `weibo-cli` on `PATH` (legacy package name).
4. `wb` on `PATH` — **only if it is not** Weights & Biases (wandb).

If `wb` is detected as wandb, the bridge skips it and reports `WAND_DETECTED`. The script never recommends `npm --force` to overwrite a system `wb`.

## Recommended Independent Install

To avoid colliding with system-wide CLIs:

```bash
npm install -g @weibo-ai/weibo-cli --prefix ~/.local/weibo-cli
ln -sf ~/.local/weibo-cli/bin/weibo ~/.local/bin/weibo
```

If `~/.local/bin` is not on `PATH`, export it for the current shell:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Verify:

```bash
weibo version
weibo doctor --output json
```

If you explicitly want a different binary, set the env var instead:

```bash
export WEIBO_CLI_BIN=/absolute/path/to/weibo
```

## Current Real CLI Command Mapping

The bridge uses `--output json` (the official flag), not the older `--json`.

| Bridge Function | CLI Command | Notes |
|----------------|-------------|-------|
| `checkWeiboCliInstalled` | `weibo version` | Verifies the binary exists and is the real Weibo CLI (not wandb). |
| `getAuthStatus` | `weibo doctor --output json` | Canonical readiness signal; returns `ready`, `steps.{login,developerVerification,subscription}`, and `nextAction`. |
| `getCurrentUser` (primary) | `weibo auth whoami --output json` | Current authenticated user. |
| `getCurrentUser` (fallback) | `weibo me --output json` | Used when `auth whoami` reports `unknown command`. |
| `syncMyPosts` | **intentionally uncalibrated in v0.4.0** | Returns `code: COMMAND_NOT_CALIBRATED` until the operator logs in, runs `weibo commands list --output json`, and updates `REAL_CLI_COMMANDS.myPosts`. |
| (informational) | `weibo commands list --output json` | Used by the operator to discover the correct sync command. |

## Auth Readiness Signals

`getAuthStatus` returns the structured `weibo doctor --output json` payload:

```json
{
  "ready": false,
  "steps": {
    "login": false,
    "developerVerification": false,
    "subscription": false
  },
  "nextAction": {
    "command": "weibo-cli auth login",
    "message": "请先登录账号，然后重新运行 weibo-cli doctor。"
  }
}
```

The bridge re-shapes this into:

```json
{
  "authenticated": false,
  "mock": false,
  "ready": false,
  "steps": { "login": false, "developerVerification": false, "subscription": false },
  "raw": { /* doctor JSON */ },
  "code": "AUTH_NOT_READY",
  "hint": "Run `weibo auth login` or `weibo auth login --device`.",
  "nextAction": { "command": "weibo-cli auth login", "message": "..." }
}
```

`code: AUTH_NOT_READY` is also returned by `getCurrentUser` and the probe script when any of these patterns appear in CLI output:

- `缺少登录令牌`
- `please run ... auth login`
- `not logged in`
- `unauthorized`
- `SLOW_DOWN`
- `未完成开发者认证`
- `未开通套餐`

If you see `SLOW_DOWN`, wait **2–5 minutes** and retry. The official Weibo CLI rate-limits device-code requests.

## Sync Readiness Status Categories

`npm run probe:weibo-cli` classifies the local CLI into one of these categories:

| Status Category | Meaning | Recommended action |
|-----------------|---------|---------------------|
| `CLI_NOT_FOUND` | No Weibo CLI binary on PATH. | Install with `npm install -g @weibo-ai/weibo-cli --prefix ~/.local/weibo-cli` and symlink. |
| `WAND_DETECTED` | The configured binary (or only `wb` candidate) is Weights & Biases, not the Weibo CLI. | Install weibo independently; **do not** overwrite `wb` with `npm --force`. |
| `CLI_INSTALLED_BUT_NOT_READY` | Binary works, `weibo doctor --output json` returns `ready:false`. | Run `weibo auth login` (browser) or `weibo auth login --device` (SSH/headless); complete developer verification and subscription. |
| `CLI_READY_FOR_REAL_CLI_MODE` | `weibo doctor --output json` returns `ready:true`. | Switch to real CLI mode by setting `MOCK_WEIBO=0` in `.env`. |

A "version succeeded" result is **not** the same as "authenticated". Only `doctor.ready === true` counts as fully ready.

## Running the Probe

```bash
npm run probe:weibo-cli
```

Or with an explicit binary:

```bash
WEIBO_CLI_BIN=/absolute/path/to/weibo npm run probe:weibo-cli
```

Or to verify a non-default name:

```bash
WEIBO_CLI_BIN=weibo-cli npm run probe:weibo-cli
```

The probe reports:

- Which binaries exist on `PATH` (`weibo`, `weibo-cli`, `wb`).
- Whether any candidate is wandb (and therefore skipped).
- For each read-only command: exit code, redacted stdout/stderr preview, parsed JSON, and a status category (`AVAILABLE_JSON`, `AVAILABLE_RAW`, `NOT_AUTHENTICATED`, `COMMAND_NOT_FOUND`, `CLI_ERROR`, `TIMEOUT`, `BIN_NOT_FOUND`).
- An overall readiness category.

It writes a structured JSON report to:

```text
reports/weibo-cli-probe-latest.json
```

The report is suitable for human review and for diffing between runs.

### Legacy Command Probes (Downgraded)

The probe also tests these legacy shapes so you can see whether they are still valid on your installed CLI:

- `weibo auth status --output json`
- `weibo posts mine --limit 3 --output json`
- `weibo user timeline --limit 3 --output json`

These are tagged `legacy: true` in the report and **are not used** for readiness classification. They are informational only — if you upgrade the bridge mapping, remove them from `REAL_CLI_COMMANDS`.

## Running the Real-CLI Smoke Test

```bash
# Skip when MOCK_WEIBO=1 (default).
MOCK_WEIBO=0 WEIBO_CLI_BIN=weibo npm run test:real-cli:smoke
```

Outcomes:

- `SKIP` — `MOCK_WEIBO=1`, or CLI not found, or `WEIBO_CLI_BIN=wb` (wandb).
- `UNAVAILABLE` — CLI installed but `doctor.ready=false`. **Not** a project failure.
- `PASS` — `doctor.ready=true`; runs `getAuthStatus`, `getCurrentUser`, and `syncMyPosts(5)`. `syncMyPosts` returns `COMMAND_NOT_CALIBRATED` in v0.4.0 by design; the smoke treats that as an acceptable signal, not a failure.

The smoke never fails the project when real-CLI readiness is incomplete. Mock-mode `npm run test:smoke` is the canonical CI gate.

## Free Mode Reminder

Even in real CLI mode, keep `FREE_MODE=1` to enforce:

- Max 4 data calls per hour.
- Only current-user data.
- No auto-publishing.
- No search/monitoring features.

## Sensitive Field Redaction

The probe and the bridge redact token-like fields from any CLI output before logging or returning them:

- `token`, `access_token`, `refresh_token`, `id_token`
- `authorization`, `auth_header`
- `cookie`, `set-cookie`
- `secret`, `client_secret`, `app_secret`, `api_secret`
- `bearer`
- `api_key`, `apikey`

These appear as `***REDACTED***` in stdout/stderr previews and in JSON responses.

## Modifying the Command Mapping

When you complete login and developer verification and want to calibrate `myPosts`:

1. Run `weibo commands list --output json` to discover the right shape.
2. Edit `REAL_CLI_COMMANDS.myPosts` in `packages/weibo-bridge/src/index.ts`.
3. Update the `myPosts` placeholder in `syncMyPosts()` so it actually calls the CLI.
4. Run `npm run build && npm run test:smoke && MOCK_WEIBO=0 npm run test:real-cli:smoke`.

Auto-publishing remains disabled.