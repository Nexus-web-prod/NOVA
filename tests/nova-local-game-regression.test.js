const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Pixel Shooter is registered as Nova local content', () => {
  const games = JSON.parse(read('website/data/games.json'));
  const legacyGames = JSON.parse(read('website/assets/json/g.json'));
  const game = games.find(item => item.name === 'Pixel Shooter');
  const legacyGame = legacyGames.find(item => item.name === 'Pixel Shooter');

  assert.deepEqual(
    { url: game.url, local: game.local },
    { url: 'https://main.nova-7.pages.dev/website/games/pixel-shooter/', local: true }
  );
  assert.equal(legacyGame.link, game.url);
  assert.equal(legacyGame.local, true);
  assert.ok(fs.existsSync(path.join(root, 'website/games/pixel-shooter/index.html')));
  assert.ok(fs.existsSync(path.join(root, 'website/games/pixel-shooter/assets/main/config.99d5f.json')));
});

test('local games bypass Scramjet and use the game name in browser chrome', () => {
  const index = read('website/html/index.html');
  assert.match(index, /function localGameFor\(url\)/);
  assert.match(index, /parsed\.origin!==location\.origin/);
  assert.match(index, /tab\.iframe\.src = localGame\.url/);
  assert.match(index, /tab\.scFrame&&tab\.scFrame\.destroy/);
  assert.match(index, /tab\.scFrame=window\.NovaProxyManager\.createFrame/);
  assert.match(index, /urlBar\.value = localGame \? localGame\.name : resolved/);
  assert.match(index, /t\.localGame\?t\.localGame\.name:t\.url/);
});

test('Pixel Shooter has a route-scoped CSP exception for Cocos runtime eval', () => {
  const headers = read('_headers');
  const route = headers.match(/\/website\/games\/pixel-shooter\/\*[\s\S]*?(?=\n\/|$)/)?.[0] || '';

  assert.match(route, /Content-Security-Policy:/);
  assert.match(route, /script-src[^;]*'unsafe-eval'/);
});
