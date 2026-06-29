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
    mock: boolean;
    version?: string;
    raw?: string;
    error?: string;
  };
  auth: {
    authenticated: boolean;
    mock: boolean;
    raw: unknown;
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
