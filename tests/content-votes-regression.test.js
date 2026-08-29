const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('catalog request cards use the native vote experience', () => {
  const games = JSON.parse(read('website/data/games.json'));
  const apps = JSON.parse(read('website/data/apps.json'));
  const cards = [games.find(item => item.contentVote === 'game'), apps.find(item => item.contentVote === 'app')];
  cards.forEach(card => {
    assert.ok(card, 'native vote card missing');
    assert.equal(card.name, 'Vote for Apps & Games');
    assert.equal(card.url, '#nova-content-vote');
    assert.equal(card.image, '/website/assets/media/icons/content-vote.svg');
  });
  assert.equal(games.some(item => item.name === 'Request A Game'), false);
  assert.equal(apps.some(item => item.name === 'Request An App'), false);
});

test('worker exposes authenticated voting and staff result routes', () => {
  const worker = read('_worker.js');
  assert.match(worker, /\/api\/content-votes/);
  assert.match(worker, /\/api\/admin\/content-votes/);
  assert.match(worker, /CREATE TABLE IF NOT EXISTS content_suggestions/);
  assert.match(worker, /PRIMARY KEY\(suggestion_id,user_id\)/);
  assert.match(worker, /requireRole\(request, db, new Set\(\["admin", "developer", "owner"\]\)\)/);
});

test('admin panel and app shell load content voting UI', () => {
  const html = read('website/html/index.html');
  const admin = read('website/js/nova-v7-admin.js');
  assert.match(html, /nova-content-votes\.css/);
  assert.match(html, /nova-content-votes\.js/);
  assert.match(admin, /navButton\("contentVotes", "Content votes"\)/);
  assert.match(admin, /NovaAPI\.adminContentVotes/);
});
