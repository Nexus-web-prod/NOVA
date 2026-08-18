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

  // Dreamland expects its persisted graph format, not a raw URL or ordinary
  // JSON object. Remove legacy/corrupt values before constructing the store.
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !parsed[0]?.values) {
        localStorage.removeItem(STORE_KEY);
      }
    }
  } catch (_) {
    localStorage.removeItem(STORE_KEY);
  }

  const safeLocalBacking = {
    read(key) {
      const saved = localStorage.getItem(key);
      if (saved === null) return null;
      try {
        const graph = JSON.parse(saved);
        if (!graph || typeof graph !== "object" || Array.isArray(graph) || !graph[0]?.values) {
          throw new TypeError("Invalid Nova proxy store");
        }
        return saved;
      } catch (_) {
        localStorage.removeItem(key);
        return null;
      }
    },
    write(key, value) {
      localStorage.setItem(key, value);
    }
  };

  function createStore() {
    return $store(INITIAL_STATE(), {
      ident: STORE_KEY,
      backing: safeLocalBacking,
      autosave: "auto"
    });
  }

  let store;
  try {
    store = createStore();
  } catch (error) {
    localStorage.removeItem(STORE_KEY);
    store = createStore();
    console.info("[Nova] Recovered damaged proxy settings.");
  }

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
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Proxy service worker did not take control")), 10000);
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          clearTimeout(timeout);
          resolve();
        }, { once: true });
      });
    }
    await vortex.init();
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

  self.novaProxyReady = Promise.all([prepareServiceWorker(), applyTransport()]).then(() => true).catch((err) => {
    console.error("[Nova] Proxy failed to initialize:", err);
    throw err;
  });
  if (typeof store.$on === "function") {
    store.$on("wispurl", () => applyTransport().catch((err) => console.error("[Nova] Failed to update proxy transport:", err)));
    store.$on("transport", () => applyTransport().catch((err) => console.error("[Nova] Failed to update proxy transport:", err)));
  }
})();
