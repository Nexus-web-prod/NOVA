(() => {
  "use strict";

  const WISP_URL = self.__NOVA_WISP_URL || "wss://unified-wisp-epoxy.fly.dev/wisp/";
  const store = {
    url: "https://google.com",
    wispurl: WISP_URL,
    bareurl: null,
    proxy: "scramjet",
    transport: "libcurl"
  };

  self.store = store;

  if (!self.NovaProxyManager) {
    const error = new Error("NovaProxyManager failed to load");
    console.error("[Nova]", error);
    self.novaProxyReady = Promise.reject(error);
    return;
  }

  self.novaProxyReady = self.NovaProxyManager.bootstrap().then(() => {
    const state = self.NovaProxyManager.getState();
    store.proxy = state.currentEngine;
    store.transport = state.currentTransport;
    return true;
  }).catch(error => {
    console.error("[Nova] Proxy failed to initialize:", error);
    throw error;
  });

  self.NovaProxyManager.subscribe(state => {
    store.proxy = state.currentEngine;
    store.transport = state.currentTransport;
    store.wispurl = state.wispEndpoint;
  });
})();
