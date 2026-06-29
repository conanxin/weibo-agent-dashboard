# Weibo CLI Adapter Guide

This document explains how the `weibo-bridge` package maps to the real `weibo-cli` commands, and how to adapt the mapping to match your installed CLI version.

## Current Assumed CLI Commands

The bridge assumes the following command shapes:

| Bridge Function | Assumed CLI Command | Purpose |
|----------------|---------------------|---------|
| `checkWeiboCliInstalled` | `weibo-cli --version` | Check CLI exists |
| `getAuthStatus` | `weibo-cli auth status --json` | Check login state |
| `getAuthStatus` (fallback) | `weibo-cli auth whoami --json` | Alternative auth check |
| `getCurrentUser` | `weibo-cli me --json` | Get current user profile |
| `syncMyPosts` | `weibo-cli posts mine --limit N --json` | Get current user's posts |
| (future) | `weibo-cli user timeline --limit N --json` | User timeline |

## How to Run the Probe Script

```bash
npm run probe:weibo-cli
```

Or with a custom binary path:

```bash
WEIBO_CLI_BIN=/path/to/weibo-cli node scripts/probe-weibo-cli.mjs
```

The probe will test each command and report:
- Whether the CLI binary is found
- Which commands are available
- Which commands require authentication
- Which commands support JSON output
- Timing for each command

## How to Modify Command Mapping

If the probe shows different command shapes on your system, edit:

**File:** `packages/weibo-bridge/src/index.ts`

Find the `REAL_CLI_COMMANDS` object:

```typescript
export const REAL_CLI_COMMANDS = {
  version: { args: ["--version"] },
  authStatus: { args: ["auth", "status", "--json"] },
  authWhoami: { args: ["auth", "whoami", "--json"] },
  currentUser: { args: ["me", "--json"] },
  myPosts: { args: ["posts", "mine", "--limit", "{limit}", "--json"] },
  userTimeline: { args: ["user", "timeline", "--limit", "{limit}", "--json"] }
} as const;
```

Modify the `args` arrays to match your CLI. The special placeholder `{limit}` will be replaced with the actual limit number.

Example: if your CLI uses `weibo-cli user --self --format json` instead:

```typescript
currentUser: { args: ["user", "--self", "--format", "json"] }
```

## MOCK_WEIBO=1 vs MOCK_WEIBO=0

| Mode | Behavior |
|------|----------|
| `MOCK_WEIBO=1` (default) | Returns mock data. Never calls real CLI. Safe for demos and CI. |
| `MOCK_WEIBO=0` | Calls real weibo-cli. Requires CLI installed and authenticated. |

Switch to real mode:

```bash
# .env
MOCK_WEIBO=0
FREE_MODE=1
```

## Free Mode Reminder

Even in real CLI mode, keep `FREE_MODE=1` to enforce:
- Max 4 data calls per hour
- Only current-user data
- No auto-publishing
- No search/monitoring features

## Error Handling

When a real CLI command fails, the bridge returns a structured error:

```json
{
  "ok": false,
  "error": "Command failed: weibo-cli me --json",
  "command": "weibo-cli me --json",
  "raw": "...",
  "stderr": "..."
}
```

The server will surface this to the frontend without crashing.

## CLI Not Installed?

If `weibo-cli` is not installed:
1. The probe script will report "CLI not found"
2. The server will return clear errors on `/api/weibo/*` endpoints
3. The dashboard will show "Weibo CLI not available" in Settings

Install the official CLI (check weibo.com developer docs for current package name).

## JSON vs Raw Output

The bridge prefers JSON output (`--json` flag). If the CLI doesn't support JSON:
- Set `json: null` in the result
- `raw` will contain the text output
- The bridge will attempt to parse or return the raw string

Consider adding a parser for your CLI's text format if JSON is not available.
