const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('website/html/index.html','utf8');
const ads = fs.readFileSync('website/js/nova-ads.js','utf8');
const tier = fs.readFileSync('website/js/nova-supernova-tier.js','utf8');
const headers = fs.readFileSync('_headers','utf8');

test('manual placements exist on approved public pages', () => {
  for (const page of ['home','games','game-player','apps','movies','plans','settings']) {
    assert.equal((html.match(new RegExp(`data-nova-ad-page="${page}"`, 'g')) || []).length, 1);
  }
  for (const page of ['browser','game-detail','social','supernova','dev','support']) {
    assert.equal(html.includes(`data-nova-ad-page="${page}"`), false);
  }
  assert.match(html, /browser-ad-free-note[\s\S]*No ads on this page/);
});

test('publisher id is configured but ad unit ids are not fabricated', () => {
  assert.match(ads, /ca-pub-6082584609878503/);
  assert.match(ads, /home:\s*null/);
  assert.match(ads, /games:\s*null/);
  assert.match(ads, /apps:\s*null/);
  assert.match(ads, /movies:\s*null/);
  assert.match(ads, /"game-player":\s*null/);
  assert.match(ads, /plans:\s*null/);
  assert.match(ads, /settings:\s*null/);
});

test('blocked/private routes and supernova are guarded centrally', () => {
  assert.match(ads, /BLOCKED_PAGES/);
  assert.match(ads, /userHasSupernova\(\)/);
  assert.match(ads, /isEntitlementReady\(\)/);
  assert.match(ads, /nova:page-change/);
  assert.match(ads, /nova:navigate/);
  assert.match(ads, /fullscreenchange/);
});

test('signed-in entitlement verification is server-backed and fail-closed', () => {
  assert.match(tier, /isServerVerified/);
  assert.match(tier, /await window\.NovaAPI\.me\(\)/);
  assert.match(tier, /setProState\(accountLooksPro\(account\), false\)/);
});

test('CSP keeps existing proxy/Wisp allowances and adds scoped AdSense origins', () => {
  assert.match(headers, /wss:\/\/unified-wisp-epoxy\.fly\.dev/);
  assert.match(headers, /https:\/\/pagead2\.googlesyndication\.com/);
  assert.match(headers, /https:\/\/googleads\.g\.doubleclick\.net/);
  assert.match(headers, /frame-ancestors 'self'/);
  assert.match(headers, /object-src 'none'/);
});

test('root document exposes AdSense site verification without a global ad runtime', () => {
  assert.match(html, /<meta\s+name=["']google-adsense-account["']\s+content=["']ca-pub-6082584609878503["']\s*\/?\s*>/i);
});

test('AdSense traffic-quality runtime is allowed by CSP without opening script-src to all HTTPS', () => {
  assert.match(headers, /script-src[^\n;]*https:\/\/\*\.adtrafficquality\.google/);
  assert.match(headers, /connect-src[^\n;]*https:\/\/\*\.adtrafficquality\.google/);
  assert.doesNotMatch(headers, /script-src[^\n;]*(?:^|\s)https:\s/);
});

test('production ads create their container before loading and rotating pixels are path-scoped', () => {
  assert.match(ads, /slot\.append\(label, container, script\)/);
  assert.match(headers, /connect-src[^;]*https:\/\/\*\/pixel\/ase/);
  assert.doesNotMatch(headers, /connect-src[^;]*(?:^|\s)https:\s/);
});

test('AdSense loader is absent from browser, diagnostics, gameplay, policy, and verification pages', () => {
  const blockedFiles = [
    'proxy/html/proxy-frame.html',
    'proxy/html/proxy-diagnostics.html',
    'website/html/nova-games.html',
    'website/html/privacy-policy.html',
    'website/html/staff-privacy-policy.html',
    'website/html/verification-handoff.html'
  ];
  for (const file of blockedFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.equal(source.includes('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'), false, file);
  }
});
