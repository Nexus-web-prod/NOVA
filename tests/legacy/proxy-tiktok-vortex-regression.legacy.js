const fs = require('fs');
const assert = require('assert');
const manager = fs.readFileSync('proxy/js/nova-proxy-manager.js', 'utf8');

assert(manager.includes('function isTikTokURL(value)'), 'TikTok URL detector missing');
assert(manager.indexOf('// TikTok is Vortex-first: decide the route before any site transport') < manager.indexOf('const preferredTransport ='), 'TikTok must be routed before transport preference selection');
assert(manager.includes('function preloadLegacyAssets()'), 'Vortex assets must be preloaded before they are needed');
assert(manager.includes('preloadLegacyAssets().catch(() => {})'), 'Vortex preload must run during modern transport warm-up');
assert(manager.includes('return host === "tiktok.com" || host.endsWith(".tiktok.com");'), 'TikTok apex and subdomain matching missing');
assert(manager.includes('this._forcedLegacyPolicy = "tiktok-vortex"'), 'TikTok Vortex policy marker missing');
assert(manager.includes('this._activateLegacy(false).then(() => {\n              if (routeGeneration !== this._routeGeneration || !isTikTokURL(nextURL)) return;\n              if (this.legacyFrame) this.legacyFrame.go(nextURL);'), 'TikTok navigation must wait for an in-flight Vortex frame initialization');
assert(manager.includes('reason: "forced TikTok compatibility route"'), 'forced TikTok compatibility reason missing');
assert(manager.includes('this._activateLegacy(true, "forced TikTok compatibility route", nextURL, routeGeneration)'), 'TikTok must activate Vortex before Scramjet navigation');
assert(manager.includes('if (this._usesLegacy()) {\n          if (this.legacyFrame) {\n            this.legacyFrame.go(nextURL);'), 'TikTok must reuse the existing Vortex frame when the shared engine is already legacy');
assert(manager.includes('20261011-sj2067-r8.29-tiktok-vortex-first'), 'TikTok routing fix version missing');
assert(manager.includes('this._forcedLegacyPolicy === "tiktok-vortex" && !isTikTokURL(nextURL)'), 'leaving TikTok must cancel pending policy');
assert(manager.includes('this._forcedLegacyPolicy === "tiktok-vortex" && !isTikTokURL(nextURL)'), 'leaving TikTok must exit forced legacy routing');
assert(manager.includes('this._forcedLegacyPolicy === "google-vortex" ? isGoogleURL(changedURL) : isTikTokURL(changedURL)'), 'Vortex URL changes must keep TikTok subdomains on legacy');
assert(manager.includes('reason === "forced TikTok compatibility route" && !isTikTokURL(fallbackTarget)'), 'stale TikTok activation must be cancelled');

console.log('proxy-tiktok-vortex-regression: PASS');
