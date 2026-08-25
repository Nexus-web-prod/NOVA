const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const manager = fs.readFileSync(path.join(root, 'proxy', 'js', 'nova-proxy-manager.js'), 'utf8');

assert(manager.includes('20260822-sj2067-r8.17'), 'R8.6 revision missing');
assert(manager.includes('baremux-legacy-tab'), 'per-tab compatibility fallback missing');
assert(manager.includes('scope: "tab"'), 'compatibility fallback must be tab-scoped');
assert(manager.includes('fromUrl === "/undefined"'), 'undefined-route sentinel detection missing');
assert(manager.includes('root404Shell'), 'root 404 compatibility detection missing');
assert(manager.includes('this._engineOverride = "legacy"'), 'legacy per-frame override missing');
assert(manager.includes('state.currentEngine === "scramjet" && !this._usesLegacy()'), 'legacy tab must not report modern Wisp state');
assert(manager.includes('nextHost !== this._compatHost'), 'new host should return to modern primary');
assert(manager.includes('_returnToModern(nextURL)'), 'modern reactivation path missing');
assert(!manager.includes('tiktok.com'), 'runtime fallback must remain site-generic');
assert(manager.includes('wss://unified-wisp-epoxy.fly.dev/wisp/'), 'Wisp changed');

console.log('proxy-r86-regression: PASS');
