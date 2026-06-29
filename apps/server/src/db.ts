import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { WeiboPost } from "@weibo-agent-dashboard/weibo-bridge";

export type AppDatabase = Database.Database;

export interface StoredPost {
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

export interface StoredDraft {
  id: number;
  source: string;
  topic: string;
  style: string;
  content: string;
  created_at: string;
}

export function openDatabase(databasePath: string): AppDatabase {
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      weibo_id TEXT NOT NULL UNIQUE,
      text TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      attitudes_count INTEGER NOT NULL DEFAULT 0,
      comments_count INTEGER NOT NULL DEFAULT 0,
      reposts_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      topic TEXT NOT NULL,
      style TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      command TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

export function upsertPosts(db: AppDatabase, posts: WeiboPost[]): number {
  const now = new Date().toISOString();
  const statement = db.prepare(`
    INSERT INTO posts (
      weibo_id,
      text,
      raw_json,
      attitudes_count,
      comments_count,
      reposts_count,
      created_at,
      synced_at
    )
    VALUES (
      @weibo_id,
      @text,
      @raw_json,
      @attitudes_count,
      @comments_count,
      @reposts_count,
      @created_at,
      @synced_at
    )
    ON CONFLICT(weibo_id) DO UPDATE SET
      text = excluded.text,
      raw_json = excluded.raw_json,
      attitudes_count = excluded.attitudes_count,
      comments_count = excluded.comments_count,
      reposts_count = excluded.reposts_count,
      created_at = excluded.created_at,
      synced_at = excluded.synced_at
  `);

  const transaction = db.transaction((items: WeiboPost[]) => {
    for (const post of items) {
      statement.run({
        weibo_id: post.weiboId,
        text: post.text,
        raw_json: JSON.stringify(post.raw),
        attitudes_count: post.attitudesCount,
        comments_count: post.commentsCount,
        reposts_count: post.repostsCount,
        created_at: post.createdAt,
        synced_at: now
      });
    }
  });

  transaction(posts);
  return posts.length;
}

export function listPosts(db: AppDatabase, search?: string): StoredPost[] {
  const query = search?.trim();
  if (query) {
    return db
      .prepare(
        `SELECT * FROM posts
         WHERE text LIKE @query OR weibo_id LIKE @query
         ORDER BY datetime(created_at) DESC, id DESC`
      )
      .all({ query: `%${query}%` }) as StoredPost[];
  }

  return db
    .prepare("SELECT * FROM posts ORDER BY datetime(created_at) DESC, id DESC")
    .all() as StoredPost[];
}

export function getDashboardStats(db: AppDatabase): {
  postCount: number;
  lastSyncAt: string | null;
  callsToday: number;
} {
  const postRow = db
    .prepare("SELECT COUNT(*) AS count, MAX(synced_at) AS lastSyncAt FROM posts")
    .get() as { count: number; lastSyncAt: string | null };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const callsRow = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM sync_logs
       WHERE command LIKE 'weibo:%'
       AND datetime(created_at) >= datetime(@todayStart)`
    )
    .get({ todayStart: todayStart.toISOString() }) as { count: number };

  return {
    postCount: postRow.count,
    lastSyncAt: postRow.lastSyncAt,
    callsToday: callsRow.count
  };
}

export function logSync(db: AppDatabase, command: string, status: "success" | "error", message: string): void {
  db.prepare(
    `INSERT INTO sync_logs (command, status, message, created_at)
     VALUES (@command, @status, @message, @created_at)`
  ).run({
    command,
    status,
    message,
    created_at: new Date().toISOString()
  });
}

export function insertDrafts(
  db: AppDatabase,
  drafts: Array<{
    source: string;
    topic: string;
    style: string;
    content: string;
  }>
): StoredDraft[] {
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO drafts (source, topic, style, content, created_at)
     VALUES (@source, @topic, @style, @content, @created_at)`
  );

  const transaction = db.transaction((items: typeof drafts) => {
    for (const draft of items) {
      insert.run({
        ...draft,
        created_at: now
      });
    }
  });

  transaction(drafts);

  return db
    .prepare("SELECT * FROM drafts ORDER BY id DESC LIMIT @limit")
    .all({ limit: drafts.length }) as StoredDraft[];
}
