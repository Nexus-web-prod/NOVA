const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Pixel Shooter uses the current external game host', () => {
  const games = JSON.parse(read('website/data/games.json'));
  const legacyGames = JSON.parse(read('website/assets/json/g.json'));
  const game = games.find(item => item.name === 'Pixel Shooter');
  const legacyGame = legacyGames.find(item => item.name === 'Pixel Shooter');

  assert.deepEqual(
    { url: game.url, local: game.local },
    { url: 'https://ubgwtf.gitlab.io/pixel-shooter/', local: undefined }
  );
  assert.equal(legacyGame.link, game.url);
  assert.equal(legacyGame.local, undefined);
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

test('Brawl Guys is registered with a complete local Construct build', () => {
  const games = JSON.parse(read('website/data/games.json'));
  const legacyGames = JSON.parse(read('website/assets/json/g.json'));
  const game = games.find(item => item.name === 'Brawl Guys');
  const legacyGame = legacyGames.find(item => item.name === 'Brawl Guys');
  const gameRoot = path.join(root, 'website/games/brawl-guys');
  const packagedGame = read('website/games/brawl-guys/index.html');
  const required = [
    'index.html',
    'appmanifest.json',
    'c2runtime.js',
    'data.js',
    'jquery-3.4.1.min.js',
    'offlineClient.js',
    'pathfind.js',
    'loading-logo.png',
    'images/player-sheet0.png',
    'media/battlethemea.ogg'
  ];

  assert.deepEqual(
    { url: game.url, local: game.local },
    { url: 'https://main.nova-7.pages.dev/website/games/brawl-guys/', local: true }
  );
  assert.equal(legacyGame.link, game.url);
  assert.equal(legacyGame.local, true);
  for (const file of required) {
    assert.ok(fs.existsSync(path.join(gameRoot, file)), `missing Construct file: ${file}`);
  }
  assert.match(packagedGame, /<title>Brawl Guys<\/title>/);
  assert.doesNotMatch(packagedGame, /imasdk|patch\/google/);
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
    'html5game/Achievements.txt',
    'html5game/Charities.txt',
    'html5game/Names_F0.txt',
    'html5game/Names_F1.txt',
    'html5game/Names_L.txt',
    'html5game/RetroBowl.js',
    'html5game/RetroBowl_texture_0.png',
    'html5game/RetroBowl_texture_1.png',
    'html5game/Schedule17.txt',
    'html5game/Teams.txt',
    'html5game/uniforms_default.txt',
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
  assert.match(packagedGame, /window\.PokiSDK_OK = false/);
  assert.doesNotMatch(packagedGame, /busqueda\.me|patch\/js\/null\.js/);
  assert.doesNotMatch(read('website/games/retro-bowl/html5game/RetroBowl.js'), /cpd;\s*$/);
});

test('Super Liquid Soccer is registered with a complete local Godot build', () => {
  const games = JSON.parse(read('website/data/games.json'));
  const legacyGames = JSON.parse(read('website/assets/json/g.json'));
  const compactGames = JSON.parse(read('website/assets/json/g.min.json'));
  const game = games.find(item => item.name === 'Super Liquid Soccer');
  const legacyGame = legacyGames.find(item => item.name === 'Super Liquid Soccer');
  const compactGame = compactGames.find(item => item.name === 'Super Liquid Soccer');
  const gameRoot = path.join(root, 'website/games/super-liquid-soccer');
  const packagedGame = read('website/games/super-liquid-soccer/index.html');
  const required = ['index.html', 'index.js', 'index.pck', 'index.wasm', 'index.png', 'index.icon.png'];

  assert.deepEqual(
    { url: game.url, local: game.local },
    { url: 'https://main.nova-7.pages.dev/website/games/super-liquid-soccer/', local: true }
  );
  assert.equal(legacyGame.link, game.url);
  assert.equal(compactGame.link, game.url);
  assert.equal(legacyGame.local, true);
  assert.equal(compactGame.local, true);
  for (const file of required) {
    const filePath = path.join(gameRoot, file);
    assert.ok(fs.existsSync(filePath), `missing Godot file: ${file}`);
    assert.ok(fs.statSync(filePath).size < 25 * 1024 * 1024, `Cloudflare file limit exceeded: ${file}`);
  }
  assert.match(packagedGame, /window\.PokiSDK = \{/);
  assert.match(packagedGame, /gameplayStart: function \(\) \{\}/);
  assert.match(packagedGame, /<title>Super Liquid Soccer<\/title>/);
  assert.doesNotMatch(packagedGame, /patch\/js|Unblocked Games/);
});

test('Basket Bros is registered with a complete local OpenFL build', () => {
  const games = JSON.parse(read('website/data/games.json'));
  const legacyGames = JSON.parse(read('website/assets/json/g.json'));
  const compactGames = JSON.parse(read('website/assets/json/g.min.json'));
  const game = games.find(item => item.name === 'Basket Bros');
  const legacyGame = legacyGames.find(item => item.name === 'Basket Bros');
  const compactGame = compactGames.find(item => item.name === 'Basket Bros');
  const gameRoot = path.join(root, 'website/games/basket-bros');
  const packagedGame = read('website/games/basket-bros/index.html');
  const required = ['index.html', 'BasketBros.js', 'main.min.js', 'manifest.json', 'assets/loading4.png'];

  assert.deepEqual(
    { url: game.url, local: game.local },
    { url: 'https://main.nova-7.pages.dev/website/games/basket-bros/', local: true }
  );
  assert.equal(legacyGame.link, game.url);
  assert.equal(compactGame.link, game.url);
  assert.equal(legacyGame.local, true);
  assert.equal(compactGame.local, true);
  for (const file of required) {
    const filePath = path.join(gameRoot, file);
    assert.ok(fs.existsSync(filePath), `missing OpenFL file: ${file}`);
    assert.ok(fs.statSync(filePath).size < 25 * 1024 * 1024, `Cloudflare file limit exceeded: ${file}`);
  }
  assert.match(packagedGame, /<title>Basket Bros<\/title>/);
  assert.match(packagedGame, /lime\.embed \("BasketBros", "openfl-content"/);
  assert.match(packagedGame, /function isUserLoggedIn\(\) \{\s*return false;/);
  assert.match(packagedGame, /nova:basket-bros:cloud-save/);
  assert.doesNotMatch(packagedGame, /serviceWorker\.register|googletagmanager|clarity\.ms|cdn-cgi\/scripts|www\.gstatic\.com\/firebasejs|firebase\.initializeApp/);
});

test('Wrestle Bros is registered with a complete local OpenFL build', () => {
  const games = JSON.parse(read('website/data/games.json'));
  const legacyGames = JSON.parse(read('website/assets/json/g.json'));
  const compactGames = JSON.parse(read('website/assets/json/g.min.json'));
  const game = games.find(item => item.name === 'Wrestle Bros');
  const legacyGame = legacyGames.find(item => item.name === 'Wrestle Bros');
  const compactGame = compactGames.find(item => item.name === 'Wrestle Bros');
  const gameRoot = path.join(root, 'website/games/wrestle-bros');
  const packagedGame = read('website/games/wrestle-bros/index.html');
  const required = ['index.html', 'WrestleBros.js', 'main.min.js', 'manifest.json', 'assets/loading.png'];

  assert.deepEqual(
    { url: game.url, local: game.local },
    { url: 'https://main.nova-7.pages.dev/website/games/wrestle-bros/', local: true }
  );
  assert.equal(legacyGame.link, game.url);
  assert.equal(compactGame.link, game.url);
  assert.equal(legacyGame.local, true);
  assert.equal(compactGame.local, true);
  for (const file of required) {
    const filePath = path.join(gameRoot, file);
    assert.ok(fs.existsSync(filePath), `missing OpenFL file: ${file}`);
    assert.ok(fs.statSync(filePath).size < 25 * 1024 * 1024, `Cloudflare file limit exceeded: ${file}`);
  }
  assert.match(packagedGame, /<title>Wrestle Bros<\/title>/);
  assert.match(packagedGame, /lime\.embed \("WrestleBros", "openfl-content"/);
  assert.doesNotMatch(packagedGame, /serviceWorker\.register|googletagmanager|cdn-cgi\/scripts|recordsession\.php/);
});

test('Time Shooter games use complete local Unity builds and packaged artwork', () => {
  const games = JSON.parse(read('website/data/games.json'));
  const legacyGames = JSON.parse(read('website/assets/json/g.json'));
  const compactGames = JSON.parse(read('website/assets/json/g.min.json'));
  const expected = [
    {
      name: 'Time Shooter 2',
      url: 'https://main.nova-7.pages.dev/website/games/time-shooter-2/',
      image: '/website/games/time-shooter-2/TimeShooter2_Yandex.jpg',
      root: 'website/games/time-shooter-2',
      required: [
        'index.html',
        'TimeShooter2_Yandex.loader.js',
        'TimeShooter2_Yandex.data.unityweb',
        'TimeShooter2_Yandex.framework.js.unityweb',
        'TimeShooter2_Yandex.wasm.unityweb',
        'TimeShooter2_Yandex.jpg'
      ]
    },
    {
      name: 'Time Shooter 3: SWAT',
      url: 'https://main.nova-7.pages.dev/website/games/time-shooter-3/',
      image: '/website/games/time-shooter-3/Build/TimeShooter3_GD.jpg',
      root: 'website/games/time-shooter-3',
      required: [
        'index.html',
        'Build/UnityLoader.js',
        'Build/TimeShooter3_GD.data.unityweb',
        'Build/TimeShooter3_GD.framework.js.unityweb',
        'Build/TimeShooter3_GD.wasm.unityweb',
        'Build/TimeShooter3_GD.jpg'
      ]
    }
  ];

  for (const item of expected) {
    const game = games.find(entry => entry.name === item.name);
    const legacyGame = legacyGames.find(entry => entry.name === item.name);
    const compactGame = compactGames.find(entry => entry.name === item.name);
    assert.deepEqual({ url: game.url, image: game.image, local: game.local }, { url: item.url, image: item.image, local: true });
    assert.equal(legacyGame.link, item.url);
    assert.equal(compactGame.link, item.url);
    assert.equal(legacyGame.image, item.image);
    assert.equal(compactGame.image, item.image);
    assert.equal(legacyGame.local, true);
    assert.equal(compactGame.local, true);
    for (const file of item.required) {
      const filePath = path.join(root, item.root, file);
      assert.ok(fs.existsSync(filePath), `missing Unity file: ${file}`);
      assert.ok(fs.statSync(filePath).size < 25 * 1024 * 1024, `Cloudflare file limit exceeded: ${file}`);
    }
    assert.doesNotMatch(read(path.join(item.root, 'index.html')), /patch\/js\/null\.js|Unblocked Games 66/);
  }
});

test('Funny Shooter 3D uses its packaged image with the archive external game URL', () => {
  const games = JSON.parse(read('website/data/games.json'));
  const legacyGames = JSON.parse(read('website/assets/json/g.json'));
  const compactGames = JSON.parse(read('website/assets/json/g.min.json'));
  const game = games.find(item => item.name === 'Funny Shooter 3D');
  const legacyGame = legacyGames.find(item => item.name === 'Funny Shooter 3D');
  const compactGame = compactGames.find(item => item.name === 'Funny Shooter 3D');
  const image = '/website/games/funny-shooter-3d/favicon.ico';

  assert.deepEqual(
    { url: game.url, image: game.image, local: game.local },
    { url: 'https://funnyshooter.github.io/file/', image, local: undefined }
  );
  assert.equal(legacyGame.link, game.url);
  assert.equal(compactGame.link, game.url);
  assert.equal(legacyGame.image, image);
  assert.equal(compactGame.image, image);
  assert.ok(fs.existsSync(path.join(root, 'website/games/funny-shooter-3d/favicon.ico')));
});

test('local games open in the dedicated Nova game player', () => {
  const index = read('website/html/index.html');
  const player = read('website/html/game.html');
  assert.match(index, /function localGameFor\(url\)/);
  assert.match(index, /website\/games\/fnaf-2/);
  assert.match(index, /website\/games\/brawl-stars/);
  assert.match(index, /website\/games\/brawl-guys/);
  assert.match(index, /website\/games\/retro-bowl/);
  assert.match(index, /website\/games\/super-liquid-soccer/);
  assert.match(index, /website\/games\/basket-bros/);
  assert.match(index, /website\/games\/wrestle-bros/);
  assert.match(index, /website\/games\/time-shooter-2/);
  assert.match(index, /website\/games\/time-shooter-3/);
  assert.match(index, /main\.nova-7\.pages\.dev/);
  assert.match(index, /window\.location\.assign\('\/website\/html\/game\.html\?game='/);
  assert.match(index, /encodeURIComponent\(localGame\.slug\)/);
  assert.match(player, /var games = \{/);
  assert.match(player, /'fnaf-2'/);
  assert.match(player, /'brawl-stars'/);
  assert.match(player, /'brawl-guys'/);
  assert.match(player, /'retro-bowl'/);
  assert.match(player, /'super-liquid-soccer'/);
  assert.match(player, /'basket-bros'/);
  assert.match(player, /'wrestle-bros'/);
  assert.match(player, /'time-shooter-2'/);
  assert.match(player, /'time-shooter-3'/);
  assert.match(player, /id="back-button"/);
  assert.match(player, /id="restart-button"/);
  assert.match(player, /id="fullscreen-button"/);
  assert.match(player, /id="mute-button"/);
  assert.match(player, /class="launcher-star"/);
  assert.match(player, /@keyframes island-pulse/);
  assert.match(player, /document\.activeElement === frame/);
  assert.match(player, /setMenu\(false, false\)/);
  assert.match(player, /prefers-reduced-motion: reduce/);
  assert.match(player, /button:focus-visible/);
  assert.match(player, /games\[params\.get\('game'\)/);
  assert.doesNotMatch(player, /frame\.src\s*=\s*params/);
  assert.doesNotMatch(player, /<input[^>]+name=["']url/);
});

test('legacy in-browser local loading remains available for an existing local tab', () => {
  const index = read('website/html/index.html');
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

test('local Time Shooter Unity payloads have production-safe MIME types', () => {
  const headers = read('_headers');
  for (const game of ['time-shooter-2', 'time-shooter-3']) {
    assert.match(headers, new RegExp(`/website/games/${game}/[^\\n]*framework\\.js\\.unityweb\\n  Content-Type: application/javascript`));
    assert.match(headers, new RegExp(`/website/games/${game}/[^\\n]*wasm\\.unityweb\\n  Content-Type: application/wasm`));
    assert.match(headers, new RegExp(`/website/games/${game}/[^\\n]*data\\.unityweb\\n  Content-Type: application/octet-stream`));
  }
});
