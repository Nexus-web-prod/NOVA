/**
 * nova-update.js — Auto-update without manual hard refresh.
 * Loaded immediately after nova-db-shim.js (cache-busted on each deploy).
 */
(function () {
  "use strict";

  var BUILD_STAMP = "nova-7-20260825-stability-r1";
  var STAMP_KEY = "nova_build_stamp";
  var RELOAD_DONE_KEY = "nova_build_reload_done";

  window.__NOVA_BUILD_STAMP = BUILD_STAMP;

  function clearCaches() {
    if (!("caches" in window)) return Promise.resolve();
    return caches.keys().then(function (names) {
      return Promise.all(names.map(function (k) { return caches.delete(k); }));
    });
  }

  function unregisterServiceWorkers() {
    if (!navigator.serviceWorker) return Promise.resolve();
    return navigator.serviceWorker.getRegistrations().then(function (regs) {
      return Promise.all(regs.map(function (r) { return r.unregister(); }));
    });
  }

  /** One-time reload when deploy stamp changes — clears SW + HTTP cache, then reloads. */
  function runBuildStampUpdate() {
    if (sessionStorage.getItem(RELOAD_DONE_KEY) === BUILD_STAMP) {
      try { localStorage.setItem(STAMP_KEY, BUILD_STAMP); } catch (e) {}
      return false;
    }
    if (localStorage.getItem(STAMP_KEY) === BUILD_STAMP) return false;

    sessionStorage.setItem(RELOAD_DONE_KEY, BUILD_STAMP);
    unregisterServiceWorkers()
      .then(clearCaches)
      .then(function () { location.reload(); })
      .catch(function () { location.reload(); });
    return true;
  }

  if (runBuildStampUpdate()) return;

  // Proxy/service-worker updates are intentionally tied to BUILD_STAMP. Keeping
  // one update authority prevents duplicate reload listeners and reload loops.
})();
