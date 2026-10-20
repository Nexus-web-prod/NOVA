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
