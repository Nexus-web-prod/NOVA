/**
 * Nova Ads — centralized, manual ad integration.
 *
 * Rules:
 * - Never serve Nova ads to Supernova users.
 * - Never serve ads in Browser/proxy, active gameplay, private, account, staff,
 *   checkout, support-ticket, voice, or social areas.
 * - Manual discovery-page placements only; Auto Ads are intentionally not enabled.
 * - AdSense is lazy-loaded only after entitlement state is server-verified.
 */
(function () {
  "use strict";

  var CONFIG = Object.freeze({
    version: "20260831-adsterra-r8",
    publisherId: "ca-pub-6082584609878503",
    productionNetwork: Object.freeze({
      hostname: "nova-7.pages.dev",
      containerId: "container-435f315cf07c1f3b07750aa1e9c321eb",
      scriptUrl: "https://pl31115444.profitableratecpmnetwork.com/435f315cf07c1f3b07750aa1e9c321eb/invoke.js",
      fillTimeoutMs: 15000,
      maxAttempts: 2
    }),
    slots: Object.freeze({
      home: null,
      games: null,
      "game-player": null,
      apps: null,
      movies: null,
      plans: null,
      settings: null
    })
  });

  var ALLOWED_PAGES = new Set(["home", "games", "game-player", "apps", "movies", "plans", "settings"]);
  var BLOCKED_PAGES = new Set([
    "browser", "game-detail", "supernova", "social", "admin", "dev", "support",
    "rewards", "login", "register", "account", "profile", "checkout", "payment",
    "voice", "moderation"
  ]);

  var state = {
    initialized: false,
    loadingScript: null,
    scriptLoaded: false,
    entitlementReady: false,
    currentPage: "home",
    renderEpoch: 0,
    navigationToken: 0,
    productionUnit: null
  };

  function getCurrentPage() {
    if (typeof window.novaGetCurrentPage === "function") {
      try {
        var runtimePage = window.novaGetCurrentPage();
        if (runtimePage) return runtimePage;
      } catch (_) {}
    }
    var active = document.querySelector(".page.active[id^='page-']");
    if (active) return active.id.slice(5);
    var nav = document.querySelector(".nav-tab.active[data-page]");
    return nav ? nav.dataset.page : state.currentPage || "home";
  }

  function hasSignedInAccount() {
    return !!(window.__novaV7User && window.__novaV7User.username);
  }

  function hasAdConsent() {
    return localStorage.getItem("nova_consent") === "accepted";
  }

  function isEntitlementReady() {
    var tier = window.NovaSupernovaTier;
    if (!hasSignedInAccount()) return true;
    return !!(tier && typeof tier.isServerVerified === "function" && tier.isServerVerified());
  }

  function userHasSupernova() {
    var tier = window.NovaSupernovaTier;
    if (!tier || typeof tier.isPro !== "function") return true;
    return !!tier.isPro();
  }

  function isPrivateOrPlayerState(page) {
    if (BLOCKED_PAGES.has(page)) return true;
    if (document.fullscreenElement) return true;
    if (document.body.classList.contains("game-playing") ||
        document.body.classList.contains("nova-game-playing") ||
        document.documentElement.classList.contains("game-playing")) return true;
    if (document.querySelector("#social-game-shell:not([hidden])")) return true;
    return false;
  }

  function isEligible(page) {
    page = page || state.currentPage || getCurrentPage();
    if (!hasAdConsent()) return false;
    if (!isEntitlementReady()) return false;
    if (userHasSupernova()) return false;
    if (!ALLOWED_PAGES.has(page)) return false;
    if (isPrivateOrPlayerState(page)) return false;
    return true;
  }

  function cleanupProductionUnit(unit) {
    if (!unit) return;
    if (unit._novaFillObserver) {
      try { unit._novaFillObserver.disconnect(); } catch (_) {}
      unit._novaFillObserver = null;
    }
    if (unit._novaFillTimer) {
      clearTimeout(unit._novaFillTimer);
      unit._novaFillTimer = null;
    }
    if (unit._novaRetryTimer) {
      clearTimeout(unit._novaRetryTimer);
      unit._novaRetryTimer = null;
    }
  }

  function destroyProductionUnit() {
    var unit = state.productionUnit;
    if (!unit) return;
    cleanupProductionUnit(unit);
    try { unit.remove(); } catch (_) {}
    state.productionUnit = null;
  }

  function collapseSlot(slot, preserveProduction) {
    if (!slot) return;
    var unit = slot.querySelector(".nova-production-ad-unit");
    if (unit && unit === state.productionUnit && preserveProduction !== false) {
      unit.remove();
    } else if (unit) {
      cleanupProductionUnit(unit);
    }
    slot.classList.remove("nova-ad-slot--active", "nova-ad-slot--loading");
    slot.classList.add("nova-ad-slot--collapsed");
    slot.replaceChildren();
    if (!document.querySelector(".nova-production-ad-unit[data-nova-ad-filled='true']")) {
      document.documentElement.classList.remove("nova-ads-active");
    }
  }

  function removeAll(options) {
    options = options || {};
    var destroyProduction = !!options.destroyProduction;
    state.renderEpoch++;

    document.querySelectorAll(".nova-ad-slot").forEach(function (slot) {
      var unit = slot.querySelector(".nova-production-ad-unit");
      if (unit && unit === state.productionUnit && !destroyProduction) {
        unit.remove();
      } else if (unit) {
        cleanupProductionUnit(unit);
      }
      slot.classList.remove("nova-ad-slot--active", "nova-ad-slot--loading");
      slot.classList.add("nova-ad-slot--collapsed");
      slot.replaceChildren();
    });

    if (destroyProduction) destroyProductionUnit();
    document.documentElement.classList.remove("nova-ads-active");
  }

  function removeAdSenseScript() {
    document.querySelectorAll("script[data-nova-adsense]").forEach(function (script) { script.remove(); });
    state.loadingScript = null;
  }

  function ensureSupernovaAdFree() {
    if (userHasSupernova() || !isEntitlementReady()) {
      removeAll({ destroyProduction: true });
      removeAdSenseScript();
      return true;
    }
    return false;
  }

  function loadAdSense() {
    if (!isEligible()) return Promise.resolve(false);
    if (state.scriptLoaded || window.adsbygoogle) {
      state.scriptLoaded = true;
      return Promise.resolve(true);
    }
    if (state.loadingScript) return state.loadingScript;
    state.loadingScript = new Promise(function (resolve) {
      var script = document.createElement("script");
      script.async = true;
      script.crossOrigin = "anonymous";
      script.dataset.novaAdsense = "true";
      script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(CONFIG.publisherId);
      script.onload = function () { state.scriptLoaded = true; resolve(true); };
      script.onerror = function () { state.loadingScript = null; resolve(false); };
      document.head.appendChild(script);
    });
    return state.loadingScript;
  }

  function collapseIfUnfilled(slot, ins, epoch) {
    window.setTimeout(function () {
      if (epoch !== state.renderEpoch || !slot.isConnected) return;
      var status = ins.getAttribute("data-ad-status");
      var hasFrame = !!ins.querySelector("iframe");
      if (status === "unfilled" || (!hasFrame && status !== "filled")) collapseSlot(slot, false);
    }, 7000);
  }

  function currentProductionPlacement(unit) {
    var slot = unit && unit.closest ? unit.closest(".nova-ad-slot") : null;
    var page = slot ? (slot.dataset.novaAdPage || "") : "";
    return { slot: slot, page: page };
  }

  function showProductionUnitInSlot(slot, page) {
    var unit = state.productionUnit;
    if (!unit || !slot) return false;

    slot.replaceChildren(unit);
    slot.classList.remove("nova-ad-slot--collapsed");
    slot.classList.add("nova-ad-slot--active");
    slot.classList.toggle("nova-ad-slot--loading", unit.dataset.novaAdFilled !== "true");
    unit.dataset.novaAdPage = page;

    if (unit.dataset.novaAdFilled === "true") {
      document.documentElement.classList.add("nova-ads-active");
    }
    return true;
  }

  function renderProductionNetwork(slot, page, attempt) {
    var network = CONFIG.productionNetwork;
    attempt = Number(attempt || 1);

    if (window.location.hostname !== network.hostname || !isEligible(page) || page !== state.currentPage) {
      collapseSlot(slot);
      return false;
    }

    // Adsterra's invoke runtime is effectively a one-unit-per-document runtime.
    // Once Nova has a live production unit, do not delete/re-run it on every
    // client-side page change. Move the same filled unit into the new eligible
    // slot instead. Re-running invoke.js repeatedly is what caused ads to flash
    // for a moment and then disappear after SPA navigation.
    if (state.productionUnit) {
      return showProductionUnitInSlot(slot, page);
    }

    slot.replaceChildren();
    slot.classList.remove("nova-ad-slot--collapsed");
    slot.classList.add("nova-ad-slot--active", "nova-ad-slot--loading");

    var label = document.createElement("div");
    label.className = "nova-ad-label";
    label.textContent = "Sponsored";

    var unit = document.createElement("div");
    unit.className = "nova-production-ad-unit";
    unit.dataset.novaAdFilled = "false";
    unit.dataset.novaAdAttempt = String(attempt);
    unit.dataset.novaAdProvider = "adsterra";
    unit.dataset.novaAdPage = page;
    state.productionUnit = unit;

    var container = document.createElement("div");
    container.id = network.containerId;

    var fillObserver = new MutationObserver(function () {
      if (!container.childElementCount) return;
      unit.dataset.novaAdFilled = "true";
      cleanupProductionUnit(unit);
      var placement = currentProductionPlacement(unit);
      if (!placement.slot || !isEligible(placement.page) || placement.page !== state.currentPage) return;
      placement.slot.classList.remove("nova-ad-slot--loading");
      document.documentElement.classList.add("nova-ads-active");
    });
    unit._novaFillObserver = fillObserver;
    fillObserver.observe(container, { childList: true, subtree: true });

    var script = document.createElement("script");
    script.async = true;
    script.dataset.cfasync = "false";
    script.dataset.novaProductionAd = "true";
    script.dataset.novaAdAttempt = String(attempt);
    script.src = network.scriptUrl;

    function retryOrCollapse(reason) {
      if (unit !== state.productionUnit) return;
      if (unit.dataset.novaAdFilled === "true" || container.childElementCount) return;

      var placement = currentProductionPlacement(unit);
      if (!placement.slot) return;
      if (!isEligible(placement.page) || placement.page !== state.currentPage) return;

      cleanupProductionUnit(unit);
      unit.dataset.novaAdFailure = reason || "no-fill";

      if (attempt < network.maxAttempts) {
        state.productionUnit = null;
        try { unit.remove(); } catch (_) {}
        window.setTimeout(function () {
          if (placement.slot.isConnected && isEligible(placement.page) && placement.page === state.currentPage) {
            renderProductionNetwork(placement.slot, placement.page, attempt + 1);
          }
        }, 900);
      } else {
        destroyProductionUnit();
        collapseSlot(placement.slot, false);
      }
    }

    script.onload = function () {
      unit._novaFillTimer = window.setTimeout(function () { retryOrCollapse("fill-timeout"); }, network.fillTimeoutMs);
    };
    script.onerror = function () { retryOrCollapse("script-error"); };

    unit.append(label, script, container);
    slot.append(unit);
    return true;
  }

  async function render(slot) {
    if (!(slot instanceof Element)) return false;
    var page = slot.dataset.novaAdPage || state.currentPage || getCurrentPage();
    if (!isEligible(page) || page !== state.currentPage) {
      collapseSlot(slot);
      return false;
    }

    if (window.location.hostname === CONFIG.productionNetwork.hostname) {
      return renderProductionNetwork(slot, page, 1);
    }

    var slotId = CONFIG.slots[page];
    if (!slotId) {
      slot.classList.add("nova-ad-slot--collapsed");
      return false;
    }

    var epoch = state.renderEpoch;
    var loaded = await loadAdSense();
    if (!loaded || epoch !== state.renderEpoch || !isEligible(page) || page !== state.currentPage) return false;

    slot.replaceChildren();
    slot.classList.remove("nova-ad-slot--collapsed");
    slot.classList.add("nova-ad-slot--active", "nova-ad-slot--loading");
    var label = document.createElement("div");
    label.className = "nova-ad-label";
    label.textContent = "Sponsored";
    var ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.display = "block";
    ins.setAttribute("data-ad-client", CONFIG.publisherId);
    ins.setAttribute("data-ad-slot", String(slotId));
    ins.setAttribute("data-ad-format", "auto");
    ins.setAttribute("data-full-width-responsive", "true");
    slot.append(label, ins);
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      slot.classList.remove("nova-ad-slot--loading");
      document.documentElement.classList.add("nova-ads-active");
      collapseIfUnfilled(slot, ins, epoch);
      return true;
    } catch (_) {
      collapseSlot(slot, false);
      return false;
    }
  }

  async function refreshForNavigation(page) {
    state.currentPage = page || getCurrentPage();

    // Hide the current placement, but preserve the live Adsterra unit so SPA
    // page changes do not restart the third-party runtime.
    removeAll({ destroyProduction: false });

    if (ensureSupernovaAdFree()) return;
    if (!isEligible(state.currentPage)) return;

    var selector = ".nova-ad-slot[data-nova-ad-page='" + CSS.escape(state.currentPage) + "']";
    var slots = Array.prototype.slice.call(document.querySelectorAll(selector)).slice(0, 2);
    if (!slots.length) return;
    await Promise.all(slots.map(render));
  }

  function scheduleNavigationRefresh(page) {
    var token = ++state.navigationToken;
    var requestedPage = page || "";

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (token !== state.navigationToken) return;
        var settledPage = getCurrentPage();
        var target = requestedPage && requestedPage === settledPage ? requestedPage : settledPage;
        refreshForNavigation(target);
      });
    });
  }

  async function verifyEntitlement() {
    var tier = window.NovaSupernovaTier;
    if (!hasSignedInAccount()) {
      state.entitlementReady = true;
      return true;
    }
    if (!tier || typeof tier.sync !== "function") return false;
    try {
      await tier.sync();
      state.entitlementReady = isEntitlementReady();
      return state.entitlementReady;
    } catch (_) {
      state.entitlementReady = false;
      return false;
    }
  }

  function getDiagnostics() {
    return {
      version: CONFIG.version,
      page: getCurrentPage(),
      statePage: state.currentPage,
      eligible: isEligible(state.currentPage),
      hostname: window.location.hostname,
      productionNetwork: window.location.hostname === CONFIG.productionNetwork.hostname,
      hasPersistentProductionUnit: !!state.productionUnit,
      productionFilled: !!(state.productionUnit && state.productionUnit.dataset.novaAdFilled === "true"),
      legacyInventoryRelayInstalled: !!window.__novaAdInventoryRelayInstalled,
      slots: Array.prototype.map.call(document.querySelectorAll(".nova-ad-slot"), function (slot) {
        var unit = slot.querySelector(".nova-production-ad-unit");
        return {
          page: slot.dataset.novaAdPage || "",
          collapsed: slot.classList.contains("nova-ad-slot--collapsed"),
          loading: slot.classList.contains("nova-ad-slot--loading"),
          filled: !!(unit && unit.dataset.novaAdFilled === "true"),
          attempt: unit ? Number(unit.dataset.novaAdAttempt || 0) : 0,
          failure: unit ? unit.dataset.novaAdFailure || "" : ""
        };
      })
    };
  }

  async function init() {
    if (state.initialized) return;
    state.initialized = true;
    state.currentPage = getCurrentPage();
    await verifyEntitlement();
    scheduleNavigationRefresh(state.currentPage);
  }

  document.addEventListener("nova:page-change", function (event) {
    scheduleNavigationRefresh(event.detail && event.detail.page);
  });
  document.addEventListener("nova:navigate", function () {
    scheduleNavigationRefresh("browser");
  });
  document.addEventListener("nova:account-changed", async function () {
    await verifyEntitlement();
    scheduleNavigationRefresh(getCurrentPage());
  });
  window.addEventListener("nova:session-changed", async function () {
    await verifyEntitlement();
    scheduleNavigationRefresh(getCurrentPage());
  });
  document.addEventListener("nova:supernova-state", function () {
    state.entitlementReady = isEntitlementReady();
    if (userHasSupernova() || !state.entitlementReady) removeAll({ destroyProduction: true });
    scheduleNavigationRefresh(getCurrentPage());
  });
  document.addEventListener("fullscreenchange", function () {
    if (document.fullscreenElement) removeAll({ destroyProduction: false });
    else scheduleNavigationRefresh(getCurrentPage());
  });
  window.addEventListener("storage", function (event) {
    if (event.key === "nova_consent") scheduleNavigationRefresh(getCurrentPage());
  });
  document.addEventListener("click", function (event) {
    if (event.target && (event.target.id === "consent-accept" || event.target.id === "consent-decline")) {
      setTimeout(function () { scheduleNavigationRefresh(getCurrentPage()); }, 0);
    }
  }, true);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

  window.NOVA_ADSENSE_CONFIG = CONFIG;
  window.NovaAds = Object.freeze({
    init: init,
    isEligible: isEligible,
    render: render,
    refreshForNavigation: refreshForNavigation,
    removeAll: removeAll,
    loadAdSense: loadAdSense,
    getDiagnostics: getDiagnostics,
    config: CONFIG
  });
})();
