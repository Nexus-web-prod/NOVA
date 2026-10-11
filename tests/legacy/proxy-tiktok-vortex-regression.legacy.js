const fs = require('fs');
const assert = require('assert');
const manager = fs.readFileSync('proxy/js/nova-proxy-manager.js', 'utf8');

assert(manager.includes('function isTikTokURL(value)'), 'TikTok URL detector missing');
assert(manager.includes('return host === "tiktok.com" || host.endsWith(".tiktok.com");'), 'TikTok apex and subdomain matching missing');
assert(manager.includes('this._forcedLegacyPolicy = "tiktok-vortex"'), 'TikTok Vortex policy marker missing');
assert(manager.includes('reason: "forced TikTok compatibility route"'), 'forced TikTok compatibility reason missing');
assert(manager.includes('this._activateLegacy(true, "forced TikTok compatibility route", nextURL, routeGeneration)'), 'TikTok must activate Vortex before Scramjet navigation');
assert(manager.includes('this._forcedLegacyPolicy === "tiktok-vortex" && !isTikTokURL(nextURL)'), 'leaving TikTok must cancel pending policy');
assert(manager.includes('this._forcedLegacyPolicy === "tiktok-vortex" && !isTikTokURL(nextURL)'), 'leaving TikTok must exit forced legacy routing');
assert(manager.includes('this._forcedLegacyPolicy === "google-vortex" ? isGoogleURL(changedURL) : isTikTokURL(changedURL)'), 'Vortex URL changes must keep TikTok subdomains on legacy');
assert(manager.includes('reason === "forced TikTok compatibility route" && !isTikTokURL(fallbackTarget)'), 'stale TikTok activation must be cancelled');

console.log('proxy-tiktok-vortex-regression: PASS');
