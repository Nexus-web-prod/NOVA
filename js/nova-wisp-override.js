(() => {
  "use strict";

  const WISP_URL = "wss://unified-wisp-epoxy.fly.dev/wisp/";

  window.__NOVA_WISP_URL = WISP_URL;
  window.__NOVA_EPOXY_WISP = WISP_URL;
  window.__NOVA_PROXY_WISP = WISP_URL;

  function forceWispOptions(options) {
    if (Array.isArray(options)) {
      return options.map((item) => (
        item && typeof item === "object"
          ? { ...item, wisp: WISP_URL, wispUrl: WISP_URL, url: item.wisp || item.wispUrl ? WISP_URL : item.url }
          : item
      ));
    }
    if (options && typeof options === "object") {
      return { ...options, wisp: WISP_URL, wispUrl: WISP_URL };
    }
    return [{ wisp: WISP_URL }];
  }

  function patchBareMux() {
    const ctor = window.BareMux && window.BareMux.BareMuxConnection;
    if (!ctor || !ctor.prototype || ctor.prototype.__novaWispPatched) return;
    const original = ctor.prototype.setTransport;
    if (typeof original !== "function") return;
    ctor.prototype.setTransport = function setTransportWithNovaWisp(transport, options) {
      return original.call(this, transport, forceWispOptions(options));
    };
    ctor.prototype.__novaWispPatched = true;
  }

  patchBareMux();
  document.addEventListener("DOMContentLoaded", patchBareMux);
  window.addEventListener("load", patchBareMux);
  setTimeout(patchBareMux, 250);
  setTimeout(patchBareMux, 1000);
})();
