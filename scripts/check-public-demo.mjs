#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoUrl = "https://github.com/conanxin/weibo-agent-dashboard";
const pagesUrl = "https://conanxin.github.io/weibo-agent-dashboard/";
const pagesBase = "/weibo-agent-dashboard/";

const checks = [];

function pass(name, detail) {
  checks.push({ ok: true, name, detail });
}

function fail(name, detail) {
  checks.push({ ok: false, name, detail });
}

function readText(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function checkReadme() {
  const readme = readText("README.md");
  if (readme.includes(repoUrl)) {
    pass("README repository URL", repoUrl);
  } else {
    fail("README repository URL", `Missing ${repoUrl}`);
  }

  if (readme.includes(pagesUrl)) {
    pass("README Pages URL", pagesUrl);
  } else {
    fail("README Pages URL", `Missing ${pagesUrl}`);
  }
}

function checkDist() {
  const distDir = join(root, "apps", "web", "dist");
  const indexPath = join(distDir, "index.html");

  if (!existsSync(distDir)) {
    fail("apps/web/dist exists", "Run npm run build first.");
    return;
  }
  pass("apps/web/dist exists", distDir);

  if (!existsSync(indexPath)) {
    fail("dist/index.html exists", "Missing apps/web/dist/index.html.");
    return;
  }
  pass("dist/index.html exists", indexPath);

  const html = readFileSync(indexPath, "utf8");
  const assetRefs = Array.from(html.matchAll(/(?:src|href)="([^"]+)"/g)).map((match) => match[1]);
  const bundledRefs = assetRefs.filter((ref) => ref.includes("assets/"));

  if (bundledRefs.length === 0) {
    fail("dist asset references", "No bundled asset references found in index.html.");
  } else {
    pass("dist asset references", bundledRefs.join(", "));
  }

  const hasPagesBase = bundledRefs.some((ref) => ref.startsWith(`${pagesBase}assets/`));
  const hasRootAssets = bundledRefs.some((ref) => ref.startsWith("/assets/") || ref.startsWith("assets/") || ref.startsWith("./assets/"));

  if (hasPagesBase) {
    pass("Pages base in dist", `${pagesBase}assets/...`);
  } else if (hasRootAssets) {
    pass("Local/static asset refs in dist", "Current dist uses root-relative or relative assets; workflow sets VITE_BASE_PATH for Pages.");
  } else {
    fail("dist asset base", `Expected ${pagesBase}assets/... or valid local asset refs.`);
  }

  for (const ref of bundledRefs) {
    const normalized = ref
      .replace(/^\/weibo-agent-dashboard\//, "")
      .replace(/^\//, "")
      .replace(/^\.\//, "");
    const target = join(distDir, normalized);
    if (existsSync(target)) {
      pass(`asset exists: ${normalized}`, target);
    } else {
      fail(`asset exists: ${normalized}`, `Missing ${target}`);
    }
  }
}

function checkConfig() {
  const viteConfig = readText("apps/web/vite.config.ts");
  const workflow = readText(".github/workflows/pages.yml");

  if (viteConfig.includes("VITE_BASE_PATH") && viteConfig.includes("GITHUB_ACTIONS")) {
    pass("Vite base config", "Uses VITE_BASE_PATH with GitHub Actions fallback.");
  } else {
    fail("Vite base config", "Expected VITE_BASE_PATH and GitHub Actions base handling.");
  }

  if (workflow.includes('VITE_MOCK_MODE: "1"')) {
    pass("Pages workflow mock mode", "VITE_MOCK_MODE=1");
  } else {
    fail("Pages workflow mock mode", "Missing VITE_MOCK_MODE=1.");
  }

  if (workflow.includes(`VITE_BASE_PATH: "${pagesBase}"`)) {
    pass("Pages workflow base path", `VITE_BASE_PATH=${pagesBase}`);
  } else {
    fail("Pages workflow base path", `Missing VITE_BASE_PATH=${pagesBase}.`);
  }
}

checkReadme();
checkDist();
checkConfig();

console.log("Public demo health check");
console.log("=".repeat(60));
for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
  if (check.detail) {
    console.log(`  ${check.detail}`);
  }
}

const failed = checks.filter((check) => !check.ok);
console.log("=".repeat(60));
console.log(`Summary: ${checks.length - failed.length}/${checks.length} checks passed.`);

if (failed.length > 0) {
  process.exit(1);
}
