import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, createApi, isFrontendMockMode } from "./api";
import type { AnalyticsSummary, Draft, Health, Post, WeiboStatus } from "./types";

const tabs = ["Dashboard", "Posts", "Analytics", "Drafts", "Settings"] as const;
type Tab = (typeof tabs)[number];

const defaultApiBase = import.meta.env.VITE_API_BASE_URL || "";
const frontendMockMode = isFrontendMockMode();

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "Not synced yet";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function downloadFile(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function parseRawJson(rawJson: string): string {
  try {
    return JSON.stringify(JSON.parse(rawJson), null, 2);
  } catch {
    return rawJson;
  }
}

function postsToMarkdown(posts: Post[]): string {
  return posts
    .map(
      (post) => `## ${post.weibo_id}

- Created: ${post.created_at}
- Engagement: ${post.attitudes_count} likes / ${post.comments_count} comments / ${post.reposts_count} reposts

${post.text}
`
    )
    .join("\n");
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("Dashboard");
  const [apiBase, setApiBase] = useState(() => localStorage.getItem("weibo-dashboard-api-base") || defaultApiBase);
  const [health, setHealth] = useState<Health | null>(null);
  const [status, setStatus] = useState<WeiboStatus | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const api = useMemo(() => createApi(apiBase), [apiBase]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const [nextHealth, nextStatus, nextPosts, nextSummary] = await Promise.all([
        api.health(),
        api.status(),
        api.posts(search),
        api.summary()
      ]);
      setHealth(nextHealth);
      setStatus(nextStatus);
      setPosts(nextPosts.posts);
      setSummary(nextSummary);
  } catch (error) {
      setMessage(`Unable to load dashboard data. ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  }, [api, search]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  function saveApiBase(value: string): void {
    setApiBase(value);
    localStorage.setItem("weibo-dashboard-api-base", value);
  }

  async function syncPosts(): Promise<void> {
    setLoading(true);
    setMessage("");
    try {
      const result = await api.syncMyPosts(20);
      setMessage(`Sync complete: ${result.syncedCount} post(s).`);
      await refreshAll();
    } catch (error) {
      if (error instanceof ApiError) {
        setMessage(`${error.message} (${error.status})`);
      } else {
        setMessage(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">W</span>
          <div>
            <h1>Weibo Agent</h1>
            <p>content workspace</p>
          </div>
        </div>
        <nav className="nav-tabs" aria-label="Main navigation">
          {tabs.map((tab) => (
            <button className={tab === activeTab ? "active" : ""} key={tab} onClick={() => setActiveTab(tab)}>
              {tab}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-panel">
        <header className="topbar app-hero">
          <div>
            <h2>Weibo Agent Dashboard</h2>
            <p>Free-first personal Weibo content workspace powered by Weibo CLI</p>
            <div className="badge-row" aria-label="Project mode">
              <span className="badge">Free Mode</span>
              <span className="badge">{health?.mockMode || frontendMockMode ? "GitHub Pages Mock Demo" : "Real CLI Mode"}</span>
            </div>
          </div>
          <div className="topbar-actions">
            <button className="secondary" onClick={() => void refreshAll()} disabled={loading}>
              Refresh
            </button>
            <button onClick={() => void syncPosts()} disabled={loading}>
              Sync my posts
            </button>
          </div>
        </header>

        {message ? <div className="notice">{message}</div> : null}

        <section className="active-view-heading">
          <h3>{activeTab}</h3>
        </section>

        {activeTab === "Dashboard" ? (
          <Dashboard status={status} loading={loading} frontendMockMode={frontendMockMode} />
        ) : activeTab === "Posts" ? (
          <Posts posts={posts} search={search} setSearch={setSearch} refreshAll={refreshAll} />
        ) : activeTab === "Analytics" ? (
          <Analytics summary={summary} />
        ) : activeTab === "Drafts" ? (
          <Drafts api={api} />
        ) : (
          <Settings apiBase={apiBase} saveApiBase={saveApiBase} status={status} frontendMockMode={frontendMockMode} />
        )}
      </main>
    </div>
  );
}

function Dashboard({
  status,
  loading,
  frontendMockMode
}: {
  status: WeiboStatus | null;
  loading: boolean;
  frontendMockMode: boolean;
}) {
  return (
    <div className="content-stack">
      {frontendMockMode ? (
        <article className="demo-banner">
          <strong>GitHub Pages static demo mode</strong>
          <p>This page uses built-in mock data and will not connect to a real Weibo account or backend server.</p>
        </article>
      ) : null}
      <section className="dashboard-grid">
        <Metric label="CLI status" value={status?.cli.installed ? "Available" : "Unavailable"} detail={status?.cli.version || status?.cli.error || status?.cli.bin} />
        <Metric label="Auth status" value={status?.auth.authenticated ? "Signed in" : "Not signed in"} detail={status?.auth.error || (status?.auth.mock ? "mock auth" : "real cli")} />
        <Metric label="Local posts" value={String(status?.local.postCount ?? 0)} detail="SQLite archive or static mock data" />
        <Metric label="Last sync" value={formatDate(status?.local.lastSyncAt)} detail="local synced_at" />
        <Metric label="Calls today" value={String(status?.local.callsToday ?? 0)} detail="sync log count" />
        <Metric
          label="Hourly data calls"
          value={`${status?.rateLimit.used ?? 0}/${status?.rateLimit.limit ?? 4}`}
          detail={`reset ${formatDate(status?.rateLimit.resetAt)}`}
        />
        {loading ? <p className="muted">Refreshing...</p> : null}
      </section>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <p>{detail}</p> : null}
    </article>
  );
}

function Posts({
  posts,
  search,
  setSearch,
  refreshAll
}: {
  posts: Post[];
  search: string;
  setSearch: (value: string) => void;
  refreshAll: () => Promise<void>;
}) {
  return (
    <section className="content-stack">
      <div className="toolbar">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void refreshAll();
            }
          }}
          placeholder="Search text or weibo_id"
        />
        <button className="secondary" onClick={() => void refreshAll()}>
          Search
        </button>
        <button className="secondary" onClick={() => downloadFile("weibo-posts.json", JSON.stringify(posts, null, 2), "application/json")}>
          Export JSON
        </button>
        <button className="secondary" onClick={() => downloadFile("weibo-posts.md", postsToMarkdown(posts), "text/markdown")}>
          Export Markdown
        </button>
      </div>

      <div className="post-list">
        {posts.map((post) => (
          <article className="post-row" key={post.id}>
            <div className="post-meta">
              <strong>{post.weibo_id}</strong>
              <span>{formatDate(post.created_at)}</span>
            </div>
            <p>{post.text}</p>
            <div className="engagement">
              <span>{post.attitudes_count} likes</span>
              <span>{post.comments_count} comments</span>
              <span>{post.reposts_count} reposts</span>
            </div>
            <details>
              <summary>Raw JSON</summary>
              <pre>{parseRawJson(post.raw_json)}</pre>
            </details>
          </article>
        ))}
        {posts.length === 0 ? <p className="empty">No posts yet. Click Sync my posts or clear the search filter.</p> : null}
      </div>
    </section>
  );
}

function Analytics({ summary }: { summary: AnalyticsSummary | null }) {
  return (
    <section className="content-stack">
      <div className="summary-strip">
        <Metric label="Total posts" value={String(summary?.totalPosts ?? 0)} />
        <Metric label="Avg likes" value={String(summary?.averages.attitudes ?? 0)} />
        <Metric label="Avg comments" value={String(summary?.averages.comments ?? 0)} />
        <Metric label="Avg reposts" value={String(summary?.averages.reposts ?? 0)} />
      </div>

      <div className="two-column">
        <article className="panel">
          <h3>High-frequency keywords</h3>
          <div className="keyword-cloud">
            {summary?.keywords.map((keyword) => (
              <span key={keyword.term}>
                {keyword.term} <small>{keyword.count}</small>
              </span>
            ))}
            {!summary?.keywords.length ? <p className="empty">Sync posts to generate keywords.</p> : null}
          </div>
        </article>
        <article className="panel">
          <h3>Recent topic ideas</h3>
          <ul className="suggestions">
            {(summary?.suggestions ?? []).map((suggestion) => (
              <li key={suggestion}>{suggestion}</li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}

function Drafts({ api }: { api: ReturnType<typeof createApi> }) {
  const [topic, setTopic] = useState("personal Weibo content workspace");
  const [style, setStyle] = useState("clear, restrained, practical");
  const [length, setLength] = useState("medium");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [message, setMessage] = useState("");

  async function generate(): Promise<void> {
    setMessage("");
    try {
      const result = await api.generateDrafts({ topic, style, length });
      setDrafts(result.drafts);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <section className="content-stack">
      <div className="draft-form">
        <label>
          Topic
          <input value={topic} onChange={(event) => setTopic(event.target.value)} />
        </label>
        <label>
          Style
          <input value={style} onChange={(event) => setStyle(event.target.value)} />
        </label>
        <label>
          Length
          <select value={length} onChange={(event) => setLength(event.target.value)}>
            <option value="short">Short</option>
            <option value="medium">Medium</option>
            <option value="long">Long</option>
          </select>
        </label>
        <button onClick={() => void generate()}>Generate 3 drafts</button>
      </div>
      {message ? <div className="notice">{message}</div> : null}
      <div className="draft-list">
        {drafts.map((draft) => (
          <article className="draft-card" key={draft.id}>
            <p>{draft.content}</p>
            <button className="secondary" onClick={() => void navigator.clipboard.writeText(draft.content)}>
              Copy
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function Settings({
  apiBase,
  saveApiBase,
  status,
  frontendMockMode
}: {
  apiBase: string;
  saveApiBase: (value: string) => void;
  status: WeiboStatus | null;
  frontendMockMode: boolean;
}) {
  return (
    <section className="content-stack">
      <article className="panel">
        <h3>API Base URL</h3>
        <input
          value={apiBase}
          onChange={(event) => saveApiBase(event.target.value)}
          placeholder="Leave blank for same-origin /api"
          disabled={frontendMockMode}
        />
        {frontendMockMode ? <p>Static mock mode is active, so the browser does not call a backend API.</p> : null}
      </article>
      <article className="panel">
        <h3>Runtime modes</h3>
        <div className="mode-list">
          <div>
            <strong>GitHub Pages</strong>
            <span>Mock Demo. Static frontend only, no backend, no real Weibo account.</span>
          </div>
          <div>
            <strong>Local Server</strong>
            <span>Fastify + SQLite backend. Can run mock mode or real CLI mode.</span>
          </div>
          <div>
            <strong>Tencent Cloud</strong>
            <span>Full backend deployment path for real CLI smoke tests and personal use.</span>
          </div>
          <div>
            <strong>Real Weibo CLI</strong>
            <span>Read-only backend mode with `MOCK_WEIBO=0`; command mapping may need probe-based calibration.</span>
          </div>
        </div>
      </article>
      <article className="panel">
        <h3>Free Mode</h3>
        <p>The local server assumes 5 free-tier calls per hour and uses at most 4 Weibo CLI data calls per hour.</p>
        <p>
          Current usage: {status?.rateLimit.used ?? 0}/{status?.rateLimit.limit ?? 4}; reset {formatDate(status?.rateLimit.resetAt)}
        </p>
      </article>
      <article className="panel">
        <h3>Weibo CLI</h3>
        <p>Install and sign in with the official Weibo CLI, then set backend `.env` to `MOCK_WEIBO=0` for real local CLI mode.</p>
        <code>{status?.cli.bin || "weibo"}</code>
        {status?.readiness ? (
          <p className="muted">
            Readiness: <strong>{status.readiness.statusCategory}</strong>
            {status.readiness.resolvedBin ? ` (resolved: ${status.readiness.resolvedBin})` : ""}
            {status.readiness.wandbDetected ? " — wandb detected, not weibo" : ""}
          </p>
        ) : null}
        {status?.auth.nextAction ? (
          <p className="muted">Next action: <code>{status.auth.nextAction.command}</code> — {status.auth.nextAction.message}</p>
        ) : null}
      </article>
    </section>
  );
}
