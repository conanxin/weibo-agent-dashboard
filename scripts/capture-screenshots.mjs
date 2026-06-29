#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const distDir = join(root, "apps", "web", "dist");
const screenshotDir = join(root, "docs", "screenshots");
const host = "127.0.0.1";
const requestedPort = Number(process.env.SCREENSHOT_PORT || "5713");
let port = requestedPort;
let baseUrl = `http://${host}:${port}`;

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"]
]);

function run(command, args, env = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const isWindows = process.platform === "win32";
    const child = isWindows
      ? spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", [command, ...args].join(" ")], {
          cwd: root,
          env: { ...process.env, ...env },
          stdio: "inherit"
        })
      : spawn(command, args, {
          cwd: root,
          env: { ...process.env, ...env },
          stdio: "inherit"
        });

    child.on("error", rejectRun);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun();
      } else {
        rejectRun(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
      }
    });
  });
}

async function launchBrowser() {
  const attempts = [
    { label: "Playwright Chromium", options: { headless: true } },
    { label: "Microsoft Edge", options: { headless: true, channel: "msedge" } },
    { label: "Google Chrome", options: { headless: true, channel: "chrome" } }
  ];
  const errors = [];

  for (const attempt of attempts) {
    try {
      const browser = await chromium.launch(attempt.options);
      console.log(`Using ${attempt.label} for screenshot capture.`);
      return browser;
    } catch (error) {
      errors.push(`${attempt.label}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    }
  }

  throw new Error(
    [
      "Unable to launch a browser for screenshots.",
      "Install Playwright Chromium with `npx playwright install chromium`, or install Microsoft Edge/Google Chrome.",
      ...errors.map((error) => `- ${error}`)
    ].join("\n")
  );
}

function assertPortAvailable(candidatePort) {
  return new Promise((resolveCheck, rejectCheck) => {
    const probe = createServer();
    probe.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        rejectCheck(new Error(`Port ${candidatePort} is already in use. Set SCREENSHOT_PORT to another free port and retry.`));
      } else {
        rejectCheck(error);
      }
    });
    probe.once("listening", () => {
      probe.close(resolveCheck);
    });
    probe.listen(candidatePort, host);
  });
}

async function choosePort() {
  if (process.env.SCREENSHOT_PORT) {
    await assertPortAvailable(requestedPort);
    return requestedPort;
  }

  for (let candidatePort = requestedPort; candidatePort < requestedPort + 20; candidatePort += 1) {
    try {
      await assertPortAvailable(candidatePort);
      if (candidatePort !== requestedPort) {
        console.log(`Port ${requestedPort} is occupied; using ${candidatePort} for screenshots.`);
      }
      return candidatePort;
    } catch (error) {
      if (!String(error).includes("already in use")) {
        throw error;
      }
    }
  }

  throw new Error(`No free screenshot port found in ${requestedPort}-${requestedPort + 19}. Set SCREENSHOT_PORT to another free port and retry.`);
}

function createStaticServer() {
  return createServer((request, response) => {
    const requestUrl = new URL(request.url || "/", baseUrl);
    const pathname = decodeURIComponent(requestUrl.pathname);
    const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const target = resolve(distDir, relativePath);
    const safeTarget = target.startsWith(distDir) ? target : join(distDir, "index.html");
    const filePath = existsSync(safeTarget) ? safeTarget : join(distDir, "index.html");
    const ext = extname(filePath);

    response.setHeader("Content-Type", contentTypes.get(ext) || "application/octet-stream");
    response.end(readFileSync(filePath));
  });
}

function listen(server) {
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, resolveListen);
  });
}

async function capture(page, tabName, filename, prepare) {
  if (tabName !== "Dashboard") {
    await page.locator(".nav-tabs").getByRole("button", { name: tabName, exact: true }).click();
  }
  await page.locator(".active-view-heading h3", { hasText: tabName }).waitFor();
  if (prepare) {
    await prepare();
  }
  await page.screenshot({
    path: join(screenshotDir, filename),
    fullPage: true
  });
  console.log(`Saved docs/screenshots/${filename}`);
}

port = await choosePort();
baseUrl = `http://${host}:${port}`;
console.log("Building static mock demo for screenshots...");
await run("npm", ["run", "build", "-w", "apps/web"], {
  VITE_MOCK_MODE: "1",
  VITE_BASE_PATH: "/"
});

mkdirSync(screenshotDir, { recursive: true });

const server = createStaticServer();
await listen(server);
console.log(`Serving screenshot target at ${baseUrl}`);

let browser;
try {
  browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  const consoleIssues = [];

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleIssues.push(`${message.type()}: ${message.text()}`);
    }
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByText("GitHub Pages static demo mode").waitFor();

  await capture(page, "Dashboard", "dashboard.png");
  await capture(page, "Posts", "posts.png", async () => {
    await page.locator("details").first().locator("summary").click();
    await page.locator("pre").first().waitFor();
  });
  await capture(page, "Analytics", "analytics.png");
  await capture(page, "Drafts", "drafts.png", async () => {
    await page.getByRole("button", { name: "Generate 3 drafts" }).click();
    await page.locator(".draft-card").first().waitFor();
  });

  if (consoleIssues.length > 0) {
    console.warn("Console warnings/errors during screenshot capture:");
    for (const issue of consoleIssues) {
      console.warn(`- ${issue}`);
    }
  }
} finally {
  if (browser) {
    await browser.close();
  }
  await new Promise((resolveClose) => server.close(resolveClose));
}
