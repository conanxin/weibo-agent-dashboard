export interface Health {
  status: string;
  time: string;
  mockMode: boolean;
  freeMode: boolean;
}

export interface WeiboStatus {
  cli: {
    installed: boolean;
    bin: string;
    resolvedBin?: string;
    mock: boolean;
    version?: string;
    raw?: string;
    wandbDetected?: boolean;
    error?: string;
  };
  auth: {
    authenticated: boolean;
    mock: boolean;
    ready: boolean;
    steps: {
      login?: boolean;
      developerVerification?: boolean;
      subscription?: boolean;
    };
    raw: unknown;
    code?: string;
    hint?: string;
    nextAction?: { command: string; message: string };
    error?: string;
  };
  readiness?: {
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
  };
  rateLimit: {
    limit: number;
    used: number;
    remaining: number;
    resetAt: string;
  };
  local: {
    postCount: number;
    lastSyncAt: string | null;
    callsToday: number;
  };
}

export interface Post {
  id: number;
  weibo_id: string;
  text: string;
  raw_json: string;
  attitudes_count: number;
  comments_count: number;
  reposts_count: number;
  created_at: string;
  synced_at: string;
}

export interface AnalyticsSummary {
  totalPosts: number;
  averages: {
    attitudes: number;
    comments: number;
    reposts: number;
  };
  keywords: Array<{
    term: string;
    count: number;
  }>;
  suggestions: string[];
}

export interface Draft {
  id: number;
  source: string;
  topic: string;
  style: string;
  content: string;
  created_at: string;
}
