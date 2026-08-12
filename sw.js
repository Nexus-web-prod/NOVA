"use strict";

if (navigator.userAgent.includes("Firefox")) {
  Object.defineProperty(globalThis, "crossOriginIsolated", { value: true, writable: false });
}

importScripts("/vortex.all.js?v=1782061202");

const { VortexServiceWorker } = $vortexLoadWorker();
const vortex = new VortexServiceWorker();
let adblockEnabled = false;

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

const NOVA_RUNTIME_PREFIXES = ["/api/", "/assets/", "/css/", "/js/", "/baremux/", "/epoxy/"];
const NOVA_RUNTIME_FILES = new Set([
  "/",
  "/index.html",
  "/sw.js",
  "/config.js",
  "/store.js",
  "/games.json",
  "/apps.json",
  "/movies.json",
  "/info.json",
  "/whats-new.json",
  "/favicon.webp",
  "/vortex.all.js",
  "/vortex.bundle.js",
  "/vortex.sync.js",
  "/vortex.wasm.wasm",
  "/epoxy.mjs",
  "/baremux-worker.js"
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
  "static.doubleclick.net", "google-analytics.com", "analytics.google.com",
  "stats.g.doubleclick.net", "ssl.google-analytics.com", "hotjar.com", "mouseflow.com",
  "fullstory.com", "heap.io", "mixpanel.com", "segment.io", "segment.com", "amplitude.com",
  "kissmetrics.com", "clicktale.net", "crazyegg.com", "optimizely.com", "quantserve.com",
  "scorecardresearch.com", "comscore.com", "newrelic.com", "nr-data.net", "pingdom.net",
  "clarity.ms", "connect.facebook.net", "pixel.facebook.com", "graph.facebook.com",
  "platform.twitter.com", "syndication.twitter.com", "widgets.pinterest.com",
  "snap.licdn.com", "ad.linkedin.com"
]);

function isNovaRuntimeRequest(request) {
  try {
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return false;
    return NOVA_RUNTIME_FILES.has(url.pathname)
      || NOVA_RUNTIME_PREFIXES.some(prefix => url.pathname.startsWith(prefix));
  } catch {
    return false;
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

function blockedResponse(destination) {
  if (["script", "worker", "sharedworker"].includes(destination)) {
    return attachRawResponse(new Response("", {
      status: 200,
      headers: { "Content-Type": "application/javascript; charset=utf-8" }
    }));
  }
  if (destination === "style") {
    return attachRawResponse(new Response("", {
      status: 200,
      headers: { "Content-Type": "text/css; charset=utf-8" }
    }));
  }
  if (["image", "imageset"].includes(destination)) {
    const transparentGif = new Uint8Array([
      71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255, 255,
      33, 249, 4, 0, 0, 0, 0, 0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59
    ]);
    return attachRawResponse(new Response(transparentGif, {
      status: 200,
      headers: { "Content-Type": "image/gif" }
    }));
  }
  return attachRawResponse(new Response("", { status: 204 }));
}

function attachRawResponse(response) {
  const rawHeaders = Object.fromEntries(response.headers.entries());
  response.rawHeaders = rawHeaders;
  response.rawResponse = {
    body: response.body,
    headers: rawHeaders,
    status: response.status,
    statusText: response.statusText
  };
  return response;
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function proxyErrorResponse(requestUrl) {
  const safeUrl = escapeHtml(requestUrl);
  const body = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nova connection error</title><style>html{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#05050c;color:#eeeef6;font-family:system-ui,sans-serif}.panel{width:min(620px,calc(100vw - 40px));padding:32px;border:1px solid #2d2d52;border-radius:14px;background:#0b0b18}h1{margin:0 0 12px;font-size:24px}p{color:#aaaac4;line-height:1.6;overflow-wrap:anywhere}a{display:inline-block;margin-top:14px;padding:10px 16px;border:1px solid #55559a;border-radius:8px;background:#24244a;color:#fff;text-decoration:none}</style></head><body><main class="panel"><h1>Nova could not open this page</h1><p>The proxy could not reach <strong>${safeUrl}</strong>. Check the address and try again.</p><a href="">Try again</a></main></body></html>`;
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

async function handleRequest(event) {
  if (isNovaRuntimeRequest(event.request)) return fetch(event.request);

  await vortex.loadConfig();
  if (!vortex.route(event)) return fetch(event.request);

  try {
    return await vortex.fetch(event);
  } catch {
    return proxyErrorResponse(event.request.url);
  }
}

self.addEventListener("message", event => {
  if (event.data && event.data.type === "nova_adblock") {
    adblockEnabled = !!event.data.enabled;
  }
});

self.addEventListener("fetch", event => {
  event.respondWith(handleRequest(event));
});

vortex.addEventListener("request", event => {
  if (adblockEnabled && isAdDomain(event.url.hostname)) {
    event.response = blockedResponse(event.destination);
    event.response.finalURL = event.url.href;
  }
});
