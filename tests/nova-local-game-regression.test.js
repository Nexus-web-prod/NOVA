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
  assert.match(eaglerIndex, /window\.location\.replace\('game\.html\?v=20261007-eagler-stream2'\)/);
  assert.doesNotMatch(eaglerIndex, /frame\.src\s*=\s*['"]game\.html\?v=20261007-eagler-stream1['"]/);
  assert.doesNotMatch(eaglerIndex, /URL\.createObjectURL\(game\)/);
  assert.match(read('_worker.js'), /function serveEaglercraftAsset\(request, env, url\)/);
  assert.match(read('_worker.js'), /game\.part\.00/);
  const proxyWorker = read('proxy/sw.js');
  assert.match(proxyWorker, /website\/games\/nova-eaglercraft\//);
  assert.match(proxyWorker, /Nova Eaglercraft is a self-contained local game/);
});

test('Eaglercraft loading image URL matches a bundled compatibility asset', () => {
  const index = read('website/html/index.html');
  const match = index.match(/src="\/website\/games\/nova-eaglercraft\/loading\/([^"]+)"/);
  assert.ok(match, 'loading slideshow must reference a local image');
  const asset = path.join(root, 'website/games/nova-eaglercraft/loading', match[1]);
  assert.ok(fs.existsSync(asset), `loading image URL must resolve to a bundled asset: ${match[1]}`);
});
test('clicking inside the Minecraft game iframe closes Nova Island without cancelling gameplay input', () => {
  const index = read('website/html/index.html');
  assert.match(index, /function bindGameFrameIslandDismiss\(frame\)/);
  assert.match(index, /childDocument\.addEventListener\('pointerdown', function\(\)\{[\s\S]*?activePage==='game-player'[\s\S]*?shell\.classList\.contains\('game-player-has-game'\)[\s\S]*?window\._novaCloseIsland\(\);[\s\S]*?\}, true\)/);
  assert.match(index, /bindGameFrameIslandDismiss\(frame\);/);
  assert.match(index, /frame\.remove\(\);[\s\S]*?frame = document\.createElement\('iframe'\);[\s\S]*?bindGameFrameIslandDismiss\(frame\);/);
  assert.doesNotMatch(index.slice(index.indexOf('function bindGameFrameIslandDismiss(frame)'), index.indexOf('function showGamesPlayerPage(localGame)')), /preventDefault|stopPropagation/);
});
