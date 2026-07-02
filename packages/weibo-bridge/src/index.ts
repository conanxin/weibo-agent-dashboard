import { execa } from "execa";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface CliJsonResult {
  ok: boolean;
  json: JsonValue | null;
  raw?: string;
  stderr?: string;
  command: string;
  error?: string;
  code?: string;
  hint?: string;
  /** Internal: not serialized to API responses. */
  exitCode?: number;
}

export interface WeiboUser {
  id: string;
  screenName: string;
  profileUrl?: string;
  raw: JsonValue;
}

export interface WeiboPost {
  weiboId: string;
  text: string;
  attitudesCount: number;
  commentsCount: number;
  repostsCount: number;
  createdAt: string;
  raw: JsonValue;
}

export interface RateLimitStatus {
  limit: number;
  used: number;
  remaining: number;
  resetAt: string;
}

export interface CliReadyReport {
  installed: boolean;
  bin: string;
  resolvedBin?: string;
  mock: boolean;
  version?: string;
  ready?: boolean;
  steps?: {
    login?: boolean;
    developerVerification?: boolean;
    subscription?: boolean;
  };
  wandbDetected?: boolean;
  statusCategory:
    | "CLI_NOT_FOUND"
    | "WAND_DETECTED"
    | "CLI_INSTALLED_BUT_NOT_READY"
    | "CLI_READY_FOR_LOGIN"
    | "CLI_READY_FOR_REAL_CLI_MODE"
    | "MOCK_MODE";
  nextAction?: { command: string; message: string };
  error?: string;
}

const DATA_CALL_LIMIT_PER_HOUR = 4;
const HOUR_MS = 60 * 60 * 1000;

const dataRateLimiter = {
  windowStart: Date.now(),
  used: 0
};

// ─── Real CLI Command Mapping (v0.4.0 calibration) ──────────────────────────
// Use `--output json` (the official flag), not legacy `--json`.
// `myPosts` is intentionally NOT calibrated yet — it returns
// `COMMAND_NOT_CALIBRATED` until the user runs `weibo commands list --output json`
// after login and updates this mapping.
// `authStatus` uses `weibo doctor --output json` (the canonical readiness check).
// `currentUser` prefers `weibo auth whoami --output json` and falls back to
// `weibo me --output json` if whoami is missing on older CLI builds.

export const REAL_CLI_COMMANDS = {
  version: { args: ["version"] },
  authStatus: { args: ["doctor", "--output", "json"] },
  authWhoami: { args: ["auth", "whoami", "--output", "json"] },
  currentUser: { args: ["me", "--output", "json"] },
  myPosts: { args: ["my", "--limit", "{limit}", "--output", "json"] },
  userTimeline: { args: ["user", "timeline", "--limit", "{limit}", "--output", "json"] },
  commandsList: { args: ["commands", "list", "--output", "json"] }
} as const;

export type RealCliCommandKey = keyof typeof REAL_CLI_COMMANDS;

const mockPosts: WeiboPost[] = [
  {
    weiboId: "mock-1001",
    text: "今天整理了个人内容工作台的想法：先归档，再分析，最后生成可人工复制的草稿。",
    attitudesCount: 18,
    commentsCount: 4,
    repostsCount: 2,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    raw: {
      id: "mock-1001",
      text: "今天整理了个人内容工作台的想法：先归档，再分析，最后生成可人工复制的草稿。",
      attitudes_count: 18,
      comments_count: 4,
      reposts_count: 2
    }
  },
  {
    weiboId: "mock-1002",
    text: "Free mode 的核心是少调用、只处理本人数据，把珍贵额度留给真正需要同步的时候。",
    attitudesCount: 27,
    commentsCount: 6,
    repostsCount: 3,
    createdAt: new Date(Date.now() - 28 * 60 * 60 * 1000).toISOString(),
    raw: {
      id: "mock-1002",
      text: "Free mode 的核心是少调用、只处理本人数据，把珍贵额度留给真正需要同步的时候。",
      attitudes_count: 27,
      comments_count: 6,
      reposts_count: 3
    }
  },
  {
    weiboId: "mock-1003",
    text: "本地 SQLite 先跑通，未来再考虑腾讯云部署。MVP 不自动发微博，只做人机协作。",
    attitudesCount: 35,
    commentsCount: 8,
    repostsCount: 5,
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    raw: {
      id: "mock-1003",
      text: "本地 SQLite 先跑通，未来再考虑腾讯云部署。MVP 不自动发微博，只做人机协作。",
      attitudes_count: 35,
      comments_count: 8,
      reposts_count: 5
    }
  }
];

// ─── Sensitive redaction ─────────────────────────────────────────────────────
// Token, cookie, authorization, secret, bearer, api_key, refresh_token, etc.
// Used to scrub CLI stdout/stderr before reporting.

const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /\b(token|access[_-]?token|refresh[_-]?token|id[_-]?token|session[_-]?token)\b/gi,
  /\b(authorization|auth[_-]?header)\b/gi,
  /\b(cookie|set[_-]?cookie)\b/gi,
  /\b(secret|client[_-]?secret|app[_-]?secret|api[_-]?secret)\b/gi,
  /\b(bearer)\b/gi,
  /\b(api[_-]?key|apikey)\b/gi
];

function redactSensitive(text: string | undefined | null): string {
  if (!text) return "";
  let out = text;
  // key=value or key: value
  out = out.replace(
    /([A-Za-z][A-Za-z0-9_.\-]*(?:token|secret|cookie|authorization|bearer|api[_-]?key|apikey)[A-Za-z0-9_.\-]*)(\s*[:=]\s*)([^\s,;"'`<>]+)/gi,
    (_match, key, sep) => `${sep}***REDACTED***`
  );
  // "key": "value"
  out = out.replace(
    /("[A-Za-z][A-Za-z0-9_.\-]*(?:token|secret|cookie|authorization|bearer|api[_-]?key|apikey)[A-Za-z0-9_.\-]*"\s*:\s*)"([^"]*)"/gi,
    (_match, prefix) => `${prefix}"***REDACTED***"`
  );
  return out;
}

function redactJson(value: JsonValue | null): JsonValue | null {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return redactSensitive(value);
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.map((v) => redactJson(v));
  }
  if (typeof value === "object") {
    const out: { [k: string]: JsonValue } = {};
    for (const [k, v] of Object.entries(value)) {
      const sensitive = SENSITIVE_KEY_PATTERNS.some((p) => p.test(k));
      if (sensitive && (typeof v === "string" || typeof v === "number")) {
        out[k] = "***REDACTED***";
      } else if (sensitive && v === null) {
        out[k] = null;
      } else {
        out[k] = redactJson(v as JsonValue) as JsonValue;
      }
    }
    return out;
  }
  return value;
}

// ─── Auth readiness pattern detection ────────────────────────────────────────

const AUTH_NOT_READY_PATTERNS: RegExp[] = [
  /缺少登录令牌/,
  /please run .*auth login/i,
  /not logged in/i,
  /unauthorized/i,
  /SLOW_DOWN/i,
  /未完成开发者认证/,
  /未开通套餐/
];

function looksLikeAuthNotReady(text: string | undefined): boolean {
  if (!text) return false;
  return AUTH_NOT_READY_PATTERNS.some((p) => p.test(text));
}

// ─── Mock / bin helpers ──────────────────────────────────────────────────────

export function isMockMode(): boolean {
  return process.env.MOCK_WEIBO === "1";
}

/**
 * The CLI binary priority, when WEIBO_CLI_BIN env is not set:
 *   1. weibo      (canonical install name)
 *   2. weibo-cli  (legacy package name)
 *   3. wb         (last resort — but only if it is NOT wandb)
 *
 * If WEIBO_CLI_BIN is set explicitly and resolves to wandb, callers should
 * refuse it instead of shadowing the user's real wandb binary.
 */
const BIN_CANDIDATES = ["weibo", "weibo-cli", "wb"] as const;

const WANDB_MARKERS = ["wandb", "Weights & Biases", "Weights and Biases", "W&B"];

function readCachedResolvedBin(): string | undefined {
  return (globalThis as { __WEIBO_BRIDGE_RESOLVED_BIN__?: string }).__WEIBO_BRIDGE_RESOLVED_BIN__;
}

function writeCachedResolvedBin(value: string | undefined): void {
  (globalThis as { __WEIBO_BRIDGE_RESOLVED_BIN__?: string }).__WEIBO_BRIDGE_RESOLVED_BIN__ = value;
}

export function getConfiguredBin(): string {
  return process.env.WEIBO_CLI_BIN || "weibo";
}

export function clearResolvedBinCache(): void {
  writeCachedResolvedBin(undefined);
}

/**
 * Decide whether a binary is the Weibo CLI vs. wandb by inspecting `--help`.
 * `wb --version` alone is not enough (it just prints "wb, version …").
 */
async function identifyBinary(bin: string): Promise<"weibo" | "wandb" | "unknown"> {
  try {
    const result = await execa(bin, ["--help"], {
      reject: false,
      windowsHide: true,
      timeout: 5000
    });
    if (result.failed && !result.stdout && !result.stderr) return "unknown";
    const combined = `${result.stdout || ""}\n${result.stderr || ""}`;
    if (WANDB_MARKERS.some((m) => combined.includes(m))) return "wandb";
    if (/weibo/i.test(combined)) return "weibo";
    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Probe a candidate binary to decide whether it is the Weibo CLI.
 * Returns:
 *   { kind: "weibo", version } when the candidate responds like the Weibo CLI
 *   { kind: "wandb" }            when the candidate is wandb
 *   { kind: "missing" }          when the candidate cannot be executed
 *   { kind: "unknown" }          when the candidate ran but neither matched
 */
async function probeCandidate(bin: string): Promise<
  | { kind: "weibo"; version?: string }
  | { kind: "wandb" }
  | { kind: "missing" }
  | { kind: "unknown"; stdout: string; stderr: string; exitCode: number }
> {
  try {
    const result = await execa(bin, ["--version"], {
      reject: false,
      windowsHide: true,
      timeout: 5000
    });
    // execa with reject:false reports ENOENT as { failed: true, exitCode: undefined }.
    if (result.failed || (!result.stdout && !result.stderr && result.exitCode === undefined)) {
      return { kind: "missing" };
    }
    if (result.exitCode === 0) {
      return { kind: "weibo", version: result.stdout?.trim() };
    }
    return {
      kind: "unknown",
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      exitCode: result.exitCode ?? -1
    };
  } catch {
    return { kind: "missing" };
  }
}

export async function resolveWeiboCliBin(): Promise<{
  bin: string;
  installed: boolean;
  wandbDetected: boolean;
  reason:
    | "MOCK_MODE"
    | "ENV_OVERRIDE_OK"
    | "ENV_OVERRIDE_NOT_FOUND"
    | "ENV_OVERRIDE_IS_WANDB"
    | "FOUND"
    | "NOT_FOUND";
}> {
  if (isMockMode()) {
    return { bin: getConfiguredBin(), installed: true, wandbDetected: false, reason: "MOCK_MODE" };
  }

  const cached = readCachedResolvedBin();
  if (cached) {
    return { bin: cached, installed: true, wandbDetected: false, reason: "FOUND" };
  }

  const configured = getConfiguredBin();
  const candidates = configured ? [configured, ...BIN_CANDIDATES.filter((c) => c !== configured)] : [...BIN_CANDIDATES];

  let wandbDetected = false;
  for (const candidate of candidates) {
    const probe = await probeCandidate(candidate);
    if (probe.kind === "missing") {
      if (candidate === configured) {
        return {
          bin: candidate,
          installed: false,
          wandbDetected,
          reason: "ENV_OVERRIDE_NOT_FOUND"
        };
      }
      continue;
    }
    const identity = await identifyBinary(candidate);
    if (identity === "wandb") {
      wandbDetected = true;
      if (candidate === configured) {
        return {
          bin: candidate,
          installed: false,
          wandbDetected: true,
          reason: "ENV_OVERRIDE_IS_WANDB"
        };
      }
      // Skip wandb silently and try the next candidate.
      continue;
    }
    if (identity === "weibo") {
      writeCachedResolvedBin(candidate);
      const reason: "ENV_OVERRIDE_OK" | "FOUND" =
        candidate === configured ? "ENV_OVERRIDE_OK" : "FOUND";
      return { bin: candidate, installed: true, wandbDetected, reason };
    }
    // Unknown identity — if this was the env override, respect the user's
    // explicit choice and try to use it as-is.
    if (candidate === configured) {
      return {
        bin: candidate,
        installed: true,
        wandbDetected,
        reason: "ENV_OVERRIDE_OK"
      };
    }
  }

  return {
    bin: configured,
    installed: false,
    wandbDetected,
    reason: "NOT_FOUND"
  };
}

// ─── Rate limiter ────────────────────────────────────────────────────────────

function resetWindowIfNeeded(): void {
  if (Date.now() - dataRateLimiter.windowStart >= HOUR_MS) {
    dataRateLimiter.windowStart = Date.now();
    dataRateLimiter.used = 0;
  }
}

function consumeDataCall(): void {
  resetWindowIfNeeded();
  if (dataRateLimiter.used >= DATA_CALL_LIMIT_PER_HOUR) {
    const resetAt = new Date(dataRateLimiter.windowStart + HOUR_MS).toISOString();
    throw new Error(`Free mode data call limit reached. Try again after ${resetAt}.`);
  }
  dataRateLimiter.used += 1;
}

export function getRateLimitStatus(): RateLimitStatus {
  resetWindowIfNeeded();
  return {
    limit: DATA_CALL_LIMIT_PER_HOUR,
    used: dataRateLimiter.used,
    remaining: Math.max(DATA_CALL_LIMIT_PER_HOUR - dataRateLimiter.used, 0),
    resetAt: new Date(dataRateLimiter.windowStart + HOUR_MS).toISOString()
  };
}

// ─── CLI invocation ──────────────────────────────────────────────────────────

function parseCliOutput(
  stdout: string,
  stderr?: string
): { json: JsonValue | null; raw?: string; stderr?: string } {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return {
      json: null,
      raw: "",
      stderr: stderr?.trim() || undefined
    };
  }

  try {
    return {
      json: JSON.parse(trimmed) as JsonValue,
      stderr: stderr?.trim() || undefined
    };
  } catch {
    return {
      json: null,
      raw: trimmed,
      stderr: stderr?.trim() || undefined
    };
  }
}

function buildArgs(commandKey: RealCliCommandKey, limit?: number): string[] {
  const template = REAL_CLI_COMMANDS[commandKey].args;
  return template.map((arg) => {
    if (arg === "{limit}") {
      return String(Math.min(Math.max(Math.trunc(limit ?? 20), 1), 50));
    }
    return arg;
  });
}

function joinCommand(bin: string, args: string[]): string {
  return `${bin} ${args.join(" ")}`.trim();
}

async function runCliArgs(
  bin: string,
  args: string[],
  options: { timeoutMs?: number } = {}
): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  notFound: boolean;
}> {
  try {
    const result = await execa(bin, args, {
      reject: false,
      windowsHide: true,
      timeout: options.timeoutMs ?? 30000
    });
    // ENOENT with reject:false comes back as { failed: true, exitCode: undefined }.
    if (result.failed && !result.stdout && !result.stderr && result.exitCode === undefined) {
      return {
        exitCode: -1,
        stdout: "",
        stderr: "Command not found",
        timedOut: false,
        notFound: true
      };
    }
    return {
      exitCode: result.exitCode ?? -1,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      timedOut: Boolean(result.timedOut),
      notFound: false
    };
  } catch (error) {
    const err = error as { code?: string; timedOut?: boolean; exitCode?: number; stdout?: string; stderr?: string; message?: string };
    if (err.code === "ENOENT") {
      return {
        exitCode: -1,
        stdout: err.stdout || "",
        stderr: err.stderr || err.message || "Command not found",
        timedOut: false,
        notFound: true
      };
    }
    return {
      exitCode: err.exitCode ?? -1,
      stdout: err.stdout || "",
      stderr: err.stderr || err.message || "",
      timedOut: Boolean(err.timedOut),
      notFound: false
    };
  }
}

export async function runRealCli(
  commandKey: RealCliCommandKey,
  limit?: number
): Promise<CliJsonResult> {
  const args = buildArgs(commandKey, limit);
  const resolved = await resolveWeiboCliBin();
  const bin = resolved.bin;
  const command = joinCommand(bin, args);

  if (isMockMode()) {
    return {
      ok: false,
      json: null,
      command,
      code: "MOCK_MODE",
      hint: "MOCK_WEIBO=1 — real CLI calls are disabled."
    };
  }

  if (!resolved.installed) {
    const code = resolved.wandbDetected
      ? "WAND_DETECTED"
      : resolved.reason === "ENV_OVERRIDE_IS_WANDB"
        ? "WAND_DETECTED"
        : "CLI_NOT_FOUND";
    return {
      ok: false,
      json: null,
      command,
      code,
      hint: resolved.wandbDetected
        ? "The configured WEIBO_CLI_BIN appears to be Weights & Biases (wandb). Install weibo-cli separately and unset WEIBO_CLI_BIN, or set WEIBO_CLI_BIN to the actual weibo binary path."
        : "Install the Weibo CLI independently (for example to ~/.local/weibo-cli) and symlink it to ~/.local/bin/weibo, or set WEIBO_CLI_BIN to the absolute path."
    };
  }

  const proc = await runCliArgs(bin, args, { timeoutMs: 30000 });
  const parsed = parseCliOutput(proc.stdout, proc.stderr);
  const redactedStderr = redactSensitive(parsed.stderr);
  const redactedRaw = redactSensitive(parsed.raw);
  const redactedJson = redactJson(parsed.json);

  if (proc.notFound) {
    return {
      ok: false,
      json: null,
      command,
      code: "CLI_NOT_FOUND",
      stderr: redactedStderr,
      hint: "The configured Weibo CLI binary was not found at execution time. Re-run the probe to refresh."
    };
  }

  if (proc.exitCode !== 0) {
    const message = redactedRaw || redactedStderr || `Weibo CLI command failed with exit code ${proc.exitCode}.`;
    const authNotReady = looksLikeAuthNotReady(proc.stdout) || looksLikeAuthNotReady(proc.stderr);
    return {
      ok: false,
      json: redactedJson,
      raw: redactedRaw,
      stderr: redactedStderr,
      command,
      error: message,
      code: authNotReady ? "AUTH_NOT_READY" : "CLI_ERROR",
      hint: authNotReady
        ? "Run `weibo auth login` or `weibo auth login --device`. If you see SLOW_DOWN, wait 2–5 minutes and retry."
        : `Weibo CLI returned exit code ${proc.exitCode}. Inspect stderr for details.`,
      exitCode: proc.exitCode
    };
  }

  return {
    ok: true,
    json: redactedJson,
    raw: redactedRaw,
    stderr: redactedStderr,
    command,
    exitCode: proc.exitCode
  };
}

// ─── Normalizers ─────────────────────────────────────────────────────────────

function asRecord(value: JsonValue | null): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as { [k: string]: JsonValue }) : {};
}

function readString(record: Record<string, JsonValue>, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
  }
  return fallback;
}

function readNumber(record: Record<string, JsonValue>, keys: string[]): number {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
      return Number(value);
    }
  }
  return 0;
}

function normalizeUser(raw: JsonValue): WeiboUser {
  const record = asRecord(raw);
  const userRecord = asRecord(record.user ?? raw);
  const id = readString(userRecord, ["id", "uid", "user_id"], "unknown");
  const screenName = readString(userRecord, ["screen_name", "screenName", "name", "username"], "unknown");
  const profileUrl = readString(userRecord, ["profile_url", "profileUrl", "url"], "");
  return {
    id,
    screenName,
    profileUrl: profileUrl || undefined,
    raw
  };
}

function normalizePost(raw: JsonValue, index: number): WeiboPost {
  const record = asRecord(raw);
  const weiboId = readString(record, ["weibo_id", "weiboId", "id", "mid"], `item-${index}`);
  const text = readString(record, ["text", "content", "full_text", "fullText"], JSON.stringify(raw));
  const createdAt = readString(record, ["created_at", "createdAt", "created_time", "createdTime"], new Date().toISOString());

  return {
    weiboId,
    text,
    attitudesCount: readNumber(record, ["attitudes_count", "attitudesCount", "likes", "like_count"]),
    commentsCount: readNumber(record, ["comments_count", "commentsCount", "comments", "comment_count"]),
    repostsCount: readNumber(record, ["reposts_count", "repostsCount", "reposts", "share_count"]),
    createdAt,
    raw
  };
}

function extractPostList(raw: JsonValue | null): JsonValue[] {
  if (Array.isArray(raw)) {
    return raw;
  }
  const record = asRecord(raw);
  for (const key of ["posts", "items", "statuses", "data"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function checkWeiboCliInstalled(): Promise<{
  installed: boolean;
  bin: string;
  resolvedBin?: string;
  mock: boolean;
  version?: string;
  raw?: string;
  wandbDetected?: boolean;
  error?: string;
}> {
  if (isMockMode()) {
    return {
      installed: true,
      bin: getConfiguredBin(),
      resolvedBin: "mock",
      mock: true,
      version: "mock-weibo-cli 0.0.0"
    };
  }

  const resolved = await resolveWeiboCliBin();

  if (!resolved.installed) {
    return {
      installed: false,
      bin: resolved.bin,
      resolvedBin: undefined,
      mock: false,
      wandbDetected: resolved.wandbDetected,
      error: resolved.wandbDetected
        ? "The configured WEIBO_CLI_BIN appears to be Weights & Biases (wandb), not the Weibo CLI."
        : "Weibo CLI not found. Set WEIBO_CLI_BIN or install weibo to a directory on PATH."
    };
  }

  const result = await runRealCli("version");
  if (!result.ok) {
    return {
      installed: false,
      bin: resolved.bin,
      resolvedBin: resolved.bin,
      mock: false,
      error: result.error
    };
  }

  return {
    installed: true,
    bin: getConfiguredBin(),
    resolvedBin: resolved.bin,
    mock: false,
    version: result.raw || (typeof result.json === "string" ? result.json : undefined),
    raw: result.raw
  };
}

/**
 * Aggregate readiness report: combines binary detection with doctor steps
 * so callers can show a single structured status in the dashboard.
 */
export async function getCliReadiness(): Promise<CliReadyReport> {
  if (isMockMode()) {
    return {
      installed: true,
      bin: getConfiguredBin(),
      resolvedBin: "mock",
      mock: true,
      statusCategory: "MOCK_MODE"
    };
  }

  const resolved = await resolveWeiboCliBin();

  if (!resolved.installed) {
    return {
      installed: false,
      bin: resolved.bin,
      mock: false,
      wandbDetected: resolved.wandbDetected,
      statusCategory: resolved.wandbDetected ? "WAND_DETECTED" : "CLI_NOT_FOUND",
      error: resolved.wandbDetected
        ? "Configured binary is wandb, not the Weibo CLI."
        : "Weibo CLI binary not found on PATH."
    };
  }

  const doctorResult = await runRealCli("authStatus");
  const doctorRecord = asRecord(doctorResult.json);

  const steps = {
    login: doctorRecord.steps ? Boolean(asRecord(doctorRecord.steps).login) : undefined,
    developerVerification: doctorRecord.steps
      ? Boolean(asRecord(doctorRecord.steps).developerVerification)
      : undefined,
    subscription: doctorRecord.steps ? Boolean(asRecord(doctorRecord.steps).subscription) : undefined
  } as CliReadyReport["steps"];

  const nextActionRaw = doctorRecord.nextAction;
  const nextAction =
    nextActionRaw && typeof nextActionRaw === "object" && !Array.isArray(nextActionRaw)
      ? {
          command: readString(asRecord(nextActionRaw), ["command"], ""),
          message: readString(asRecord(nextActionRaw), ["message"], "")
        }
      : undefined;

  if (!doctorResult.ok) {
    return {
      installed: true,
      bin: getConfiguredBin(),
      resolvedBin: resolved.bin,
      mock: false,
      version: undefined,
      statusCategory: "CLI_INSTALLED_BUT_NOT_READY",
      steps,
      nextAction,
      error: doctorResult.error
    };
  }

  const ready = doctorRecord.ready === true;
  const version = doctorResult.raw || (typeof doctorResult.json === "string" ? doctorResult.json : undefined);

  return {
    installed: true,
    bin: getConfiguredBin(),
    resolvedBin: resolved.bin,
    mock: false,
    version,
    ready,
    steps,
    nextAction,
    statusCategory: ready ? "CLI_READY_FOR_REAL_CLI_MODE" : "CLI_INSTALLED_BUT_NOT_READY"
  };
}

export async function getAuthStatus(): Promise<{
  authenticated: boolean;
  mock: boolean;
  ready: boolean;
  steps: {
    login?: boolean;
    developerVerification?: boolean;
    subscription?: boolean;
  };
  raw: JsonValue | string | null;
  code?: string;
  hint?: string;
  nextAction?: { command: string; message: string };
  error?: string;
}> {
  if (isMockMode()) {
    return {
      authenticated: true,
      mock: true,
      ready: true,
      steps: { login: true, developerVerification: true, subscription: true },
      raw: { authenticated: true, mode: "mock" }
    };
  }

  // Use `weibo doctor --output json` as the canonical readiness signal.
  const result = await runRealCli("authStatus");

  if (!result.ok) {
    const authNotReady = result.code === "AUTH_NOT_READY" || looksLikeAuthNotReady(result.error);
    return {
      authenticated: false,
      mock: false,
      ready: false,
      steps: {},
      raw: result.json ?? result.raw ?? null,
      code: authNotReady ? "AUTH_NOT_READY" : result.code ?? "CLI_ERROR",
      hint: authNotReady
        ? "Run `weibo auth login` or `weibo auth login --device`."
        : result.hint,
      error: result.error
    };
  }

  const record = asRecord(result.json);
  const ready = record.ready === true;
  const stepsRecord = asRecord(record.steps);
  const steps = {
    login: stepsRecord.login === true,
    developerVerification: stepsRecord.developerVerification === true,
    subscription: stepsRecord.subscription === true
  };

  const authenticated = ready && steps.login;
  const nextActionRaw = record.nextAction;
  const nextAction =
    nextActionRaw && typeof nextActionRaw === "object" && !Array.isArray(nextActionRaw)
      ? {
          command: readString(asRecord(nextActionRaw), ["command"], ""),
          message: readString(asRecord(nextActionRaw), ["message"], "")
        }
      : undefined;

  return {
    authenticated,
    mock: false,
    ready,
    steps,
    raw: result.json ?? result.raw ?? null,
    nextAction,
    code: authenticated ? undefined : "AUTH_NOT_READY",
    hint: authenticated
      ? undefined
      : nextAction?.message || "Run `weibo auth login` or `weibo auth login --device`."
  };
}

export async function getCurrentUser(): Promise<{
  user: WeiboUser;
  mock: boolean;
  rateLimit: RateLimitStatus;
  code?: string;
  hint?: string;
  error?: string;
}> {
  consumeDataCall();

  if (isMockMode()) {
    return {
      user: {
        id: "mock-user-1",
        screenName: "Mock Weibo User",
        profileUrl: "https://weibo.com/mock-user",
        raw: {
          id: "mock-user-1",
          screen_name: "Mock Weibo User",
          profile_url: "https://weibo.com/mock-user"
        }
      },
      mock: true,
      rateLimit: getRateLimitStatus()
    };
  }

  // Primary: `weibo auth whoami --output json`. Fallback: `weibo me --output json`.
  let result = await runRealCli("authWhoami");
  if (!result.ok && /unknown command/i.test(result.error ?? "")) {
    result = await runRealCli("currentUser");
  }

  if (!result.ok) {
    const authNotReady = result.code === "AUTH_NOT_READY";
    return {
      user: normalizeUser(result.json ?? null),
      mock: false,
      rateLimit: getRateLimitStatus(),
      code: authNotReady ? "AUTH_NOT_READY" : result.code ?? "CLI_ERROR",
      hint: authNotReady
        ? "Run `weibo auth login` or `weibo auth login --device`."
        : result.hint,
      error: result.error
    };
  }

  return {
    user: normalizeUser(result.json ?? result.raw ?? null),
    mock: false,
    rateLimit: getRateLimitStatus()
  };
}

export async function syncMyPosts(_limit?: number): Promise<{
  posts: WeiboPost[];
  mock: boolean;
  raw: JsonValue | string | null;
  rateLimit: RateLimitStatus;
  code?: string;
  hint?: string;
  error?: string;
}> {
  // We still count a request slot, but in real-CLI mode we do NOT actually call
  // the CLI yet: the `myPosts` mapping is intentionally uncalibrated until the
  // operator runs `weibo commands list --output json` after login and updates
  // REAL_CLI_COMMANDS. This protects Free Mode quotas and avoids issuing a
  // known-bad call.
  if (!isMockMode()) {
    return {
      posts: [],
      mock: false,
      raw: null,
      rateLimit: getRateLimitStatus(),
      code: "COMMAND_NOT_CALIBRATED",
      hint:
        "Run `weibo commands list --output json` after login and update REAL_CLI_COMMANDS.myPosts in packages/weibo-bridge/src/index.ts."
    };
  }

  const limit = _limit ?? mockPosts.length;
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), mockPosts.length);
  const selectedPosts = mockPosts.slice(0, safeLimit);
  return {
    posts: selectedPosts,
    mock: true,
    raw: {
      posts: selectedPosts.map((post) => post.raw)
    },
    rateLimit: getRateLimitStatus()
  };
}