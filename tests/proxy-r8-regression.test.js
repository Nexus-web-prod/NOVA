'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const VERSION = '20260822-sj2067-r8.17';
const swSource = fs.readFileSync(path.join(ROOT, 'proxy/sw.js'), 'utf8');
const managerSource = fs.readFileSync(path.join(ROOT, 'proxy/js/nova-proxy-manager.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(ROOT, 'website/html/index.html'), 'utf8');
const scramjetSource = fs.readFileSync(path.join(ROOT, 'proxy/scramjet/scramjet.js'), 'utf8');

assert(swSource.includes(`const NOVA_PROXY_RUNTIME_VERSION = "${VERSION}"`));
assert(managerSource.includes(`const VERSION = "${VERSION}"`));
assert(!indexSource.includes('20260822-sj2067-r6'));
assert(indexSource.includes(`/proxy/js/nova-proxy-manager.js?v=${VERSION}`));
assert(indexSource.includes(`/website/js/nova-social-vc.js?v=${VERSION}`));

// Legacy runtime must be an absolute same-origin startup dependency, not a late importScripts call.
assert(swSource.includes('importScripts(`/proxy/vortex.all.js?v=${NOVA_PROXY_RUNTIME_VERSION}`)'));
const enableLegacyBody = swSource.slice(swSource.indexOf('function enableLegacyVortex'), swSource.indexOf('const proxyMetrics'));
assert(!enableLegacyBody.includes('importScripts('));
for (const f of ['proxy/vortex.all.js', 'proxy/vortex.wasm.wasm', 'proxy/vortex.sync.js', 'proxy/baremux/index.js', 'proxy/baremux/worker.js', 'proxy/epoxy.mjs']) {
  assert(fs.existsSync(path.join(ROOT, f)), `missing legacy asset ${f}`);
}

// SRI: static rule + dynamic paths must neutralize the browser-visible integrity attribute only in Scramjet.
assert(scramjetSource.includes('{fn:()=>"",integrity:["script","link"]}') || scramjetSource.includes('{fn:()=>null,integrity:["script","link"]}'));
assert(scramjetSource.includes('"integrity"===r&&("script"===i||"link"===i)'));
assert(scramjetSource.includes('removeAttribute",t.this,"integrity"'));
assert(scramjetSource.includes('scramjet-attr-integrity'));

// Binary resources must return the original body before text/JS/CSS rewriting.
for (const term of ['application/font-woff','application/vnd.ms-fontobject','application/font-sfnt','application/octet-stream','application/wasm','woff2?','svgz','ogg']) {
  assert(scramjetSource.includes(term), `binary classifier missing ${term}`);
}
assert(scramjetSource.includes('if(l)return o.body;switch(r.destination)'));
assert(scramjetSource.includes('o.set("Accept-Encoding","identity")'));

// Fallback health must require rolling/repeated evidence, not one destination failure.
for (const term of [
  'const GENERAL_FAILURE_THRESHOLD = 4',
  'const TRANSPORT_DISTINCT_TARGET_THRESHOLD = 3',
  'const MIN_TRANSPORT_SAMPLE_COUNT = 4',
  'const WISP_FAILURE_THRESHOLD = 2',
  'const NAVIGATION_FAILURE_THRESHOLD = 2',
  'const FAILURE_COOLDOWN_MS = 30000'
]) assert(managerSource.includes(term), `health invariant missing ${term}`);
assert(managerSource.includes('isDestinationFailure(category)'));
assert(managerSource.includes('Destination DNS/TLS/HTTP/challenge and rewrite failures NEVER trigger'));
assert(managerSource.includes('strongHosts.size >= TRANSPORT_DISTINCT_TARGET_THRESHOLD'));
assert(managerSource.includes('disableComputedWrap: false'));

// The exact Wisp and transport order must remain pinned.
assert(managerSource.includes('wss://unified-wisp-epoxy.fly.dev/wisp/'));
assert(managerSource.includes('new LibcurlClient({ wisp: WISP_URL })'));
assert(managerSource.includes('controller.setTransport(epoxy)'));
assert(managerSource.includes('currentTransport = "baremux-legacy"'));

function makeHeaders(obj = {}) {
  const h = new Headers(obj);
  return h;
}
function makeRequest(url, opts = {}) {
  return {
    url,
    mode: opts.mode || 'cors',
    destination: opts.destination || '',
    method: opts.method || 'GET',
    referrer: opts.referrer || '',
    headers: makeHeaders(opts.headers || {}),
  };
}

const listeners = {};
const imported = [];
const nativeFetches = [];
const routed = [];
let clientsById = new Map();
let vortexFetches = 0;

const sandbox = {
  URL, URLSearchParams, Headers, Response, Request, Proxy, Map, Set, Promise, Date, RegExp, String, Number, Boolean, Array, Object, Error, TypeError,
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  navigator: { userAgent: 'Node test' },
  caches: { keys: async () => [], delete: async () => true },
  fetch: async request => {
    const url = typeof request === 'string' ? request : request.url;
    nativeFetches.push(url);
    return new Response('native', { status: 200, headers: { 'content-type': 'text/plain' } });
  },
  importScripts: (...paths) => {
    imported.push(...paths);
    for (const p of paths) {
      if (p.startsWith('/proxy/controller/controller.sw.js')) {
        sandbox.$scramjetController = {
          shouldRoute: event => new URL(event.request.url).pathname.startsWith('/~/sj/'),
          route: async event => {
            routed.push(event.request.url);
            return new Response('scramjet', { status: 200, headers: { 'x-routed-url': event.request.url } });
          }
        };
      } else if (p.startsWith('/proxy/js/nova-proxy-compatibility.js')) {
        sandbox.self.NovaProxyCompatibility = { classify: () => null };
      } else if (p.startsWith('/proxy/vortex.all.js')) {
        sandbox.$vortexLoadWorker = () => ({
          VortexServiceWorker: class {
            constructor() { this.config = { prefix: '/vortex/' }; }
            addEventListener() {}
            async loadConfig() { return this.config; }
            route() { return true; }
            async fetch() { vortexFetches++; return new Response('legacy', { status: 200 }); }
          }
        });
      }
    }
  },
};
sandbox.self = sandbox;
sandbox.location = { origin: 'https://dev.nova-7.pages.dev' };
sandbox.self.location = sandbox.location;
sandbox.self.clients = {
  claim: async () => {},
  get: async id => clientsById.get(id) || null,
  matchAll: async () => [],
};
sandbox.self.skipWaiting = async () => {};
sandbox.self.addEventListener = (type, fn) => { listeners[type] = fn; };
vm.createContext(sandbox);
vm.runInContext(swSource, sandbox, { filename: 'proxy/sw.js' });

assert(imported.some(p => p === `/proxy/vortex.all.js?v=${VERSION}`), 'Vortex must import at SW startup');
assert(typeof listeners.fetch === 'function');
assert(typeof listeners.message === 'function');

async function dispatchFetch(request, ids = {}) {
  let responsePromise = null;
  const waiters = [];
  const event = {
    request,
    clientId: ids.clientId || '',
    resultingClientId: ids.resultingClientId || '',
    respondWith(p) { responsePromise = Promise.resolve(p); },
    waitUntil(p) { waiters.push(Promise.resolve(p)); },
  };
  listeners.fetch(event);
  await Promise.allSettled(waiters);
  return responsePromise ? await responsePromise : null;
}

async function dispatchMessage(data) {
  return await new Promise((resolve, reject) => {
    const event = {
      data,
      ports: [{ postMessage: resolve }],
      waitUntil(p) { Promise.resolve(p).catch(reject); }
    };
    try { listeners.message(event); } catch (e) { reject(e); }
    setTimeout(() => reject(new Error('message timeout')), 2000).unref?.();
  });
}

(async () => {
  const origin = 'https://dev.nova-7.pages.dev';
  const prefix = '/~/sj/controller1/frame1/';
  const upstreamDoc = 'https://www.epicgames.com/account/portal/website/html/index.html';
  const proxiedRef = origin + prefix + encodeURIComponent(upstreamDoc);

  // Generic malformed relative path recovery.
  routed.length = 0; nativeFetches.length = 0;
  let res = await dispatchFetch(makeRequest(origin + prefix + 'epic_logo.png', {
    destination: 'image', referrer: proxiedRef
  }), { clientId: 'proxy1' });
  assert.strictEqual(res.status, 200);
  const routedUrl = res.headers.get('x-routed-url');
  assert(routedUrl, 'relative recovery must route via Scramjet');
  assert(decodeURIComponent(new URL(routedUrl).pathname.slice(prefix.length)).startsWith('https://www.epicgames.com/account/portal/epic_logo.png'));
  assert(!nativeFetches.some(u => u.includes('epic_logo.png')));

  // Root-relative same-origin escape from a proxied document.
  clientsById.set('proxy2', { url: proxiedRef });
  routed.length = 0; nativeFetches.length = 0;
  res = await dispatchFetch(makeRequest(origin + '/website/assets/logo.png', {
    destination: 'image', referrer: proxiedRef
  }), { clientId: 'proxy2' });
  assert.strictEqual(res.status, 200);
  assert(routed.some(u => decodeURIComponent(new URL(u).pathname.slice(prefix.length)).startsWith('https://www.epicgames.com/website/assets/logo.png')));
  assert.strictEqual(nativeFetches.length, 0);

  // Third-party escaped request must never be root-worker native-fetched.
  routed.length = 0; nativeFetches.length = 0;
  res = await dispatchFetch(makeRequest('https://ssl.gstatic.com/gb/images/sprites/p.png', {
    destination: 'image', referrer: proxiedRef
  }), { clientId: 'proxy1' });
  assert.strictEqual(res.status, 200);
  assert(routed.some(u => decodeURIComponent(new URL(u).pathname.slice(prefix.length)).startsWith('https://ssl.gstatic.com/gb/images/sprites/p.png')));
  assert.strictEqual(nativeFetches.length, 0);

  // Internal Nova proxy-frame stays first-party/native even with a proxied referrer.
  routed.length = 0; nativeFetches.length = 0;
  res = await dispatchFetch(makeRequest(origin + '/proxy/html/proxy-frame.html', {
    destination: 'iframe', mode: 'navigate', referrer: proxiedRef
  }), { clientId: 'proxy1', resultingClientId: 'nova-frame' });
  assert.strictEqual(res.status, 200);
  assert(nativeFetches.includes(origin + '/proxy/html/proxy-frame.html'));
  assert.strictEqual(routed.length, 0);

  // Approved Nova R2 Range/media stays native and preserves its request object/headers.
  routed.length = 0; nativeFetches.length = 0;
  const r2 = 'https://pub-3e1e8c105d3843dda7206f2b3d9801da.r2.dev/movie.mp4';
  res = await dispatchFetch(makeRequest(r2, {
    destination: 'video', headers: { range: 'bytes=100-200' }, referrer: origin + '/'
  }));
  assert.strictEqual(res.status, 200);
  assert(nativeFetches.includes(r2));
  assert.strictEqual(routed.length, 0);

  // Unknown raw third-party request with no controlled Client is not intercepted/fetched by root SW.
  routed.length = 0; nativeFetches.length = 0;
  res = await dispatchFetch(makeRequest('https://cdn.example.net/app.js', { destination: 'script' }));
  assert.strictEqual(res, null);
  assert.strictEqual(nativeFetches.length, 0);
  assert.strictEqual(routed.length, 0);

  // Forced legacy worker path can be enabled from the already-imported runtime.
  const legacyReady = await dispatchMessage({ type: 'nova_enable_legacy' });
  assert.strictEqual(legacyReady.ready, true);
  assert.strictEqual(legacyReady.legacyRuntimeLoaded, true);
  assert.strictEqual(legacyReady.legacyVortexLoaded, true);
  assert.strictEqual(legacyReady.legacyServiceWorkerReady, true);
  res = await dispatchFetch(makeRequest(origin + '/vortex/https%3A%2F%2Fexample.com%2F', { destination: 'iframe', mode: 'navigate' }));
  assert.strictEqual(res.status, 200);
  assert.strictEqual(vortexFetches, 1);

  // URL semantics expected by the generic recovery path.
  const base = new URL('https://example.com/a/b/page.html?old=1#old');
  const cases = new Map([
    ['file.png', 'https://example.com/a/b/file.png'],
    ['./file.png', 'https://example.com/a/b/file.png'],
    ['../file.png', 'https://example.com/a/file.png'],
    ['/file.png', 'https://example.com/file.png'],
    ['?query=x', 'https://example.com/a/b/page.html?query=x'],
    ['#hash', 'https://example.com/a/b/page.html?old=1#hash'],
    ['//cdn.example.com/file.js', 'https://cdn.example.com/file.js'],
    ['https://other.example/file.js', 'https://other.example/file.js'],
    ['http://other.example/file.js', 'http://other.example/file.js'],
    ['blob:https://example.com/id', 'blob:https://example.com/id'],
    ['data:text/plain,ok', 'data:text/plain,ok'],
    ['javascript:void(0)', 'javascript:void(0)'],
    ['about:blank', 'about:blank'],
    ['ws://socket.example/x', 'ws://socket.example/x'],
    ['wss://socket.example/x', 'wss://socket.example/x'],
  ]);
  for (const [input, expected] of cases) assert.strictEqual(new URL(input, base).href, expected, input);

  console.log('proxy r8 regression rules: ok');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

// R8 standards-correctness hardening.
assert(swSource.includes('proxyMetrics.quirksModePrevented += 1'), 'R8 must preserve standards mode for proxied HTML');
assert(swSource.includes('stripProxiedSriFromHtml'), 'R8 must strip stale SRI only on proxied rewritten HTML');
assert(swSource.includes('sriMismatchPrevented'), 'R8 must count prevented SRI mismatches');
assert(swSource.includes('tel:|about:'), 'special URL schemes must include tel:');
assert(swSource.includes('undefinedNavigation'), 'R8 must guard malformed /undefined navigation reconstruction');
assert(managerSource.includes('switchModernTransport'), 'R8 must support live modern transport switching');
assert(managerSource.includes('safeRequestMetadata'), 'R8 request diagnostics must use safe metadata');
assert(managerSource.includes('websocketStats'), 'R8 must expose WebSocket stability diagnostics');
assert(fs.existsSync(path.join(ROOT, 'proxy/html/proxy-diagnostics.html')), 'missing in-Nova diagnostics page');
assert(fs.existsSync(path.join(ROOT, 'tools/nova-compat-100.mjs')), 'missing 100-site tester');
const testerSource = fs.readFileSync(path.join(ROOT, 'tools/nova-compat-100.mjs'), 'utf8');
assert(testerSource.includes('STALE_FRAME'));
assert(testerSource.includes('active frame did not match requested target'));
assert(testerSource.includes("if (SITES.length !== 100)"));
