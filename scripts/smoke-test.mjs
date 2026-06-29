import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const databasePath = resolve("data/smoke-test.sqlite");
for (const suffix of ["", "-shm", "-wal"]) {
  const target = `${databasePath}${suffix}`;
  if (existsSync(target)) {
    rmSync(target);
  }
}

process.env.MOCK_WEIBO = "1";
process.env.FREE_MODE = "1";
process.env.DATABASE_PATH = "./data/smoke-test.sqlite";
process.env.PORT = process.env.PORT || "3000";
process.env.HOST = process.env.HOST || "127.0.0.1";

const { createApp } = await import("../apps/server/dist/app.js");
const app = await createApp({ logger: false });

try {
  const health = await app.inject({ method: "GET", url: "/api/health" });
  assert.equal(health.statusCode, 200);
  assert.equal(health.json().mockMode, true);

  const status = await app.inject({ method: "GET", url: "/api/weibo/status" });
  assert.equal(status.statusCode, 200);
  assert.equal(status.json().cli.installed, true);

  const me = await app.inject({ method: "GET", url: "/api/weibo/me" });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().user.screenName, "Mock Weibo User");

  const sync = await app.inject({
    method: "POST",
    url: "/api/weibo/sync-my-posts",
    payload: { limit: 3 }
  });
  assert.equal(sync.statusCode, 200);
  assert.equal(sync.json().syncedCount, 3);

  const posts = await app.inject({ method: "GET", url: "/api/posts" });
  assert.equal(posts.statusCode, 200);
  assert.equal(posts.json().posts.length, 3);

  const summary = await app.inject({ method: "GET", url: "/api/analytics/summary" });
  assert.equal(summary.statusCode, 200);
  assert.equal(summary.json().totalPosts, 3);

  const drafts = await app.inject({
    method: "POST",
    url: "/api/drafts/generate",
    payload: {
      topic: "免费版微博工作台",
      style: "清晰、克制、实用",
      length: "medium"
    }
  });
  assert.equal(drafts.statusCode, 200);
  assert.equal(drafts.json().drafts.length, 3);

  console.log("Smoke test passed: health, status, me, sync, posts, analytics, drafts.");
} finally {
  await app.close();
}
