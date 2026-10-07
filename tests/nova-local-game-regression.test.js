const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Nova Eaglercraft is a pinned, self-contained local game', () => {
  const games = JSON.parse(read('website/data/games.json'));
  const legacyGames = JSON.parse(read('website/assets/json/g.json'));
  const game = games.find(item => item.name === 'Nova Eaglercraft');
  const legacyGame = legacyGames.find(item => item.name === 'Nova Eaglercraft');
  const packagedGame = path.join(root, 'website/games/nova-eaglercraft/index.html');

  assert.deepEqual(
    { url: game.url, local: game.local, alwaysTop: game.alwaysTop },
    { url: 'https://main.nova-7.pages.dev/website/games/nova-eaglercraft/', local: true, alwaysTop: true }
  );
  assert.equal(legacyGame.link, game.url);
  assert.equal(legacyGame.local, true);
  assert.equal(legacyGame.alwaysTop, true);
  assert.ok(fs.existsSync(packagedGame));
  for (const part of ['game.part.00', 'game.part.01', 'game.part.02', 'game.part.03']) {
    const partPath = path.join(root, 'website/games/nova-eaglercraft', part);
    assert.ok(fs.existsSync(partPath));
    assert.ok(fs.statSync(partPath).size < 25 * 1024 * 1024);
  }
  const eaglerIndex = read('website/games/nova-eaglercraft/index.html');
  assert.match(eaglerIndex, /<title>Nova Eaglercraft<\/title>/);
  assert.match(eaglerIndex, /frame\.src = 'game\.html\?v=20261007-eagler-stream1'/);
  assert.doesNotMatch(eaglerIndex, /URL\.createObjectURL\(game\)/);
  assert.match(read('_worker.js'), /function serveEaglercraftAsset\(request, env, url\)/);
  assert.match(read('_worker.js'), /game\.part\.00/);
  const proxyWorker = read('proxy/sw.js');
  assert.match(proxyWorker, /website\/games\/nova-eaglercraft\//);
  assert.match(proxyWorker, /Nova Eaglercraft is a self-contained local game/);
});

test('Nova Eaglercraft is registered in the built-in Games Player and remains first in its results', () => {
  const index = read('website/html/index.html');
  const player = read('website/html/game.html');
  const games = JSON.parse(read('website/data/games.json'));
  const game = games.find(item => item.name === 'Nova Eaglercraft');
  assert.match(index, /\/website\/games\/nova-eaglercraft\//);
  assert.match(index, /name:'Nova Eaglercraft',slug:'nova-eaglercraft'/);
  assert.match(player, /'nova-eaglercraft': \{ name: 'Nova Eaglercraft', src: '\/website\/games\/nova-eaglercraft\/' \}/);
  assert.equal(game.alwaysTop, true);
  assert.equal(games[0].name, 'Nova Eaglercraft');
});

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
      image: '/website/assets/media/icons/timeshooter2.webp',
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
    { url: 'https://ubgwtf.gitlab.io/funny-shooter/', image, local: undefined }
  );
  assert.equal(legacyGame.link, game.url);
  assert.equal(compactGame.link, game.url);
  assert.equal(legacyGame.image, image);
  assert.equal(compactGame.image, image);
  assert.ok(fs.existsSync(path.join(root, 'website/games/funny-shooter-3d/favicon.ico')));
});

test('Basket Random is local while preserving its existing Nova icon', () => {
  const games = JSON.parse(read('website/data/games.json'));
  const legacyGames = JSON.parse(read('website/assets/json/g.json'));
  const compactGames = JSON.parse(read('website/assets/json/g.min.json'));
  const game = games.find(item => item.name === 'Basket Random');
  const legacyGame = legacyGames.find(item => item.name === 'Basket Random');
  const compactGame = compactGames.find(item => item.name === 'Basket Random');
  const gameRoot = path.join(root, 'website/games/basket-random');
  const packagedGame = read('website/games/basket-random/index.html');
  const icon = '/website/assets/media/icons/br.webp';
  const required = ['index.html', 'data.json', 'box2d.wasm', 'box2d.wasm.js', 'scripts/c3runtime.js', 'scripts/offlineclient.js', 'scripts/main.js', 'images/titlebg-sheet0.png'];

  assert.deepEqual(
    { url: game.url, image: game.image, local: game.local },
    { url: 'https://main.nova-7.pages.dev/website/games/basket-random/', image: icon, local: true }
  );
  assert.equal(legacyGame.link, game.url);
  assert.equal(compactGame.link, game.url);
  assert.equal(legacyGame.image, icon);
  assert.equal(compactGame.image, icon);
  assert.equal(legacyGame.local, true);
  assert.equal(compactGame.local, true);
  for (const file of required) {
    const filePath = path.join(gameRoot, file);
    assert.ok(fs.existsSync(filePath), `missing Construct file: ${file}`);
    assert.ok(fs.statSync(filePath).size < 25 * 1024 * 1024, `Cloudflare file limit exceeded: ${file}`);
  }
  assert.match(packagedGame, /<title>Basket Random<\/title>/);
  assert.doesNotMatch(packagedGame, /patch\/js|register-sw|Unblocked Games 66/);
});

test('uploaded classic games are local and preserve every existing catalog icon', () => {
  const games = JSON.parse(read('website/data/games.json'));
  const legacyGames = JSON.parse(read('website/assets/json/g.json'));
  const compactGames = JSON.parse(read('website/assets/json/g.min.json'));
  const expected = [
    ['Jetpack Joyride', 'jetpack-joyride', '/website/assets/media/icons/jetpackjoyride.webp', '/website/assets/media/icons/jetpackjoyride.webp', 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTlXwelM4mWFCoBcTvH8e1JgftqAR_Ssi3b9n3COCC3BuN8sTDpBSjhtDJ6Tv6fk1dbIkfP62PoJL7OjliSW1jA3MOfvMDJhaYTW17a6pU&s=10'],
    ['Subway Surfers: San Francisco', 'subway-surfers', '/website/assets/media/icons/SF.webp', '/website/assets/media/icons/SF.webp', '/website/assets/media/icons/SF.webp'],
    ['Slope', 'slope', '/website/assets/media/icons/slope.webp', '/website/assets/media/icons/slope.webp', '/website/assets/media/icons/slope.webp'],
    ['Rocket Soccer', 'rocket-league', '/website/assets/media/icons/2D-Rocket-League.webp', '/website/assets/media/icons/2D-Rocket-League.webp', '/website/assets/media/icons/2D-Rocket-League.webp'],
    ['Among Us', 'among-us', '/website/assets/media/icons/scratch-among-us.webp', '/website/assets/media/icons/scratch-among-us.webp', '/website/assets/media/icons/scratch-among-us.webp'],
    ['Bitlife', 'bitlife', '/website/assets/media/icons/bitlife.webp', '/website/assets/media/icons/bitlife.webp', '/website/assets/media/icons/bitlife.webp'],
    ['Cookie Clicker', 'cookie-clicker', '/website/assets/media/icons/cookieclicker.webp', '/website/assets/media/icons/cookieclicker.webp', '/website/assets/media/icons/cookieclicker.webp']
  ];

  for (const [name, slug, dataIcon, legacyIcon, compactIcon] of expected) {
    const game = games.find(item => item.name === name);
    const legacyGame = legacyGames.find(item => item.name === name);
    const compactGame = compactGames.find(item => item.name === name);
    const url = `https://main.nova-7.pages.dev/website/games/${slug}/`;
    assert.deepEqual({ url: game.url, image: game.image, local: game.local }, { url, image: dataIcon, local: true });
    assert.deepEqual({ link: legacyGame.link, image: legacyGame.image, local: legacyGame.local }, { link: url, image: legacyIcon, local: true });
    assert.deepEqual({ link: compactGame.link, image: compactGame.image, local: compactGame.local }, { link: url, image: compactIcon, local: true });
    assert.ok(fs.existsSync(path.join(root, `website/games/${slug}/index.html`)));
  }

  for (const file of fs.readdirSync(path.join(root, 'website/games/subway-surfers/Build'))) {
    assert.ok(fs.statSync(path.join(root, 'website/games/subway-surfers/Build', file)).size < 25 * 1024 * 1024, `Cloudflare file limit exceeded: ${file}`);
  }
  assert.match(read('_worker.js'), /serveSplitGameAsset/);
  assert.match(read('_worker.js'), /SanFrancisco\.data\.unityweb/);
});

test('Jetpack Joyride uses its complete local build without an external base URL', () => {
  const game = read('website/games/jetpack-joyride/index.html');
  assert.match(game, /src="game3\.js"/);
  assert.match(game, /id="phaser-canvas"/);
  assert.doesNotMatch(game, /<base\b|<iframe\b|abinbins\.github\.io/);
  assert.match(read('_worker.js'), /serveJetpackAsset/);
  assert.ok(fs.readdirSync(path.join(root, 'website/games/jetpack-joyride/assets/audio')).length >= 90);
  assert.ok(fs.readdirSync(path.join(root, 'website/games/jetpack-joyride/assets/atlas')).length >= 14);
});

test('Slope keeps unavailable advertising hooks from stopping the Unity game', () => {
  const framework = read('website/games/slope/Build/SlopeBuild.framework.js');
  const sdk = read('website/games/slope/sdk.js');
  assert.match(framework, /typeof window\.showNextAd === "function"/);
  assert.match(sdk, /window\.showNextAd/);
});

test('Stickman Hook is registered as a complete local game without replacing its Nova icon', () => {
  const games = JSON.parse(read('website/data/games.json'));
  const legacyGames = JSON.parse(read('website/assets/json/g.json'));
  const game = games.find(item => item.name === 'Stickman Hook');
  const legacyGame = legacyGames.find(item => item.name === 'Stickman Hook');
  assert.deepEqual(
    { url: game.url, image: game.image, local: game.local },
    {
      url: 'https://main.nova-7.pages.dev/website/games/stickman-hook/',
      image: '/website/assets/media/icons/stickmanhook.webp',
      local: true
    }
  );
  assert.equal(legacyGame.link, game.url);
  assert.equal(legacyGame.image, game.image);
  assert.equal(legacyGame.local, true);
  assert.match(read('website/games/stickman-hook/index.html'), /src="bundle\.js"/);
  assert.ok(fs.statSync(path.join(root, 'website/games/stickman-hook/bundle.js')).size > 1_000_000);
  assert.match(read('website/html/index.html'), /'\/website\/games\/stickman-hook\/': \{name:'Stickman Hook',slug:'stickman-hook'\}/);
  assert.match(read('website/html/game.html'), /'stickman-hook': \{ name: 'Stickman Hook', src: '\/website\/games\/stickman-hook\/' \}/);
});

test('both Tunnel Rush games are complete local builds and preserve their Nova icons', () => {
  const games = JSON.parse(read('website/data/games.json'));
  const legacyGames = JSON.parse(read('website/assets/json/g.json'));
  for (const item of [
    { name: 'Tunnel Rush', slug: 'tunnel-rush', icon: '/website/assets/media/icons/tunnelrush.webp' },
    { name: 'Tunnel Rush 2', slug: 'tunnel-rush-2', icon: '/website/assets/media/icons/tunnelrush2.webp' }
  ]) {
    const url = `https://main.nova-7.pages.dev/website/games/${item.slug}/`;
    const game = games.find(entry => entry.name === item.name);
    const legacyGame = legacyGames.find(entry => entry.name === item.name);
    assert.deepEqual({ url: game.url, image: game.image, local: game.local }, { url, image: item.icon, local: true });
    assert.deepEqual({ link: legacyGame.link, image: legacyGame.image, local: legacyGame.local }, { link: url, image: item.icon, local: true });
    assert.ok(fs.existsSync(path.join(root, `website/games/${item.slug}/index.html`)));
  }
  assert.ok(fs.statSync(path.join(root, 'website/games/tunnel-rush/tunnel_rush_v9wasmcode.unityweb')).size > 3_000_000);
  assert.ok(fs.statSync(path.join(root, 'website/games/tunnel-rush-2/data.bin')).size > 1_000_000);
  assert.ok(fs.statSync(path.join(root, 'website/games/tunnel-rush-2/moonbird.wasm')).size > 250_000);
});

test('Learn to Fly is registered with its uploaded local Flash build', () => {
  const games = JSON.parse(read('website/data/games.json'));
  const legacyGames = JSON.parse(read('website/assets/json/g.json'));
  const game = games.find(entry => entry.name === 'Learn to Fly');
  const legacyGame = legacyGames.find(entry => entry.name === 'Learn to Fly');
  const url = 'https://main.nova-7.pages.dev/website/games/learn-to-fly/';
  const image = '/website/games/learn-to-fly/favicon.ico';
  assert.deepEqual({ url: game.url, image: game.image, local: game.local }, { url, image, local: true });
  assert.deepEqual({ link: legacyGame.link, image: legacyGame.image, local: legacyGame.local }, { link: url, image, local: true });
  assert.ok(fs.statSync(path.join(root, 'website/games/learn-to-fly/learntofly.swf')).size > 800_000);
  assert.ok(fs.statSync(path.join(root, 'website/games/learn-to-fly/c5c02c4e65c1c4423a97.wasm')).size > 1_000_000);
});

test('Moto X3M is a local build that preserves its Nova icon and does not wait for an ad SDK', () => {
  const games = JSON.parse(read('website/data/games.json'));
  const legacyGames = JSON.parse(read('website/assets/json/g.json'));
  const game = games.find(entry => entry.name === 'Moto X3M');
  const legacyGame = legacyGames.find(entry => entry.name === 'Moto X3M');
  const url = 'https://main.nova-7.pages.dev/website/games/moto-x3m/';
  const image = '/website/assets/media/icons/mx3m.webp';
  assert.deepEqual({ url: game.url, image: game.image, local: game.local }, { url, image, local: true });
  assert.deepEqual({ link: legacyGame.link, image: legacyGame.image, local: legacyGame.local }, { link: url, image, local: true });
  const index = read('website/games/moto-x3m/index.html');
  assert.match(index, /myDispatchEvent\("sdk_inited"\)/);
  assert.doesNotMatch(index, /cdn\.y8\.com/);
  assert.ok(fs.statSync(path.join(root, 'website/games/moto-x3m/motox3m2.min.js')).size > 1_000_000);
});

test('Paper.io 2 uses the uploaded local build and preserves the existing Paper.io icon', () => {
  const games = JSON.parse(read('website/data/games.json'));
  const legacyGames = JSON.parse(read('website/assets/json/g.json'));
  const game = games.find(entry => entry.name === 'Paper.io 2');
  const legacyGame = legacyGames.find(entry => entry.name === 'Paper.io 2');
  const url = 'https://main.nova-7.pages.dev/website/games/paper-2-io/';
  const image = '/website/assets/media/icons/paperio.webp';
  assert.deepEqual({ url: game.url, image: game.image, local: game.local }, { url, image, local: true });
  assert.deepEqual({ link: legacyGame.link, image: legacyGame.image, local: legacyGame.local }, { link: url, image, local: true });
  assert.match(read('website/games/paper-2-io/index.html'), /src="js\/app-new-gm\.js\?26"/);
  assert.ok(fs.statSync(path.join(root, 'website/games/paper-2-io/main.min.js')).size > 1_000_000);
  assert.match(read('website/html/index.html'), /'\/website\/games\/paper-2-io\/': \{name:'Paper\.io 2',slug:'paper-2-io'\}/);
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
  assert.match(index, /website\/games\/basket-random/);
  for (const game of ['jetpack-joyride', 'among-us', 'bitlife', 'slope', 'rocket-league', 'cookie-clicker', 'subway-surfers']) {
    assert.match(index, new RegExp(`website\\/games\\/${game}`));
    assert.match(player, new RegExp(`'${game}'`));
  }
  assert.match(index, /main\.nova-7\.pages\.dev/);
  assert.match(index, /function showGamesPlayerPage\(localGame\)/);
  assert.match(index, /window\._novaSwitchPage\('game-player'\)/);
  assert.match(index, /showGamesPlayerPage\(localGame\)/);
  assert.match(index, /id="page-game-player"/);
  assert.match(index, /data-page="game-player"/);
  assert.match(index, /game-player-quick-controls/);
  assert.match(index, /game-player-mode/);
  assert.match(index, /playerFrame\.contentDocument\.addEventListener\('pointermove'/);
  assert.match(index, /#nova-shell\.island-open\.game-player-mode/);
  assert.match(index, /game-player-mode\.game-player-has-game/);
  assert.match(index, /#page-game-player\.pg-enter-left/);
  assert.match(index, /id="ni-game-player-page-item" data-page="game-player"/);
  assert.match(index, /window\.NovaAPI\.rateGame\(entry\.local\.slug,value\)/);
  assert.doesNotMatch(index, /activeItem\.offsetTop - list\.scrollTop/);
  assert.match(index, /activeGameplay=activePage==='game-player'/);
  assert.match(index, /focused\.matches\('#frame-container iframe\.tab-iframe\.active,#local-game-player-frame'\)/);
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
  assert.match(player, /'basket-random'/);
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
  assert.match(headers, /Content-Security-Policy:[^\n]*script-src[^;]*blob:/);
});

test('local Time Shooter Unity payloads have production-safe MIME types', () => {
  const headers = read('_headers');
  for (const game of ['time-shooter-2', 'time-shooter-3']) {
    assert.match(headers, new RegExp(`/website/games/${game}/[^\\n]*framework\\.js\\.unityweb\\n  Content-Type: application/javascript`));
    assert.match(headers, new RegExp(`/website/games/${game}/[^\\n]*wasm\\.unityweb\\n  Content-Type: application/wasm`));
    assert.match(headers, new RegExp(`/website/games/${game}/[^\\n]*data\\.unityweb\\n  Content-Type: application/octet-stream`));
  }
});

test('UGS replacements are complete local games and preserve Nova artwork', () => {
  const games = JSON.parse(read('website/data/games.json'));
  const index = read('website/html/index.html');
  const player = read('website/html/game.html');
  const expected = [
    {
      name: 'Baseball Bros',
      slug: 'baseball-bros',
      image: '/website/assets/media/icons/baseball-bros.png',
      payload: 'BaseballBros.js',
      minimum: 3_000_000
    },
    {
      name: 'Speed stars',
      slug: 'speed-stars',
      image: '/website/assets/media/icons/speedstars.png',
      payload: 'Build/webgl.wasm.part1',
      minimum: 10_000_000
    },
    {
      name: 'Space Waves',
      slug: 'space-waves',
      image: '/website/assets/media/icons/spacewaves.png',
      payload: 'Build/7fb5141de5923189bc1dc5f94eb619f2.wasm.unityweb',
      minimum: 4_000_000
    }
  ];

  for (const entry of expected) {
    const game = games.find(item => item.name === entry.name);
    const url = `https://main.nova-7.pages.dev/website/games/${entry.slug}/`;
    assert.deepEqual(
      { url: game.url, image: game.image, local: game.local },
      { url, image: entry.image, local: true }
    );
    assert.ok(fs.existsSync(path.join(root, 'website/games', entry.slug, 'index.html')));
    assert.ok(fs.statSync(path.join(root, 'website/games', entry.slug, entry.payload)).size > entry.minimum);
    assert.match(index, new RegExp(`website\\/games\\/${entry.slug}`));
    assert.match(player, new RegExp(`'${entry.slug}'`));
  }

  const speedStars = read('website/games/speed-stars/index.html');
  assert.match(speedStars, /<script src="merge\.js"><\/script>/);
  assert.doesNotMatch(speedStars, /game-cdn\.poki\.com|cdn\.jsdelivr\.net/);

  const crossyRoad = games.find(item => item.name === 'Crossy Road');
  assert.notEqual(crossyRoad && crossyRoad.local, true);
  assert.doesNotMatch(crossyRoad && crossyRoad.url || '', /website\/games\/crossy-road/);
});

test('Monkey Mart is local and DOOM uses its original remote build', () => {
  const games = JSON.parse(read('website/data/games.json'));
  const index = read('website/html/index.html');
  const player = read('website/html/game.html');
  const expected = [
    {
      name: 'Monkey Mart', slug: 'monkey-mart', image: '/website/assets/media/icons/mm.webp',
      payload: 'MonkeyMart.wasm', minimum: 2_000_000
    }
  ];

  for (const entry of expected) {
    const game = games.find(item => item.name === entry.name);
    const url = `https://main.nova-7.pages.dev/website/games/${entry.slug}/`;
    assert.deepEqual(
      { url: game.url, image: game.image, local: game.local },
      { url, image: entry.image, local: true }
    );
    assert.ok(fs.statSync(path.join(root, 'website/games', entry.slug, entry.payload)).size > entry.minimum);
    assert.match(index, new RegExp(`website\\/games\\/${entry.slug}`));
    assert.match(player, new RegExp(`'${entry.slug}'`));
  }

  const doom = games.find(item => item.name === 'DOOM');
  assert.deepEqual(
    { url: doom.url, image: doom.image, local: doom.local },
    { url: 'https://arcader.com/roms/doom.html', image: '/website/assets/media/icons/DOOM.webp', local: undefined }
  );
  assert.doesNotMatch(index, /website\/games\/doom/);
  assert.doesNotMatch(player, /'doom'/);

  const escapeRoad = games.find(item => item.name === 'Escape Road 2');
  assert.notEqual(escapeRoad.local, true);
  assert.doesNotMatch(escapeRoad.url, /website\/games\/escape-road-2/);
});

test('Geo Dash uses the selected local gdash build and preserves its Nova icon', () => {
  const games = JSON.parse(read('website/data/games.json'));
  const game = games.find(item => item.name === 'Geo Dash');
  const url = 'https://main.nova-7.pages.dev/website/games/geo-dash/';
  const image = '/website/assets/media/icons/geodash.png';

  assert.deepEqual({ url: game.url, image: game.image, local: game.local }, { url, image, local: true });
  assert.match(read('website/games/geo-dash/index.html'), /assets\/index-game\.js/);
  assert.ok(fs.statSync(path.join(root, 'website/games/geo-dash/assets/index-game.js')).size > 3_000_000);
  assert.match(read('website/html/index.html'), /website\/games\/geo-dash/);
  assert.match(read('website/html/game.html'), /'geo-dash'/);
});

test('Monkey Mart archive metadata matches its bundled files and uses a local SDK stub', () => {
  const rootPath = path.join(root, 'website/games/monkey-mart');
  const archive = JSON.parse(read('website/games/monkey-mart/archive/archive_files.json'));
  for (const file of archive.content) {
    const actualSize = file.pieces.reduce((total, piece) => {
      return total + fs.statSync(path.join(rootPath, 'archive', piece.name)).size;
    }, 0);
    assert.equal(actualSize, file.size, `archive size mismatch for ${file.name}`);
  }

  const page = read('website/games/monkey-mart/index.html');
  const sdk = read('website/games/monkey-mart/poki-sdk.js');
  assert.doesNotMatch(page, /bg_loading\.png|load_bar_(?:bg|fg)\.png/);
  assert.match(sdk, /window\.PokiSDK = \{/);
  assert.doesNotMatch(sdk, /poki-sdk-core|createElement\("script"\)/);
});

test('Nova does not load or display advertising and publishes its AdSense seller record', () => {
  const index = read('website/html/index.html');
  const settings = read('website/js/nova-settings-v7-ui.js');
  const headers = read('_headers');
  assert.doesNotMatch(index, /nova-ad-slot|Sponsored content|google-adsense-account|profitableratecpmnetwork|nova-ads\.js|nova-ads\.css/i);
  assert.doesNotMatch(settings, /nova-ad-slot|Sponsored content/i);
  assert.doesNotMatch(headers, /googlesyndication|doubleclick|adtrafficquality|profitableratecpmnetwork|pixel\/ase|ntv\.json/i);
  assert.equal(read('ads.txt'), 'google.com, pub-6082584609878503, DIRECT, f08c47fec0942fa0\n');
  assert.match(read('_worker.js'), /url\.pathname === "\/ads\.txt"[\s\S]*pub-6082584609878503[\s\S]*status: 200/);
  assert.equal(fs.existsSync(path.join(root, 'website/js/nova-ads.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'website/css/nova-ads.css')), false);
});
