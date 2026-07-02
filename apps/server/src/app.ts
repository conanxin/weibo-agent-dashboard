import { existsSync } from "node:fs";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import {
  checkWeiboCliInstalled,
  getAuthStatus,
  getCliReadiness,
  getCurrentUser,
  getRateLimitStatus,
  syncMyPosts
} from "@weibo-agent-dashboard/weibo-bridge";
import { getAnalyticsSummary } from "./analytics.js";
import { getServerConfig } from "./config.js";
import { createDraftContents } from "./drafts.js";
import { getDashboardStats, insertDrafts, listPosts, logSync, openDatabase, upsertPosts } from "./db.js";

export async function createApp(options: { logger?: boolean } = {}) {
  const config = getServerConfig();
  const db = openDatabase(config.databasePath);
  const app = Fastify({
    logger: options.logger ?? true
  });

  await app.register(cors, {
    origin: true
  });

  app.addHook("onClose", async () => {
    db.close();
  });

  app.get("/api/health", async () => ({
    status: "ok",
    time: new Date().toISOString(),
    mockMode: config.mockMode,
    freeMode: config.freeMode
  }));

  app.get("/api/weibo/status", async () => {
    try {
      const [cli, auth, readiness] = await Promise.all([
        checkWeiboCliInstalled(),
        getAuthStatus(),
        getCliReadiness()
      ]);
      return {
        cli,
        auth,
        readiness,
        rateLimit: getRateLimitStatus(),
        local: getDashboardStats(db)
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        cli: { installed: false, bin: "weibo", mock: false, error: message },
        auth: {
          authenticated: false,
          mock: false,
          ready: false,
          steps: {},
          raw: null,
          error: message
        },
        readiness: {
          installed: false,
          bin: "weibo",
          mock: false,
          statusCategory: "CLI_NOT_FOUND",
          error: message
        },
        rateLimit: getRateLimitStatus(),
        local: getDashboardStats(db),
        error: `Status check failed: ${message}`
      };
    }
  });

  app.get("/api/weibo/me", async (_request, reply) => {
    try {
      const result = await getCurrentUser();
      if (result.error) {
        reply.code(503);
        return {
          error: result.error,
          user: result.user,
          mock: result.mock,
          rateLimit: result.rateLimit
        };
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reply.code(429);
      return {
        error: message,
        rateLimit: getRateLimitStatus()
      };
    }
  });

  app.post<{
    Body: {
      limit?: number;
    };
  }>("/api/weibo/sync-my-posts", async (request, reply) => {
    const limit = Number.isFinite(request.body?.limit) ? Number(request.body.limit) : 20;
    try {
      const result = await syncMyPosts(limit);
      if (result.error) {
        logSync(db, "weibo:sync-my-posts", "error", result.error);
        reply.code(503);
        return {
          error: result.error,
          posts: result.posts,
          mock: result.mock,
          raw: result.raw,
          rateLimit: result.rateLimit,
          local: getDashboardStats(db)
        };
      }
      const count = upsertPosts(db, result.posts);
      logSync(db, "weibo:sync-my-posts", "success", `Synced ${count} post(s).`);
      return {
        ...result,
        syncedCount: count,
        local: getDashboardStats(db)
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logSync(db, "weibo:sync-my-posts", "error", message);
      reply.code(429);
      return {
        error: message,
        rateLimit: getRateLimitStatus()
      };
    }
  });

  app.get<{
    Querystring: {
      q?: string;
    };
  }>("/api/posts", async (request) => ({
    posts: listPosts(db, request.query.q)
  }));

  app.get("/api/analytics/summary", async () => getAnalyticsSummary(db));

  app.post<{
    Body: {
      topic?: string;
      style?: string;
      length?: "short" | "medium" | "long";
    };
  }>("/api/drafts/generate", async (request, reply) => {
    const topic = request.body?.topic?.trim() ?? "";
    if (!topic) {
      reply.code(400);
      return {
        error: "topic is required"
      };
    }

    const style = request.body?.style?.trim() || "清晰、克制、实用";
    const contents = createDraftContents({
      topic,
      style,
      length: request.body?.length
    });
    const drafts = insertDrafts(
      db,
      contents.map((content) => ({
        source: "local-template",
        topic,
        style,
        content
      }))
    );

    return {
      drafts
    };
  });

  if (existsSync(config.webDistPath)) {
    await app.register(fastifyStatic, {
      root: config.webDistPath,
      wildcard: false
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        reply.code(404).send({
          error: "API route not found"
        });
        return;
      }
      reply.sendFile("index.html");
    });
  }

  return app;
}
