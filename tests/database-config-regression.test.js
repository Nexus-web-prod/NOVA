const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'wrangler.toml'), 'utf8');

test('server-side NOVA config uses the private nova-db database', () => {
  assert.match(config, /^TURSO_DATABASE_URL\s*=\s*"libsql:\/\/nova-db-nexuswebprod\.aws-us-east-2\.turso\.io"\s*$/m);
  assert.doesNotMatch(config, /public-nova-db/i, 'browser/public database must not be configured for the Worker');
});

test('Turso auth token is never stored in source configuration', () => {
  assert.doesNotMatch(config, /^TURSO_AUTH_TOKEN\s*=/m);
});


test('health check explicitly identifies and validates the private Worker database', () => {
  const worker = fs.readFileSync(path.join(root, '_worker.js'), 'utf8');
  assert.match(worker, /const expectedHost = "nova-db-nexuswebprod\.aws-us-east-2\.turso\.io"/);
  assert.match(worker, /DATABASE_CONFIG_MISSING/);
  assert.match(worker, /DATABASE_CONFIG_MISMATCH/);
  assert.match(worker, /DATABASE_CONNECTION_FAILED/);
  assert.match(worker, /database: "private-nova-db"/);
  assert.doesNotMatch(worker, /targetHost:.*TURSO_AUTH_TOKEN/);
});

test('health endpoint bypasses schema initialization so it can diagnose startup failures', () => {
  const worker = fs.readFileSync(path.join(root, '_worker.js'), 'utf8');
  const apiStart = worker.indexOf('if (url.pathname.startsWith("/api/"))');
  const healthBypass = worker.indexOf('if (url.pathname === "/api/health" && request.method === "GET")', apiStart);
  const configGate = worker.indexOf('if (!hasDatabaseConfig(env))', apiStart);
  const schemaInit = worker.indexOf('await ensureTursoSchema(getDb(env))', apiStart);
  assert.ok(apiStart >= 0 && healthBypass > apiStart, 'API dispatcher should include a dedicated health route');
  assert.ok(configGate > healthBypass, 'health diagnostics must run before the generic configuration gate');
  assert.ok(schemaInit > healthBypass, 'health diagnostics must run before schema initialization');
});
