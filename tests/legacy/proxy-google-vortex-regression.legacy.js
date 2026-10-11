const fs = require('fs');
const assert = require('assert');
const manager = fs.readFileSync('proxy/js/nova-proxy-manager.js', 'utf8');
const index = fs.readFileSync('website/html/index.html', 'utf8');

assert(manager.includes('function isGoogleURL(value)'), 'Google document detector missing');
assert(manager.includes('return /^google\\.[a-z.]{2,}$/i.test(host);'), 'Google country-domain routing missing');
assert(manager.includes('this._forcedLegacyPolicy = "google-vortex"'), 'Google Vortex policy marker missing');
assert(manager.includes('reason: "forced Google compatibility route"'), 'forced Google Vortex reason missing');
assert(manager.includes('this._activateLegacy(true, "forced Google compatibility route", nextURL, routeGeneration)'), 'Google must activate Vortex before Scramjet navigation');
assert(manager.includes('const routeGeneration = ++this._routeGeneration;'), 'routing generation guard missing');
assert(manager.includes('expectedGeneration !== this._routeGeneration'), 'stale Vortex activation cancellation missing');
assert(manager.includes('this._forcedLegacyPolicy === "google-vortex" && !isGoogleURL(nextURL)'), 'leaving Google must cancel pending policy');
assert(manager.includes('this._forcedLegacyPolicy === "google-vortex" ? isGoogleURL(currentLegacyURL) : isTikTokURL(currentLegacyURL)'), 'forced-domain load exit detection missing');
assert(!manager.includes('function isGoogleSearchURL(value)'), 'old search-only detector must be removed');
assert(!manager.includes('googleTarget'), 'post-load Google activation path must be removed to avoid races');
assert(index.includes('/proxy/js/nova-proxy-manager.js?v=20261011-sj2067-r8.29-tiktok-vortex-first'), 'manager cache bust missing');
assert(!manager.includes('state.currentEngine = "vortex";\n        this._compatHost = hostFor(nextURL)'), 'Google route must not globally switch engine');

assert(manager.includes('this.legacyFrame.addEventListener("urlchange"'), 'Vortex urlchange exit hook missing');
assert(manager.includes('this._forcedLegacyPolicy === "google-vortex" ? isGoogleURL(changedURL) : isTikTokURL(changedURL)'), 'Vortex urlchange must preserve Google and TikTok domain families');
assert(manager.includes('this._returnToModern(changedURL)'), 'Vortex non-Google navigation must return to Scramjet');

console.log('proxy-google-vortex-regression: PASS');
