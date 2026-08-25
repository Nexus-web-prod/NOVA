const NOVA_WISP_URL = "wss://unified-wisp-epoxy.fly.dev/wisp/";

self.__NOVA_WISP_URL = NOVA_WISP_URL;
self.__NOVA_EPOXY_WISP = NOVA_WISP_URL;
self.__NOVA_PROXY_WISP = NOVA_WISP_URL;

self._CONFIG = {
  wispurl: NOVA_WISP_URL,
  bareurl: null,
  proxy: "scramjet",
  transport: "libcurl",
  transportModule: "/proxy/transports/libcurl/index.mjs",
  fallbackTransport: "epoxy",
  fallbackTransportModule: "/proxy/transports/epoxy/index.mjs",
  legacyTransport: "/proxy/epoxy.mjs?v=20260822-sj2067-r8.19"
};
