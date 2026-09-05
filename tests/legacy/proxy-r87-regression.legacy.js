const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const sw = fs.readFileSync(path.join(root, 'proxy/sw.js'), 'utf8');
const vortex = fs.readFileSync(path.join(root, 'proxy', 'vortex.all.js'), 'utf8');
const manager = fs.readFileSync(path.join(root, 'proxy/js/nova-proxy-manager.js'), 'utf8');
function assert(cond, msg) { if (!cond) throw new Error(msg); }
assert(sw.includes('20260822-sj2067-r8.17'), 'R8.7 revision missing');
assert(sw.includes('legacyVortex = new VortexServiceWorker();'), 'Vortex worker is not constructed at SW evaluation');
assert(!/function enableLegacyVortex\(\)[\s\S]{0,800}new VortexServiceWorker\(\)/.test(sw), 'Vortex must not be constructed lazily in enableLegacyVortex');
assert(vortex.includes('typeof data !== "object" || !("vortex$type" in data)'), 'Vortex worker message guard missing');
assert(vortex.includes('typeof e.data !== "object" || !("vortex$type" in e.data)'), 'Vortex controller message guard missing');
const navPos = manager.indexOf('this.element.src = "/proxy/html/proxy-frame.html"');
const removePos = manager.indexOf('controller.frames.splice(index, 1)', navPos);
assert(navPos >= 0 && removePos > navPos, 'Scramjet frame must be retired after old document navigation');
console.log('proxy-r87-regression: PASS');
