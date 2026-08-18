(() => {
  "use strict";

  const cfg = self._CONFIG || {};
  const WISP_URL = cfg.wispurl || self.__NOVA_WISP_URL || "wss://unified-wisp-epoxy.fly.dev/wisp/";
  const TRANSPORT = cfg.transport || "/epoxy.mjs?v=5";
  // Changing this URL creates a fresh SharedWorker instead of reconnecting to
  // a retired proxy worker that can remain alive in another Nova tab.
  const BARE_MUX_WORKER = "/baremux/worker.js?v=5";
  const STORE_KEY = "nova-settings";
  const INITIAL_STATE = () => ({
    url: "https://google.com",
    wispurl: WISP_URL,
    bareurl: cfg.bareurl || null,
    proxy: "",
    transport: TRANSPORT
  });

  // Proxy transport values come from the deployed runtime config. The old
  // Dreamland-backed store repeatedly reloaded legacy values (including raw
  // URLs that were not valid JSON) and could corrupt proxy startup again.
  // Keep the runtime state in memory and remove that obsolete persisted graph.
  try { localStorage.removeItem(STORE_KEY); } catch (_) {}
  const store = INITIAL_STATE();

  store.wispurl = WISP_URL;
  store.transport = TRANSPORT;
  try {
    localStorage.setItem("bare-mux-path", BARE_MUX_WORKER);
  } catch (_) {}

  self.store = store;

  if (typeof $vortexLoadController === "undefined") {
    console.error("[Nova] Vortex failed to load. Proxy will not work.");
    return;
  }

  const { VortexController } = $vortexLoadController();
  const vortex = new VortexController({
    files: {
      wasm: "/vortex.wasm.wasm",
      all: "/vortex.all.js",
      sync: "/vortex.sync.js"
    },
    flags: {
      rewriterLogs: false,
      scramitize: false,
      cleanErrors: true,
      sourcemaps: false
    }
  });

  self.vortex = vortex;

  async function confirmWorkerConfig() {
    const controller = navigator.serviceWorker.controller;
    if (!controller) throw new Error("Proxy service worker is not controlling this page");
    for (let attempt = 0; attempt < 20; attempt++) {
      const ready = await new Promise((resolve) => {
        const channel = new MessageChannel();
        const timeout = setTimeout(() => resolve(false), 500);
        channel.port1.onmessage = (event) => {
          clearTimeout(timeout);
          resolve(!!event.data?.ready);
        };
        controller.postMessage({ type: "nova_vortex_config_check" }, [channel.port2]);
      });
      if (ready) return true;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error("Proxy configuration did not reach the service worker");
  }

  async function prepareServiceWorker() {
    if (!("serviceWorker" in navigator)) throw new Error("Service workers are unavailable");
    const hadController = !!navigator.serviceWorker.controller;
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    if (hadController) {
      reg.addEventListener("updatefound", () => {
        const next = reg.installing;
        if (!next) return;
        next.addEventListener("statechange", () => {
          if (next.state === "activated") window.location.reload();
        });
      });
    }
    setInterval(() => reg.update().catch(() => {}), 60000);
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      const reloadKey = "nova-sw-control-reload-v1";
      if (sessionStorage.getItem(reloadKey) !== "1") {
        sessionStorage.setItem(reloadKey, "1");
        const nextUrl = new URL(location.href);
        nextUrl.searchParams.delete("proxyReset");
        location.replace(nextUrl.toString());
        await new Promise(() => {});
      }
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Proxy service worker could not control this tab")), 20000);
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          clearTimeout(timeout);
          resolve();
        }, { once: true });
      });
    }
    sessionStorage.removeItem("nova-sw-control-reload-v1");
    await vortex.init();
    await confirmWorkerConfig();
    return true;
  }

  if (typeof BareMux === "undefined") {
    console.error("[Nova] BareMux failed to load. Browser proxy will be blank.");
    return;
  }

  const connection = new BareMux.BareMuxConnection(BARE_MUX_WORKER);

  async function applyTransport() {
    store.wispurl = WISP_URL;
    store.transport = TRANSPORT;
    console.debug("[Nova] Setting transport:", TRANSPORT, "->", WISP_URL);
    await connection.setTransport(TRANSPORT, [{ wisp: WISP_URL }]);
    return true;
  }

  // BareMux must own a live SharedWorker port before Vortex asks the service
  // worker to perform its first fetch. Starting these concurrently creates a
  // race where the service worker repeatedly waits for a port that does not
  // exist yet.
  self.novaProxyReady = applyTransport().then(prepareServiceWorker).then(() => true).catch((err) => {
    console.error("[Nova] Proxy failed to initialize:", err);
    throw err;
  });
  if (typeof store.$on === "function") {
    store.$on("wispurl", () => applyTransport().catch((err) => console.error("[Nova] Failed to update proxy transport:", err)));
    store.$on("transport", () => applyTransport().catch((err) => console.error("[Nova] Failed to update proxy transport:", err)));
  }
})();
