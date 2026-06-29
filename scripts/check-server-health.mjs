#!/usr/bin/env node

const healthUrl = process.env.HEALTH_URL || "http://localhost:3000/api/health";

try {
  const response = await fetch(healthUrl, {
    headers: {
      accept: "application/json"
    }
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }

  if (!response.ok) {
    console.log(`FAIL server health check returned HTTP ${response.status}`);
    console.log(JSON.stringify(body, null, 2));
    process.exit(1);
  }

  if (body.status !== "ok") {
    console.log("FAIL server health response did not contain status=ok");
    console.log(JSON.stringify(body, null, 2));
    process.exit(1);
  }

  console.log(`PASS server health check: ${healthUrl}`);
  console.log(`  mockMode=${String(body.mockMode)}`);
  console.log(`  freeMode=${String(body.freeMode)}`);
  console.log(`  time=${body.time || "unknown"}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.log(`FAIL server health check: ${healthUrl}`);
  console.log(`  ${message}`);
  console.log("  Start the server first with: npm run start");
  process.exit(1);
}
