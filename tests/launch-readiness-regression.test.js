const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('public game counts match the current catalog', () => {
  const games = JSON.parse(read('website/data/games.json'));
  const index = read('website/html/index.html');
  const onboarding = read('website/js/nova-onboarding-tour-v7.js');
  const ai = read('website/js/nova-ai.js');
  assert.equal(games.length, 94);
  assert.doesNotMatch(index, /89 games|home-stat-num">89/);
  assert.match(index, /94 games to play/);
  assert.match(onboarding, /gameCount:94/);
  assert.match(ai, /platform with 94 games/);
});

test('catalog no longer contains confirmed dead destinations', () => {
  const apps = JSON.parse(read('website/data/apps.json'));
  const urls = apps.map(app => app.url);
  assert.doesNotMatch(urls.join('\n'), /Firefox-Legacy|now\.gg\/iframe\/snippet|vid\.puffyan\.us|hdtoday\.tv|005konz/i);
  ['https://www.mozilla.org/firefox/', 'https://www.android.com/', 'https://en.aptoide.com/', 'https://character.ai/', 'https://piped.video/', 'https://pluto.tv/', 'https://play.blooket.com/'].forEach(url => assert(urls.includes(url), `missing replacement ${url}`));
});

test('observers require a real document root', () => {
  assert.match(read('website/js/nova-stars.js'), /observedRoot && typeof MutationObserver/);
  assert.match(read('website/js/nova-onboarding-tour-v7.js'), /if\(root&&typeof MutationObserver/);
});

test('audit tools use current catalogs, runtime resolution, and browser selectors', () => {
  const gamesAudit = read('tools/audit-game-transports.mjs');
  const compatibility = read('tools/nova-compat-100.mjs');
  assert.match(gamesAudit, /'website', 'data', 'games\.json'/);
  assert.match(gamesAudit, /isNovaBundle/);
  assert.doesNotMatch(gamesAudit, /closcon000/);
  assert.match(compatibility, /#url-bar/);
  assert.match(compatibility, /r8\.24/i);
  assert.doesNotMatch(compatibility, /#bm-url-input|closcon000|r8\.17/i);
});
