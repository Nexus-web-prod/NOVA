(() => {
  "use strict";

  const VERSION = "20260822-sj2067-r8.19";
  const WISP_URL = "wss://unified-wisp-epoxy.fly.dev/wisp/";
  const SW_URL = `/sw.js?novaProxy=${VERSION}`;
  const PATHS = Object.freeze({
    scramjet: `/scramjet/scramjet.js?v=${VERSION}`,
    controllerApi: `/controller/controller.api.js?v=${VERSION}`,
    utils: `/scramjet-utils/scramjet-utils.js?v=${VERSION}`,
    libcurl: `/transports/libcurl/index.mjs?v=${VERSION}`,
    epoxy: `/transports/epoxy/index.mjs?v=${VERSION}`,
    legacyBareMux: `/baremux/index.js?v=${VERSION}`,
    legacyVortex: `/vortex.all.js?v=${VERSION}`,
    legacyTransport: `/epoxy.mjs?v=${VERSION}`,
    legacyWorker: `/baremux/worker.js?v=${VERSION}`,
    legacyWasm: `/vortex.wasm.wasm?v=${VERSION}`,
    legacySync: `/vortex.sync.js?v=${VERSION}`
  });

  const NAVIGATION_TIMEOUT_MS = 20000;
  const BLANK_RECHECK_MS = 2500;
  const FAILURE_COOLDOWN_MS = 30000;
  const HEALTH_WINDOW_MS = 15000;
  const NAV_HEALTH_WINDOW_MS = 30000;
  const GENERAL_FAILURE_THRESHOLD = 4;
  const TRANSPORT_DISTINCT_TARGET_THRESHOLD = 3;
  const MIN_TRANSPORT_SAMPLE_COUNT = 4;
  const WISP_FAILURE_THRESHOLD = 2;
  const NAVIGATION_FAILURE_THRESHOLD = 2;

  const state = {
    version: VERSION,
    currentEngine: "starting",
    currentTransport: "none",
    previousTransport: "none",
    wispEndpoint: WISP_URL,
    wispStatus: "configured",
    fallbackCount: 0,
    fallbackHistory: [],
    lastFailure: null,
    lastTransportFailure: null,
    lastRewriteFailure: null,
    lastBinaryFailure: null,
    lastFallbackReason: null,
    recentRequests: [],
    recentFailures: [],
    recentBinaryResponses: [],
    sriStripped: 0,
    sriPreserved: 0,
    sriMismatchPrevented: 0,
    quirksModePrevented: 0,
    websocketStats: { libcurl: null, epoxy: null },
    websocketSessions: [],
    challengeFailures: [],
    transportSnapshots: [],
    legacyLoadStarted: false,
    legacyVortexLoaded: false,
    legacyBareMuxLoaded: false,
    legacyTransportReady: false,
    legacyServiceWorkerReady: false,
    legacyReady: false,
    legacyInitError: null,
    transportHealth: {
      libcurl: { status: "idle", score: 100, failures: 0, successes: 0, recentFailures: 0, lastError: null },
      epoxy: { status: "idle", score: 100, failures: 0, successes: 0, recentFailures: 0, lastError: null },
      legacy: { status: "idle", score: 100, failures: 0, successes: 0, recentFailures: 0, lastError: null }
    }
  };

  let initPromise = null;
  let controller = null;
  let serviceWorker = null;
  let libcurlTransport = null;
  let epoxyTransport = null;
  let epoxyInitPromise = null;
  let legacyVortex = null;
  let legacyConnection = null;
  let fallbackPromise = null;
  let ignoreFailuresUntil = 0;
  let keepaliveTimer = null;
  let routingPollTimer = null;
  let lastDiagnosticWorker = null;
  let lastDiagnosticSignature = "";
  const loadedScripts = new Map();
  const frames = new Set();
  const subscribers = new Set();
  const websocketFailureSignals = { libcurl: [], epoxy: [] };
  const healthSignals = { libcurl: [], epoxy: [], legacy: [] };
  const successSignals = { libcurl: [], epoxy: [], legacy: [] };

  function cloneState() {
    const snapshot = JSON.parse(JSON.stringify(state));
    snapshot.engine = snapshot.currentEngine;
    snapshot.transport = snapshot.currentTransport;
    snapshot.wispURL = snapshot.wispEndpoint;
    snapshot.wispState = snapshot.wispStatus;
    snapshot.libcurlHealth = snapshot.transportHealth.libcurl;
    snapshot.epoxyHealth = snapshot.transportHealth.epoxy;
    snapshot.legacyHealth = snapshot.transportHealth.legacy;
    return snapshot;
  }

  function publish() {
    syncServiceWorkerDiagnostics();
    const snapshot = cloneState();
    window.__NOVA_PROXY_STATE = snapshot;
    for (const callback of subscribers) {
      try { callback(snapshot); } catch (_) {}
    }
    renderDebugPanel(snapshot);
  }

  function syncServiceWorkerDiagnostics() {
    const target = navigator.serviceWorker?.controller || serviceWorker;
    if (!target) return;
    const signature = `${state.currentEngine}:${state.currentTransport}`;
    if (target === lastDiagnosticWorker && signature === lastDiagnosticSignature) return;
    try {
      target.postMessage({
        type: "nova_proxy_transport_state",
        engine: state.currentEngine,
        transport: state.currentTransport
      });
      lastDiagnosticWorker = target;
      lastDiagnosticSignature = signature;
    } catch (_) {}
  }

  function normalizeError(error) {
    if (!error) return "Unknown proxy failure";
    if (typeof error === "string") return error.slice(0, 500);
    return String(error.message || error).slice(0, 500);
  }

  function setHealth(name, status, error) {
    const health = state.transportHealth[name];
    if (!health) return;
    health.status = status;
    if (error) {
      health.failures += 1;
      health.lastError = normalizeError(error);
    } else if (status === "healthy") {
      health.lastError = null;
    }
    health.recentFailures = (healthSignals[name] || []).length;
    publish();
  }

  function hostFor(value) {
    try { return new URL(String(value || "")).hostname.toLowerCase(); } catch (_) { return ""; }
  }

  // Google is a Vortex/BareMux per-tab compatibility route. Route the whole
  // google.* document family through Vortex, not only /search, because Google
  // frequently transitions from / or /webhp to search results with History API
  // / SPA navigation that never calls NovaProxyFrame.go(). Starting Google in
  // Vortex guarantees every Google search remains on Vortex. Leaving google.*
  // immediately returns the tab to Scramjet/libcurl. This never changes global
  // transport health or the engine used by unrelated tabs.
  function isGoogleURL(value) {
    try {
      const url = new URL(String(value || ""));
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      return /^google\.[a-z.]{2,}$/i.test(host);
    } catch (_) {
      return false;
    }
  }

  // Escape Road 2 and 3 rely on browser behavior that is more compatible with
  // Nova's legacy Vortex/BareMux path. Keep this override scoped to the tab and
  // return to the modern engine when the tab leaves the game's host.
  function isLegacyGameURL(value) {
    try {
      const url = new URL(String(value || ""));
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      return (host === "azgames.io" && /^\/escape-road-2(?:[./]|$)/i.test(url.pathname)) ||
        (host === "escaperoad.io" && /^\/escape-road-3(?:[./]|$)/i.test(url.pathname));
    } catch (_) {
      return false;
    }
  }

  // Brave Search is intentionally Scramjet-only. Google uses the legacy
  // Vortex/BareMux compatibility route, but Brave must never inherit that
  // engine or enter generic runtime fallback.
  function isBraveSearchURL(value) {
    try {
      const url = new URL(String(value || ""));
      const host = url.hostname.toLowerCase();
      return host === "search.brave.com" || host.endsWith(".search.brave.com");
    } catch (_) {
      return false;
    }
  }

  function classifyFailure(kind, error, extra = {}) {
    const message = normalizeError(error).toLowerCase();
    const status = Number(extra.status || 0);
    let hostname = hostFor(extra.url || "");
    const challenge = extra.challenge === true || /(?:captcha|challenge|challenges|cdn-cgi\/challenge)/i.test(String(extra.url || ""));
    if (challenge && status >= 500) return "target-challenge";
    if (status >= 400 && status < 500) return "target-http-4xx";
    if (status >= 500 && status < 600) return "target-http-5xx";
    if (!hostname && extra.url) return "invalid-target-hostname";
    if (hostname && (!hostname.includes(".") || /\.invalid$/i.test(hostname))) return "invalid-target-hostname";
    if (/could not resolve host|name or service not known|dns|host not found|resolve host|curle_couldnt_resolve_host/i.test(message)) return "destination-dns";
    if (/ssl connect error|tls handshake|certificate verify|certificate problem|cert mismatch|error code 35|curle_ssl|hyper tls handshake eof/i.test(message)) return "destination-tls";
    if (extra.source === "wisp" || /(?:wisp).*(?:closed|disconnect|failed|eof|socket)/i.test(message)) return "wisp";
    if (extra.source === "controller-rpc" || /controller.*(?:rpc|transport).*(?:failed|closed|error)/i.test(message)) return "controller-transport-rpc";
    if (extra.source === "websocket-bridge" || /websocket transport bridge/i.test(message)) return "websocket-transport-bridge";
    if (/rewrite|unable to parse rewritten url|unrewriteurl/i.test(kind + " " + message)) return "rewrite";
    if (kind === "navigation-timeout" || kind === "blank-page" || kind === "navigation-route-failure") return "navigation";
    if (/initialization/.test(kind)) return "initialization";
    return "transport";
  }

  function isDestinationFailure(category) {
    return category === "invalid-target-hostname" || category === "destination-dns" || category === "destination-tls" ||
      category === "target-http-4xx" || category === "target-http-5xx" || category === "target-challenge";
  }

  function isStrongTransportFailure(category) {
    return category === "wisp" || category === "controller-transport-rpc" || category === "websocket-transport-bridge" ||
      category === "transport" || category === "initialization";
  }

  function pruneSignals(name, windowMs = HEALTH_WINDOW_MS) {
    const now = Date.now();
    healthSignals[name] = (healthSignals[name] || []).filter(item => now - item.at <= Math.max(windowMs, NAV_HEALTH_WINDOW_MS));
    successSignals[name] = (successSignals[name] || []).filter(at => now - at <= HEALTH_WINDOW_MS);
    const health = state.transportHealth[name];
    if (health) health.recentFailures = healthSignals[name].filter(item => now - item.at <= windowMs).length;
  }

  function recordTransportSuccess(name, remote) {
    if (!state.transportHealth[name]) return;
    const now = Date.now();
    successSignals[name].push(now);
    pruneSignals(name);
    const health = state.transportHealth[name];
    health.successes += 1;
    health.score = Math.min(100, Number(health.score || 0) + 10);
    // Two healthy deliveries in the rolling window restore confidence. HTTP
    // error status codes still count as successful transport delivery because
    // the transport reached the destination and returned a real response.
    if (successSignals[name].length >= 2) {
      healthSignals[name] = [];
      health.recentFailures = 0;
      if (state.currentTransport === name) health.status = "healthy";
    }
    if (state.currentTransport === name && state.wispStatus === "degraded") state.wispStatus = "active";
    publish();
  }

  function recordHealthSignal(name, kind, error, extra = {}) {
    if (!healthSignals[name]) return { shouldFallback: false, category: "transport" };
    const category = classifyFailure(kind, error, extra);
    const now = Date.now();
    const url = String(extra.url || "");
    const host = hostFor(url);
    const message = normalizeError(error);
    pruneSignals(name);
    const duplicate = healthSignals[name].some(item => now - item.at < 1500 && item.category === category && item.url === url && item.message === message);
    if (!duplicate) healthSignals[name].push({ at: now, category, url, host, message });
    pruneSignals(name);

    const health = state.transportHealth[name];
    const destinationFailure = isDestinationFailure(category);
    if (health) {
      health.failures += duplicate ? 0 : 1;
      health.lastError = message;
      health.recentFailures = healthSignals[name].filter(item => now - item.at <= HEALTH_WINDOW_MS && isStrongTransportFailure(item.category)).length;
      // R8.1: destination/challenge failures are observations about the target,
      // not evidence that libcurl/Epoxy/Wisp is globally unhealthy.
      if (!destinationFailure && category !== "rewrite") health.status = "degraded";
      const penalty = category === "initialization" ? 100 : category === "wisp" ? 35 :
        (category === "controller-transport-rpc" || category === "websocket-transport-bridge") ? 30 :
        category === "transport" ? 20 : category === "navigation" ? 8 : 0;
      health.score = Math.max(0, Number(health.score ?? 100) - (duplicate ? 0 : penalty));
      if (destinationFailure && state.currentTransport === name) health.status = "healthy";
    }

    if (category === "target-challenge") {
      state.challengeFailures.push({ timestamp: new Date().toISOString(), url, status: Number(extra.status || 0) || null, transport: name, provenance: "target/challenge compatibility failure" });
      if (state.challengeFailures.length > 50) state.challengeFailures.splice(0, state.challengeFailures.length - 50);
    }

    const recent = healthSignals[name].filter(item => now - item.at <= HEALTH_WINDOW_MS);
    const strong = recent.filter(item => isStrongTransportFailure(item.category));
    const strongHosts = new Set(strong.map(item => item.host).filter(Boolean));
    const navigation = healthSignals[name].filter(item => now - item.at <= NAV_HEALTH_WINDOW_MS && item.category === "navigation");
    const wisp = strong.filter(item => item.category === "wisp");
    const transport = strong.filter(item => item.category === "transport" || item.category === "controller-transport-rpc" || item.category === "websocket-transport-bridge");

    let shouldFallback = false;
    if (category === "initialization") shouldFallback = true;
    else if (category === "wisp") shouldFallback = wisp.length >= WISP_FAILURE_THRESHOLD;
    else if (category === "transport" || category === "controller-transport-rpc" || category === "websocket-transport-bridge") {
      shouldFallback = transport.length >= Math.max(GENERAL_FAILURE_THRESHOLD, MIN_TRANSPORT_SAMPLE_COUNT) &&
        (strongHosts.size >= TRANSPORT_DISTINCT_TARGET_THRESHOLD || transport.some(item => !item.host));
    } else if (category === "navigation") {
      // Navigation stalls are compatibility evidence first. Only fallback when
      // they accompany real transport-level failures in the same rolling window.
      shouldFallback = navigation.length >= NAVIGATION_FAILURE_THRESHOLD && strong.length >= MIN_TRANSPORT_SAMPLE_COUNT;
    }
    // Destination DNS/TLS/HTTP/challenge and rewrite failures NEVER trigger a
    // global fallback by themselves.

    publish();
    return { shouldFallback, category, recentCount: recent.length, strongCount: strong.length, uniqueTargetHosts: strongHosts.size };
  }

  function recordFallback(from, to, reason) {
    state.previousTransport = from || "none";
    state.fallbackHistory.push({
      timestamp: new Date().toISOString(),
      from: from || "none",
      to: to || "none",
      reason: normalizeError(reason)
    });
    state.lastFallbackReason = normalizeError(reason);
    if (state.fallbackHistory.length > 20) state.fallbackHistory.splice(0, state.fallbackHistory.length - 20);
  }

  function captureTransportSnapshot(currentTarget = "") {
    const snapshot = {
      timestamp: new Date().toISOString(),
      activeTransport: state.currentTransport,
      transportHealth: JSON.parse(JSON.stringify(state.transportHealth)),
      wispStatus: state.wispStatus,
      fallbackCount: state.fallbackCount,
      fallbackReason: state.lastFallbackReason,
      currentTarget: String(currentTarget || "")
    };
    state.transportSnapshots.push(snapshot);
    if (state.transportSnapshots.length > 100) state.transportSnapshots.splice(0, state.transportSnapshots.length - 100);
    publish();
    return snapshot;
  }

  function rawHeaderValue(headers, name) {
    const wanted = String(name).toLowerCase();
    if (!Array.isArray(headers)) return "";
    for (const pair of headers) if (Array.isArray(pair) && String(pair[0]).toLowerCase() === wanted) return String(pair[1] ?? "");
    return "";
  }

  function isBinaryResponse(remote, headers) {
    const ct = rawHeaderValue(headers, "content-type").split(";", 1)[0].trim().toLowerCase();
    if (ct.startsWith("font/") || ct.startsWith("image/") || ct.startsWith("video/") || ct.startsWith("audio/")) return true;
    if (["application/font-woff", "application/font-sfnt", "application/vnd.ms-fontobject", "application/octet-stream", "application/wasm"].includes(ct)) return true;
    try { return /\.(?:woff2?|eot|ttf|otf|wasm|png|jpe?g|webp|gif|svgz|mp4|webm|mp3|ogg)(?:$|[?#])/i.test(new URL(remote).pathname); } catch (_) { return false; }
  }

  function isFontResponse(remote, headers) {
    const ct = rawHeaderValue(headers, "content-type").split(";", 1)[0].trim().toLowerCase();
    if (ct.startsWith("font/") || ["application/font-woff", "application/font-sfnt", "application/vnd.ms-fontobject", "application/x-font-woff", "application/x-font-ttf"].includes(ct)) return true;
    try { return /\.(?:woff2?|ttf|otf|eot)(?:$|[?#])/i.test(new URL(remote).pathname); } catch (_) { return false; }
  }

  function withoutWireEncodingHeaders(headers, keepContentEncoding = false) {
    const blocked = new Set(["content-length", "content-range", "accept-ranges", "transfer-encoding"]);
    if (!keepContentEncoding) blocked.add("content-encoding");
    return (Array.isArray(headers) ? headers : []).filter(pair => Array.isArray(pair) && !blocked.has(String(pair[0] || "").toLowerCase()));
  }

  function fontContainerLooksDecoded(remote, bytes) {
    if (!(bytes instanceof ArrayBuffer) || bytes.byteLength < 4) return false;
    const b = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 4));
    let ext = "";
    try { ext = new URL(remote).pathname.toLowerCase().split(".").pop() || ""; } catch (_) {}
    if (ext === "woff2") return b[0] === 0x77 && b[1] === 0x4f && b[2] === 0x46 && b[3] === 0x32; // wOF2
    if (ext === "woff") return b[0] === 0x77 && b[1] === 0x4f && b[2] === 0x46 && b[3] === 0x46; // wOFF
    if (ext === "otf") return b[0] === 0x4f && b[1] === 0x54 && b[2] === 0x54 && b[3] === 0x4f; // OTTO
    if (ext === "ttf") return (b[0] === 0x00 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) || (b[0] === 0x74 && b[1] === 0x72 && b[2] === 0x75 && b[3] === 0x65);
    return true;
  }


  function fontContainerValidation(remote, bytes) {
    if (!(bytes instanceof ArrayBuffer) || bytes.byteLength < 12) return { valid: false, reason: "too-short" };
    let ext = "";
    try { ext = new URL(remote).pathname.toLowerCase().split(".").pop() || ""; } catch (_) {}
    const b = new Uint8Array(bytes);
    const u32 = offset => new DataView(bytes).getUint32(offset, false);
    if (ext === "woff2") {
      if (!(b[0]===0x77&&b[1]===0x4f&&b[2]===0x46&&b[3]===0x32)) return { valid:false, reason:"bad-woff2-signature" };
      if (bytes.byteLength < 48) return { valid:false, reason:"short-woff2-header" };
      const declaredLength = u32(8);
      const totalSfntSize = u32(16);
      const totalCompressedSize = u32(20);
      if (declaredLength !== bytes.byteLength) return { valid:false, reason:`woff2-length-${declaredLength}-vs-${bytes.byteLength}` };
      if (!totalSfntSize || !totalCompressedSize || totalSfntSize < totalCompressedSize) return { valid:false, reason:"woff2-size-invariant" };
      return { valid:true, reason:"woff2-valid" };
    }
    if (ext === "woff") {
      if (!(b[0]===0x77&&b[1]===0x4f&&b[2]===0x46&&b[3]===0x46)) return { valid:false, reason:"bad-woff-signature" };
      const declaredLength = u32(8);
      return { valid: declaredLength === bytes.byteLength, reason: declaredLength === bytes.byteLength ? "woff-valid" : "woff-length" };
    }
    return { valid: fontContainerLooksDecoded(remote, bytes), reason: "sfnt-signature" };
  }

  async function materializeFontCandidate(remote, response) {
    if (!response || !response.body) return { response, validation: { valid:false, reason:"no-body" } };
    let bytes;
    if (response.body instanceof ArrayBuffer) bytes=response.body;
    else if (ArrayBuffer.isView(response.body)) bytes=response.body.buffer.slice(response.body.byteOffset,response.body.byteOffset+response.body.byteLength);
    else if (typeof Blob!=="undefined" && response.body instanceof Blob) bytes=await response.body.arrayBuffer();
    else if (response.body instanceof ReadableStream) bytes=await new Response(response.body).arrayBuffer();
    else return { response, validation:{valid:false,reason:"unsupported-body"} };
    const validation=fontContainerValidation(remote,bytes);
    const encoding=rawHeaderValue(response.headers,"content-encoding");
    const decoded=fontContainerLooksDecoded(remote,bytes);
    const headers=withoutWireEncodingHeaders(response.headers, Boolean(encoding && !decoded));
    return { response:{...response,body:bytes,headers}, validation };
  }

  function isHtmlResponse(remote, headers) {
    const ct = rawHeaderValue(headers, "content-type").split(";", 1)[0].trim().toLowerCase();
    if (ct === "text/html" || ct === "application/xhtml+xml") return true;
    try {
      const path = new URL(remote).pathname;
      return /(?:^|\/)index\.html?$/i.test(path) || /\/$/.test(path);
    } catch (_) { return false; }
  }

  function stripSriBeforeScramjet(html) {
    // R8.17: remove SRI before Scramjet ever parses/rewrites the document.
    // This prevents Scramjet's attribute virtualization from preserving or
    // re-materializing an upstream hash after CSS/JS bytes have been rewritten.
    return String(html)
      .replace(/\s+scramjet-attr-integrity\s*=\s*(?:(["'])(.*?)\1|[^\s>]+)/gi, "")
      .replace(/\s+integrity\s*=\s*(?:(["'])(.*?)\1|[^\s>]+)/gi, "");
  }

  async function sanitizeHtmlResponseBeforeScramjet(remote, response) {
    if (!response || !response.body || !isHtmlResponse(remote, response.headers)) return response;
    let text;
    try {
      if (typeof response.body === "string") text = response.body;
      else if (response.body instanceof ArrayBuffer) text = new TextDecoder().decode(new Uint8Array(response.body));
      else if (ArrayBuffer.isView(response.body)) text = new TextDecoder().decode(new Uint8Array(response.body.buffer, response.body.byteOffset, response.body.byteLength));
      else if (typeof Blob !== "undefined" && response.body instanceof Blob) text = await response.body.text();
      else if (response.body instanceof ReadableStream) text = await new Response(response.body).text();
      else return response;
    } catch (_) { return response; }
    const cleaned = stripSriBeforeScramjet(text);
    if (cleaned === text) return { ...response, body: text, headers: withoutWireEncodingHeaders(response.headers, false) };
    const headers = withoutWireEncodingHeaders(response.headers, false);
    state.recentRequests.push({
      timestamp: new Date().toISOString(),
      classification: "pre-scramjet-sri-strip",
      transport: state.currentTransport,
      url: String(remote || "")
    });
    if (state.recentRequests.length > 100) state.recentRequests.splice(0, state.recentRequests.length - 100);
    return { ...response, body: cleaned, headers };
  }

  async function bufferFontResponseExactly(remote, response) {
    if (!response || !isFontResponse(remote, response.headers) || !response.body) return response;
    let bytes;
    if (response.body instanceof ArrayBuffer) bytes = response.body;
    else if (ArrayBuffer.isView(response.body)) bytes = response.body.buffer.slice(response.body.byteOffset, response.body.byteOffset + response.body.byteLength);
    else if (typeof Blob !== "undefined" && response.body instanceof Blob) bytes = await response.body.arrayBuffer();
    else if (response.body instanceof ReadableStream) bytes = await new Response(response.body).arrayBuffer();
    else return response;

    // R8.15: do not blindly remove Content-Encoding. Epoxy may return upstream
    // encoded entity bytes while libcurl may return already-decoded bytes. Use
    // the font container magic to decide which representation we actually have.
    // If the bytes already begin with wOF2/wOFF/OTTO/sfnt, strip wire encoding;
    // otherwise preserve Content-Encoding so the browser can decode it once.
    const encoding = rawHeaderValue(response.headers, "content-encoding");
    const decodedContainer = fontContainerLooksDecoded(remote, bytes);
    const headers = withoutWireEncodingHeaders(response.headers, Boolean(encoding && !decodedContainer));
    return { ...response, body: bytes, headers };
  }

  function bodyByteLength(body) {
    if (body instanceof ArrayBuffer) return body.byteLength;
    if (ArrayBuffer.isView(body)) return body.byteLength;
    if (typeof Blob !== "undefined" && body instanceof Blob) return body.size;
    return null;
  }

  function recordBinaryResponse(name, remote, response) {
    if (!response || !isBinaryResponse(remote, response.headers)) return null;
    const encoding = rawHeaderValue(response.headers, "content-encoding");
    const lengthText = rawHeaderValue(response.headers, "content-length");
    const receivedByteLength = bodyByteLength(response.body);
    const entry = {
      timestamp: new Date().toISOString(),
      url: String(remote),
      transport: name,
      upstreamContentType: rawHeaderValue(response.headers, "content-type"),
      upstreamContentEncoding: encoding,
      downstreamContentType: rawHeaderValue(response.headers, "content-type"),
      downstreamContentEncoding: encoding,
      receivedByteLength,
      returnedByteLength: receivedByteLength,
      declaredContentLength: /^\d+$/.test(lengthText) ? Number(lengthText) : null,
      rewritten: false
    };
    state.recentBinaryResponses.push(entry);
    if (state.recentBinaryResponses.length > 50) state.recentBinaryResponses.splice(0, state.recentBinaryResponses.length - 50);
    return entry;
  }

  function instrumentBinaryStream(response, entry) {
    if (!entry || !isDebugEnabled() || !response?.body || typeof response.body.pipeThrough !== "function" || typeof TransformStream === "undefined") return response;
    let byteLength = 0;
    try {
      response.body = response.body.pipeThrough(new TransformStream({
        transform(chunk, controller) {
          if (chunk instanceof ArrayBuffer) byteLength += chunk.byteLength;
          else if (ArrayBuffer.isView(chunk)) byteLength += chunk.byteLength;
          else if (typeof Blob !== "undefined" && chunk instanceof Blob) byteLength += chunk.size;
          controller.enqueue(chunk);
        },
        flush() {
          entry.receivedByteLength = byteLength;
          entry.returnedByteLength = byteLength;
          const declared = entry.declaredContentLength;
          if (declared != null && !entry.upstreamContentEncoding && declared !== byteLength) {
            state.lastBinaryFailure = {
              at: Date.now(),
              url: entry.url,
              transport: entry.transport,
              error: `Binary length mismatch: declared ${declared}, received ${byteLength}`
            };
          }
          publish();
        }
      }));
    } catch (_) {}
    return response;
  }

  function forceIdentityEncoding(headers) {
    const out = [];
    for (const pair of Array.isArray(headers) ? headers : []) {
      if (!Array.isArray(pair) || String(pair[0]).toLowerCase() === "accept-encoding") continue;
      out.push(pair);
    }
    out.push(["Accept-Encoding", "identity"]);
    return out;
  }

  function noteFailure(kind, error, extra) {
    const failure = {
      kind,
      message: normalizeError(error),
      at: Date.now(),
      ...(extra || {})
    };
    state.lastFailure = failure;
    state.recentFailures.push({
      timestamp: new Date(failure.at).toISOString(),
      kind: failure.kind,
      error: failure.message,
      transport: state.currentTransport,
      engine: state.currentEngine,
      status: failure.status || null,
      path: failure.path || ""
    });
    if (state.recentFailures.length > 100) state.recentFailures.splice(0, state.recentFailures.length - 100);
    if (kind === "fatal-rewrite" || /rewrite/i.test(kind)) state.lastRewriteFailure = failure;
    if (/transport|initialization|navigation-route-failure|navigation-timeout/.test(kind)) {
      state.lastTransportFailure = failure;
      state.wispStatus = "degraded";
    }
    publish();
  }

  function loadScript(src) {
    if (loadedScripts.has(src)) return loadedScripts.get(src);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
    loadedScripts.set(src, promise);
    return promise;
  }

  function withTimeout(promise, ms, label) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label || "Timed out")), ms);
      })
    ]).finally(() => clearTimeout(timer));
  }


  async function verifyLegacyAsset(path, label) {
    const url = new URL(path, location.origin);
    if (url.origin !== location.origin) throw new Error(`${label} must be a same-origin Nova asset`);
    let response;
    try {
      response = await fetch(url.href, { method: "HEAD", cache: "no-store", credentials: "same-origin" });
    } catch (_) {
      response = null;
    }
    if (!response?.ok) {
      response = await fetch(url.href, { cache: "no-store", credentials: "same-origin" });
    }
    if (!response.ok) throw new Error(`${label} is missing at ${url.pathname} (${response.status})`);
    return true;
  }

  async function checkLegacyWorkerConfig() {
    const target = navigator.serviceWorker.controller || serviceWorker;
    if (!target) return false;
    return withTimeout(new Promise(resolve => {
      const channel = new MessageChannel();
      channel.port1.onmessage = event => resolve(!!event.data?.ready);
      target.postMessage({ type: "nova_vortex_config_check" }, [channel.port2]);
    }), 3000, "Legacy Vortex configuration check timed out");
  }

  async function getProxyMetrics() {
    const target = navigator.serviceWorker.controller || serviceWorker;
    if (!target) return {};
    try {
      return await withTimeout(new Promise(resolve => {
        const channel = new MessageChannel();
        channel.port1.onmessage = event => resolve(event.data || {});
        target.postMessage({ type: "nova_proxy_metrics" }, [channel.port2]);
      }), 2000, "Proxy metrics diagnostics timed out");
    } catch (_) {
      return {};
    }
  }

  async function getRoutingLog() {
    const target = navigator.serviceWorker.controller || serviceWorker;
    if (!target) return [];
    try {
      return await withTimeout(new Promise(resolve => {
        const channel = new MessageChannel();
        channel.port1.onmessage = event => {
          const requests = Array.isArray(event.data?.requests) ? event.data.requests : [];
          resolve(requests.slice(-50));
        };
        target.postMessage({ type: "nova_proxy_routing_log" }, [channel.port2]);
      }), 2000, "Proxy routing diagnostics timed out");
    } catch (_) {
      return [];
    }
  }

  async function refreshRoutingDiagnostics() {
    if (!isDebugEnabled()) return;
    const requests = await getRoutingLog();
    state.recentRequests = requests;
    publish();
  }

  function startRoutingDiagnostics() {
    if (routingPollTimer || !isDebugEnabled()) return;
    void refreshRoutingDiagnostics();
    routingPollTimer = setInterval(() => void refreshRoutingDiagnostics(), 1000);
  }

  function stopRoutingDiagnostics() {
    if (routingPollTimer) clearInterval(routingPollTimer);
    routingPollTimer = null;
  }

  async function waitForDesiredController(registration) {
    const desiredMarker = `novaProxy=${VERSION}`;
    const current = navigator.serviceWorker.controller;
    if (current && current.scriptURL.includes(desiredMarker)) return current;

    const activated = registration.active;
    if (activated && activated.scriptURL.includes(desiredMarker) && !current) {
      // clients.claim() should take control of this page immediately after activation.
    }

    try {
      await withTimeout(new Promise(resolve => {
        const check = () => {
          const next = navigator.serviceWorker.controller;
          if (next && next.scriptURL.includes(desiredMarker)) {
            navigator.serviceWorker.removeEventListener("controllerchange", check);
            resolve(next);
          }
        };
        navigator.serviceWorker.addEventListener("controllerchange", check);
        check();
      }), 15000, "New Scramjet service worker did not take control");
    } catch (error) {
      const reloadKey = `nova-proxy-sw-migration-${VERSION}`;
      if (sessionStorage.getItem(reloadKey) !== "1") {
        sessionStorage.setItem(reloadKey, "1");
        location.reload();
        await new Promise(() => {});
      }
      throw error;
    }

    sessionStorage.removeItem(`nova-proxy-sw-migration-${VERSION}`);
    return navigator.serviceWorker.controller || registration.active;
  }

  async function prepareServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      throw new Error("Service workers are unavailable");
    }

    // Remove only dedicated legacy proxy registrations. The root /sw.js
    // registration is updated in place below so unrelated Nova state survives.
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(async registration => {
      const scopePath = new URL(registration.scope).pathname;
      const workers = [registration.active, registration.waiting, registration.installing].filter(Boolean);
      const hasDedicatedLegacyWorker = workers.some(worker => {
        const scriptPath = new URL(worker.scriptURL).pathname.toLowerCase();
        return scriptPath.includes("vortex") || scriptPath.includes("baremux");
      });
      if (scopePath.startsWith("/vortex/") || scopePath.startsWith("/baremux/") || hasDedicatedLegacyWorker) {
        try { await registration.unregister(); } catch (_) {}
      }
    }));

    const registration = await navigator.serviceWorker.register(SW_URL, {
      scope: "/",
      updateViaCache: "none"
    });
    try { await registration.update(); } catch (_) {}
    await navigator.serviceWorker.ready;
    const active = await waitForDesiredController(registration);
    if (!active) throw new Error("Proxy service worker could not control this page");
    serviceWorker = active;
    return active;
  }

  async function loadScramjetRuntime() {
    await loadScript(PATHS.scramjet);
    if (!window.$scramjet || window.$scramjet.versionInfo?.version !== "2.0.67-alpha.2") {
      throw new Error("Scramjet 2.0.67-alpha.2 did not load correctly");
    }
    await loadScript(PATHS.controllerApi);
    if (!window.$scramjetController || window.$scramjetController.VERSION !== "0.0.14") {
      throw new Error("Scramjet Controller 0.0.14 did not load correctly");
    }
    await loadScript(PATHS.utils);
    if (!window.$scramjetUtils || typeof window.$scramjetUtils.getScramjet !== "function") {
      throw new Error("scramjet-utils 0.0.3 did not load correctly");
    }
    // The published utils 0.0.3 bundle contained stale peer-version assertions.
    // Nova vendors that exact package and patches only those assertions to the
    // pinned Scramjet 2.0.67-alpha.2 / Controller 0.0.14 pair.
    window.$scramjetUtils.getScramjet();
  }

  function safeRequestMetadata(method, headers) {
    const names = [];
    let hasAuthorization = false;
    let hasCookie = false;
    let contentType = "";
    for (const pair of Array.isArray(headers) ? headers : []) {
      if (!Array.isArray(pair)) continue;
      const key = String(pair[0] || "").toLowerCase();
      if (!key) continue;
      names.push(key);
      if (key === "authorization") hasAuthorization = true;
      if (key === "cookie") hasCookie = true;
      if (key === "content-type") contentType = String(pair[1] || "").slice(0, 120);
    }
    return {
      method: String(method || "GET").toUpperCase(),
      headerNames: [...new Set(names)].sort(),
      hasAuthorization,
      hasCookie,
      contentType
    };
  }

  function noteWebSocketEvent(name, patch) {
    const current = state.websocketStats[name] || {
      connectTime: null,
      connectedAt: null,
      upstreamCloseCode: null,
      downstreamCloseCode: null,
      cleanClose: null,
      bytesSent: 0,
      bytesReceived: 0,
      binaryFramesSent: 0,
      textFramesSent: 0,
      binaryFramesReceived: 0,
      textFramesReceived: 0,
      reconnectReason: null,
      closeOrigin: null,
      connectedDurationMs: null,
      transport: name
    };
    state.websocketStats[name] = { ...current, ...(patch || {}) };
    publish();
    return state.websocketStats[name];
  }

  function frameByteLength(value) {
    if (value instanceof ArrayBuffer) return value.byteLength;
    if (ArrayBuffer.isView(value)) return value.byteLength;
    if (typeof Blob !== "undefined" && value instanceof Blob) return value.size;
    if (typeof value === "string") return new TextEncoder().encode(value).byteLength;
    return 0;
  }

  function instrumentTransport(name, transport) {
    if (!transport || transport.__novaInstrumented || typeof transport.connect !== "function") return transport;
    const originalConnect = transport.connect.bind(transport);
    const originalRequest = typeof transport.request === "function" ? transport.request.bind(transport) : null;
    Object.defineProperty(transport, "__novaInstrumented", { value: true });

    if (originalRequest) {
      transport.request = async function (remote, method, body, headers, signal) {
        const requestMeta = safeRequestMetadata(method, headers);
        try {
          // R8.14: libcurl.js enables CURLOPT_ACCEPT_ENCODING internally. That is
          // excellent for normal HTTP traffic, but font files are already binary
          // containers and Discord exposed repeatable WOFF2 corruption on the
          // libcurl stream path. Use the existing Epoxy fallback only for font
          // GET/HEAD requests, without changing global transport health/state.
          // If Epoxy is unavailable, fall back to libcurl normally.
          let response;
          if (name === "libcurl" && /^(?:GET|HEAD)$/i.test(String(method || "GET")) && isFontResponse(remote, [])) {
            // R8.16: validate the actual font container, not just transport headers.
            // Prefer Epoxy for the font-only subtransport, but if its WOFF/WOFF2
            // header invariants are invalid, retry the same request over libcurl
            // and choose the structurally valid candidate. This does not alter
            // global transport health or the active tab transport.
            let epoxyCandidate = null;
            try {
              const fontTransport = await ensureEpoxyReady();
              epoxyCandidate = await materializeFontCandidate(remote, await fontTransport.request(remote, method, body, forceIdentityEncoding(headers), signal));
            } catch (_) {}
            if (epoxyCandidate?.validation?.valid) {
              response = epoxyCandidate.response;
            } else {
              const libcurlCandidate = await materializeFontCandidate(remote, await originalRequest(remote, method, body, forceIdentityEncoding(headers), signal));
              response = libcurlCandidate.response;
              state.recentRequests.push({
                timestamp: new Date().toISOString(),
                classification: "font-byte-validation",
                transport: libcurlCandidate.validation.valid ? "libcurl" : (epoxyCandidate ? "no-valid-candidate" : "libcurl"),
                epoxyReason: epoxyCandidate?.validation?.reason || "unavailable",
                libcurlReason: libcurlCandidate.validation.reason,
                primaryTransport: "libcurl",
                url: String(remote || "")
              });
            }
          } else {
            response = await originalRequest(remote, method, body, forceIdentityEncoding(headers), signal);
          }
          state.recentRequests.push({
            timestamp: new Date().toISOString(),
            classification: "transport-request",
            transport: name,
            url: String(remote || ""),
            ...requestMeta
          });
          if (state.recentRequests.length > 100) state.recentRequests.splice(0, state.recentRequests.length - 100);
          recordTransportSuccess(name, remote);
          const responseStatus = Number(response?.status || 0);
          if (responseStatus >= 400) {
            const category = classifyFailure("http-response", new Error(`HTTP ${responseStatus}`), { url: String(remote || ""), status: responseStatus });
            if (category === "target-challenge") recordHealthSignal(name, "http-response", new Error(`HTTP ${responseStatus}`), { url: String(remote || ""), status: responseStatus, challenge: true });
          }
          response = await sanitizeHtmlResponseBeforeScramjet(remote, response);
          response = await bufferFontResponseExactly(remote, response);
          const binaryEntry = recordBinaryResponse(name, remote, response);
          return instrumentBinaryStream(response, binaryEntry);
        } catch (error) {
          const health = recordHealthSignal(name, "transport-request", error, { url: String(remote || ""), source: "request" });
          noteFailure(health.category.startsWith("destination-") ? "destination-host-failure" : "transport-request-failure", error, {
            url: String(remote || ""),
            transport: name,
            category: health.category
          });
          if (state.currentTransport === name && health.shouldFallback) {
            void requestHealthFallback(name, error, null, `rolling ${health.category} failures`);
          }
          throw error;
        }
      };
    }

    transport.connect = function (url, protocols, requestHeaders, onopen, onmessage, onclose, onerror) {
      const connectStarted = performance.now();
      const sessionStartedAt = Date.now();
      noteWebSocketEvent(name, { reconnectReason: null, connectedAt: null, closeOrigin: null, connectedDurationMs: null });
      const wrappedOpen = (protocol, extensions) => {
        noteWebSocketEvent(name, { connectTime: Math.round(performance.now() - connectStarted), connectedAt: new Date().toISOString(), closeOrigin: null });
        websocketFailureSignals[name] = [];
        recordTransportSuccess(name, url);
        if (state.currentTransport === name) {
          state.wispStatus = "connected";
          publish();
        }
        if (typeof onopen === "function") onopen(protocol, extensions);
      };
      const wrappedMessage = data => {
        const binary = data instanceof ArrayBuffer || ArrayBuffer.isView(data) || (typeof Blob !== "undefined" && data instanceof Blob);
        const current = state.websocketStats[name] || {};
        noteWebSocketEvent(name, {
          bytesReceived: Number(current.bytesReceived || 0) + frameByteLength(data),
          binaryFramesReceived: Number(current.binaryFramesReceived || 0) + (binary ? 1 : 0),
          textFramesReceived: Number(current.textFramesReceived || 0) + (binary ? 0 : 1)
        });
        if (typeof onmessage === "function") onmessage(data);
      };
      const wrappedClose = (code, reason) => {
        noteWebSocketEvent(name, {
          upstreamCloseCode: Number.isFinite(Number(code)) ? Number(code) : null,
          downstreamCloseCode: Number.isFinite(Number(code)) ? Number(code) : null,
          cleanClose: Number(code) === 1000 || Number(code) === 1001,
          reconnectReason: String(reason || "").slice(0, 160) || null,
          closeOrigin: "upstream",
          connectedDurationMs: Math.max(0, Date.now() - sessionStartedAt)
        });
        state.websocketSessions.push({ timestamp: new Date().toISOString(), transport: name, target: String(url || ""), durationMs: Math.max(0, Date.now() - sessionStartedAt), closeCode: Number.isFinite(Number(code)) ? Number(code) : null, closeReason: String(reason || "").slice(0, 160), closeOrigin: "upstream" });
        if (state.websocketSessions.length > 100) state.websocketSessions.splice(0, state.websocketSessions.length - 100);
        if (typeof onclose === "function") onclose(code, reason);
      };
      const wrappedError = error => {
        const now = Date.now();
        const recent = websocketFailureSignals[name].filter(timestamp => now - timestamp <= 10000);
        recent.push(now);
        websocketFailureSignals[name] = recent;
        if (state.currentTransport === name) {
          state.wispStatus = "degraded";
          publish();
          if (recent.length >= 2) {
            websocketFailureSignals[name] = [];
            const wrapped = error instanceof Error ? error : new Error(`${name} reported repeated WebSocket bridge failures`);
            const source = /wisp/i.test(normalizeError(wrapped)) ? "wisp" : "websocket-bridge";
            const health = recordHealthSignal(name, "transport-error", wrapped, { source, url: String(url || "") });
            noteFailure(health.category === "wisp" ? "wisp-failure" : "websocket-bridge-failure", wrapped, { source, transport: name, url: String(url || "") });
            if (health.shouldFallback) void requestHealthFallback(name, wrapped, null, "repeated Wisp/WebSocket failures");
          }
        }
        if (typeof onerror === "function") onerror(error);
      };
      const channel = originalConnect(url, protocols, requestHeaders, wrappedOpen, wrappedMessage, wrappedClose, wrappedError);
      if (Array.isArray(channel) && typeof channel[0] === "function") {
        const send = channel[0];
        channel[0] = data => {
          const binary = data instanceof ArrayBuffer || ArrayBuffer.isView(data) || (typeof Blob !== "undefined" && data instanceof Blob);
          const current = state.websocketStats[name] || {};
          noteWebSocketEvent(name, {
            bytesSent: Number(current.bytesSent || 0) + frameByteLength(data),
            binaryFramesSent: Number(current.binaryFramesSent || 0) + (binary ? 1 : 0),
            textFramesSent: Number(current.textFramesSent || 0) + (binary ? 0 : 1)
          });
          return send(data);
        };
      }
      return channel;
    };
    return transport;
  }

  async function createLibcurl() {
    setHealth("libcurl", "initializing");
    const module = await import(PATHS.libcurl);
    const LibcurlClient = module.default || module.LibcurlClient;
    if (typeof LibcurlClient !== "function") throw new Error("libcurl transport export is missing");
    const transport = instrumentTransport("libcurl", new LibcurlClient({ wisp: WISP_URL }));
    await transport.init();
    if (!transport.ready) throw new Error("libcurl transport did not become ready");
    libcurlTransport = transport;
    setHealth("libcurl", "healthy");
    return transport;
  }

  async function ensureEpoxyReady() {
    if (epoxyTransport?.ready) {
      setHealth("epoxy", "healthy");
      return epoxyTransport;
    }
    if (epoxyInitPromise) return epoxyInitPromise;

    epoxyInitPromise = (async () => {
      setHealth("epoxy", "initializing");
      const module = await import(PATHS.epoxy);
      const EpoxyTransport = module.default;
      if (typeof EpoxyTransport !== "function") throw new Error("Epoxy transport export is missing");
      const transport = epoxyTransport || instrumentTransport("epoxy", new EpoxyTransport({
        wisp: WISP_URL
      }));
      epoxyTransport = transport;
      await transport.init();
      if (!transport.ready) throw new Error("Epoxy transport did not become ready");
      setHealth("epoxy", "healthy");
      return transport;
    })().catch(error => {
      setHealth("epoxy", "failed", error);
      throw error;
    }).finally(() => {
      epoxyInitPromise = null;
    });

    return epoxyInitPromise;
  }

  function startKeepalive() {
    if (keepaliveTimer) return;
    keepaliveTimer = setInterval(() => {
      try { navigator.serviceWorker.controller?.postMessage("nova-scramjet-keepalive"); } catch (_) {}
    }, 15000);
  }

  async function createController(initialTransport) {
    const Controller = window.$scramjetController?.Controller;
    if (typeof Controller !== "function") throw new Error("Scramjet Controller API is unavailable");

    controller = new Controller({
      serviceworker: serviceWorker,
      transport: initialTransport,
      config: {
        prefix: "/~/sj/",
        scramjetPath: `/scramjet/scramjet.js?v=${VERSION}`,
        injectPath: `/controller/controller.inject.js?v=${VERSION}`,
        wasmPath: `/scramjet/scramjet.wasm?v=${VERSION}`,
        virtualWasmPath: "scramjet.wasm.js"
      },
      scramjetConfig: {
        flags: {
          allowInvalidJs: true,
          // R8.5: computed-property virtualization must stay enabled. Scramjet's
          // property wrapper only remaps protected browser globals (location,
          // parent, top, eval) and leaves ordinary keys unchanged, so obj[key]()
          // keeps its receiver while window[key] can still virtualize location.
          disableComputedWrap: false,
          allowFailedIntercepts: true,
          cleanErrors: true,
          rewriterLogs: false,
          sourcemaps: false
        }
      }
    });
    await controller.wait();
    startKeepalive();
    return controller;
  }

  async function initializeModern() {
    await prepareServiceWorker();
    await loadScramjetRuntime();

    let initialTransport;
    try {
      initialTransport = await createLibcurl();
      state.currentEngine = "scramjet";
      state.currentTransport = "libcurl";
      state.wispStatus = "transport-ready";
      publish();
    } catch (error) {
      setHealth("libcurl", "failed", error);
      noteFailure("libcurl-initialization", error);
      state.fallbackCount += 1;
      recordFallback("libcurl", "epoxy", error);
      initialTransport = await ensureEpoxyReady();
      state.currentEngine = "scramjet";
      state.currentTransport = "epoxy";
      state.wispStatus = "transport-ready";
      publish();
    }

    await createController(initialTransport);

    // Warm the modern fallback now, while leaving libcurl selected on the
    // controller. A warm Epoxy instance can be switched in without rebuilding
    // any Scramjet frames when libcurl later has a meaningful failure.
    if (state.currentTransport === "libcurl") {
      ensureEpoxyReady().catch(() => {});
    }
  }

  async function enableLegacyWorkerRuntime() {
    const target = navigator.serviceWorker.controller || serviceWorker;
    if (!target) throw new Error("Proxy service worker is unavailable for legacy fallback");
    await withTimeout(new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = event => {
        const data = event.data || {};
        if (data.ready && data.legacyRuntimeLoaded && data.legacyVortexLoaded && data.legacyServiceWorkerReady) resolve(true);
        else reject(new Error(data.error || data.legacyRuntimeImportError || "Legacy Vortex worker runtime did not fully load"));
      };
      target.postMessage({ type: "nova_enable_legacy" }, [channel.port2]);
    }), 5000, "Legacy Vortex worker activation timed out");
  }

  async function disableLegacyWorkerRuntime() {
    const target = navigator.serviceWorker.controller || serviceWorker;
    if (!target) return false;
    try {
      return await withTimeout(new Promise(resolve => {
        const channel = new MessageChannel();
        channel.port1.onmessage = event => resolve(!!event.data?.ready);
        target.postMessage({ type: "nova_disable_legacy" }, [channel.port2]);
      }), 2000, "Legacy Vortex worker deactivation timed out");
    } catch (_) {
      return false;
    }
  }

  async function initializeLegacy() {
    if (legacyVortex && legacyConnection && state.legacyReady) return legacyVortex;
    setHealth("legacy", "initializing");
    state.legacyLoadStarted = true;
    state.legacyReady = false;
    state.legacyTransportReady = false;
    state.legacyServiceWorkerReady = false;
    state.legacyInitError = null;
    publish();

    try {
      await Promise.all([
        verifyLegacyAsset(PATHS.legacyBareMux, "BareMux runtime"),
        verifyLegacyAsset(PATHS.legacyWorker, "BareMux SharedWorker"),
        verifyLegacyAsset(PATHS.legacyTransport, "legacy Epoxy transport"),
        verifyLegacyAsset(PATHS.legacyVortex, "Vortex runtime"),
        verifyLegacyAsset(PATHS.legacyWasm, "Vortex WASM"),
        verifyLegacyAsset(PATHS.legacySync, "Vortex sync runtime")
      ]);

      // Create the BareMux bridge before constructing Vortex in the service
      // worker. Vortex's worker-side BareClient immediately asks a controlled
      // page for a SharedWorker port, so the page listener must already exist.
      await loadScript(PATHS.legacyBareMux);
      if (!window.BareMux?.BareMuxConnection) throw new Error("Legacy BareMux runtime is unavailable");
      legacyConnection = new window.BareMux.BareMuxConnection(PATHS.legacyWorker);
      await legacyConnection.setTransport(PATHS.legacyTransport, [{ wisp: WISP_URL }]);
      const selectedLegacyTransport = await legacyConnection.getTransport();
      if (!selectedLegacyTransport || !String(selectedLegacyTransport).includes("/epoxy.mjs")) {
        throw new Error("Legacy BareMux did not select the vendored Epoxy transport");
      }
      state.legacyBareMuxLoaded = true;
      state.legacyTransportReady = true;
      publish();

      await loadScript(PATHS.legacyVortex);
      if (typeof window.$vortexLoadController !== "function") throw new Error("Legacy Vortex runtime is unavailable");
      await enableLegacyWorkerRuntime();
      state.legacyVortexLoaded = true;
      state.legacyServiceWorkerReady = true;
      publish();
      const { VortexController } = window.$vortexLoadController();
      legacyVortex = new VortexController({
        prefix: "/vortex/",
        files: {
          wasm: PATHS.legacyWasm,
          all: PATHS.legacyVortex,
          sync: PATHS.legacySync
        },
        flags: {
          rewriterLogs: false,
          cleanErrors: true,
          sourcemaps: false,
          allowInvalidJs: true,
          allowFailedIntercepts: true
        }
      });
      await legacyVortex.init();
      if (!(await checkLegacyWorkerConfig())) throw new Error("Legacy Vortex worker did not receive its configuration");
      state.legacyReady = true;
      state.legacyInitError = null;
      setHealth("legacy", "healthy");
      return legacyVortex;
    } catch (error) {
      state.legacyReady = false;
      state.legacyServiceWorkerReady = false;
      state.legacyInitError = normalizeError(error);
      setHealth("legacy", "failed", error);
      throw error;
    }
  }

  function isMeaningfulNavigationFailure(kind) {
    return kind === "navigation-timeout" ||
      kind === "blank-page" ||
      kind === "navigation-route-failure" ||
      kind === "transport-error";
  }

  async function switchToEpoxy(reason, frame) {
    try {
      const epoxy = await ensureEpoxyReady();
      const from = state.currentTransport;
      controller.setTransport(epoxy);
      state.currentEngine = "scramjet";
      state.currentTransport = "epoxy";
      state.wispStatus = "transport-ready";
      state.fallbackCount += 1;
      recordFallback(from, "epoxy", reason);
      ignoreFailuresUntil = Date.now() + FAILURE_COOLDOWN_MS;
      publish();
      for (const adapter of frames) {
        if (adapter._pending || adapter === frame) adapter._retryCurrent("epoxy-fallback");
      }
      return true;
    } catch (error) {
      noteFailure("epoxy-initialization", error);
      return switchToLegacy(error, frame);
    }
  }

  async function switchToLegacy(reason, frame) {
    try {
      const from = state.currentTransport;
      await initializeLegacy();
      state.currentEngine = "vortex";
      state.currentTransport = "baremux-legacy";
      state.wispStatus = "legacy-transport-ready";
      state.fallbackCount += 1;
      recordFallback(from, "baremux-legacy", reason);
      ignoreFailuresUntil = Date.now() + FAILURE_COOLDOWN_MS;
      publish();
      await Promise.all([...frames].map(adapter => adapter._activateLegacy(!!adapter.lastURL)));
      return true;
    } catch (error) {
      noteFailure("legacy-initialization", error);
      state.currentEngine = "error";
      state.previousTransport = state.currentTransport;
      state.currentTransport = "none";
      publish();
      for (const adapter of frames) adapter._showProxyError(error);
      throw error;
    }
  }

  function requestHealthFallback(name, error, frame, reason) {
    if (Date.now() < ignoreFailuresUntil) return Promise.resolve(false);
    if (fallbackPromise) return fallbackPromise;
    fallbackPromise = (async () => {
      if (state.currentEngine === "scramjet" && name === "libcurl" && state.currentTransport === "libcurl") {
        setHealth("libcurl", "failed", error);
        return switchToEpoxy(reason || error, frame);
      }
      if (state.currentEngine === "scramjet" && name === "epoxy" && state.currentTransport === "epoxy") {
        setHealth("epoxy", "failed", error);
        return switchToLegacy(reason || error, frame);
      }
      if (state.currentEngine === "vortex") {
        setHealth("legacy", "failed", error);
        state.currentEngine = "error";
        state.previousTransport = state.currentTransport;
        state.currentTransport = "none";
        publish();
        for (const adapter of frames) adapter._showProxyError(error);
      }
      return false;
    })().finally(() => { fallbackPromise = null; });
    return fallbackPromise;
  }

  function reportFailure(kind, error, frame, extra = {}) {
    noteFailure(kind, error, extra);
    // Rewriter/URL compatibility errors are not transport-health evidence.
    if (kind === "fatal-rewrite" || classifyFailure(kind, error, extra) === "rewrite") return Promise.resolve(false);
    if (!isMeaningfulNavigationFailure(kind)) return Promise.resolve(false);
    if (Date.now() < ignoreFailuresUntil) return Promise.resolve(false);

    const name = state.currentTransport === "libcurl" || state.currentTransport === "epoxy" ? state.currentTransport : "legacy";
    const health = recordHealthSignal(name, kind, error, { ...extra, url: extra.url || frame?.lastURL || "" });
    if (!health.shouldFallback) {
      // Retry the first navigation-level failure once on the same transport;
      // this prevents one bad hostname or transient route error poisoning the
      // entire transport while still giving a stalled navigation a recovery path.
      if (frame && (kind === "navigation-timeout" || kind === "navigation-route-failure") && !frame._healthRetryPending) {
        frame._healthRetryPending = true;
        setTimeout(() => {
          frame._healthRetryPending = false;
          if (state.currentEngine === "scramjet" && frame.lastURL) frame._retryCurrent("same-transport-health-retry");
        }, 150);
      }
      return Promise.resolve(false);
    }
    return requestHealthFallback(name, error, frame, `rolling ${health.category} health threshold reached`);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  class NovaProxyFrame {
    constructor(element) {
      this.element = element;
      this.modernFrame = null;
      this.legacyFrame = null;
      this.lastURL = "";
      this._pending = false;
      this._navigationToken = 0;
      this._navigationTimer = null;
      this._blankTimer = null;
      this._legacySwitch = null;
      this._healthRetryPending = false;
      this._engineOverride = null;
      this._compatTimer = null;
      this._compatHost = "";
      this._requestedURL = "";
      this._forcedLegacyPolicy = "";
      this._routeGeneration = 0;
      this._onLoad = this._onLoad.bind(this);
      this.element.addEventListener("load", this._onLoad);

      if (state.currentEngine === "vortex") {
        this._legacySwitch = this._activateLegacy(false);
      } else {
        this.modernFrame = controller.createFrame(this.element);
      }
      frames.add(this);
    }

    _usesLegacy() {
      return this._engineOverride === "legacy" || state.currentEngine === "vortex";
    }

    get url() {
      if (this._usesLegacy() && this.legacyFrame) {
        try { return this.legacyFrame.url; } catch (_) {}
      }
      if (this.modernFrame) {
        try {
          const href = this.element.contentWindow?.location?.href;
          if (href && (href === location.origin + "/proxy-frame" || href === location.origin + "/proxy-frame.html")) return this.lastURL;
          if (href && href.startsWith(location.origin + this.modernFrame.prefix)) {
            const decoded = window.$scramjet.unrewriteUrl(href, this.modernFrame.context);
            if (decoded && /^https?:/i.test(decoded)) this.lastURL = decoded;
          }
        } catch (_) {}
      }
      return this.lastURL;
    }

    _clearTimers() {
      clearTimeout(this._navigationTimer);
      clearTimeout(this._blankTimer);
      clearTimeout(this._compatTimer);
      this._navigationTimer = null;
      this._blankTimer = null;
      this._compatTimer = null;
    }

    _startNavigationTimer() {
      this._clearTimers();
      const token = ++this._navigationToken;
      this._pending = true;
      this._navigationTimer = setTimeout(() => {
        if (!this._pending || token !== this._navigationToken) return;
        reportFailure("navigation-timeout", new Error(`Navigation stalled for ${NAVIGATION_TIMEOUT_MS / 1000}s`), this, { url: this.lastURL });
      }, NAVIGATION_TIMEOUT_MS);
    }

    _onLoad() {
      const attr = this.element.getAttribute("src") || "";
      if (attr === "/proxy-frame" || attr === "/proxy-frame.html" || !this.lastURL) return;

      this._pending = false;
      if (state.currentEngine === "scramjet" && !this._usesLegacy()) {
        state.wispStatus = "active";
        publish();
      }
      clearTimeout(this._navigationTimer);
      this._navigationTimer = null;
      void this.url;

      // Google is Vortex-only while the document remains on google.*. If a
      // link/navigation leaves Google, hand the tab back to Scramjet.
      if (this._usesLegacy() && this._forcedLegacyPolicy === "google-vortex") {
        let currentLegacyURL = "";
        try { currentLegacyURL = String(this.url || this.lastURL || ""); } catch (_) {}
        if (currentLegacyURL && !isGoogleURL(currentLegacyURL)) {
          this.lastURL = currentLegacyURL;
          this._requestedURL = currentLegacyURL;
          this._routeGeneration += 1; // cancel any stale pending Google activation
          this._returnToModern(currentLegacyURL).catch(error =>
            reportFailure("modern-reactivation", error, this, { url: currentLegacyURL })
          );
          return;
        }
      }

      if (state.currentEngine !== "scramjet" || this._usesLegacy()) return;
      const token = this._navigationToken;
      this._blankTimer = setTimeout(() => {
        if (token !== this._navigationToken || this._pending) return;
        try {
          const doc = this.element.contentDocument;
          const body = doc?.body;
          const text = body?.textContent?.trim() || "";
          const hasElements = !!body?.children?.length;
          if (doc?.readyState === "complete" && !text && !hasElements) {
            reportFailure("blank-page", new Error("Scramjet navigation completed with a blank document"), this, { url: this.lastURL });
          }
        } catch (_) {
          // Cross-context access can fail on a valid page; that is not a proxy failure.
        }
      }, BLANK_RECHECK_MS);

      // Modern-runtime compatibility fallback. This is deliberately per-tab:
      // a site/runtime incompatibility must not poison libcurl/Epoxy health or
      // move unrelated tabs (for example GeForce NOW/Fortnite) off Scramjet.
      this._compatTimer = setTimeout(() => {
        if (token !== this._navigationToken || this._pending || this._usesLegacy()) return;
        try {
          const requested = new URL(this._requestedURL || this.lastURL);
          if (isBraveSearchURL(requested.href)) return;
          const currentText = String(this.url || this.lastURL || requested.href);
          const current = new URL(currentText, requested.href);
          const fromUrl = current.searchParams.get("fromUrl");
          const doc = this.element.contentDocument;
          const bodyText = (doc?.body?.innerText || doc?.body?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 12000);
          const invalidSentinel = current.pathname.includes("/undefined") || fromUrl === "/undefined" || fromUrl === "undefined";
          const root404Shell = requested.pathname === "/" && current.origin === requested.origin &&
            (/^\/404(?:\/|$)/.test(current.pathname) || /\b404\b/.test(bodyText.slice(0, 2000))) &&
            /couldn['’]?t find (?:this|the) page|page not found|not found/i.test(bodyText);
          if (!invalidSentinel && !root404Shell) return;

          this._compatHost = requested.hostname.toLowerCase();
          this._forcedLegacyPolicy = "compatibility";
          state.fallbackHistory.push({
            timestamp: new Date().toISOString(),
            from: state.currentTransport,
            to: "baremux-legacy-tab",
            reason: invalidSentinel ? "modern route leaked undefined sentinel" : "modern root navigation rendered target 404 shell",
            scope: "tab",
            target: requested.origin
          });
          if (state.fallbackHistory.length > 50) state.fallbackHistory.splice(0, state.fallbackHistory.length - 50);
          state.lastFallbackReason = invalidSentinel ? "tab compatibility: undefined route sentinel" : "tab compatibility: root 404 shell";
          publish();
          this._activateLegacy(true, state.lastFallbackReason, requested.href).catch(error => reportFailure("legacy-initialization", error, this, { url: requested.href }));
        } catch (_) {}
      }, Math.max(BLANK_RECHECK_MS + 1000, 3500));
    }

    async _activateLegacy(retry, reason = "compatibility fallback", retryURL = "", expectedGeneration = null) {
      if (this._legacySwitch) return this._legacySwitch;
      // Capture the intended destination before any async legacy bootstrap. A
      // later navigation must never change the target of this activation.
      const fallbackTarget = String(retryURL || this._requestedURL || this.lastURL || "");
      this._legacySwitch = (async () => {
        const vortex = await initializeLegacy();
        // Forced routing can take long enough for the user to navigate away.
        // Abort stale Google activations instead of dragging the new page into
        // Vortex after it has already loaded successfully in Scramjet.
        if (expectedGeneration !== null && expectedGeneration !== this._routeGeneration) return;
        if (isBraveSearchURL(fallbackTarget)) return;
        if (reason === "forced Google compatibility route" && !isGoogleURL(fallbackTarget)) return;
        this._engineOverride = "legacy";
        this._clearTimers();
        const retiringModernFrame = this.modernFrame;

        // R8.7: stop the old Scramjet document before removing its controller
        // frame. R8.6 removed the frame first, leaving the still-running page
        // issuing requests that failed with "No frame found for request" while
        // the legacy iframe was taking ownership.
        await new Promise(resolve => {
          const finish = () => resolve();
          this.element.addEventListener("load", finish, { once: true });
          this.element.src = "/proxy-frame";
          setTimeout(finish, 1200);
        });
        if (retiringModernFrame && controller) {
          const index = controller.frames.indexOf(retiringModernFrame);
          if (index >= 0) controller.frames.splice(index, 1);
        }
        this.modernFrame = null;
        this.legacyFrame = vortex.createFrame(this.element);

        // Google-only Vortex policy: navigations initiated inside the legacy
        // document never pass through NovaProxyFrame.go(). Vortex exposes a
        // urlchange event from the client before the destination app finishes
        // booting. Use it to hand any non-Google destination back to Scramjet
        // immediately instead of allowing Brave/other sites to inherit Vortex.
        if (this.legacyFrame && typeof this.legacyFrame.addEventListener === "function") {
          this.legacyFrame.addEventListener("urlchange", event => {
            if (this._forcedLegacyPolicy !== "google-vortex") return;
            const changedURL = String(event?.url || "");
            if (!changedURL || isGoogleURL(changedURL)) return;
            const exitGeneration = ++this._routeGeneration;
            this.lastURL = changedURL;
            this._requestedURL = changedURL;
            this._forcedLegacyPolicy = "";
            this._compatHost = "";
            // Invalidate any in-flight Google activation and retire this Vortex
            // document before its cross-site scripts/assets can take ownership.
            Promise.resolve().then(() => {
              if (exitGeneration !== this._routeGeneration) return;
              this._returnToModern(changedURL).catch(error =>
                reportFailure("modern-reactivation", error, this, { url: changedURL })
              );
            });
          });
        }
        // R8.9: compatibility fallback must retry the URL the user originally
        // requested, not the already-corrupted URL observed inside Scramjet.
        // Reading adapter.url during compatibility detection may legitimately
        // discover a target-side /404?fromUrl=/undefined and update lastURL.
        // Carry the clean request explicitly across the async legacy bootstrap.
        if (retry && fallbackTarget) {
          this.lastURL = fallbackTarget;
          this._requestedURL = fallbackTarget;
          this.go(fallbackTarget);
        }
      })().finally(() => {
        this._legacySwitch = null;
      });
      return this._legacySwitch;
    }

    _retryCurrent() {
      if (!this.lastURL) return;
      const url = this.lastURL;
      setTimeout(() => this.go(url), 50);
    }

    async _returnToModern(url) {
      if (state.currentEngine !== "scramjet") return this.go(url);
      this._clearTimers();
      this.legacyFrame = null;
      await new Promise(resolve => {
        const finish = () => resolve();
        this.element.addEventListener("load", finish, { once: true });
        this.element.src = "/proxy-frame";
        setTimeout(finish, 1200);
      });
      this._engineOverride = null;
      this._compatHost = "";
      this._forcedLegacyPolicy = "";
      if (!this.modernFrame && controller) this.modernFrame = controller.createFrame(this.element);
      this.go(url);
    }

    go(url) {
      if (url instanceof URL) url = url.toString();
      const nextURL = String(url || "");
      if (!nextURL) return;
      const routeGeneration = ++this._routeGeneration;

      // Brave Search is Scramjet-only. If this tab currently belongs to
      // Vortex/BareMux (including Google forced-routing or compatibility
      // fallback), retire legacy ownership before loading Brave.
      if (isBraveSearchURL(nextURL)) {
        this._forcedLegacyPolicy = "";
        this._compatHost = "";
        if (this._engineOverride === "legacy" || this._usesLegacy()) {
          this._returnToModern(nextURL).catch(error =>
            reportFailure("modern-reactivation", error, this, { url: nextURL })
          );
          return;
        }
      }

      if (state.currentEngine === "scramjet" && this._engineOverride !== "legacy" && isLegacyGameURL(nextURL)) {
        this.lastURL = nextURL;
        this._requestedURL = nextURL;
        this._compatHost = hostFor(nextURL);
        this._forcedLegacyPolicy = "game-legacy";
        state.fallbackHistory.push({
          timestamp: new Date().toISOString(),
          from: state.currentTransport,
          to: "baremux-legacy-tab",
          reason: "forced Escape Road compatibility route",
          scope: "tab",
          target: nextURL
        });
        if (state.fallbackHistory.length > 50) state.fallbackHistory.splice(0, state.fallbackHistory.length - 50);
        state.lastFallbackReason = "tab routing: Escape Road uses Vortex";
        publish();
        this._activateLegacy(true, "forced Escape Road compatibility route", nextURL, routeGeneration).catch(error =>
          reportFailure("legacy-initialization", error, this, { url: nextURL })
        );
        return;
      }

      // Route the complete google.* document family into Vortex before any
      // Scramjet navigation begins. This covers Google searches submitted via
      // SPA/history navigation because the Google document itself is already
      // running under Vortex.
      if (state.currentEngine === "scramjet" && this._engineOverride !== "legacy" && isGoogleURL(nextURL)) {
        this.lastURL = nextURL;
        this._requestedURL = nextURL;
        this._compatHost = hostFor(nextURL);
        this._forcedLegacyPolicy = "google-vortex";
        state.fallbackHistory.push({
          timestamp: new Date().toISOString(),
          from: state.currentTransport,
          to: "baremux-legacy-tab",
          reason: "forced Google compatibility route",
          scope: "tab",
          target: nextURL
        });
        if (state.fallbackHistory.length > 50) state.fallbackHistory.splice(0, state.fallbackHistory.length - 50);
        state.lastFallbackReason = "tab routing: Google uses Vortex";
        publish();
        this._activateLegacy(true, "forced Google compatibility route", nextURL, routeGeneration).catch(error =>
          reportFailure("legacy-initialization", error, this, { url: nextURL })
        );
        return;
      }

      // If the user leaves Google while its async Vortex bootstrap is still in
      // flight, clear the policy immediately. routeGeneration makes the stale
      // activation self-cancel when initializeLegacy() resolves.
      if (this._forcedLegacyPolicy === "google-vortex" && !isGoogleURL(nextURL) && this._engineOverride !== "legacy") {
        this._forcedLegacyPolicy = "";
        this._compatHost = "";
      }
      if (this._forcedLegacyPolicy === "game-legacy" && !isLegacyGameURL(nextURL) && this._engineOverride !== "legacy") {
        this._forcedLegacyPolicy = "";
        this._compatHost = "";
      }

      if (this._engineOverride === "legacy" && state.currentEngine === "scramjet" && this._compatHost) {
        const nextHost = hostFor(nextURL);
        const leavesGooglePolicy = this._forcedLegacyPolicy === "google-vortex" && !isGoogleURL(nextURL);
        if (leavesGooglePolicy || (this._forcedLegacyPolicy !== "google-vortex" && nextHost && nextHost !== this._compatHost)) {
          this._returnToModern(nextURL).catch(error => reportFailure("modern-reactivation", error, this, { url: nextURL }));
          return;
        }
      }
      this.lastURL = nextURL;
      if (!this.lastURL) return;
      this._requestedURL = this.lastURL;
      this._startNavigationTimer();

      if (this._usesLegacy()) {
        if (this.legacyFrame) {
          this.legacyFrame.go(this.lastURL);
        } else {
          this._activateLegacy(true).catch(error => reportFailure("transport-error", error, this));
        }
        return;
      }

      if (!this.modernFrame && controller) this.modernFrame = controller.createFrame(this.element);
      try {
        this.modernFrame.go(this.lastURL);
      } catch (error) {
        reportFailure("fatal-rewrite", error, this, { url: this.lastURL });
      }
    }

    back() {
      try { (this._usesLegacy() ? this.legacyFrame : this.modernFrame)?.back(); } catch (_) {}
    }

    forward() {
      try { (this._usesLegacy() ? this.legacyFrame : this.modernFrame)?.forward(); } catch (_) {}
    }

    reload() {
      try {
        this._startNavigationTimer();
        (this._usesLegacy() ? this.legacyFrame : this.modernFrame)?.reload();
      } catch (error) {
        reportFailure("transport-error", error, this);
      }
    }

    destroy() {
      this._clearTimers();
      this.element.removeEventListener("load", this._onLoad);
      if (this.modernFrame && controller) {
        const index = controller.frames.indexOf(this.modernFrame);
        if (index >= 0) controller.frames.splice(index, 1);
      }
      this.modernFrame = null;
      this.legacyFrame = null;
      this._engineOverride = null;
      this._compatHost = "";
      frames.delete(this);
    }

    _showProxyError(error) {
      this._clearTimers();
      this._pending = false;
      const target = escapeHtml(this.lastURL || "this page");
      const detail = escapeHtml(normalizeError(error));
      this.element.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nova connection error</title><style>html{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#05050c;color:#eeeef6;font-family:system-ui,sans-serif}.panel{width:min(620px,calc(100vw - 40px));padding:32px;border:1px solid #2d2d52;border-radius:14px;background:#0b0b18}h1{margin:0 0 12px;font-size:24px}p{color:#aaaac4;line-height:1.6;overflow-wrap:anywhere}.detail{font-size:12px;opacity:.7}</style></head><body><main class="panel"><h1>Nova could not open this page</h1><p>The proxy could not reach <strong>${target}</strong>. Check the address and try again.</p><p class="detail">${detail}</p></main></body></html>`;
    }
  }

  async function switchModernTransport(name) {
    if (!controller) throw new Error("Scramjet controller is not ready");
    if (name === "libcurl") {
      if (!libcurlTransport?.ready) await createLibcurl();
      controller.setTransport(libcurlTransport);
    } else if (name === "epoxy") {
      const epoxy = await ensureEpoxyReady();
      controller.setTransport(epoxy);
    } else {
      throw new Error(`Unsupported modern transport: ${name}`);
    }
    const previous = state.currentTransport;
    state.previousTransport = previous;
    state.currentEngine = "scramjet";
    state.currentTransport = name;
    state.wispStatus = "transport-ready";
    recordFallback(previous, name, `manual transport override: ${name}`);
    publish();
    return cloneState();
  }

  function forcedTransport() {
    try {
      const params = new URLSearchParams(location.search);
      if (params.get("novaProxyLegacy") === "1" || localStorage.getItem("nova_proxy_legacy") === "1") return "legacy";
      const value = params.get("novaProxyTransport") || localStorage.getItem("nova_proxy_force_transport") || "";
      return ["libcurl", "epoxy", "legacy"].includes(value) ? value : "";
    } catch (_) { return ""; }
  }

  function forceLegacyEnabled() {
    return forcedTransport() === "legacy";
  }

  async function bootstrap() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      if (forceLegacyEnabled()) {
        await prepareServiceWorker();
        await initializeLegacy();
        state.currentEngine = "vortex";
        state.currentTransport = "baremux-legacy";
        state.wispStatus = "legacy-transport-ready";
        publish();
        return true;
      }
      try {
        await initializeModern();
        if (forcedTransport() === "epoxy" && state.currentTransport !== "epoxy") {
          const epoxy = await ensureEpoxyReady();
          controller.setTransport(epoxy);
          state.previousTransport = state.currentTransport;
          state.currentTransport = "epoxy";
          state.wispStatus = "transport-ready";
          publish();
        }
      } catch (modernError) {
        noteFailure("modern-initialization", modernError);
        try {
          await initializeLegacy();
          state.currentEngine = "vortex";
          state.previousTransport = state.currentTransport;
          state.currentTransport = "baremux-legacy";
          state.wispStatus = "legacy-transport-ready";
          state.fallbackCount += 1;
          recordFallback(state.previousTransport || "modern-init", "baremux-legacy", modernError);
          publish();
        } catch (legacyError) {
          noteFailure("legacy-initialization", legacyError);
          state.currentEngine = "error";
          state.currentTransport = "none";
          publish();
          throw legacyError;
        }
      }
      publish();
      if (isDebugEnabled()) startRoutingDiagnostics();
      return true;
    })();
    return initPromise;
  }

  function createFrame(element) {
    if (state.currentEngine === "starting") throw new Error("NovaProxyManager is not ready");
    if (state.currentEngine === "error") throw new Error("Nova proxy is unavailable");
    return new NovaProxyFrame(element || document.createElement("iframe"));
  }

  function subscribe(callback) {
    if (typeof callback !== "function") return () => {};
    subscribers.add(callback);
    try { callback(cloneState()); } catch (_) {}
    return () => subscribers.delete(callback);
  }

  function isDebugEnabled() {
    try {
      const params = new URLSearchParams(location.search);
      return params.get("novaProxyDebug") === "1" || localStorage.getItem("nova_proxy_debug") === "1";
    } catch (_) { return false; }
  }

  function renderDebugPanel(snapshot) {
    if (!isDebugEnabled() || !document.body) return;
    let panel = document.getElementById("nova-proxy-debug");
    if (!panel) {
      panel = document.createElement("pre");
      panel.id = "nova-proxy-debug";
      panel.style.cssText = "position:fixed;right:10px;bottom:10px;z-index:2147483647;max-width:420px;max-height:45vh;overflow:auto;margin:0;padding:10px 12px;border:1px solid #45457a;border-radius:8px;background:rgba(5,5,14,.94);color:#d7d7ff;font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;pointer-events:none;white-space:pre-wrap";
      document.body.appendChild(panel);
    }
    panel.textContent = JSON.stringify(snapshot, null, 2);
  }

  function frameForRoutePath(path) {
    if (!path) return null;
    for (const adapter of frames) {
      const prefix = adapter.modernFrame?.prefix;
      if (prefix && path.startsWith(prefix)) return adapter;
    }
    return null;
  }

  navigator.serviceWorker?.addEventListener("message", event => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "nova_proxy_route_failure") {
      const adapter = frameForRoutePath(data.path || "");
      const message = data.message || `Scramjet route returned ${data.status || "an error"}`;
      const kind = /unable to parse rewritten url|unrewrite|rewrite/i.test(message) ? "fatal-rewrite" : "navigation-route-failure";
      reportFailure(kind, new Error(message), adapter, {
        status: data.status || 0,
        path: data.path || "",
        url: adapter?.lastURL || ""
      });
    }
  });

  window.NovaProxyManager = Object.freeze({
    VERSION,
    WISP_URL,
    PATHS,
    bootstrap,
    createFrame,
    reportFailure,
    switchTransport: switchModernTransport,
    getState: cloneState,
    captureTransportSnapshot,
    subscribe
  });
  window.NovaProxyDiagnostics = Object.freeze({
    getState: cloneState,
    captureTransportSnapshot,
    getRoutingLog,
    getMetrics: getProxyMetrics,
    enable() {
      try { localStorage.setItem("nova_proxy_debug", "1"); } catch (_) {}
      startRoutingDiagnostics();
      renderDebugPanel(cloneState());
    },
    disable() {
      try { localStorage.removeItem("nova_proxy_debug"); } catch (_) {}
      stopRoutingDiagnostics();
      state.recentRequests = [];
      state.recentFailures = [];
      state.recentBinaryResponses = [];
      document.getElementById("nova-proxy-debug")?.remove();
    },
    async forceLibcurl() {
      try {
        localStorage.removeItem("nova_proxy_legacy");
        localStorage.setItem("nova_proxy_force_transport", "libcurl");
        if (state.currentEngine === "scramjet") return await switchModernTransport("libcurl");
        location.reload();
      } catch (error) { throw error; }
    },
    async forceEpoxy() {
      try {
        localStorage.removeItem("nova_proxy_legacy");
        localStorage.setItem("nova_proxy_force_transport", "epoxy");
        if (state.currentEngine === "scramjet") return await switchModernTransport("epoxy");
        location.reload();
      } catch (error) { throw error; }
    },
    forceLegacy() {
      try {
        localStorage.setItem("nova_proxy_force_transport", "legacy");
        localStorage.setItem("nova_proxy_legacy", "1");
        location.reload();
      } catch (_) {}
    },
    clearOverride() {
      try {
        localStorage.removeItem("nova_proxy_force_transport");
        localStorage.removeItem("nova_proxy_legacy");
      } catch (_) {}
    },
    clearLegacyOverride() {
      try {
        localStorage.removeItem("nova_proxy_force_transport");
        localStorage.removeItem("nova_proxy_legacy");
      } catch (_) {}
    },
    async testFallbackChain() {
      const results = {
        activeBefore: { engine: state.currentEngine, transport: state.currentTransport },
        libcurl: { status: "FAIL", error: null },
        epoxy: { status: "FAIL", error: null },
        legacy: { status: "FAIL", error: null },
        thresholds: {
          rollingWindowMs: HEALTH_WINDOW_MS,
          navigationWindowMs: NAV_HEALTH_WINDOW_MS,
          cooldownMs: FAILURE_COOLDOWN_MS,
          generalFailures: GENERAL_FAILURE_THRESHOLD,
          minimumTransportSamples: MIN_TRANSPORT_SAMPLE_COUNT,
          transportDistinctTargets: TRANSPORT_DISTINCT_TARGET_THRESHOLD,
          navigationFailures: NAVIGATION_FAILURE_THRESHOLD,
          wispFailures: WISP_FAILURE_THRESHOLD
        }
      };
      try {
        if (!libcurlTransport?.ready) await createLibcurl();
        results.libcurl.status = libcurlTransport?.ready ? "PASS" : "FAIL";
      } catch (error) { results.libcurl.error = normalizeError(error); }
      try {
        const epoxy = await ensureEpoxyReady();
        results.epoxy.status = epoxy?.ready ? "PASS" : "FAIL";
      } catch (error) { results.epoxy.error = normalizeError(error); }
      try {
        await initializeLegacy();
        results.legacy.status = state.legacyReady ? "PASS" : "FAIL";
      } catch (error) { results.legacy.error = normalizeError(error); }
      if (results.activeBefore.engine !== "vortex") await disableLegacyWorkerRuntime();
      results.activeAfter = { engine: state.currentEngine, transport: state.currentTransport };
      results.transportUnchanged = results.activeBefore.engine === results.activeAfter.engine && results.activeBefore.transport === results.activeAfter.transport;
      try { console.table({ libcurl: results.libcurl.status, epoxy: results.epoxy.status, legacy: results.legacy.status }); } catch (_) {}
      return results;
    },
    async runCompatibilityTests() {
      const out = {};
      const mark = (name, ok, detail = "") => { out[name] = { status: ok ? "PASS" : "FAIL", detail }; };
      const skip = (name, detail) => { out[name] = { status: "SKIP", detail }; };
      const fetchCheck = async (name, path, validate = response => response.ok) => {
        try { const response = await fetch(path, { cache: "no-store" }); mark(name, !!validate(response), `${response.status} ${response.headers.get("content-type") || ""}`.trim()); }
        catch (error) { mark(name, false, normalizeError(error)); }
      };
      await fetchCheck("html", "/proxy-frame.html", response => response.ok && (response.headers.get("content-type") || "").includes("text/html"));
      await fetchCheck("css", "/css/nova.css", response => response.ok && (response.headers.get("content-type") || "").includes("text/css"));
      await fetchCheck("javascript", `/config.js?v=${VERSION}`, response => response.ok && /javascript|text\/plain/.test(response.headers.get("content-type") || ""));
      await fetchCheck("image", "/favicon.webp", response => response.ok && (response.headers.get("content-type") || "").startsWith("image/"));
      try {
        const module = await import(PATHS.libcurl);
        mark("module-js", !!module && typeof module === "object");
        const dynamicModule = await import(PATHS.epoxy);
        mark("dynamic-import", !!dynamicModule && typeof dynamicModule === "object");
      } catch (error) { mark("module-js", false, normalizeError(error)); mark("dynamic-import", false, normalizeError(error)); }
      try {
        const blob = new Blob(["self.onmessage=e=>postMessage(e.data+1)"], { type: "application/javascript" });
        const blobUrl = URL.createObjectURL(blob);
        const fetched = await fetch(blobUrl);
        mark("blob-fetch", fetched.ok && (await fetched.text()).includes("postMessage"));
        const workerResult = await withTimeout(new Promise((resolve, reject) => {
          const worker = new Worker(blobUrl);
          worker.onmessage = event => { worker.terminate(); resolve(event.data === 42); };
          worker.onerror = error => { worker.terminate(); reject(error); };
          worker.postMessage(41);
        }), 3000, "Blob worker test timed out");
        mark("blob-worker", !!workerResult);
        URL.revokeObjectURL(blobUrl);
      } catch (error) { mark("blob-worker", false, normalizeError(error)); }
      try {
        const sriRule = window.$scramjet?.htmlRules?.find(rule => rule.integrity);
        mark("sri-stripped-proxied-resource", !!sriRule && sriRule.fn("sha384-test") == null);
      } catch (error) { mark("sri-stripped-proxied-resource", false, normalizeError(error)); }
      try {
        const wasmResponse = await fetch(`/scramjet/scramjet.wasm?v=${VERSION}`, { cache: "no-store" });
        const wasm = new Uint8Array(await wasmResponse.arrayBuffer());
        mark("wasm", wasmResponse.ok && wasm.length > 4 && wasm[0] === 0 && wasm[1] === 97 && wasm[2] === 115 && wasm[3] === 109);
      } catch (error) { mark("wasm", false, normalizeError(error)); }
      try {
        if (typeof XMLHttpRequest === "undefined") throw new Error("XMLHttpRequest unavailable");
        const xhrOk = await withTimeout(new Promise(resolve => {
          const xhr = new XMLHttpRequest(); xhr.open("GET", `/config.js?v=${VERSION}`); xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 400); xhr.onerror = () => resolve(false); xhr.send();
        }), 3000, "XHR test timed out");
        mark("xhr", !!xhrOk);
      } catch (error) { mark("xhr", false, normalizeError(error)); }
      try {
        const iframeOk = await withTimeout(new Promise(resolve => {
          const frame = document.createElement("iframe"); frame.hidden = true; frame.onload = () => { frame.remove(); resolve(true); }; frame.onerror = () => { frame.remove(); resolve(false); }; frame.src = "/proxy-frame.html"; document.body.appendChild(frame);
        }), 3000, "iframe test timed out");
        mark("iframe", !!iframeOk);
      } catch (error) { mark("iframe", false, normalizeError(error)); }
      try {
        const required = Object.values(PATHS);
        const checks = await Promise.all(required.map(async path => { const response = await fetch(path, { cache: "no-store" }); return response.ok; }));
        mark("runtime-assets", checks.every(Boolean));
      } catch (error) { mark("runtime-assets", false, normalizeError(error)); }
      skip("woff2", "No dedicated first-party WOFF2 self-test fixture is bundled; binary path is covered by static/runtime proxy tests.");
      skip("eot", "No dedicated first-party EOT self-test fixture is bundled; binary path is covered by static/runtime proxy tests.");
      skip("websocket", "No same-origin diagnostic WebSocket endpoint is exposed; the production Wisp is not probed by this self-test.");
      skip("redirect", "No dedicated same-origin redirect fixture is exposed.");
      skip("range", "Nova R2 Range handling is validated by the service-worker regression suite rather than issuing external media traffic here.");
      return out;
    }
  });
  window.__NOVA_PROXY_MANAGER_VERSION = VERSION;
  window.__NOVA_WISP_URL = WISP_URL;
  publish();
})();
