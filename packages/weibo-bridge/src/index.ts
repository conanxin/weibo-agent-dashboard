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

const DATA_CALL_LIMIT_PER_HOUR = 4;
const HOUR_MS = 60 * 60 * 1000;

const dataRateLimiter = {
  windowStart: Date.now(),
  used: 0
};

// ─── Real CLI Command Mapping ────────────────────────────────────────────────
// Adjust these to match the actual weibo-cli command shape on your system.
// Run `npm run probe:weibo-cli` to discover available commands.

export const REAL_CLI_COMMANDS = {
  version: { args: ["--version"] },
  authStatus: { args: ["auth", "status", "--json"] },
  authWhoami: { args: ["auth", "whoami", "--json"] },
  currentUser: { args: ["me", "--json"] },
  myPosts: { args: ["posts", "mine", "--limit", "{limit}", "--json"] },
  userTimeline: { args: ["user", "timeline", "--limit", "{limit}", "--json"] }
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

function isMockMode(): boolean {
  return process.env.MOCK_WEIBO === "1";
}

function getWeiboCliBin(): string {
  return process.env.WEIBO_CLI_BIN || "weibo-cli";
}

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

function parseCliOutput(stdout: string, stderr?: string): { json: JsonValue | null; raw?: string; stderr?: string } {
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

export async function runRealCli(commandKey: RealCliCommandKey, limit?: number): Promise<CliJsonResult> {
  const args = buildArgs(commandKey, limit);
  const command = `${getWeiboCliBin()} ${args.join(" ")}`;

  try {
    const result = await execa(getWeiboCliBin(), args, {
      reject: false,
      windowsHide: true,
      timeout: 30000
    });

    const parsed = parseCliOutput(result.stdout, result.stderr);

    if (result.exitCode !== 0) {
      const message = parsed.raw || result.stderr || `Weibo CLI command failed with exit code ${result.exitCode}.`;
      return {
        ok: false,
        json: parsed.json,
        raw: parsed.raw,
        stderr: parsed.stderr,
        command,
        error: message
      };
    }

    return {
      ok: true,
      json: parsed.json,
      raw: parsed.raw,
      stderr: parsed.stderr,
      command
    };
  } catch (error) {
    return {
      ok: false,
      json: null,
      command,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function asRecord(value: JsonValue | null): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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

export async function checkWeiboCliInstalled(): Promise<{
  installed: boolean;
  bin: string;
  mock: boolean;
  version?: string;
  raw?: string;
  error?: string;
}> {
  if (isMockMode()) {
    return {
      installed: true,
      bin: getWeiboCliBin(),
      mock: true,
      version: "mock-weibo-cli 0.0.0"
    };
  }

  const result = await runRealCli("version");
  if (!result.ok) {
    return {
      installed: false,
      bin: getWeiboCliBin(),
      mock: false,
      error: result.error
    };
  }

  return {
    installed: true,
    bin: getWeiboCliBin(),
    mock: false,
    version: result.raw || (typeof result.json === "string" ? result.json : undefined),
    raw: result.raw
  };
}

export async function getAuthStatus(): Promise<{
  authenticated: boolean;
  mock: boolean;
  raw: JsonValue | string | null;
  error?: string;
}> {
  if (isMockMode()) {
    return {
      authenticated: true,
      mock: true,
      raw: {
        authenticated: true,
        mode: "mock"
      }
    };
  }

  // Try auth status first, fallback to auth whoami
  let result = await runRealCli("authStatus");

  if (!result.ok && result.error?.toLowerCase().includes("unknown command")) {
    result = await runRealCli("authWhoami");
  }

  if (!result.ok) {
    return {
      authenticated: false,
      mock: false,
      raw: result.raw ?? null,
      error: result.error
    };
  }

  const record = asRecord(result.json);
  const authenticated = Boolean(
    record.authenticated === true ||
    record.loggedIn === true ||
    record.logged_in === true ||
    record.status === "authenticated" ||
    record.status === "logged_in" ||
    (record.id && record.screen_name) // whoami returns user object when authenticated
  );

  return {
    authenticated,
    mock: false,
    raw: result.json ?? result.raw ?? null
  };
}

export async function getCurrentUser(): Promise<{
  user: WeiboUser;
  mock: boolean;
  rateLimit: RateLimitStatus;
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

  const result = await runRealCli("currentUser");
  if (!result.ok) {
    return {
      user: normalizeUser(result.raw ?? null),
      mock: false,
      rateLimit: getRateLimitStatus(),
      error: result.error
    };
  }

  return {
    user: normalizeUser(result.json ?? result.raw ?? null),
    mock: false,
    rateLimit: getRateLimitStatus()
  };
}

export async function syncMyPosts(limit?: number): Promise<{
  posts: WeiboPost[];
  mock: boolean;
  raw: JsonValue | string | null;
  rateLimit: RateLimitStatus;
  error?: string;
}> {
  consumeDataCall();

  if (isMockMode()) {
    const safeLimit = Math.min(Math.max(Math.trunc(limit ?? mockPosts.length), 1), mockPosts.length);
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

  const result = await runRealCli("myPosts", limit);
  if (!result.ok) {
    return {
      posts: [],
      mock: false,
      raw: result.raw ?? null,
      rateLimit: getRateLimitStatus(),
      error: result.error
    };
  }

  const rawPosts = extractPostList(result.json);
  return {
    posts: rawPosts.map((post, index) => normalizePost(post, index)),
    mock: false,
    raw: result.json ?? result.raw ?? null,
    rateLimit: getRateLimitStatus()
  };
}
