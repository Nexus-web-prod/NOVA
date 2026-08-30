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

test('FNAF 2 is registered as a self-contained Nova local game', () => {
  const games = JSON.parse(read('website/data/games.json'));
  const legacyGames = JSON.parse(read('website/assets/json/g.json'));
  const game = games.find(item => item.name === 'FNAF 2');
  const legacyGame = legacyGames.find(item => item.name === 'FNAF 2');
  const packagedGame = read('website/games/fnaf-2/index.html');

  assert.deepEqual(
    { url: game.url, local: game.local },
    { url: 'https://main.nova-7.pages.dev/website/games/fnaf-2/', local: true }
  );
  assert.equal(legacyGame.link, game.url);
  assert.equal(legacyGame.local, true);
  assert.match(packagedGame, /var projectParts = \["project\.part1\.bin", "project\.part2\.bin"\]/);
  assert.match(packagedGame, /Promise\.all\(projectParts\.map/);
  assert.match(packagedGame, /connect-src 'self' data: blob:/);
  assert.doesNotMatch(packagedGame, /static\.cloudflareinsights\.com\/beacon/);
  for (const part of ['project.part1.bin', 'project.part2.bin']) {
    const partPath = path.join(root, 'website/games/fnaf-2', part);
    assert.ok(fs.existsSync(partPath));
    assert.ok(fs.statSync(partPath).size < 25 * 1024 * 1024);
  }
});

test('Brawl Stars is registered with a complete local Unity build', () => {
  const games = JSON.parse(read('website/data/games.json'));
  const legacyGames = JSON.parse(read('website/assets/json/g.json'));
  const game = games.find(item => item.name === 'Brawl Stars');
  const legacyGame = legacyGames.find(item => item.name === 'Brawl Stars');
  const gameRoot = path.join(root, 'website/games/brawl-stars');
  const required = [
    'index.html',
    'add/howler.js',
    'playgama-bridge.js',
    'Build/web.loader.js',
    'Build/web.data.unityweb',
    'Build/web.framework.js.unityweb',
    'Build/web.wasm.unityweb'
  ];

  assert.deepEqual(
    { url: game.url, local: game.local },
    { url: 'https://main.nova-7.pages.dev/website/games/brawl-stars/', local: true }
  );
  assert.equal(legacyGame.link, game.url);
  assert.equal(legacyGame.local, true);
  for (const file of required) {
    const filePath = path.join(gameRoot, file);
    assert.ok(fs.existsSync(filePath), `missing Unity file: ${file}`);
    assert.ok(fs.statSync(filePath).size < 25 * 1024 * 1024, `Cloudflare file limit exceeded: ${file}`);
  }
  assert.doesNotMatch(read('website/games/brawl-stars/index.html'), /challenge-platform\/scripts/);
});

test('Retro Bowl is registered with a complete local GameMaker build', () => {
  const games = JSON.parse(read('website/data/games.json'));
  const legacyGames = JSON.parse(read('website/assets/json/g.json'));
  const game = games.find(item => item.name === 'Retro Bowl');
  const legacyGame = legacyGames.find(item => item.name === 'Retro Bowl');
  const gameRoot = path.join(root, 'website/games/retro-bowl');
  const packagedGame = read('website/games/retro-bowl/index.html');
  const required = [
    'index.html',
    'html5game/RetroBowl.js',
    'html5game/RetroBowl_texture_0.png',
    'html5game/RetroBowl_texture_1.png',
    'html5game/RetroBowl_texture_2.png',
    'html5game/optiondata.dat',
    'html5game/uph_poki.js'
  ];

  assert.deepEqual(
    { url: game.url, local: game.local },
    { url: 'https://main.nova-7.pages.dev/website/games/retro-bowl/', local: true }
  );
  assert.equal(legacyGame.link, game.url);
  assert.equal(legacyGame.local, true);
  for (const file of required) {
    const filePath = path.join(gameRoot, file);
    assert.ok(fs.existsSync(filePath), `missing GameMaker file: ${file}`);
    assert.ok(fs.statSync(filePath).size < 25 * 1024 * 1024, `Cloudflare file limit exceeded: ${file}`);
  }
  assert.match(packagedGame, /window\.PokiSDK = null/);
  assert.doesNotMatch(packagedGame, /busqueda\.me|patch\/js\/null\.js/);
});

test('local games bypass Scramjet and use the game name in browser chrome', () => {
  const index = read('website/html/index.html');
  assert.match(index, /function localGameFor\(url\)/);
  assert.match(index, /website\/games\/fnaf-2/);
  assert.match(index, /website\/games\/brawl-stars/);
  assert.match(index, /website\/games\/retro-bowl/);
  assert.match(index, /parsed\.origin!==location\.origin/);
  assert.match(index, /var localIframe=replaceTabIframe\(tab\)/);
  assert.match(index, /tab\.scFrame&&tab\.scFrame\.destroy/);
  assert.match(index, /tab\.scFrame=window\.NovaProxyManager\.createFrame/);
  assert.match(index, /urlBar\.value = localGame \? localGame\.name : resolved/);
  assert.match(index, /t\.localGame\?t\.localGame\.name:t\.url/);
});

test('proxy-to-local navigation replaces the instrumented iframe browsing context', () => {
  const index = read('website/html/index.html');
  assert.match(index, /function replaceTabIframe\(tab\)/);
  assert.match(index, /var localIframe=replaceTabIframe\(tab\)/);
  assert.match(index, /previous\.parentNode\.replaceChild\(iframe,previous\)/);
});

test('Nova CSP permits the Function constructor required by Cocos Creator 2.4.2', () => {
  const headers = read('_headers');
  assert.match(headers, /Content-Security-Policy:[^\n]*script-src[^;]*'unsafe-eval'/);
});
