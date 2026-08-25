const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const manager = fs.readFileSync(path.join(root, 'proxy/js/nova-proxy-manager.js'), 'utf8');
const vortex = fs.readFileSync(path.join(root, 'proxy', 'vortex.all.js'), 'utf8');

function ok(cond, msg) { if (!cond) throw new Error(msg); }

ok(manager.includes('_activateLegacy(true, state.lastFallbackReason, requested.href)'),
  'compatibility fallback must pass original requested URL explicitly');
ok(manager.includes('const fallbackTarget = String(retryURL || this._requestedURL || this.lastURL || "")'),
  'legacy activation must prefer explicit/original requested target over observed corrupted URL');
ok(manager.includes('this.go(fallbackTarget)'),
  'legacy retry must navigate the preserved fallback target');
ok(vortex.includes('const wasmUrl = new URL(this.config.files.wasm, self.location.origin)'),
  'Vortex WASM route must normalize config URL');
ok(vortex.includes('requestUrl.pathname === wasmUrl.pathname'),
  'Vortex WASM route must compare pathnames without cache-busting query');
ok(!vortex.includes('requestUrl.pathname === this.config.files.wasm'),
  'old impossible pathname-vs-query-string comparison must be removed');
console.log('proxy-r89-regression: PASS');
