const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'website/js/nova-message-island.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'website/html/index.html'), 'utf8');

test('message island uses one low-rate recent-message poll', () => {
  assert.match(source, /var POLL_INTERVAL_MS = 15000;/);
  assert.match(source, /setInterval\(poll, POLL_INTERVAL_MS\)/);
  assert.match(source, /\/api\/message-island\/recent\?/);
  assert.doesNotMatch(source, /else state\.lastPollResult = await pollStreams/);
});

test('closed island is not suppressed by a stale social page class', () => {
  assert.match(source, /currentPage === 'social'/);
  assert.match(source, /String\(me\.username \|\| ''\)\.trim\(\)\.toLowerCase\(\)/);
});

test('home page loads the restored message island bundle', () => {
  assert.match(html, /nova-message-island\.js\?v=20260901-restore-r1/);
});
