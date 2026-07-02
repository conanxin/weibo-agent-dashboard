import type { AnalyticsSummary, Draft, Health, Post, WeiboStatus } from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

const isStaticMockMode = import.meta.env.VITE_MOCK_MODE === "1";

const now = Date.now();
const mockPosts: Post[] = [
  {
    id: 1,
    weibo_id: "mock-1001",
    text: "Started a free-first Weibo content workspace: sync less, archive locally, review clearly, publish manually.",
    raw_json: JSON.stringify(
      {
        id: "mock-1001",
        text: "Started a free-first Weibo content workspace: sync less, archive locally, review clearly, publish manually.",
        attitudes_count: 18,
        comments_count: 4,
        reposts_count: 2
      },
      null,
      2
    ),
    attitudes_count: 18,
    comments_count: 4,
    reposts_count: 2,
    created_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    synced_at: new Date(now - 30 * 60 * 1000).toISOString()
  },
  {
    id: 2,
    weibo_id: "mock-1002",
    text: "Free Mode keeps the quota safe: only my own posts, no hot search polling, no competitor monitoring, no auto-publish.",
    raw_json: JSON.stringify(
      {
        id: "mock-1002",
        text: "Free Mode keeps the quota safe: only my own posts, no hot search polling, no competitor monitoring, no auto-publish.",
        attitudes_count: 27,
        comments_count: 6,
        reposts_count: 3
      },
      null,
      2
    ),
    attitudes_count: 27,
    comments_count: 6,
    reposts_count: 3,
    created_at: new Date(now - 26 * 60 * 60 * 1000).toISOString(),
    synced_at: new Date(now - 30 * 60 * 1000).toISOString()
  },
  {
    id: 3,
    weibo_id: "mock-1003",
    text: "The MVP stays local and simple: React, Fastify, SQLite, and a narrow Weibo CLI bridge.",
    raw_json: JSON.stringify(
      {
        id: "mock-1003",
        text: "The MVP stays local and simple: React, Fastify, SQLite, and a narrow Weibo CLI bridge.",
        attitudes_count: 35,
        comments_count: 8,
        reposts_count: 5
      },
      null,
      2
    ),
    attitudes_count: 35,
    comments_count: 8,
    reposts_count: 5,
    created_at: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
    synced_at: new Date(now - 30 * 60 * 1000).toISOString()
  }
];

let mockCallsToday = 1;
let mockRateUsed = 1;
let mockDraftId = 100;

function normalizeBase(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, "");
}

async function request<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${normalizeBase(baseUrl)}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    },
    ...init
  });

  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new ApiError(body.error || `Request failed: ${response.status}`, response.status);
  }
  return body;
}

function summarize(posts: Post[]): AnalyticsSummary {
  const totals = posts.reduce(
    (accumulator, post) => ({
      attitudes: accumulator.attitudes + post.attitudes_count,
      comments: accumulator.comments + post.comments_count,
      reposts: accumulator.reposts + post.reposts_count
    }),
    { attitudes: 0, comments: 0, reposts: 0 }
  );
  const denominator = posts.length || 1;

  return {
    totalPosts: posts.length,
    averages: {
      attitudes: Math.round((totals.attitudes / denominator) * 10) / 10,
      comments: Math.round((totals.comments / denominator) * 10) / 10,
      reposts: Math.round((totals.reposts / denominator) * 10) / 10
    },
    keywords: [
      { term: "free-mode", count: 3 },
      { term: "archive", count: 2 },
      { term: "drafts", count: 2 },
      { term: "sqlite", count: 1 },
      { term: "cli", count: 1 }
    ],
    suggestions: [
      "Write a practical note about why manual publishing is safer for v0.1.",
      "Turn the Free Mode constraints into a short public project update.",
      "Explain how local archives help personal content review."
    ]
  };
}

function mockStatus(): WeiboStatus {
  const latestSync = mockPosts.reduce<string | null>((latest, post) => {
    if (!latest || post.synced_at > latest) {
      return post.synced_at;
    }
    return latest;
  }, null);

  return {
    cli: {
      installed: true,
      bin: "weibo",
      resolvedBin: "mock",
      mock: true,
      version: "static-mock"
    },
    auth: {
      authenticated: true,
      mock: true,
      ready: true,
      steps: { login: true, developerVerification: true, subscription: true },
      raw: {
        authenticated: true,
        mode: "static mock"
      }
    },
    readiness: {
      installed: true,
      bin: "weibo",
      resolvedBin: "mock",
      mock: true,
      statusCategory: "MOCK_MODE"
    },
    rateLimit: {
      limit: 4,
      used: mockRateUsed,
      remaining: Math.max(4 - mockRateUsed, 0),
      resetAt: new Date(now + 60 * 60 * 1000).toISOString()
    },
    local: {
      postCount: mockPosts.length,
      lastSyncAt: latestSync,
      callsToday: mockCallsToday
    }
  };
}

function createMockApi() {
  return {
    health: async (): Promise<Health> => ({
      status: "ok",
      time: new Date().toISOString(),
      mockMode: true,
      freeMode: true
    }),
    status: async (): Promise<WeiboStatus> => mockStatus(),
    syncMyPosts: async (_limit: number): Promise<{ syncedCount: number }> => {
      mockCallsToday += 1;
      mockRateUsed = Math.min(mockRateUsed + 1, 4);
      return { syncedCount: mockPosts.length };
    },
    posts: async (query: string): Promise<{ posts: Post[] }> => {
      const normalizedQuery = query.trim().toLowerCase();
      if (!normalizedQuery) {
        return { posts: mockPosts };
      }
      return {
        posts: mockPosts.filter(
          (post) =>
            post.text.toLowerCase().includes(normalizedQuery) ||
            post.weibo_id.toLowerCase().includes(normalizedQuery)
        )
      };
    },
    summary: async (): Promise<AnalyticsSummary> => summarize(mockPosts),
    generateDrafts: async (payload: { topic: string; style: string; length: string }): Promise<{ drafts: Draft[] }> => {
      const topic = payload.topic.trim() || "Weibo content workspace";
      const style = payload.style.trim() || "clear and practical";
      const lengthLine =
        payload.length === "short"
          ? "Keep it short and easy to copy."
          : payload.length === "long"
            ? "Add enough context for readers to understand the workflow and the safety boundary."
            : "Keep the message compact but specific.";

      return {
        drafts: [
          `I am building ${topic} as a free-first workflow: sync carefully, archive locally, draft locally, publish manually. ${lengthLine}`,
          `${topic} works best when the tool stays narrow. The style is ${style}: useful defaults, clear limits, and no surprise publishing.`,
          `A small update on ${topic}: v0.1 focuses on mock-first demos and local review before any real Weibo CLI integration. ${lengthLine}`
        ].map((content) => ({
          id: mockDraftId++,
          source: "static-mock",
          topic,
          style,
          content,
          created_at: new Date().toISOString()
        }))
      };
    }
  };
}

function createHttpApi(baseUrl: string) {
  return {
    health: () => request<Health>(baseUrl, "/api/health"),
    status: () => request<WeiboStatus>(baseUrl, "/api/weibo/status"),
    syncMyPosts: (limit: number) =>
      request<{ syncedCount: number }>(baseUrl, "/api/weibo/sync-my-posts", {
        method: "POST",
        body: JSON.stringify({ limit })
      }),
    posts: (query: string) =>
      request<{ posts: Post[] }>(baseUrl, `/api/posts${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`),
    summary: () => request<AnalyticsSummary>(baseUrl, "/api/analytics/summary"),
    generateDrafts: (payload: { topic: string; style: string; length: string }) =>
      request<{ drafts: Draft[] }>(baseUrl, "/api/drafts/generate", {
        method: "POST",
        body: JSON.stringify(payload)
      })
  };
}

export function createApi(baseUrl: string) {
  return isStaticMockMode ? createMockApi() : createHttpApi(baseUrl);
}

export function isFrontendMockMode(): boolean {
  return isStaticMockMode;
}
