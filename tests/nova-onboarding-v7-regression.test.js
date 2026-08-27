const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const tourPath = path.join(root, 'website/js/nova-onboarding-tour-v7.js');
const socialPath = path.join(root, 'website/js/social.js');
const indexPath = path.join(root, 'website/html/index.html');
const headersPath = path.join(root, '_headers');
const tour = fs.readFileSync(tourPath, 'utf8');

test('Nova has one post-setup onboarding implementation and one state key', () => {
  const index = fs.readFileSync(indexPath, 'utf8');
  assert.equal((index.match(/nova-onboarding-tour-v7\.js/g) || []).length, 1);
  assert.match(tour, /nova_onboarding_v7/);
  assert.doesNotMatch(tour, /setInterval\s*\(/);
});

test('the guide observes Nova and never drives Nova navigation', () => {
  assert.doesNotMatch(tour, /\.click\s*\(/);
  assert.doesNotMatch(tour, /stopImmediatePropagation\s*\(/);
  assert.doesNotMatch(tour, /novaSwitchPage\s*\(/);
  assert.match(tour, /pointer-events:none/);
  assert.match(tour, /#page-games/);
  assert.match(tour, /#page-game-detail/);
  assert.match(tour, /#page-browser/);
});

test('guided interaction blocks outside clicks and opens only the action target', () => {
  assert.match(tour, /\.shade\{[^}]*pointer-events:auto/);
  assert.match(tour, /\.focus\{[^}]*pointer-events:auto/);
  assert.match(tour, /\.guide\.action \.focus\{pointer-events:none/);
  assert.match(tour, /classList\.toggle\('action',!!st\.action\)/);
  assert.match(tour, /function guardInput\(event\)/);
  assert.match(tour, /event\.isTrusted===false/);
  assert.match(tour, /insideTarget/);
  assert.match(tour, /event\.stopPropagation\(\)/);
  assert.match(tour, /prefers-reduced-motion:reduce/);
});

test('Everyone Chat advances only on confirmed send', () => {
  const social = fs.readFileSync(socialPath, 'utf8');
  assert.match(social, /nova:social-message-sent/);
  assert.match(tour, /events:\['nova:social-message-sent'\]/);
  assert.doesNotMatch(tour, /social-everyone-send-btn/);
});

test('the playable tutorial target is Equinox, never Request A Game', () => {
  assert.match(tour, /cardName:'Equinox'/);
  assert.doesNotMatch(tour, /cardName:'Request A Game'/);
});

test('setup boundary and CSP remain present', () => {
  const headers = fs.readFileSync(headersPath, 'utf8');
  const setupCss = fs.readFileSync(path.join(root, 'website/css/nova-setup-v7.css'), 'utf8');
  const index = fs.readFileSync(indexPath, 'utf8');
  assert.match(tour, /nova:setup-complete/);
  assert.match(tour, /__novaSetupV7Active/);
  assert.match(index, /document\.documentElement\.classList\.add\("nova-setup-pending"\)/);
  assert.match(setupCss, /html\.nova-setup-pending #nova-shell/);
  assert.match(setupCss, /visibility: hidden !important/);
  assert.match(headers, /Content-Security-Policy:/);
});

test('cookie consent lives in Setup beside the legal links', () => {
  const setup = fs.readFileSync(path.join(root, 'website/js/nova-setup-v7.js'), 'utf8');
  const index = fs.readFileSync(indexPath, 'utf8');
  assert.match(setup, /data-setup-consent="minimal"/);
  assert.match(setup, /data-setup-consent="accepted"/);
  assert.match(setup, /Privacy Policy[\s\S]*Terms of Service[\s\S]*Local storage and cookies/);
  assert.doesNotMatch(index, /id="consent-banner"/);
});

test('Recent observes the actual tab state and advances after its real click', () => {
  assert.match(tour, /id:'recent'[\s\S]*observe:'\.ni-tab\[data-ni-tab="recent"\]'/);
  assert.match(tour, /completeWhen:function\(\)\{return!!q\('\.ni-tab\.active\[data-ni-tab="recent"\]'\)\}/);
  assert.match(tour, /s\.addEventListener\(type,function\(event\)\{event\.stopPropagation\(\)\}\)/);
  assert.match(tour, /function settlePosition\(\)/);
  assert.match(tour, /\[80,180,340\]/);
});
