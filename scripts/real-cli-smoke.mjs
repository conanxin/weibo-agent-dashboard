#!/usr/bin/env node
/**
 * Real-CLI Smoke Test (v0.4.0 — real CLI calibration).
 *
 * Validates the real Weibo CLI bridge in three states:
 *   1. SKIP         — MOCK_WEIBO=1 (mock mode is the default for CI/demos)
 *   2. SKIP         — CLI binary not found on PATH
 *   3. UNAVAILABLE  — CLI installed but doctor.ready=false (auth/verification/
 *                      subscription incomplete). Not a project failure.
 *   4. PASS         — doctor.ready=true; runs getAuthStatus, getCurrentUser,
 *                      and syncMyPosts(5) in read-only mode.
 *
 * This script NEVER fails the project when real-CLI readiness is incomplete.
 * Mock mode tests in scripts/smoke-test.mjs are the canonical CI gate.
 */
import { getAuthStatus, getCurrentUser, getCliReadiness, isMockMode, syncMyPosts } from "@weibo-agent-dashboard/weibo-bridge";

const POST_LIMIT = 5;

function section(title) {
  console.log("=".repeat(60));
  console.log(title);
  console.log("=".repeat(60));
}

function result({ outcome, summary, details }) {
  const detailLines = details ? Object.entries(details).map(([k, v]) => `  ${k}: ${v}`).join("\n") : "";
  console.log(`${outcome} ${summary}`);
  if (detailLines) console.log(detailLines);
  console.log("");
}

async function main() {
  section("Real Weibo CLI smoke (v0.4.0)");
  console.log(`MOCK_WEIBO: ${process.env.MOCK_WEIBO ?? "(unset)"}`);
  console.log(`WEIBO_CLI_BIN: ${process.env.WEIBO_CLI_BIN ?? "(unset)"}`);
  console.log("");

  // 1. Mock mode — skip silently.
  if (isMockMode()) {
    result({
      outcome: "SKIP",
      summary: "MOCK_WEIBO=1 — real CLI bridge is disabled by mock mode.",
      details: { Note: "Run with MOCK_WEIBO=0 (and WEIBO_CLI_BIN=weibo) to exercise the real CLI path." }
    });
    process.exit(0);
  }

  // 2. Resolve readiness.
  const readiness = await getCliReadiness();
  console.log(`Resolved bin:    ${readiness.resolvedBin || "(none)"}`);
  console.log(`Status category: ${readiness.statusCategory}`);
  console.log(`Ready:           ${readiness.ready ?? false}`);
  if (readiness.steps) {
    const s = readiness.steps;
    console.log(
      `Doctor steps:    login=${s.login ?? "?"} developerVerification=${
        s.developerVerification ?? "?"
      } subscription=${s.subscription ?? "?"}`
    );
  }
  if (readiness.nextAction) {
    console.log(`Next action:     ${readiness.nextAction.command}`);
    console.log(`                 ${readiness.nextAction.message}`);
  }
  console.log("");

  // 3. CLI missing or wandb — SKIP, never fail.
  if (readiness.statusCategory === "CLI_NOT_FOUND" || readiness.statusCategory === "WAND_DETECTED") {
    result({
      outcome: "SKIP",
      summary: `${readiness.statusCategory} — real CLI bridge cannot run.`,
      details: {
        ResolvedBin: readiness.bin,
        Error: readiness.error || "(none)",
        Recommendation:
          readiness.statusCategory === "WAND_DETECTED"
            ? "Install weibo to ~/.local/weibo-cli and symlink ~/.local/bin/weibo. Do not override wandb."
            : "Install the official Weibo CLI or set WEIBO_CLI_BIN to its absolute path."
      }
    });
    process.exit(0);
  }

  // 4. Doctor not ready — UNAVAILABLE, never fail.
  if (readiness.statusCategory !== "CLI_READY_FOR_REAL_CLI_MODE" || !readiness.ready) {
    const steps = readiness.steps || {};
    result({
      outcome: "UNAVAILABLE",
      summary: "Weibo CLI installed but auth/platform readiness incomplete — this is not a project failure.",
      details: {
        Login: String(steps.login ?? "?"),
        DeveloperVerification: String(steps.developerVerification ?? "?"),
        Subscription: String(steps.subscription ?? "?"),
        NextAction: readiness.nextAction?.command || "weibo auth login",
        Hint:
          "Run `weibo auth login` or `weibo auth login --device`. For SLOW_DOWN, wait 2–5 minutes and retry."
      }
    });
    process.exit(0);
  }

  // 5. Doctor ready — exercise read-only path.
  section("Read-only bridge calls");

  let pass = true;

  // 5a. getAuthStatus
  const auth = await getAuthStatus();
  console.log(`getAuthStatus → authenticated=${auth.authenticated} ready=${auth.ready}`);
  console.log(`  steps: login=${auth.steps.login} developerVerification=${auth.steps.developerVerification} subscription=${auth.steps.subscription}`);
  if (auth.nextAction) {
    console.log(`  nextAction: ${auth.nextAction.command}`);
  }
  if (!auth.authenticated || !auth.ready) {
    console.log("  WARN: doctor.ready=true but getAuthStatus reports not authenticated.");
    pass = false;
  }
  console.log("");

  // 5b. getCurrentUser
  const me = await getCurrentUser();
  console.log(`getCurrentUser → id=${me.user.id} screenName=${me.user.screenName}`);
  console.log(`  rateLimit: ${me.rateLimit.used}/${me.rateLimit.limit} remaining=${me.rateLimit.remaining}`);
  if (me.error) {
    console.log(`  WARN: error=${me.error} code=${me.code}`);
  }
  if (me.user.id === "unknown" || me.user.screenName === "unknown") {
    pass = false;
  }
  console.log("");

  // 5c. syncMyPosts — intentionally NOT calibrated yet; should not fail the smoke.
  const posts = await syncMyPosts(POST_LIMIT);
  console.log(`syncMyPosts(${POST_LIMIT}) → code=${posts.code ?? "ok"} mock=${posts.mock} posts=${posts.posts.length}`);
  console.log(`  rateLimit: ${posts.rateLimit.used}/${posts.rateLimit.limit} remaining=${posts.rateLimit.remaining}`);
  if (posts.code === "COMMAND_NOT_CALIBRATED") {
    console.log("  NOTE: myPosts is intentionally uncalibrated; this is expected.");
    console.log("  Run `weibo commands list --output json` after login and update REAL_CLI_COMMANDS.myPosts.");
  } else if (posts.code === "AUTH_NOT_READY") {
    console.log("  WARN: myPosts reported AUTH_NOT_READY even though doctor.ready=true.");
  } else if (posts.error) {
    console.log(`  WARN: error=${posts.error}`);
  }
  console.log("");

  section("RESULT");
  if (pass) {
    console.log("PASS — real CLI smoke completed without unexpected failures.");
    console.log("  nextAction: when myPosts is calibrated, set REAL_CLI_COMMANDS.myPosts in weibo-bridge.");
    process.exit(0);
  } else {
    console.log("PASS-WITH-WARN — real CLI bridge ran, but at least one read-only call returned unexpected data.");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Real-CLI smoke failed unexpectedly:", err?.message || err);
  process.exit(0);
});