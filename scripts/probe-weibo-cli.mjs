#!/usr/bin/env node
/**
 * Weibo CLI Probe Script (v0.2.0)
 *
 * Detects whether weibo-cli is installed and which commands are available.
 * Safe to run without login credentials — it only probes command existence.
 */
import { execa } from "execa";

const WEIBO_CLI_BIN = process.env.WEIBO_CLI_BIN || "weibo-cli";

const PROBE_COMMANDS = [
  {
    key: "version",
    args: ["--version"],
    description: "CLI version"
  },
  {
    key: "authStatus",
    args: ["auth", "status", "--json"],
    description: "Authentication status"
  },
  {
    key: "authWhoami",
    args: ["auth", "whoami", "--json"],
    description: "Current authenticated user"
  },
  {
    key: "me",
    args: ["me", "--json"],
    description: "Current user profile"
  },
  {
    key: "postsMine",
    args: ["posts", "mine", "--limit", "3", "--json"],
    description: "Current user's posts"
  },
  {
    key: "userTimeline",
    args: ["user", "timeline", "--limit", "3", "--json"],
    description: "User timeline"
  }
];

async function probeCommand({ key, args, description }) {
  const startTime = Date.now();
  try {
    const result = await execa(WEIBO_CLI_BIN, args, {
      reject: false,
      windowsHide: true,
      timeout: 15000
    });

    const duration = Date.now() - startTime;
    const stdout = result.stdout?.trim() || "";
    const stderr = result.stderr?.trim() || "";

    // Try to parse as JSON
    let json = null;
    let isJson = false;
    if (stdout) {
      try {
        json = JSON.parse(stdout);
        isJson = true;
      } catch {
        // Not JSON, keep raw
      }
    }

    // Determine availability
    const isAvailable = result.exitCode === 0;
    const isAuthenticated = isAvailable && !stderr.toLowerCase().includes("not logged in") && !stderr.toLowerCase().includes("unauthorized");

    return {
      key,
      description,
      available: isAvailable,
      authenticated: isAuthenticated,
      exitCode: result.exitCode,
      duration,
      isJson,
      json: isJson ? json : undefined,
      raw: !isJson && stdout ? stdout : undefined,
      stderr: stderr || undefined,
      // Don't log sensitive tokens
      safeSummary: isAvailable
        ? `OK (${isJson ? "JSON" : "raw"}, ${duration}ms)`
        : `Failed (exit ${result.exitCode})`
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      key,
      description,
      available: false,
      authenticated: false,
      exitCode: error.exitCode ?? -1,
      duration,
      isJson: false,
      error: error.message,
      safeSummary: `Error: ${error.message}`
    };
  }
}

async function main() {
  console.log("=" .repeat(60));
  console.log("Weibo CLI Probe (v0.2.0)");
  console.log("=" .repeat(60));
  console.log(`Binary: ${WEIBO_CLI_BIN}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log("");

  // First check if CLI exists at all
  let cliExists = false;
  try {
    const versionResult = await execa(WEIBO_CLI_BIN, ["--version"], {
      reject: false,
      windowsHide: true,
      timeout: 5000
    });
    cliExists = versionResult.exitCode === 0 || versionResult.stdout?.includes("weibo");
  } catch {
    cliExists = false;
  }

  if (!cliExists) {
    console.log("❌ weibo-cli not found or not executable");
    console.log("");
    console.log("To install:");
    console.log("  npm install -g weibo-cli  (or see official docs)");
    console.log("");
    console.log("To specify a custom binary:");
    console.log("  WEIBO_CLI_BIN=/path/to/weibo-cli node scripts/probe-weibo-cli.mjs");
    console.log("");
    console.log("Summary: 0/6 commands available (CLI not found)");
    process.exit(0);
  }

  console.log("✅ weibo-cli found");
  console.log("");

  // Probe all commands
  console.log("Probing commands...");
  console.log("-".repeat(60));

  const results = [];
  for (const cmd of PROBE_COMMANDS) {
    const result = await probeCommand(cmd);
    results.push(result);

    const icon = result.available ? "✅" : "❌";
    const authIcon = result.available && result.authenticated ? "🔓" : result.available ? "🔒" : "";
    console.log(`${icon} ${authIcon} ${result.description}`);
    console.log(`   Command: ${WEIBO_CLI_BIN} ${cmd.args.join(" ")}`);
    console.log(`   Result: ${result.safeSummary}`);
    if (result.stderr && !result.available) {
      console.log(`   Stderr: ${result.stderr.substring(0, 200)}`);
    }
    console.log("");
  }

  // Summary
  console.log("=" .repeat(60));
  console.log("SUMMARY");
  console.log("=" .repeat(60));

  const available = results.filter((r) => r.available);
  const authenticated = results.filter((r) => r.authenticated);
  const jsonCapable = results.filter((r) => r.isJson);

  console.log(`Total commands probed: ${results.length}`);
  console.log(`Available: ${available.length}/${results.length}`);
  console.log(`Authenticated: ${authenticated.length}/${results.length}`);
  console.log(`JSON output: ${jsonCapable.length}/${results.length}`);
  console.log("");

  // Command availability table
  console.log("Command Availability:");
  for (const r of results) {
    const status = r.available
      ? r.authenticated
        ? "✅ Available + Authenticated"
        : "✅ Available (not authenticated)"
      : "❌ Not available";
    console.log(`  ${r.key.padEnd(15)} ${status}`);
  }
  console.log("");

  // Recommendations
  console.log("Recommendations:");
  if (available.length === 0) {
    console.log("  • No commands available. Check weibo-cli installation.");
  } else if (authenticated.length === 0) {
    console.log("  • Commands available but not authenticated. Run: weibo-cli login");
  } else {
    console.log("  • Ready for real CLI mode. Set MOCK_WEIBO=0 to use real commands.");
  }

  if (jsonCapable.length < available.length) {
    console.log("  • Some commands don't support --json. Consider parsing raw output.");
  }

  console.log("");
  console.log("Next steps:");
  console.log("  1. Update packages/weibo-bridge/src/index.ts REAL_CLI_COMMANDS mapping");
  console.log("  2. Run npm run build && npm run test:smoke");
  console.log("  3. Set MOCK_WEIBO=0 and test real integration");
  console.log("");
}

main().catch((err) => {
  console.error("Probe failed:", err.message);
  process.exit(1);
});
