const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const headers = fs.readFileSync(path.join(root, "_headers"), "utf8");

test("Cloudflare Web Analytics is explicitly allowed by the Nova CSP", () => {
  const policyLine = headers.split("\n").find(line => line.trim().startsWith("Content-Security-Policy:"));
  assert.ok(policyLine, "global Content-Security-Policy header is required");
  assert.match(policyLine, /script-src[^;]*https:\/\/static\.cloudflareinsights\.com/);
  assert.match(policyLine, /connect-src[^;]*https:\/\/cloudflareinsights\.com/);
  assert.doesNotMatch(policyLine, /script-src[^;]*https:\/\/\*\.cloudflareinsights\.com/);
  assert.match(policyLine, /script-src[^;]*https:\/\/challenges\.cloudflare\.com/);
  assert.match(policyLine, /connect-src[^;]*https:\/\/challenges\.cloudflare\.com/);
  assert.match(policyLine, /connect-src[^;]*https:\/\/public2-nova-db-nexuswebprod\.aws-us-east-2\.turso\.io/);
  assert.doesNotMatch(policyLine, /public-nova-db-nexuswebprod\.aws-us-east-2\.turso\.io/);
  assert.match(policyLine, /frame-src[^;]*https:\/\/challenges\.cloudflare\.com/);
});

test("proxy runtime resources keep explicit same-origin CORP overrides", () => {
  assert.match(headers, /\/proxy\/vortex\.all\.js[\s\S]*?Cross-Origin-Resource-Policy: same-origin/);
  assert.match(headers, /\/proxy\/baremux\/worker\.js[\s\S]*?Cross-Origin-Resource-Policy: same-origin/);
});
