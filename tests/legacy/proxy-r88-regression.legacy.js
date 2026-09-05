const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const sw = fs.readFileSync(path.join(root, 'proxy/sw.js'), 'utf8');
const vortex = fs.readFileSync(path.join(root, 'proxy', 'vortex.all.js'), 'utf8');
const manager = fs.readFileSync(path.join(root, 'proxy/js/nova-proxy-manager.js'), 'utf8');
function assert(cond, msg) { if (!cond) throw new Error(msg); }

assert(sw.includes('20260822-sj2067-r8.17'), 'R8.8 revision missing from service worker');
assert(sw.includes('legacyVortex = new VortexServiceWorker();'), 'Vortex message/config listener must still be installed during SW evaluation');
assert(vortex.includes('this.client = null;'), 'Vortex must not construct BareClient during service-worker evaluation');
assert(vortex.includes('if (!this.client) this.client = new _mercuryworkshop_bare_mux__WEBPACK_IMPORTED_MODULE_2__["default"]();'), 'Vortex must lazily construct BareClient on first legacy fetch');
const clientNull = vortex.indexOf('this.client = null;');
const listenerAfterClient = vortex.indexOf('addEventListener("message"', clientNull);
assert(clientNull >= 0 && listenerAfterClient > clientNull, 'Vortex message listener should still install after lazy client field initialization');

const loadBareMux = manager.indexOf('await loadScript(PATHS.legacyBareMux)');
const createConnection = manager.indexOf('legacyConnection = new window.BareMux.BareMuxConnection(PATHS.legacyWorker)');
const setTransport = manager.indexOf('await legacyConnection.setTransport(PATHS.legacyTransport, [{ wisp: WISP_URL }])');
const verifyTransport = manager.indexOf('const selectedLegacyTransport = await legacyConnection.getTransport()');
const enableWorker = manager.indexOf('await enableLegacyWorkerRuntime()');
assert(loadBareMux >= 0 && createConnection > loadBareMux, 'BareMux runtime must load before connection creation');
assert(setTransport > createConnection, 'Legacy Epoxy transport must be selected after BareMux connection creation');
assert(verifyTransport > setTransport, 'BareMux transport must be verified before enabling Vortex worker');
assert(enableWorker > verifyTransport, 'Vortex worker must only activate after BareMux SharedWorker is configured');

console.log('proxy-r88-regression: PASS');
