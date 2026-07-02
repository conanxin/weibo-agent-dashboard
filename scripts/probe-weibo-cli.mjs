#!/usr/bin/env node
/**
 * Weibo CLI Probe Script (v0.4.0 — real CLI calibration).
 *
 * Detects the official Weibo CLI binary, identifies wandb as a non-match,
 * probes a prioritized set of read-only commands (using `--output json`),
 * classifies each probe, and writes a structured report to
 *   reports/weibo-cli-probe-latest.json
 *
 * The probe never authenticates or writes data — it only inspects command
 * existence, JSON support, and auth readiness signals.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execa } from "execa";

const BIN_CANDIDATES = ["weibo", "weibo-cli", "wb"];
const WANDB_MARKERS = ["wandb", "Weights & Biases", "Weights and Biases", "W&B"];

const REPORT_PATH = resolve("reports/weibo-cli-probe-latest.json");
const PREVIEW_LIMIT = 240;

const AUTH_NOT_READY_PATTERNS = [
  /缺少登录令牌/,
  /please run .*auth login/i,
  /not logged in/i,
  /unauthorized/i,
  /SLOW_DOWN/i,
  /未完成开发者认证/,
  /未开通套餐/
];

const SENSITIVE_KEYS = [
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "authorization",
  "auth_header",
  "cookie",
  "set-cookie",
  "secret",
  "client_secret",
  "app_secret",
  "api_secret",
  "bearer",
  "api_key",
  "apikey"
];

const PROBE_COMMANDS = [
  {
    key: "version",
    args: ["version"],
    description: "CLI version (canonical install name)"
  },
  {
    key: "doctor",
    args: ["doctor"],
    description: "CLI doctor (human-readable readiness)"
  },
  {
    key: "doctorJson",
    args: ["doctor", "--output", "json"],
    description: "CLI doctor JSON (canonical readiness signal)"
  },
  {
    key: "authHelp",
    args: ["auth", "--help"],
    description: "Auth command help"
  },
  {
    key: "authWhoami",
    args: ["auth", "whoami"],
    description: "Auth whoami (text)"
  },
  {
    key: "authWhoamiJson",
    args: ["auth", "whoami", "--output", "json"],
    description: "Auth whoami JSON"
  },
  {
    key: "me",
    args: ["me"],
    description: "Me (text)"
  },
  {
    key: "meJson",
    args: ["me", "--output", "json"],
    description: "Me JSON"
  },
  {
    key: "commandsList",
    args: ["commands", "list"],
    description: "commands list (text)"
  },
  {
    key: "commandsListJson",
    args: ["commands", "list", "--output", "json"],
    description: "commands list JSON"
  }
];

const LEGACY_CANDIDATES = [
  {
    key: "authStatusLegacy",
    args: ["auth", "status", "--output", "json"],
    description: "Legacy auth status (downgraded)"
  },
  {
    key: "postsMineLegacy",
    args: ["posts", "mine", "--limit", "3", "--output", "json"],
    description: "Legacy posts mine (downgraded)"
  },
  {
    key: "userTimelineLegacy",
    args: ["user", "timeline", "--limit", "3", "--output", "json"],
    description: "Legacy user timeline (downgraded)"
  }
];

// ─── Sensitive redaction ─────────────────────────────────────────────────────

function redactText(text) {
  if (!text) return "";
  return text
    .replace(/([A-Za-z][A-Za-z0-9_.\-]*(?:token|secret|cookie|authorization|bearer|api[_-]?key|apikey)[A-Za-z0-9_.\-]*)(\s*[:=]\s*)([^\s,;"'`<>]+)/gi, (_m, k, sep) => `${sep}***REDACTED***`)
    .replace(/("[A-Za-z][A-Za-z0-9_.\-]*(?:token|secret|cookie|authorization|bearer|api[_-]?key|apikey)[A-Za-z0-9_.\-]*"\s*:\s*)"([^"]*)"/gi, (_m, p) => `${p}"***REDACTED***"`);
}

function redactJson(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(redactJson);
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const lower = k.toLowerCase();
      if (SENSITIVE_KEYS.includes(lower) && (typeof v === "string" || typeof v === "number")) {
        out[k] = "***REDACTED***";
      } else if (SENSITIVE_KEYS.includes(lower) && v === null) {
        out[k] = null;
      } else {
        out[k] = redactJson(v);
      }
    }
    return out;
  }
  return value;
}

function preview(text) {
  if (!text) return "";
  if (text.length <= PREVIEW_LIMIT) return text;
  return text.slice(0, PREVIEW_LIMIT) + "…";
}

function looksLikeAuthNotReady(text) {
  if (!text) return false;
  return AUTH_NOT_READY_PATTERNS.some((p) => p.test(text));
}

// ─── Candidate probing ───────────────────────────────────────────────────────

async function probeCandidate(bin) {
  try {
    const result = await execa(bin, ["--version"], {
      reject: false,
      windowsHide: true,
      timeout: 5000
    });
    // ENOENT with reject:false comes back as { failed: true, exitCode: undefined }.
    if (result.failed || (!result.stdout && !result.stderr && result.exitCode === undefined)) {
      return { kind: "missing" };
    }
    if (result.exitCode === 0) {
      return { kind: "weibo", version: (result.stdout || "").trim() };
    }
    return {
      kind: "unknown",
      exitCode: result.exitCode ?? -1
    };
  } catch (error) {
    return { kind: "missing" };
  }
}

/**
 * Decide whether a binary is the Weibo CLI vs. wandb by inspecting `--help`
 * output. `wb --version` alone is not enough (it just prints "wb, version …").
 */
async function identifyBinary(bin) {
  try {
    const result = await execa(bin, ["--help"], {
      reject: false,
      windowsHide: true,
      timeout: 5000
    });
    if (result.failed && !result.stdout && !result.stderr) return "missing";
    const combined = `${result.stdout || ""}\n${result.stderr || ""}`;
    if (WANDB_MARKERS.some((m) => combined.includes(m))) {
      return "wandb";
    }
    if (/weibo/i.test(combined)) {
      return "weibo";
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

async function resolveBin() {
  const configured = process.env.WEIBO_CLI_BIN || "";
  const ordered = configured
    ? [configured, ...BIN_CANDIDATES.filter((c) => c !== configured)]
    : [...BIN_CANDIDATES];
  const attempted = [];
  let wandbDetected = false;
  for (const candidate of ordered) {
    // First check whether the binary exists at all.
    const existence = await probeCandidate(candidate);
    attempted.push({ candidate, probe: existence });
    if (existence.kind === "missing") {
      // Skip silently and try the next candidate unless this was the env override.
      if (candidate === configured) {
        return { bin: candidate, source: "env", wandbDetected, attempted, envOverrideNotFound: true };
      }
      continue;
    }

    // Resolve whether it is the Weibo CLI or wandb by inspecting `--help`.
    const identity = await identifyBinary(candidate);
    if (identity === "wandb") {
      wandbDetected = true;
      attempted[attempted.length - 1].identity = "wandb";
      if (candidate === configured) {
        return { bin: candidate, source: "env", wandbDetected: true, attempted, envOverrideIsWandb: true };
      }
      continue;
    }
    if (identity === "weibo") {
      attempted[attempted.length - 1].identity = "weibo";
      attempted[attempted.length - 1].version = (existence.kind === "weibo" ? existence.version : undefined);
      return { bin: candidate, source: candidate === configured ? "env" : "fallback", wandbDetected, attempted };
    }
    // Unknown binary — keep going if it was a fallback, but if env override we
    // have to use it.
    attempted[attempted.length - 1].identity = "unknown";
    if (candidate === configured) {
      return { bin: candidate, source: "env", wandbDetected, attempted };
    }
  }
  return { bin: configured || BIN_CANDIDATES[0], source: configured ? "env" : "fallback", wandbDetected, attempted };
}

// ─── Command probing ─────────────────────────────────────────────────────────

function classifyProbe({ exitCode, stdout, stderr, timedOut, notFound, parsedJson }) {
  if (notFound) return "BIN_NOT_FOUND";
  if (timedOut) return "TIMEOUT";
  if (exitCode === 0) {
    return parsedJson !== null ? "AVAILABLE_JSON" : "AVAILABLE_RAW";
  }
  const combined = `${stdout || ""}\n${stderr || ""}`;
  if (/unknown (command|subcommand)|invalid command|not a weibo command/i.test(combined)) {
    return "COMMAND_NOT_FOUND";
  }
  if (looksLikeAuthNotReady(combined)) {
    return "NOT_AUTHENTICATED";
  }
  return "CLI_ERROR";
}

async function probeCommand(bin, { key, args, description }, { timeoutMs = 15000, legacy = false } = {}) {
  const startTime = Date.now();
  const fullCommand = `${bin} ${args.join(" ")}`.trim();
  try {
    const result = await execa(bin, args, {
      reject: false,
      windowsHide: true,
      timeout: timeoutMs
    });
    const duration = Date.now() - startTime;
    const stdout = result.stdout || "";
    const stderr = result.stderr || "";
    // execa with reject:false reports ENOENT as { failed: true, exitCode: undefined }.
    const notFound = result.failed && !stdout && !stderr && result.exitCode === undefined;
    let parsedJson = null;
    let jsonParseOk = false;
    if (stdout.trim()) {
      try {
        parsedJson = JSON.parse(stdout);
        jsonParseOk = true;
      } catch {
        parsedJson = null;
      }
    }
    const statusCategory = classifyProbe({
      exitCode: result.exitCode ?? -1,
      stdout,
      stderr,
      timedOut: Boolean(result.timedOut),
      notFound,
      parsedJson
    });
    return {
      key,
      description,
      command: fullCommand,
      available: result.exitCode === 0 && !result.timedOut,
      exitCode: result.exitCode ?? -1,
      durationMs: duration,
      stdoutPreview: preview(redactText(stdout)),
      stderrPreview: preview(redactText(stderr)),
      parsedJson: parsedJson !== null ? redactJson(parsedJson) : null,
      jsonParseOk,
      statusCategory,
      legacy,
      timedOut: Boolean(result.timedOut)
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const code = error?.code;
    const notFound = code === "ENOENT" || code === "EACCES";
    return {
      key,
      description,
      command: fullCommand,
      available: false,
      exitCode: error?.exitCode ?? -1,
      durationMs: duration,
      stdoutPreview: preview(redactText(error?.stdout || "")),
      stderrPreview: preview(redactText(error?.stderr || error?.message || "")),
      parsedJson: null,
      jsonParseOk: false,
      statusCategory: notFound ? "BIN_NOT_FOUND" : "CLI_ERROR",
      legacy,
      timedOut: Boolean(error?.timedOut)
    };
  }
}

// ─── Overall classification ──────────────────────────────────────────────────

function classifyOverall({ resolution, primaryResults, legacyResults }) {
  if (resolution.envOverrideIsWandb) {
    return {
      statusCategory: "WAND_DETECTED",
      ready: false,
      message: "WEIBO_CLI_BIN points to Weights & Biases (wandb), not the Weibo CLI."
    };
  }
  if (resolution.wandbDetected && !resolution.bin) {
    return {
      statusCategory: "WAND_DETECTED",
      ready: false,
      message: "Only wandb was found on PATH. Install the Weibo CLI separately."
    };
  }
  const doctor = primaryResults.find((r) => r.key === "doctorJson");
  if (!doctor || !doctor.available) {
    const version = primaryResults.find((r) => r.key === "version");
    if (!version || !version.available) {
      return {
        statusCategory: "CLI_NOT_FOUND",
        ready: false,
        message: "Weibo CLI not found on PATH."
      };
    }
    return {
      statusCategory: "CLI_INSTALLED_BUT_NOT_READY",
      ready: false,
      message: "Weibo CLI installed but `weibo doctor --output json` did not return a usable JSON readiness signal."
    };
  }
  const ready = doctor.parsedJson?.ready === true;
  const steps = doctor.parsedJson?.steps ?? {};
  if (ready) {
    return {
      statusCategory: "CLI_READY_FOR_REAL_CLI_MODE",
      ready: true,
      steps,
      message: "CLI installed and ready (login + developer verification + subscription all true)."
    };
  }
  return {
    statusCategory: "CLI_INSTALLED_BUT_NOT_READY",
    ready: false,
    steps,
    message: "CLI installed, auth/platform readiness incomplete. Run `weibo auth login` and complete developer verification and subscription."
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date().toISOString();
  console.log("=".repeat(60));
  console.log("Weibo CLI Probe (v0.4.0 — real CLI calibration)");
  console.log("=".repeat(60));
  console.log(`Time: ${startedAt}`);
  console.log(`Env WEIBO_CLI_BIN: ${process.env.WEIBO_CLI_BIN || "(unset)"}`);
  console.log("");

  const resolution = await resolveBin();

  console.log("Binary detection:");
  for (const attempt of resolution.attempted) {
    const p = attempt.probe;
    const id = attempt.identity;
    let tag;
    if (id === "weibo") tag = `✅ weibo (version ${p.version})`;
    else if (id === "wandb") tag = "⚠️  wandb (skipped)";
    else if (p.kind === "missing") tag = "— not on PATH";
    else if (id === "unknown") tag = `? unknown (exit ${p.exitCode})`;
    else tag = `? unresolved (exit ${p.exitCode})`;
    console.log(`  ${attempt.candidate.padEnd(10)} ${tag}`);
  }
  console.log(`Resolved bin: ${resolution.bin}`);
  if (resolution.envOverrideIsWandb) {
    console.log("⚠️  WEIBO_CLI_BIN points to wandb. Refusing to use it.");
    console.log("   Unset WEIBO_CLI_BIN or point it at the real weibo binary.");
    console.log("");
  }
  console.log("");

  // If wandb-only or no binary, we still emit a report and stop here.
  const usableBin = !resolution.envOverrideIsWandb && resolution.attempted.some((a) => a.identity === "weibo");

  let primaryResults = [];
  let legacyResults = [];
  if (usableBin) {
    console.log("Probing primary read-only commands (--output json)…");
    console.log("-".repeat(60));
    for (const cmd of PROBE_COMMANDS) {
      const result = await probeCommand(resolution.bin, cmd, { timeoutMs: 15000 });
      primaryResults.push(result);
      const icon = result.available ? "✅" : "❌";
      console.log(`${icon} ${result.description}`);
      console.log(`   Command: ${result.command}`);
      console.log(`   Status:  ${result.statusCategory} (exit ${result.exitCode}, ${result.durationMs}ms)`);
      if (result.stderrPreview && !result.available) {
        console.log(`   Stderr:  ${result.stderrPreview}`);
      }
      if (result.parsedJson && result.statusCategory === "AVAILABLE_JSON") {
        console.log(`   JSON:    ${preview(JSON.stringify(result.parsedJson))}`);
      }
      console.log("");
    }

    console.log("Probing legacy command candidates (downgraded — informational only)…");
    console.log("-".repeat(60));
    for (const cmd of LEGACY_CANDIDATES) {
      const result = await probeCommand(resolution.bin, cmd, { timeoutMs: 15000, legacy: true });
      legacyResults.push(result);
      const icon = result.available ? "✅" : "❌";
      console.log(`${icon} ${result.description} (legacy)`);
      console.log(`   Status:  ${result.statusCategory} (exit ${result.exitCode})`);
      console.log("");
    }
  }

  const overall = classifyOverall({ resolution, primaryResults, legacyResults });

  console.log("=".repeat(60));
  console.log("OVERALL READINESS");
  console.log("=".repeat(60));
  console.log(`Status category: ${overall.statusCategory}`);
  console.log(`Ready:           ${overall.ready}`);
  if (overall.steps) {
    const s = overall.steps;
    console.log(
      `Steps:           login=${s.login ?? "?"}  developerVerification=${s.developerVerification ?? "?"}  subscription=${s.subscription ?? "?"}`
    );
  }
  console.log(`Message:         ${overall.message}`);
  console.log("");

  // Summary recommendations.
  console.log("Summary:");
  if (overall.statusCategory === "CLI_NOT_FOUND") {
    console.log("  • Install weibo to ~/.local/bin and run `npm run probe:weibo-cli` again.");
  } else if (overall.statusCategory === "WAND_DETECTED") {
    console.log("  • The system `wb` is Weights & Biases (wandb). Do NOT override it with npm --force.");
    console.log("  • Install weibo to ~/.local/weibo-cli and symlink ~/.local/bin/weibo instead.");
  } else if (overall.statusCategory === "CLI_INSTALLED_BUT_NOT_READY") {
    console.log("  • CLI installed but auth/platform readiness is incomplete.");
    console.log("  • Run `weibo auth login` (browser) or `weibo auth login --device` (SSH/headless).");
    console.log("  • If you see SLOW_DOWN, wait 2–5 minutes and retry.");
    console.log("  • This is not a project failure — the dashboard will keep working in mock mode.");
  } else if (overall.statusCategory === "CLI_READY_FOR_REAL_CLI_MODE") {
    console.log("  • Real CLI mode is now usable. Switch to MOCK_WEIBO=0 in .env to test.");
  }
  console.log("");

  // Write JSON report.
  const report = {
    version: "0.4.0",
    generatedAt: startedAt,
    finishedAt: new Date().toISOString(),
    env: {
      WEIBO_CLI_BIN: process.env.WEIBO_CLI_BIN || null
    },
    resolution: {
      resolvedBin: resolution.bin,
      source: resolution.source,
      wandbDetected: resolution.wandbDetected,
      envOverrideIsWandb: Boolean(resolution.envOverrideIsWandb),
      envOverrideNotFound: Boolean(resolution.envOverrideNotFound),
      attempted: resolution.attempted.map((a) => ({
        candidate: a.candidate,
        kind: a.probe.kind,
        identity: a.identity,
        version: a.probe.kind === "weibo" ? a.probe.version : undefined,
        exitCode: a.probe.kind === "unknown" ? a.probe.exitCode : undefined
      }))
    },
    overall: {
      statusCategory: overall.statusCategory,
      ready: overall.ready,
      message: overall.message,
      steps: overall.steps || null
    },
    commands: primaryResults,
    legacyCommands: legacyResults
  };

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`Report written: ${REPORT_PATH}`);
}

main().catch((err) => {
  console.error("Probe failed:", err?.message || err);
  process.exit(1);
});