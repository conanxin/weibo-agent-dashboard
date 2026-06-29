import "dotenv/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(currentDir, "../../..");

function readNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getServerConfig() {
  const databasePath = process.env.DATABASE_PATH || "./data/weibo.sqlite";
  return {
    host: process.env.HOST || "0.0.0.0",
    port: readNumber(process.env.PORT, 3000),
    databasePath: resolve(repoRoot, databasePath),
    freeMode: process.env.FREE_MODE !== "0",
    mockMode: process.env.MOCK_WEIBO === "1",
    webDistPath: resolve(repoRoot, "apps/web/dist")
  };
}
