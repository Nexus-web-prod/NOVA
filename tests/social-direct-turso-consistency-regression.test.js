const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const api = fs.readFileSync(path.join(root, 'website/js/nova-v7-api.js'), 'utf8');

test('social reads stay on the Worker while social writes still use the Worker', () => {
  assert.match(
    api,
    /var directSocialReadsAvailable = false;/,
    'direct public social reads must remain disabled until their write paths are migrated too'
  );
  assert.match(
    api,
    /directSocialReadsAvailable !== false && directPublicChannel\(channel\)/,
    'messages must respect the direct-read migration guard'
  );
  assert.match(
    api,
    /sendMessage: function \(body\) \{ return request\("\/api\/social\/messages", \{ method: "POST", body: body \}\); \}/,
    'sending continues through the authenticated Worker rather than an unsafe browser-side SQL write'
  );
});

test('public social messages and reactions both respect the shared migration guard', () => {
  const guard = /directSocialReadsAvailable !== false && directPublicChannel\(channel\)/g;
  assert.equal(
    [...api.matchAll(guard)].length,
    2,
    'both messages and reactions must remain guarded until the public social migration is complete'
  );
});
