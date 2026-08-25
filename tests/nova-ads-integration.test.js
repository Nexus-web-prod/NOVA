const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('website/html/index.html','utf8');
const ads = fs.readFileSync('website/js/nova-ads.js','utf8');
const tier = fs.readFileSync('website/js/nova-supernova-tier.js','utf8');
const headers = fs.readFileSync('_headers','utf8');

test('manual placements exist only on discovery pages', () => {
  for (const page of ['home','games','apps','movies']) {
    assert.equal((html.match(new RegExp(`data-nova-ad-page="${page}"`, 'g')) || []).length, 1);
  }
  for (const page of ['browser','game-detail','settings','social','supernova','dev','support']) {
    assert.equal(html.includes(`data-nova-ad-page="${page}"`), false);
  }
});

test('publisher id is configured but ad unit ids are not fabricated', () => {
  assert.match(ads, /ca-pub-6082584609878503/);
  assert.match(ads, /home:\s*null/);
  assert.match(ads, /games:\s*null/);
  assert.match(ads, /apps:\s*null/);
  assert.match(ads, /movies:\s*null/);
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
