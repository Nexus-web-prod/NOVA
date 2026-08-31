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
    version: "20260831-adsterra-r7",
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
    navigationToken: 0
  };

  function getCurrentPage() {
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

  function collapseSlot(slot) {
    if (!slot) return;
    cleanupProductionUnit(slot.querySelector(".nova-production-ad-unit"));
    slot.classList.remove("nova-ad-slot--active", "nova-ad-slot--loading");
    slot.classList.add("nova-ad-slot--collapsed");
    slot.replaceChildren();
    if (!document.querySelector(".nova-production-ad-unit[data-nova-ad-filled='true']")) {
      document.documentElement.classList.remove("nova-ads-active");
    }
  }

  function removeAll() {
    state.renderEpoch++;
    document.querySelectorAll(".nova-ad-slot").forEach(function (slot) {
      cleanupProductionUnit(slot.querySelector(".nova-production-ad-unit"));
      slot.classList.remove("nova-ad-slot--active", "nova-ad-slot--loading");
      slot.classList.add("nova-ad-slot--collapsed");
      slot.replaceChildren();
    });
    document.documentElement.classList.remove("nova-ads-active");
  }

  function removeAdSenseScript() {
    document.querySelectorAll("script[data-nova-adsense]").forEach(function (script) { script.remove(); });
    state.loadingScript = null;
  }

  function ensureSupernovaAdFree() {
    if (userHasSupernova() || !isEntitlementReady()) {
      removeAll();
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
      if (status === "unfilled" || (!hasFrame && status !== "filled")) collapseSlot(slot);
    }, 7000);
  }

  function productionStillEligible(slot, page, epoch) {
    return !!(slot && slot.isConnected && epoch === state.renderEpoch && isEligible(page) && page === state.currentPage);
  }

  function renderProductionNetwork(slot, page, attempt) {
    var network = CONFIG.productionNetwork;
    attempt = Number(attempt || 1);
    if (window.location.hostname !== network.hostname || !isEligible(page) || page !== state.currentPage) {
      collapseSlot(slot);
      return false;
    }

    cleanupProductionUnit(slot.querySelector(".nova-production-ad-unit"));
    slot.replaceChildren();
    slot.classList.remove("nova-ad-slot--collapsed");
    slot.classList.add("nova-ad-slot--active", "nova-ad-slot--loading");

    var epoch = state.renderEpoch;
    var label = document.createElement("div");
    label.className = "nova-ad-label";
    label.textContent = "Sponsored";

    var unit = document.createElement("div");
    unit.className = "nova-production-ad-unit";
    unit.dataset.novaAdFilled = "false";
    unit.dataset.novaAdAttempt = String(attempt);
    unit.dataset.novaAdProvider = "adsterra";

    var container = document.createElement("div");
    container.id = network.containerId;

    var fillObserver = new MutationObserver(function () {
      if (!container.childElementCount) return;
      unit.dataset.novaAdFilled = "true";
      cleanupProductionUnit(unit);
      var currentSlot = unit.closest(".nova-ad-slot");
      if (!productionStillEligible(currentSlot, page, epoch)) return;
      currentSlot.classList.remove("nova-ad-slot--loading");
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
      if (!productionStillEligible(slot, page, epoch)) {
        cleanupProductionUnit(unit);
        return;
      }
      if (unit.dataset.novaAdFilled === "true" || container.childElementCount) return;
      cleanupProductionUnit(unit);
      unit.dataset.novaAdFailure = reason || "no-fill";
      if (attempt < network.maxAttempts) {
        unit._novaRetryTimer = window.setTimeout(function () {
          if (productionStillEligible(slot, page, epoch)) renderProductionNetwork(slot, page, attempt + 1);
        }, 900);
      } else {
        collapseSlot(slot);
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
      collapseSlot(slot);
      return false;
    }
  }

  async function refreshForNavigation(page) {
    state.currentPage = page || getCurrentPage();
    removeAll();
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
        var target = requestedPage && document.getElementById("page-" + requestedPage)?.classList.contains("active") ? requestedPage : settledPage;
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
    scheduleNavigationRefresh(getCurrentPage());
  });
  document.addEventListener("fullscreenchange", function () {
    if (document.fullscreenElement) removeAll();
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
