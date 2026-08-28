const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const worker = fs.readFileSync(path.join(__dirname, '..', '_worker.js'), 'utf8');

test('proxy-frame and proxy runtime documents bypass database maintenance gating', () => {
  assert.match(worker, /function shouldCheckMaintenanceDocument\(request, url\)/);
  assert.match(worker, /url\.pathname\.startsWith\("\/proxy\/"\)\) return false/);
  assert.match(worker, /shouldCheckMaintenanceDocument\(request, url\) && hasDatabaseConfig\(env\)/);
});

test('document maintenance lookup fails open instead of replacing Nova with a synthetic 503', () => {
  assert.match(worker, /maintenance check failed open; serving static document/);
  assert.doesNotMatch(worker, /if \(!hasDatabaseConfig\(env\)\) return maintenanceDocument\(\{ message: "Nova is temporarily unavailable\." \}\)/);
  assert.doesNotMatch(worker, /console\.error\("Nova maintenance check failed", error\);\s*return maintenanceDocument/);
});
