"use strict";

const NOVA_PROXY_RUNTIME_VERSION = "20260829-sj2067-r8.24";

if (navigator.userAgent.includes("Firefox")) {
  try {
    Object.defineProperty(globalThis, "crossOriginIsolated", { value: true, writable: false });
  } catch (_) {}
}

// Scramjet owns /~/sj/ exclusively. controller.sw.js does not install a fetch
// handler; it exposes shouldRoute()/route() for this worker to call.
importScripts(`/proxy/controller/controller.sw.js?v=${NOVA_PROXY_RUNTIME_VERSION}`);

// Legacy Vortex is still inactive until NovaProxyManager explicitly selects
// the third fallback. Its worker script is imported during service-worker
// evaluation because service workers cannot reliably add new importScripts()
// dependencies after installation. Importing the runtime does not create a
// Vortex worker, claim /vortex/, or mix BareMux into proxy-transports.
importScripts(`/proxy/js/nova-proxy-compatibility.js?v=${NOVA_PROXY_RUNTIME_VERSION}`);

let legacyVortex = null;
let legacyRuntimeLoaded = false;
let legacyRuntimeImportError = null;
let legacyEnabled = false;
let adblockEnabled = false;
try {
  importScripts(`/proxy/vortex.all.js?v=${NOVA_PROXY_RUNTIME_VERSION}`);
  legacyRuntimeLoaded = typeof self.$vortexLoadWorker === "function";
  if (!legacyRuntimeLoaded) {
    legacyRuntimeImportError = "Vortex worker loader export is missing";
  } else {
    // R8.7: construct Vortex during the service worker's initial evaluation.
    // Chrome requires message handlers used by service workers to be installed
    // during initial evaluation; constructing it later made compatibility
    // fallback unreliable even though standalone Vortex/BareMux worked.
    const { VortexServiceWorker } = $vortexLoadWorker();
    legacyVortex = new VortexServiceWorker();
    legacyVortex.addEventListener("request", event => {
      if (adblockEnabled && isAdDomain(event.url.hostname)) {
        event.response = blockedResponse(event.destination);
        event.response.finalURL = event.url.href;
      }
    });
  }
} catch (error) {
  legacyRuntimeImportError = String(error?.message || error);
  legacyVortex = null;
}

function enableLegacyVortex() {
  if (!legacyRuntimeLoaded || !legacyVortex) {
    throw new Error(`Legacy Vortex runtime failed during service-worker startup: ${legacyRuntimeImportError || "unknown error"}`);
  }
  legacyEnabled = true;
  return legacyVortex;
}
const proxyMetrics = {
  scramjetRequests: 0,
  scramjetFailures: 0,
  legacyRequests: 0,
  legacyFailures: 0,
  sriStripped: 0,
  sriPreserved: 0,
  sriMismatchPrevented: 0,
  quirksModePrevented: 0,
  binaryResponses: 0,
  binaryHeaderAnomalies: 0
};


// Keep just enough routing state to recognize requests that escaped a rewritten
// Scramjet URL. A controlled proxied document gets a stable Client id; once we
// see that client's /~/sj/<controller>/ prefix we can rescue any later raw
// third-party subrequest back through the same Scramjet frame instead of
// accidentally issuing it as a native service-worker fetch.
const ROUTING_LOG_LIMIT = 50;
const routingLog = [];
const proxiedClientPrefixes = new Map();
const proxiedClientUpstreams = new Map();
let routingSequence = 0;
let currentProxyEngine = "scramjet";
let currentProxyTransport = "starting";

function extractScramjetPrefix(input) {
  if (!input) return null;
  try {
    const url = new URL(input, self.location.origin);
    if (url.origin !== self.location.origin) return null;
    const match = url.pathname.match(/^\/~\/sj\/[^/]+\/[^/]+\//);
    return match ? match[0] : null;
  } catch (_) {
    return null;
  }
}

function isNavigationRequest(request) {
  return request.mode === "navigate" || ["document", "iframe"].includes(request.destination);
}

// FetchEvent.clientId identifies the source Client that initiated the request.
// resultingClientId identifies the new Client created by a navigation. Never
// mark a Nova parent page as proxied merely because it created a Scramjet iframe.
function sourceClientIdsForEvent(event) {
  return [event.clientId || event.resultingClientId].filter(Boolean);
}

function resultingClientIdsForEvent(event) {
  if (isNavigationRequest(event.request) && event.resultingClientId) return [event.resultingClientId];
  return sourceClientIdsForEvent(event);
}

function hasAnyClientId(event) {
  return !!(event.clientId || event.resultingClientId);
}

function rememberScramjetClient(event, prefix, upstream) {
  if (!prefix) return;
  const ids = resultingClientIdsForEvent(event);
  for (const id of ids) {
    proxiedClientPrefixes.set(id, prefix);
    if (upstream && /^https?:/i.test(upstream)) proxiedClientUpstreams.set(id, upstream);
  }
  // A browser session should never approach this size, but bound stale ids so
  // an unusually long-lived worker cannot grow the maps forever.
  while (proxiedClientPrefixes.size > 200) {
    const id = proxiedClientPrefixes.keys().next().value;
    proxiedClientPrefixes.delete(id);
    proxiedClientUpstreams.delete(id);
  }
}

function forgetScramjetClient(event) {
  for (const id of resultingClientIdsForEvent(event)) {
    proxiedClientPrefixes.delete(id);
    proxiedClientUpstreams.delete(id);
  }
}

function proxiedContextForEvent(event) {
  const referrerPrefix = extractScramjetPrefix(event.request.referrer);
  if (referrerPrefix) return { prefix: referrerPrefix, source: "referrer" };
  for (const id of sourceClientIdsForEvent(event)) {
    const prefix = proxiedClientPrefixes.get(id);
    if (prefix) return { prefix, source: "client" };
  }
  return null;
}

function hasNovaShellReferrer(request) {
  if (!request.referrer) return false;
  try {
    const referrer = new URL(request.referrer);
    return referrer.origin === self.location.origin &&
      !referrer.pathname.startsWith("/~/sj/") &&
      !referrer.pathname.startsWith("/vortex/");
  } catch (_) {
    return false;
  }
}

async function resolveClientRoutingContext(event) {
  const known = proxiedContextForEvent(event);
  if (known) return { kind: "proxied", ...known };

  let sawClient = false;
  for (const id of sourceClientIdsForEvent(event)) {
    try {
      const client = await self.clients.get(id);
      if (!client) continue;
      sawClient = true;
      const prefix = extractScramjetPrefix(client.url);
      if (prefix) {
        proxiedClientPrefixes.set(id, prefix);
        return { kind: "proxied", prefix, source: "client-url", clientUrl: client.url };
      }
      try {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === self.location.origin) {
          return { kind: "nova", source: "client-url", clientUrl: client.url };
        }
      } catch (_) {}
    } catch (_) {}
  }
  return { kind: sawClient ? "other" : "unknown", source: "client-resolution" };
}

function decodeScramjetPhysicalUrl(input, prefix) {
  if (!input || !prefix) return "";
  try {
    const url = new URL(input, self.location.origin);
    if (url.origin !== self.location.origin || !url.pathname.startsWith(prefix)) return "";
    const encoded = url.pathname.slice(prefix.length);
    if (!encoded || encoded === "scramjet.wasm.js") return "";
    return decodeURIComponent(encoded);
  } catch (_) {
    return "";
  }
}

function isAbsoluteLogicalUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_) { return false; }
}

function logicalUrlFromPhysical(input, prefix) {
  const decoded = decodeScramjetPhysicalUrl(input, prefix);
  return isAbsoluteLogicalUrl(decoded) ? decoded : "";
}

async function upstreamBaseForEvent(event, context) {
  const prefix = context?.prefix || extractScramjetPrefix(event.request.referrer) || extractScramjetPrefix(event.request.url);
  if (!prefix) return "";

  const fromReferrer = logicalUrlFromPhysical(event.request.referrer, prefix);
  if (fromReferrer) return fromReferrer;

  for (const id of sourceClientIdsForEvent(event)) {
    const remembered = proxiedClientUpstreams.get(id);
    if (remembered && isAbsoluteLogicalUrl(remembered)) return remembered;
    try {
      const client = await self.clients.get(id);
      const decoded = logicalUrlFromPhysical(client?.url || "", prefix);
      if (decoded) {
        proxiedClientUpstreams.set(id, decoded);
        return decoded;
      }
    } catch (_) {}
  }
  return "";
}

function scramjetEventForTarget(event, prefix, targetUrl) {
  const target = new URL(targetUrl);
  target.hash = "";
  const rewrittenUrl = new URL(prefix + encodeURIComponent(target.href), self.location.origin).href;
  const request = new Proxy(event.request, {
    get(targetRequest, property) {
      if (property === "url") return rewrittenUrl;
      const value = Reflect.get(targetRequest, property, targetRequest);
      return typeof value === "function" ? value.bind(targetRequest) : value;
    }
  });
  return {
    request,
    clientId: event.clientId,
    resultingClientId: event.resultingClientId,
    waitUntil(promise) { return event.waitUntil(promise); }
  };
}

async function recoverRelativeScramjetEvent(event, prefix) {
  let requestUrl;
  try { requestUrl = new URL(event.request.url); } catch (_) { return event; }
  const physicalTail = requestUrl.pathname.slice(prefix.length);
  if (!physicalTail || physicalTail === "scramjet.wasm.js") return event;

  let decodedTail;
  try { decodedTail = decodeURIComponent(physicalTail); } catch (_) { return event; }
  if (/^(?:https?:|blob:|data:|javascript:|mailto:|tel:|about:)/i.test(decodedTail)) {
    const logical = isAbsoluteLogicalUrl(decodedTail) ? decodedTail : "";
    if (logical && isNavigationRequest(event.request)) rememberScramjetClient(event, prefix, logical);
    return event;
  }

  const base = await upstreamBaseForEvent(event, { prefix });
  if (!base) return event;
  try {
    // A malformed physical path means the browser resolved a logical relative
    // URL against Nova's proxy URL. Re-apply that relative reference to the
    // original upstream document instead. A literal undefined navigation is a
    // common symptom of a missing original-route value; do not turn that into
    // an upstream /undefined route when the known upstream document is valid.
    const undefinedNavigation = isNavigationRequest(event.request) && /^(?:\/?undefined)$/i.test(decodedTail.trim());
    const relative = undefinedNavigation ? new URL(base).pathname + new URL(base).search + new URL(base).hash : decodedTail + requestUrl.search + requestUrl.hash;
    const target = new URL(relative || "/", base);
    const synthetic = scramjetEventForTarget(event, prefix, target.href);
    rememberScramjetClient(event, prefix, base);
    return synthetic;
  } catch (_) {
    return event;
  }
}

async function escapedSameOriginTarget(event, context) {
  const base = await upstreamBaseForEvent(event, context);
  if (!base) return "";
  try {
    const novaUrl = new URL(event.request.url);
    return new URL(novaUrl.pathname + novaUrl.search + novaUrl.hash, base).href;
  } catch (_) { return ""; }
}

function recordRouting(event, classification, reason, details = {}) {
  const request = event.request;
  const context = details.context || proxiedContextForEvent(event);
  const entry = {
    id: ++routingSequence,
    at: Date.now(),
    url: request.url,
    rewrittenUrl: details.rewrittenUrl || "",
    destination: request.destination || "",
    mode: request.mode || "",
    method: request.method || "GET",
    referrer: request.referrer || "",
    initiator: details.initiator || decodeScramjetPhysicalUrl(request.referrer, context?.prefix) || "",
    classification,
    reason,
    engine: currentProxyEngine,
    transport: currentProxyTransport,
    timestamp: new Date().toISOString(),
    responseStatus: null,
    contentType: null,
    contentEncoding: null,
    error: null,
    errorClass: null,
    provenance: details.provenance || (classification === "scramjet" ? "scramjet-controller" : classification === "legacy" ? "vortex-worker" : classification === "nova-media" ? "native-media" : "native-nova"),
    receivedByteLength: null,
    declaredContentLength: null,
    upstreamContentType: null,
    upstreamContentEncoding: null,
    downstreamContentType: null,
    downstreamContentEncoding: null,
    rewritten: ["document", "iframe", "script", "style", "worker", "sharedworker"].includes(request.destination || "")
  };
  routingLog.push(entry);
  if (routingLog.length > ROUTING_LOG_LIMIT) routingLog.splice(0, routingLog.length - ROUTING_LOG_LIMIT);

  const id = event.clientId || event.resultingClientId;
  if (!entry.initiator && id) {
    try {
      event.waitUntil(Promise.resolve(self.clients.get(id)).then(client => {
        if (!client) return;
        const prefix = extractScramjetPrefix(client.url) || context?.prefix;
        entry.initiator = decodeScramjetPhysicalUrl(client.url, prefix) || client.url || "";
      }).catch(() => {}));
    } catch (_) {}
  }
  return entry;
}


function finalizeRouting(entry, response, error) {
  if (!entry) return response;
  if (error) { entry.error = String(error?.message || error).slice(0, 500); entry.errorClass = String(error?.name || "Error").slice(0, 80); }
  if (response instanceof Response) {
    entry.responseStatus = response.status;
    entry.contentType = response.headers.get("content-type") || "";
    entry.contentEncoding = response.headers.get("content-encoding") || "";
    entry.downstreamContentType = entry.contentType;
    entry.downstreamContentEncoding = entry.contentEncoding;
    const declared = response.headers.get("content-length");
    entry.declaredContentLength = declared && /^\d+$/.test(declared) ? Number(declared) : null;
    const fetchError = response.headers.get("x-nova-fetch-error");
    if (fetchError && !entry.error) entry.error = fetchError.slice(0, 500);
  }
  return response;
}

async function withRoutingResult(entry, responsePromise) {
  try {
    const response = await responsePromise;
    if (!(response instanceof Response)) throw new Error("Proxy route did not resolve to a Response");
    return finalizeRouting(entry, response);
  } catch (error) {
    finalizeRouting(entry, null, error);
    throw error;
  }
}

function isApprovedNovaR2(request) {
  try {
    const hostname = new URL(request.url).hostname.toLowerCase();
    return hostname === "pub-3e1e8c105d3843dda7206f2b3d9801da.r2.dev" ||
      hostname.endsWith(".r2.dev") ||
      hostname.endsWith(".r2.cloudflarestorage.com");
  } catch (_) {
    return false;
  }
}

function shouldUseNativeMedia(request, proxiedContext) {
  // R2 is Nova-controlled. Preserve its Range path for Movies even if the media
  // element lives in a controlled frame. For other media hosts, only bypass the
  // proxy when the request comes from Nova itself, never from a proxied page.
  if (isApprovedNovaR2(request)) {
    return request.destination === "video" || request.destination === "audio" || request.headers.has("range") || !proxiedContext;
  }
  return !proxiedContext && (request.destination === "video" || request.destination === "audio");
}

async function safeNativeFetch(request, status = 503, label = "Nova request failed") {
  try {
    const response = await fetch(request);
    if (response instanceof Response) return response;
    throw new Error("Native fetch did not return a Response");
  } catch (error) {
    return new Response(label, {
      status,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Nova-Fetch-Error": String(error?.message || error).slice(0, 180)
      }
    });
  }
}

function externalScramjetEvent(event, prefix) {
  return scramjetEventForTarget(event, prefix, event.request.url);
}

async function handleEscapedThirdParty(event, context) {
  const synthetic = externalScramjetEvent(event, context.prefix);
  rememberScramjetClient(event, context.prefix);
  if (!$scramjetController.shouldRoute(synthetic)) {
    const isNavigation = event.request.mode === "navigate" || ["document", "iframe"].includes(event.request.destination);
    if (isNavigation) {
      try { event.waitUntil(notifyRouteFailure(synthetic, "Scramjet route is not ready for rescued third-party request", 503)); } catch (_) {}
    }
    return new Response("Scramjet route is not ready", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
  return handleScramjet(synthetic);
}


async function handleCrossOriginRequest(event) {
  const resolution = await resolveClientRoutingContext(event);
  const context = resolution.kind === "proxied" ? resolution : null;

  if (shouldUseNativeMedia(event.request, context)) {
    const entry = recordRouting(event, "nova-media", isApprovedNovaR2(event.request) ? "approved Nova R2/native Range media bypass" : "Nova-owned native audio/video request", { context });
    return withRoutingResult(entry, safeNativeFetch(event.request, 502, "Nova media request failed."));
  }

  if (context) {
    const entry = recordRouting(event, "scramjet", "raw third-party request originated from a proxied document; rescued into Scramjet", { context });
    return withRoutingResult(entry, handleEscapedThirdParty(event, context));
  }

  if (resolution.kind === "nova") {
    // We had to claim this request while resolving a no-referrer/cold-worker
    // ambiguity. It is now proven to belong to Nova rather than a proxy frame.
    const entry = recordRouting(event, "nova-native", "verified Nova client after cold-worker resolution; native pass-through", { context: null });
    return withRoutingResult(entry, safeNativeFetch(event.request, 502, "Nova external request failed."));
  }

  // A controlled Client id existed but could not be resolved. Never turn that
  // ambiguity into a raw third-party fetch: it may be an escaped proxy request.
  const entry = recordRouting(event, "scramjet", "unresolved controlled client; blocked raw third-party fallthrough", { context: null });
  return withRoutingResult(entry, Promise.resolve(new Response("Nova could not safely classify this proxy request. Please retry.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
  })));
}

async function handleEscapedSameOrigin(event, context) {
  const target = await escapedSameOriginTarget(event, context);
  if (!target || !/^https?:/i.test(target)) {
    return new Response("Nova could not reconstruct this proxied relative URL. Please retry.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
  const synthetic = scramjetEventForTarget(event, context.prefix, target);
  rememberScramjetClient(event, context.prefix, await upstreamBaseForEvent(event, context));
  if (!$scramjetController.shouldRoute(synthetic)) {
    return new Response("Scramjet route is not ready", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
  return handleScramjet(synthetic);
}

function isNovaInternalForProxiedRequest(request) {
  try {
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return false;
    if (["/proxy/html/proxy-frame.html", "/proxy/html/proxy-frame.html", "/proxy/sw.js", "/proxy/config.js", "/proxy/store.js", "/website/html/verification-handoff.html", "/website/html/verification-handoff.html"].includes(url.pathname)) return true;
    if (url.pathname.startsWith("/api/")) return true;
    if (["/proxy/scramjet/", "/proxy/controller/", "/proxy/scramjet-utils/", "/proxy/transports/", "/proxy/proxy-transports/", "/proxy/baremux/", "/proxy/epoxy/"].some(prefix => url.pathname.startsWith(prefix))) return true;
    if (["/proxy/vortex.all.js", "/proxy/vortex.bundle.js", "/proxy/vortex.sync.js", "/proxy/vortex.wasm.wasm", "/proxy/epoxy.mjs", "/proxy/baremux-worker.js"].includes(url.pathname)) return true;
    if (url.pathname.startsWith("/proxy/js/nova-proxy-") || url.pathname === "/proxy/js/nova-proxy-compatibility.js") return true;
    return false;
  } catch (_) { return false; }
}

const NOVA_RUNTIME_PREFIXES = [
  "/api/", "/website/assets/", "/website/css/", "/website/js/", "/proxy/baremux/", "/proxy/epoxy/",
  "/proxy/scramjet/", "/proxy/controller/", "/proxy/scramjet-utils/", "/proxy/transports/", "/proxy/proxy-transports/"
];
const NOVA_RUNTIME_FILES = new Set([
  "/", "/index.html", "/website/html/index.html", "/proxy/html/proxy-frame.html", "/proxy/sw.js", "/proxy/config.js", "/proxy/store.js",
  "/website/data/games.json", "/website/data/apps.json", "/website/data/movies.json", "/website/data/info.json", "/website/data/whats-new.json", "/website/assets/favicon.webp",
  "/proxy/vortex.all.js", "/proxy/vortex.bundle.js", "/proxy/vortex.sync.js", "/proxy/vortex.wasm.wasm", "/proxy/epoxy.mjs", "/proxy/baremux-worker.js"
]);

const AD_DOMAINS = new Set([
  "doubleclick.net", "googlesyndication.com", "googleadservices.com", "adservice.google.com",
  "ads.google.com", "amazon-adsystem.com", "media.net", "outbrain.com", "taboola.com",
  "revcontent.com", "zergnet.com", "mgid.com", "popcash.net", "propellerads.com",
  "exoclick.com", "trafficjunky.net", "adnxs.com", "rubiconproject.com", "openx.net",
  "pubmatic.com", "criteo.com", "criteo.net", "appnexus.com", "advertising.com",
  "yieldmanager.com", "2mdn.net", "adsrvr.org", "casalemedia.com", "spotxchange.com",
  "spotx.tv", "ads.yahoo.com", "gemini.yahoo.com", "moatads.com", "adsafeprotected.com",
  "pagead2.googlesyndication.com", "tpc.googlesyndication.com", "securepubads.g.doubleclick.net",
  "static.doubleclick.net", "google-analytics.com", "analytics.google.com", "stats.g.doubleclick.net",
  "ssl.google-analytics.com", "hotjar.com", "mouseflow.com", "fullstory.com", "heap.io",
  "mixpanel.com", "segment.io", "segment.com", "amplitude.com", "kissmetrics.com", "clicktale.net",
  "crazyegg.com", "optimizely.com", "quantserve.com", "scorecardresearch.com", "comscore.com",
  "newrelic.com", "nr-data.net", "pingdom.net", "clarity.ms", "connect.facebook.net",
  "pixel.facebook.com", "graph.facebook.com", "platform.twitter.com", "syndication.twitter.com",
  "widgets.pinterest.com", "snap.licdn.com", "ad.linkedin.com"
]);

function isNovaRuntimeRequest(request) {
  try {
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return false;
    // Vortex must see its WASM bootstrap request only when legacy mode is in use.
    if (url.pathname === "/proxy/vortex.wasm.wasm") return false;
    return NOVA_RUNTIME_FILES.has(url.pathname) || NOVA_RUNTIME_PREFIXES.some(prefix => url.pathname.startsWith(prefix));
  } catch (_) {
    return false;
  }
}

function isScramjetPath(request) {
  try {
    const url = new URL(request.url);
    return url.origin === self.location.origin && url.pathname.startsWith("/~/sj/");
  } catch (_) {
    return false;
  }
}

function legacyTargetFromUrl(requestUrl) {
  if (requestUrl.origin !== self.location.origin || !requestUrl.pathname.startsWith("/vortex/")) return null;
  try { return new URL(decodeURIComponent(requestUrl.pathname.slice("/vortex/".length))); }
  catch (_) { return null; }
}

// R8.19: Vortex intentionally refuses decoded targets that point back at Nova's
// real origin. A handful of Nova-owned shell/runtime URLs can legitimately be
// encoded by the legacy frame during startup, though. Handle only those public
// static/runtime GETs natively before they reach Vortex; never expose /api/,
// verification, or arbitrary same-origin URLs to a proxied site.
function isSafeLegacySameOriginTarget(target, request) {
  if (!target || target.origin !== self.location.origin) return false;
  if (!request || !["GET", "HEAD"].includes(String(request.method || "GET").toUpperCase())) return false;
  const path = target.pathname;
  if (["/", "/index.html", "/website/html/index.html", "/proxy/html/proxy-frame.html", "/proxy/config.js", "/proxy/store.js", "/website/assets/favicon.webp",
       "/website/data/games.json", "/website/data/apps.json", "/website/data/movies.json", "/website/data/info.json", "/website/data/whats-new.json",
       "/proxy/vortex.all.js", "/proxy/vortex.bundle.js", "/proxy/vortex.sync.js", "/proxy/vortex.wasm.wasm", "/proxy/epoxy.mjs", "/proxy/baremux-worker.js"].includes(path)) return true;
  return ["/website/assets/", "/website/css/", "/website/js/", "/proxy/baremux/", "/proxy/epoxy/", "/proxy/scramjet/", "/proxy/controller/",
          "/proxy/scramjet-utils/", "/proxy/transports/", "/proxy/proxy-transports/"].some(prefix => path.startsWith(prefix));
}

async function handleSafeLegacySameOriginTarget(event, target) {
  const headers = new Headers(event.request.headers);
  // Do not forward proxy-derived authorization/cookie headers into Nova. Native
  // same-origin fetch will attach only the browser's normal credentials policy.
  headers.delete("authorization");
  headers.delete("cookie");
  headers.delete("origin");
  headers.delete("referer");
  return fetch(target.href, {
    method: event.request.method,
    headers,
    credentials: "same-origin",
    redirect: "follow",
    cache: event.request.cache === "only-if-cached" ? "default" : event.request.cache
  });
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function proxyErrorResponse(requestUrl) {
  const safeUrl = escapeHtml(requestUrl);
  const body = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nova connection error</title><style>html{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#05050c;color:#eeeef6;font-family:system-ui,sans-serif}.panel{width:min(620px,calc(100vw - 40px));padding:32px;border:1px solid #2d2d52;border-radius:14px;background:#0b0b18}h1{margin:0 0 12px;font-size:24px}p{color:#aaaac4;line-height:1.6;overflow-wrap:anywhere}</style></head><body><main class="panel"><h1>Nova could not open this page</h1><p>The proxy could not reach <strong>${safeUrl}</strong>. Check the address and try again.</p></main></body></html>`;
  return new Response(body, {
    status: 502,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

async function authHandoffResponse() {
  try {
    return await fetch(new URL("/website/html/verification-handoff.html", self.location.origin), {
      cache: "no-store",
      redirect: "error"
    });
  } catch (_) {
    return new Response("Open this verification address directly in your browser.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
}

function isAdDomain(hostname) {
  const normalized = hostname.replace(/^www\./, "");
  if (AD_DOMAINS.has(normalized)) return true;
  const labels = normalized.split(".");
  for (let index = 1; index < labels.length - 1; index++) {
    if (AD_DOMAINS.has(labels.slice(index).join("."))) return true;
  }
  return false;
}

function attachRawResponse(response) {
  const rawHeaders = Object.fromEntries(response.headers.entries());
  response.rawHeaders = rawHeaders;
  response.rawResponse = { body: response.body, headers: rawHeaders, status: response.status, statusText: response.statusText };
  return response;
}

function blockedResponse(destination) {
  if (["script", "worker", "sharedworker"].includes(destination)) {
    return attachRawResponse(new Response("", { status: 200, headers: { "Content-Type": "application/javascript; charset=utf-8" } }));
  }
  if (destination === "style") {
    return attachRawResponse(new Response("", { status: 200, headers: { "Content-Type": "text/css; charset=utf-8" } }));
  }
  if (["image", "imageset"].includes(destination)) {
    const transparentGif = new Uint8Array([
      71,73,70,56,57,97,1,0,1,0,128,0,0,0,0,0,255,255,255,33,249,4,0,0,0,0,0,44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,59
    ]);
    return attachRawResponse(new Response(transparentGif, { status: 200, headers: { "Content-Type": "image/gif" } }));
  }
  return attachRawResponse(new Response("", { status: 204 }));
}

async function notifyRouteFailure(event, message, status) {
  const payload = {
    type: "nova_proxy_route_failure",
    message: String(message || "Scramjet route failure").slice(0, 500),
    status: Number(status || 0),
    path: new URL(event.request.url).pathname
  };
  const id = event.clientId || event.resultingClientId;
  if (id) {
    const client = await self.clients.get(id);
    if (client) {
      client.postMessage(payload);
      return;
    }
  }
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) client.postMessage(payload);
}

function isBinaryContentType(contentType, requestUrl = "") {
  const ct = String(contentType || "").split(";", 1)[0].trim().toLowerCase();
  if (ct.startsWith("font/") || ct.startsWith("image/") || ct.startsWith("video/") || ct.startsWith("audio/")) return true;
  if (["application/font-woff", "application/font-sfnt", "application/vnd.ms-fontobject", "application/octet-stream", "application/wasm"].includes(ct)) return true;
  try { return /\.(?:woff2?|ttf|otf|eot|wasm|png|jpe?g|gif|webp|avif|svgz|mp4|webm|m4a|mp3|ogg)(?:$|[?#])/i.test(new URL(requestUrl).pathname); }
  catch (_) { return false; }
}

function stripProxiedSriFromHtml(html) {
  // R8.16: Chromium can begin fetching parser-discovered resources before any
  // page-side hook runs. Keep a deliberately empty integrity attribute on the
  // final serialized element (which disables SRI metadata) and remove only the
  // Scramjet shadow copy. This is more robust than deleting the attribute and
  // letting a reflected-property path re-materialize the original hash.
  let stripped = 0;
  let output = String(html).replace(/\s+scramjet-attr-integrity\s*=\s*(?:(["'])(.*?)\1|([^\s>]+))/gi, () => {
    stripped += 1;
    return "";
  });
  output = output.replace(/\s+integrity\s*=\s*(?:(["'])(.*?)\1|([^\s>]+))/gi, () => {
    stripped += 1;
    return ' integrity=""';
  });
  return { html: output, stripped };
}

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

function rebuildResponseSafely(body, response, headers = response.headers) {
  const status = Number(response?.status || 200);
  return new Response(NULL_BODY_STATUSES.has(status) ? null : body, {
    status,
    statusText: response?.statusText || "",
    headers
  });
}

async function hardenScramjetResponse(event, response) {
  if (!(response instanceof Response)) return response;
  const contentType = response.headers.get("content-type") || "";
  const isNavigation = isNavigationRequest(event.request);
  if (isBinaryContentType(contentType, event.request.url)) {
    proxyMetrics.binaryResponses += 1;
    const encoding = response.headers.get("content-encoding") || "";
    const length = response.headers.get("content-length") || "";
    if (encoding || length) proxyMetrics.binaryHeaderAnomalies += 1;

    // R8.11: libcurl/proxy-transports expose a JavaScript response stream. At
    // this point the bytes in that stream are the authoritative downstream
    // entity. Forwarding upstream transfer/encoding lengths can make Chromium
    // truncate or reinterpret fonts and other binary bodies (WOFF2 was the
    // visible failure). Preserve the body byte-for-byte and strip only metadata
    // that describes the upstream wire representation. Never text-decode binary.
    const headers = new Headers(response.headers);
    // R8.15: the transport boundary now decides whether Content-Encoding still
    // describes the bytes. Preserve it here when present; removing it from raw
    // Epoxy entity bytes makes Chromium feed compressed data to the font parser.
    headers.delete("content-length");
    headers.delete("content-range");
    headers.delete("accept-ranges");
    headers.delete("transfer-encoding");
    headers.set("x-nova-proxy-binary", "byte-safe");
    return rebuildResponseSafely(response.body, response, headers);
  }
  // R8.15: top-level/iframe navigations must be sanitized even when the
  // controller returned an absent or nonstandard Content-Type. If Chromium is
  // going to parse this response as a document, the final bytes are the last
  // authoritative place to guarantee stale SRI cannot reach the parser.
  if (!isNavigation && !/\btext\/html\b/i.test(contentType)) return response;

  let html;
  try { html = await response.text(); } catch (_) { return response; }
  let changed = false;
  if (!/^\s*<!doctype\s+html[\s>]/i.test(html)) {
    html = `<!doctype html>${html}`;
    proxyMetrics.quirksModePrevented += 1;
    changed = true;
  }
  const sri = stripProxiedSriFromHtml(html);
  if (sri.stripped) {
    html = sri.html;
    proxyMetrics.sriStripped += sri.stripped;
    proxyMetrics.sriMismatchPrevented += sri.stripped;
    changed = true;
  } else {
    proxyMetrics.sriPreserved += 1;
  }
  if (!changed) return rebuildResponseSafely(html, response, response.headers);
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("transfer-encoding");
  headers.set("content-type", contentType || "text/html; charset=utf-8");
  headers.set("x-nova-proxy-transformed", "html-compat");
  return rebuildResponseSafely(html, response, headers);
}

async function handleScramjet(event) {
  proxyMetrics.scramjetRequests += 1;
  try {
    let response = await $scramjetController.route(event);
    response = await hardenScramjetResponse(event, response);
    const isNavigation = event.request.mode === "navigate" || ["document", "iframe"].includes(event.request.destination);
    if (isNavigation && response.status === 500) {
      let text = "";
      try { text = await response.clone().text(); } catch (_) {}
      if (text.startsWith("Internal Service Worker Error:")) {
        proxyMetrics.scramjetFailures += 1;
        event.waitUntil(notifyRouteFailure(event, text, response.status));
      }
    }
    return response;
  } catch (error) {
    proxyMetrics.scramjetFailures += 1;
    event.waitUntil(notifyRouteFailure(event, error?.message || error, 500));
    return new Response("Internal Service Worker Error: " + (error?.message || String(error)), {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
}

function isLegacyVortexRequest(url) {
  return url.origin === self.location.origin && (url.pathname.startsWith("/vortex/") || url.pathname === "/proxy/vortex.wasm.wasm");
}

async function handleLegacyVortex(event) {
  if (!legacyEnabled || !legacyVortex) {
    return new Response("Nova legacy proxy is not enabled", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
  proxyMetrics.legacyRequests += 1;
  let requestUrl;
  try { requestUrl = new URL(event.request.url); } catch (_) { return fetch(event.request); }

  const proxiedTarget = legacyTargetFromUrl(requestUrl);

  // R8.19: keep Nova's own public shell/runtime requests out of Vortex's
  // same-origin leak guard. Everything else that decodes back to Nova remains
  // blocked, rather than weakening Vortex's security boundary.
  if (proxiedTarget?.origin === self.location.origin) {
    if (isSafeLegacySameOriginTarget(proxiedTarget, event.request)) {
      return handleSafeLegacySameOriginTarget(event, proxiedTarget);
    }
    proxyMetrics.legacyFailures += 1;
    return new Response("Nova blocked an unsafe same-origin legacy proxy request.", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }

  const compatibility = proxiedTarget ? self.NovaProxyCompatibility?.classify(proxiedTarget) : null;
  if (compatibility?.mode === "direct-auth" && ["document", "iframe"].includes(event.request.destination)) {
    return authHandoffResponse();
  }

  for (let attempt = 0; attempt < 30 && !legacyVortex.config; attempt++) {
    try { await legacyVortex.loadConfig(); } catch (_) {}
    if (!legacyVortex.config) await new Promise(resolve => setTimeout(resolve, 50));
  }
  if (!legacyVortex.config || typeof legacyVortex.config.prefix !== "string") {
    proxyMetrics.legacyFailures += 1;
    const error = new Error("Legacy Vortex configuration is unavailable");
    if (event.request.mode === "navigate" || ["document", "iframe"].includes(event.request.destination)) {
      event.waitUntil(notifyRouteFailure(event, error.message, 502));
    }
    return proxyErrorResponse(event.request.url);
  }
  if (!legacyVortex.route(event)) return fetch(event.request);
  try {
    return await legacyVortex.fetch(event);
  } catch (error) {
    proxyMetrics.legacyFailures += 1;
    if (event.request.mode === "navigate" || ["document", "iframe"].includes(event.request.destination)) {
      event.waitUntil(notifyRouteFailure(event, error?.message || error, 502));
    }
    return proxyErrorResponse(event.request.url);
  }
}

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    // One-time proxy migration cleanup: only remove caches that clearly belong
    // to old Vortex/BareMux proxy runtimes. Do not wipe Nova app/user caches.
    try {
      const names = await caches.keys();
      await Promise.all(names.filter(name => /vortex|baremux|nova[-_:]?proxy[-_:]?legacy|20260822-sj2067-r[67]/i.test(name) || (name.includes("20260822-sj2067-r8") && !name.includes("20260822-sj2067-r8.19"))).map(name => caches.delete(name)));
    } catch (_) {}
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "nova_enable_legacy") {
    try {
      enableLegacyVortex();
      event.ports[0]?.postMessage({ ready: true, legacyRuntimeLoaded, legacyVortexLoaded: !!legacyVortex, legacyServiceWorkerReady: !!legacyVortex, legacyRuntimeImportError });
    } catch (error) {
      event.ports[0]?.postMessage({ ready: false, legacyRuntimeLoaded, legacyVortexLoaded: !!legacyVortex, legacyServiceWorkerReady: false, legacyRuntimeImportError, error: String(error?.message || error) });
    }
    return;
  }
  if (event.data && event.data.type === "nova_disable_legacy") {
    legacyEnabled = false;
    event.ports[0]?.postMessage({ ready: true, legacyRuntimeLoaded, legacyVortexLoaded: !!legacyVortex, legacyServiceWorkerReady: false });
    return;
  }
  if (event.data && event.data.type === "nova_vortex_config_check") {
    event.waitUntil((async () => {
      if (!legacyEnabled || !legacyVortex) {
        event.ports[0]?.postMessage({ ready: false });
        return;
      }
      try { await legacyVortex.loadConfig(); } catch (_) {}
      event.ports[0]?.postMessage({ ready: !!legacyVortex.config && typeof legacyVortex.config.prefix === "string" });
    })());
    return;
  }
  if (event.data && event.data.type === "nova_adblock") {
    adblockEnabled = !!event.data.enabled;
    return;
  }
  if (event.data && event.data.type === "nova_proxy_transport_state") {
    currentProxyEngine = String(event.data.engine || currentProxyEngine).slice(0, 40);
    currentProxyTransport = String(event.data.transport || currentProxyTransport).slice(0, 40);
    return;
  }
  if (event.data && event.data.type === "nova_proxy_routing_log") {
    event.ports[0]?.postMessage({ requests: routingLog.slice(-ROUTING_LOG_LIMIT) });
    return;
  }
  if (event.data && event.data.type === "nova_proxy_metrics") {
    event.ports[0]?.postMessage({ ...proxyMetrics });
  }
});

self.addEventListener("fetch", event => {
  let url;
  try {
    url = new URL(event.request.url);
  } catch (_) {
    recordRouting(event, "nova-native", "unparseable request URL; service worker leaves it to the browser");
    return;
  }

  // /~/sj/ is exclusively Scramjet-owned. Seeing one also teaches the worker
  // which controlled Client belongs to this controller/frame, allowing escaped
  // cross-origin subrequests from that Client to be rescued later.
  if (url.origin === self.location.origin && url.pathname.startsWith("/~/sj/")) {
    const prefix = extractScramjetPrefix(url.href);
    const logical = logicalUrlFromPhysical(url.href, prefix);
    rememberScramjetClient(event, prefix, isNavigationRequest(event.request) ? logical : logicalUrlFromPhysical(event.request.referrer, prefix));
    const entry = recordRouting(event, "scramjet", logical ? "same-origin Scramjet proxy path" : "Scramjet relative path recovery", { context: { prefix, source: "request" } });
    event.respondWith(withRoutingResult(entry, (async () => {
      const routedEvent = await recoverRelativeScramjetEvent(event, prefix);
      entry.rewrittenUrl = routedEvent.request.url;
      if ($scramjetController.shouldRoute(routedEvent)) return handleScramjet(routedEvent);
      return new Response("Scramjet route is not ready", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
      });
    })()));
    return;
  }

  if (url.origin === self.location.origin && isLegacyVortexRequest(url) && legacyEnabled) {
    const entry = recordRouting(event, "legacy", "legacy Vortex fallback path");
    event.respondWith(withRoutingResult(entry, handleLegacyVortex(event).catch(error => new Response("Nova legacy proxy failed to open this page: " + String(error?.message || error), {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    }))));
    return;
  }

  const proxiedContext = proxiedContextForEvent(event);

  if (url.origin === self.location.origin) {
    if (proxiedContext && !isNovaInternalForProxiedRequest(event.request)) {
      const entry = recordRouting(event, "scramjet", "same-origin URL escaped from a proxied document; reconstructed against upstream base", { context: proxiedContext });
      event.respondWith(withRoutingResult(entry, handleEscapedSameOrigin(event, proxiedContext)));
      return;
    }
    if (event.request.mode === "navigate" || ["document", "iframe"].includes(event.request.destination)) {
      forgetScramjetClient(event);
    }
    const entry = recordRouting(event, "nova-native", isNovaRuntimeRequest(event.request) ? "Nova app/API/static runtime request" : "same-origin Nova request");
    event.respondWith(withRoutingResult(entry, safeNativeFetch(event.request, 503, "Nova is temporarily unable to load this resource.")));
    return;
  }
  if (proxiedContext) {
    if (shouldUseNativeMedia(event.request, proxiedContext)) {
      const entry = recordRouting(event, "nova-media", isApprovedNovaR2(event.request) ? "approved Nova R2/native Range media bypass" : "Nova-owned native audio/video request", { context: proxiedContext });
      event.respondWith(withRoutingResult(entry, safeNativeFetch(event.request, 502, "Nova media request failed.")));
    } else {
      const entry = recordRouting(event, "scramjet", "raw third-party request originated from a proxied document; rescued into Scramjet", { context: proxiedContext });
      event.respondWith(withRoutingResult(entry, handleEscapedThirdParty(event, proxiedContext)));
    }
    return;
  }

  // A normal Nova page can make its own cross-origin requests. When its
  // same-origin referrer proves the request is not from a proxy frame, leave
  // the request to the browser instead of performing a root-worker fetch.
  if (hasNovaShellReferrer(event.request)) {
    if (shouldUseNativeMedia(event.request, null)) {
      const entry = recordRouting(event, "nova-media", isApprovedNovaR2(event.request) ? "approved Nova R2/native Range media bypass" : "Nova-owned native audio/video request");
      event.respondWith(withRoutingResult(entry, safeNativeFetch(event.request, 502, "Nova media request failed.")));
    } else {
      recordRouting(event, "nova-native", "cross-origin request has a verified Nova referrer; service worker does not intercept");
    }
    return;
  }

  // A service-worker restart clears the in-memory Client→frame map. If a Client
  // id exists, resolve its current URL before deciding whether a cross-origin
  // request is Nova traffic or an escaped proxied-page subrequest. This closes
  // the cold-worker race that previously let Google/Epic assets bypass Scramjet.
  if (hasAnyClientId(event)) {
    event.respondWith(handleCrossOriginRequest(event));
    return;
  }

  if (shouldUseNativeMedia(event.request, null)) {
    const entry = recordRouting(event, "nova-media", isApprovedNovaR2(event.request) ? "approved Nova R2/native Range media bypass" : "Nova-owned native audio/video request");
    event.respondWith(withRoutingResult(entry, safeNativeFetch(event.request, 502, "Nova media request failed.")));
    return;
  }

  // No controlled Client means there is no evidence this belongs to a proxied
  // document. Do not claim it merely because this root worker observed it.
  recordRouting(event, "nova-native", "cross-origin request has no controlled proxied client; service worker does not intercept");
});
