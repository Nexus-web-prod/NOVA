/**
 * Nova Ads — centralized, manual AdSense integration.
 *
 * Rules:
 * - Never serve Nova ads to Supernova users.
 * - Never serve ads in Browser/proxy, gameplay/player, private, account, staff,
 *   settings, checkout, support-ticket, voice, or social areas.
 * - Manual discovery-page placements only; Auto Ads are intentionally not enabled.
 * - AdSense is lazy-loaded only after entitlement state is server-verified.
 */
(function () {
  "use strict";

  var CONFIG = Object.freeze({
    publisherId: "ca-pub-6082584609878503",
    slots: Object.freeze({
      // TODO(AdSense): Replace null with the numeric data-ad-slot ID from each
      // manually-created responsive Display ad unit in Google AdSense.
      home: null,
      games: null,
      apps: null,
      movies: null
    })
  });

  var ALLOWED_PAGES = new Set(["home", "games", "apps", "movies"]);
  var BLOCKED_PAGES = new Set([
    "browser", "game-detail", "settings", "supernova", "social", "admin",
    "dev", "support", "plans", "rewards", "login", "register", "account",
    "profile", "checkout", "payment", "voice", "moderation"
  ]);
  var state = {
    initialized: false,
    loadingScript: null,
    scriptLoaded: false,
    entitlementReady: false,
    currentPage: "home",
    renderEpoch: 0
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
    if (!tier || typeof tier.isPro !== "function") return true; // fail closed
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
    page = page || getCurrentPage();
    if (!hasAdConsent()) return false;
    if (!isEntitlementReady()) return false;
    if (userHasSupernova()) return false;
    if (!ALLOWED_PAGES.has(page)) return false;
    if (isPrivateOrPlayerState(page)) return false;
    return true;
  }

  function removeAll() {
    state.renderEpoch++;
    document.querySelectorAll(".nova-ad-slot").forEach(function (slot) {
      slot.classList.remove("nova-ad-slot--active", "nova-ad-slot--loading");
      slot.classList.add("nova-ad-slot--collapsed");
      slot.replaceChildren();
    });
    document.documentElement.classList.remove("nova-ads-active");
  }

  function removeAdSenseScript() {
    document.querySelectorAll("script[data-nova-adsense]").forEach(function (script) {
      script.remove();
    });
    state.loadingScript = null;
    // A script that already executed cannot be fully unloaded from the JS realm.
    // We still remove all Nova ad units and prevent all future Nova render calls.
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
      var existing = document.querySelector("script[data-nova-adsense]");
      if (existing) {
        existing.addEventListener("load", function () { state.scriptLoaded = true; resolve(true); }, { once: true });
        existing.addEventListener("error", function () { resolve(false); }, { once: true });
        return;
      }

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
      if (status === "unfilled" || (!hasFrame && status !== "filled")) {
        slot.classList.remove("nova-ad-slot--active", "nova-ad-slot--loading");
        slot.classList.add("nova-ad-slot--collapsed");
        slot.replaceChildren();
      }
    }, 7000);
  }

  async function render(slot) {
    if (!(slot instanceof Element)) return false;
    var page = slot.dataset.novaAdPage || getCurrentPage();
    if (!isEligible(page) || page !== getCurrentPage()) {
      slot.classList.add("nova-ad-slot--collapsed");
      return false;
    }

    var slotId = CONFIG.slots[page];
    if (!slotId) {
      // Intentionally collapse until the real AdSense ad-unit ID is configured.
      slot.classList.add("nova-ad-slot--collapsed");
      return false;
    }

    var epoch = state.renderEpoch;
    var loaded = await loadAdSense();
    if (!loaded || epoch !== state.renderEpoch || !isEligible(page) || page !== getCurrentPage()) return false;

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
      slot.classList.remove("nova-ad-slot--active", "nova-ad-slot--loading");
      slot.classList.add("nova-ad-slot--collapsed");
      slot.replaceChildren();
      return false;
    }
  }

  async function refreshForNavigation(page) {
    state.currentPage = page || getCurrentPage();
    state.renderEpoch++;
    removeAll();

    if (ensureSupernovaAdFree()) return;
    if (!isEligible(state.currentPage)) return;

    var selector = ".nova-ad-slot[data-nova-ad-page='" + CSS.escape(state.currentPage) + "']";
    var slots = Array.prototype.slice.call(document.querySelectorAll(selector)).slice(0, 2);
    if (!slots.length) return;
    await Promise.all(slots.map(render));
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

  async function init() {
    if (state.initialized) return;
    state.initialized = true;
    state.currentPage = getCurrentPage();
    await verifyEntitlement();
    await refreshForNavigation(state.currentPage);
  }

  document.addEventListener("nova:page-change", function (event) {
    refreshForNavigation(event.detail && event.detail.page);
  });
  document.addEventListener("nova:navigate", function () {
    refreshForNavigation("browser");
  });
  document.addEventListener("nova:account-changed", async function () {
    await verifyEntitlement();
    refreshForNavigation(getCurrentPage());
  });
  window.addEventListener("nova:session-changed", async function () {
    await verifyEntitlement();
    refreshForNavigation(getCurrentPage());
  });
  document.addEventListener("nova:supernova-state", function () {
    state.entitlementReady = isEntitlementReady();
    refreshForNavigation(getCurrentPage());
  });
  document.addEventListener("fullscreenchange", function () {
    if (document.fullscreenElement) removeAll();
    else refreshForNavigation(getCurrentPage());
  });


  window.addEventListener("storage", function (event) {
    if (event.key === "nova_consent") refreshForNavigation(getCurrentPage());
  });
  document.addEventListener("click", function (event) {
    if (event.target && (event.target.id === "consent-accept" || event.target.id === "consent-decline")) {
      setTimeout(function () { refreshForNavigation(getCurrentPage()); }, 0);
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
    config: CONFIG
  });
})();
