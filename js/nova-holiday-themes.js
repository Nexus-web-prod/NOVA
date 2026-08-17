/**
 * Nova Holiday Themes
 * Registered, CSP-safe seasonal packs. Automatic themes are available to
 * everyone; year-round manual selection and mixing are Supernova features.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "nova_holiday_settings";
  var DEFAULTS = { mode: "automatic", selected: "christmas", style: "full", effects: "balanced" };
  var HOLIDAYS = [
    { id: "new-year", name: "New Year", short: "NEW YEAR", motif: "✦", note: "Midnight gold, confetti and a clean new beginning." },
    { id: "valentines", name: "Valentine's Day", short: "VALENTINE'S", motif: "♥", note: "Rose glass, floating hearts and warm highlights." },
    { id: "st-patricks", name: "St. Patrick's Day", short: "ST. PATRICK'S", motif: "♣", note: "Emerald light, clover details and polished gold." },
    { id: "easter", name: "Easter", short: "EASTER", motif: "✿", note: "Pastel skies, spring blossoms and soft daylight." },
    { id: "fourth-july", name: "Fourth of July", short: "FOURTH OF JULY", motif: "★", note: "Midnight blue, restrained stripes and fireworks." },
    { id: "halloween", name: "Halloween", short: "HALLOWEEN", motif: "◆", note: "Storm purple, moonlit fog and subtle webs." },
    { id: "christmas", name: "Christmas", short: "CHRISTMAS", motif: "❄", note: "Frosted glass, warm lights and quiet snowfall." }
  ];
  var allowedIds = HOLIDAYS.map(function (holiday) { return holiday.id; });
  var settings = loadSettings();
  var activeId = "";
  var timer = 0;

  function loadSettings() {
    try { return sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null")); }
    catch (error) { return Object.assign({}, DEFAULTS); }
  }
  function sanitize(value) {
    value = value && typeof value === "object" ? value : {};
    return {
      mode: ["automatic", "manual", "off"].indexOf(value.mode) >= 0 ? value.mode : DEFAULTS.mode,
      selected: allowedIds.indexOf(value.selected) >= 0 ? value.selected : DEFAULTS.selected,
      style: ["full", "decorations"].indexOf(value.style) >= 0 ? value.style : DEFAULTS.style,
      effects: ["full", "balanced", "minimal"].indexOf(value.effects) >= 0 ? value.effects : DEFAULTS.effects
    };
  }
  function isPro() {
    if (window.NovaSupernovaTier && window.NovaSupernovaTier.isPro()) return true;
    try {
      var account = JSON.parse(localStorage.getItem("nova_account") || "null");
      var roles = account && (Array.isArray(account.roles) ? account.roles : [account.role]);
      return !!(account && (account.supernova || account.plan === "supernova" || roles.indexOf("admin") >= 0 || roles.indexOf("owner") >= 0));
    } catch (error) { return false; }
  }
  function localDate(year, month, day) { return new Date(year, month - 1, day, 12, 0, 0, 0); }
  function dayStart(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0); }
  function addDays(date, days) { var next = new Date(date); next.setDate(next.getDate() + days); return next; }

  function easterDate(year) {
    var a = year % 19;
    var b = Math.floor(year / 100);
    var c = year % 100;
    var d = Math.floor(b / 4);
    var e = b % 4;
    var f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4);
    var k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31);
    var day = ((h + l - 7 * m + 114) % 31) + 1;
    return localDate(year, month, day);
  }

  function windowsFor(id, year) {
    if (id === "new-year") return [
      { start: localDate(year - 1, 12, 27), end: localDate(year, 1, 2) },
      { start: localDate(year, 12, 27), end: localDate(year + 1, 1, 2) }
    ];
    if (id === "valentines") return [{ start: localDate(year, 2, 7), end: localDate(year, 2, 15) }];
    if (id === "st-patricks") return [{ start: localDate(year, 3, 10), end: localDate(year, 3, 18) }];
    if (id === "easter") {
      var easter = easterDate(year);
      return [{ start: addDays(easter, -7), end: addDays(easter, 1) }];
    }
    if (id === "fourth-july") return [{ start: localDate(year, 6, 28), end: localDate(year, 7, 5) }];
    if (id === "halloween") return [{ start: localDate(year, 10, 1), end: localDate(year, 11, 1) }];
    return [{ start: localDate(year, 12, 1), end: localDate(year, 12, 26) }];
  }
  function currentAutomatic(date) {
    var today = dayStart(date || new Date());
    var year = today.getFullYear();
    for (var index = 0; index < HOLIDAYS.length; index += 1) {
      var holiday = HOLIDAYS[index];
      var windows = windowsFor(holiday.id, year);
      for (var windowIndex = 0; windowIndex < windows.length; windowIndex += 1) {
        if (today >= windows[windowIndex].start && today <= windows[windowIndex].end) return holiday;
      }
    }
    return null;
  }
  function nextAutomatic(date) {
    var today = dayStart(date || new Date());
    var candidates = [];
    [today.getFullYear(), today.getFullYear() + 1].forEach(function (year) {
      HOLIDAYS.forEach(function (holiday) {
        windowsFor(holiday.id, year).forEach(function (window) {
          if (window.start > today) candidates.push({ holiday: holiday, start: window.start });
        });
      });
    });
    candidates.sort(function (first, second) { return first.start - second.start; });
    return candidates[0] || null;
  }
  function getHoliday(id) { return HOLIDAYS.find(function (holiday) { return holiday.id === id; }) || null; }
  function effectiveHoliday(date) {
    if (settings.mode === "off") return null;
    if (settings.mode === "manual" && isPro()) return getHoliday(settings.selected);
    return currentAutomatic(date || new Date());
  }
  function effectiveEffects() {
    var root = document.documentElement;
    if (root.dataset.reduceMotion === "on" || root.dataset.performanceMode === "fast" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "minimal";
    return settings.effects;
  }

  function ensureLayer() {
    var layer = document.getElementById("nova-holiday-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "nova-holiday-layer";
      layer.setAttribute("aria-hidden", "true");
      document.body.appendChild(layer);
    }
    return layer;
  }
  function buildLayer(holiday, effects) {
    var layer = ensureLayer();
    if (!holiday) {
      layer.innerHTML = "";
      layer.removeAttribute("data-holiday");
      return;
    }
    var count = effects === "full" ? 28 : (effects === "balanced" ? 15 : 0);
    var particles = "";
    for (var index = 0; index < count; index += 1) {
      var left = (index * 37 + 11) % 100;
      var delay = -((index * 13) % 17);
      var duration = 10 + ((index * 7) % 13);
      var size = 5 + ((index * 3) % 9);
      particles += '<i class="nova-holiday-particle" style="--holiday-left:' + left + '%;--holiday-delay:' + delay + 's;--holiday-duration:' + duration + 's;--holiday-size:' + size + 'px">' + holiday.motif + '</i>';
    }
    layer.dataset.holiday = holiday.id;
    layer.innerHTML = '<div class="nova-holiday-corner nova-holiday-corner--left"><b>' + holiday.motif + '</b><span></span></div>' +
      '<div class="nova-holiday-corner nova-holiday-corner--right"><b>' + holiday.motif + '</b><span></span></div>' +
      '<div class="nova-holiday-particles">' + particles + '</div>';
  }
  function updateHeroBadge(holiday) {
    var hero = document.querySelector("#page-home .nova-hero");
    var badge = document.getElementById("nova-holiday-badge");
    if (!badge && hero) {
      badge = document.createElement("div");
      badge.id = "nova-holiday-badge";
      badge.className = "nova-holiday-badge";
      hero.appendChild(badge);
    }
    if (!badge) return;
    badge.hidden = !holiday;
    if (holiday) badge.innerHTML = '<span>' + holiday.motif + '</span>' + holiday.short + ' EDITION';
  }
  function apply(date) {
    var holiday = effectiveHoliday(date);
    var root = document.documentElement;
    var effects = effectiveEffects();
    if (holiday) {
      root.dataset.novaHoliday = holiday.id;
      root.dataset.novaHolidayStyle = isPro() ? settings.style : "full";
      root.dataset.novaHolidayEffects = effects;
    } else {
      delete root.dataset.novaHoliday;
      delete root.dataset.novaHolidayStyle;
      delete root.dataset.novaHolidayEffects;
    }
    buildLayer(holiday, effects);
    updateHeroBadge(holiday);
    activeId = holiday ? holiday.id : "";
    var next = nextAutomatic(date || new Date());
    document.dispatchEvent(new CustomEvent("nova:holiday-change", { detail: {
      active: holiday ? Object.assign({}, holiday) : null,
      next: next ? { id: next.holiday.id, name: next.holiday.name, start: next.start.getTime() } : null,
      settings: Object.assign({}, settings),
      manualAvailable: isPro(),
      effects: effects
    } }));
  }
  function setSettings(value) {
    settings = sanitize(value);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (error) {}
    apply();
  }
  function preview(id) {
    if (!isPro() || allowedIds.indexOf(id) < 0) return;
    settings.mode = "manual";
    settings.selected = id;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (error) {}
    apply();
    document.dispatchEvent(new CustomEvent("nova:holiday-previewed", { detail: { settings: Object.assign({}, settings) } }));
  }
  function scheduleRefresh() {
    clearInterval(timer);
    timer = setInterval(function () { if (!document.hidden) apply(); }, 30 * 60 * 1000);
  }
  function init() {
    apply();
    scheduleRefresh();
  }

  document.addEventListener("DOMContentLoaded", init);
  document.addEventListener("nova:holiday-settings", function (event) { if (event.detail) setSettings(event.detail); });
  document.addEventListener("nova:account-changed", function () { setTimeout(apply, 100); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) apply(); });

  window.NovaHolidayThemes = {
    list: function () { return HOLIDAYS.map(function (holiday) { return Object.assign({}, holiday); }); },
    getSettings: function () { return Object.assign({}, settings); },
    setSettings: setSettings,
    preview: preview,
    apply: apply,
    currentAutomatic: currentAutomatic,
    nextAutomatic: nextAutomatic,
    easterDate: easterDate,
    windowsFor: windowsFor,
    active: function () { return activeId; }
  };
})();
