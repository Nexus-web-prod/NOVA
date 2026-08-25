const fs = require('fs');
const assert = require('assert');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const sj = read('proxy/scramjet/scramjet.js');
const sjm = read('proxy/scramjet/scramjet.mjs');
const inject = read('proxy/controller/controller.inject.js');
const sw = read('proxy/sw.js');
const manager = read('proxy/js/nova-proxy-manager.js');

for (const src of [sj, sjm]) {
  assert(src.includes('EventTarget.prototype.addEventListener'), 'Scramjet EventTarget hook must remain present');
  assert(src.includes('\"message\"!==t.args[0]&&\"hashchange\"!==t.args[0]&&\"storage\"!==t.args[0]') || src.includes('!(t.args[0] in r)'),
    'R8.2+ must leave ordinary EventTarget listeners unwrapped');
}
assert(inject.includes('__NOVA_R82_ROUTE_GUARD__'), 'R8.2 route guard must be injected');
assert(inject.includes('undefinedHistoryPrevented'), 'R8.2 must reject literal undefined History routes');
assert(inject.includes('/^\\/undefined\\/?$/i'), 'R8.2 must normalize an exact logical /undefined sentinel');
assert(!inject.includes('tiktok.com'), 'R8.2 compatibility injection must not hardcode TikTok');
assert(manager.includes('20260822-sj2067-r8.17'), 'manager revision must be current R8.4');
assert(sw.includes('20260822-sj2067-r8.17'), 'service worker revision must be current R8.4');
assert(manager.includes('wss://unified-wisp-epoxy.fly.dev/wisp/'), 'exact Fly.io Wisp must remain pinned');
console.log('Nova R8.2 regression checks passed');
