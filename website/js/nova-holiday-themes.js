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
    { id: "easter", name: "Easter", short: "EASTER", motif: "🥚", note: "A bright spring meadow, blossom petals and pastel Easter glass." },
    { id: "halloween", name: "Halloween", short: "HALLOWEEN", motif: "☾", note: "A moonlit graveyard, haunted castle, drifting fog and ember glow." },
    { id: "thanksgiving", name: "Thanksgiving", short: "THANKSGIVING", motif: "🍂", note: "Warm autumn light, falling leaves and harvest glass." },
    { id: "christmas", name: "Christmas", short: "CHRISTMAS", motif: "❄", note: "Frosted glass, warm lights and quiet snowfall." }
  ];
  var allowedIds = HOLIDAYS.map(function (holiday) { return holiday.id; });
  var settings = loadSettings();
  var activeId = "";
  var timer = 0;
  var newYearCountdownTimer = 0;

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

  function thanksgivingDate(year) {
    var first = localDate(year, 11, 1);
    var offset = (4 - first.getDay() + 7) % 7;
    return localDate(year, 11, 1 + offset + 21);
  }

  function windowsFor(id, year) {
    // Automatic holiday themes start shortly before the holiday and end after
    // the holiday itself. New Year crosses the year boundary, so its window
    // begins in late December and ends on January 1.
    if (id === "new-year") return [{ start: localDate(year, 12, 26), end: localDate(year + 1, 1, 1) }];
    if (id === "valentines") return [{ start: localDate(year, 2, 9), end: localDate(year, 2, 14) }];
    if (id === "st-patricks") return [{ start: localDate(year, 3, 12), end: localDate(year, 3, 17) }];
    if (id === "easter") {
      var easter = easterDate(year);
      return [{ start: addDays(easter, -7), end: easter }];
    }
    if (id === "halloween") return [{ start: localDate(year, 10, 24), end: localDate(year, 10, 31) }];
    if (id === "thanksgiving") {
      var thanksgiving = thanksgivingDate(year);
      return [{ start: addDays(thanksgiving, -7), end: thanksgiving }];
    }
    if (id === "christmas") return [{ start: localDate(year, 12, 15), end: localDate(year, 12, 25) }];
    return [];
  }
  function currentAutomatic(date) {
    var today = dayStart(date || new Date());
    var years = [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1];
    for (var index = 0; index < HOLIDAYS.length; index += 1) {
      var holiday = HOLIDAYS[index];
      for (var yearIndex = 0; yearIndex < years.length; yearIndex += 1) {
        var windows = windowsFor(holiday.id, years[yearIndex]);
        for (var windowIndex = 0; windowIndex < windows.length; windowIndex += 1) {
          if (today >= windows[windowIndex].start && today <= windows[windowIndex].end) return holiday;
        }
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
    if (holiday.id === "new-year") count = effects === "full" ? 62 : (effects === "balanced" ? 34 : 0);
    if (holiday.id === "christmas") count = effects === "full" ? 78 : (effects === "balanced" ? 46 : 22);
    if (holiday.id === "valentines") count = effects === "full" ? 52 : (effects === "balanced" ? 30 : 0);
    if (holiday.id === "st-patricks") count = effects === "full" ? 54 : (effects === "balanced" ? 30 : 0);
    if (holiday.id === "easter") count = effects === "full" ? 72 : (effects === "balanced" ? 40 : 0);
    if (holiday.id === "halloween") count = effects === "full" ? 34 : (effects === "balanced" ? 20 : 0);
    if (holiday.id === "thanksgiving") count = effects === "full" ? 48 : (effects === "balanced" ? 28 : 0);
    var particles = "";
    for (var index = 0; index < count; index += 1) {
      var left = (index * 37 + 11) % 100;
      var delay = -((index * 13) % 17);
      var duration = 10 + ((index * 7) % 13);
      var size = 5 + ((index * 3) % 9);
      particles += '<i class="nova-holiday-particle" style="--holiday-left:' + left + '%;--holiday-delay:' + delay + 's;--holiday-duration:' + duration + 's;--holiday-size:' + size + 'px">' + holiday.motif + '</i>';
    }
    layer.dataset.holiday = holiday.id;
    var special = "";
    if (holiday.id === "new-year") {
      var bursts = "";
      for (var n = 0; n < 24; n += 1) {
        bursts += '<i class="nova-newyear-burst" style="--burst-left:' + ((n * 29 + 6) % 100) + '%;--burst-top:' + ((n * 19 + 10) % 62) + '%;--burst-delay:' + (-((n * 5) % 16)) + 's;--burst-duration:' + (4 + ((n * 3) % 6)) + 's;--burst-size:' + (2 + (n % 3)) + 'px"></i>';
      }
      special = '<div class="nova-newyear-scene">' +
        '<div class="nova-newyear-glow nova-newyear-glow--left"></div>' +
        '<div class="nova-newyear-glow nova-newyear-glow--right"></div>' +
        '<div class="nova-newyear-glow nova-newyear-glow--center"></div>' +
        '<div class="nova-newyear-bursts">' + bursts + '</div>' +
      '</div>';
    }
    if (holiday.id === "christmas") {
      var sparkles = "";
      for (var s = 0; s < 26; s += 1) {
        sparkles += '<i class="nova-christmas-spark" style="--spark-left:' + ((s * 37 + 5) % 100) + '%;--spark-top:' + ((s * 19 + 11) % 92) + '%;--spark-delay:' + (-((s * 5) % 18)) + 's;--spark-duration:' + (4 + ((s * 3) % 7)) + 's;--spark-size:' + (2 + (s % 3)) + 'px"></i>';
      }
      special = '<div class="nova-christmas-scene">' +
        '<div class="nova-christmas-glow nova-christmas-glow--left"></div>' +
        '<div class="nova-christmas-glow nova-christmas-glow--right"></div>' +
        '<div class="nova-christmas-glow nova-christmas-glow--center"></div>' +
        '<div class="nova-christmas-spark-field">' + sparkles + '</div>' +
      '</div>';
    }
    if (holiday.id === "valentines") {
      var glints = "";
      for (var v = 0; v < 24; v += 1) {
        glints += '<i class="nova-valentines-glint" style="--glint-left:' + ((v * 31 + 7) % 100) + '%;--glint-top:' + ((v * 17 + 13) % 92) + '%;--glint-delay:' + (-((v * 4) % 16)) + 's;--glint-duration:' + (5 + ((v * 3) % 7)) + 's;--glint-size:' + (2 + (v % 4)) + 'px"></i>';
      }
      var petals = "";
      for (var r = 0; r < 16; r += 1) {
        petals += '<i class="nova-valentines-petal" style="--petal-left:' + ((r * 43 + 9) % 100) + '%;--petal-top:' + ((r * 29 + 11) % 88) + '%;--petal-delay:' + (-((r * 5) % 18)) + 's;--petal-duration:' + (10 + ((r * 4) % 8)) + 's"></i>';
      }
      special = '<div class="nova-valentines-scene">' +
        '<div class="nova-valentines-glow nova-valentines-glow--left"></div>' +
        '<div class="nova-valentines-glow nova-valentines-glow--right"></div>' +
        '<div class="nova-valentines-glow nova-valentines-glow--center"></div>' +
        '<div class="nova-valentines-glint-field">' + glints + '</div>' +
        '<div class="nova-valentines-petal-field">' + petals + '</div>' +
      '</div>';
    }
    if (holiday.id === "st-patricks") {
      var sparks = "";
      for (var g = 0; g < 30; g += 1) {
        sparks += '<i class="nova-stpatricks-spark" style="--spark-left:' + ((g * 29 + 7) % 100) + '%;--spark-top:' + ((g * 17 + 11) % 92) + '%;--spark-delay:' + (-((g * 4) % 17)) + 's;--spark-duration:' + (5 + ((g * 3) % 6)) + 's;--spark-size:' + (2 + (g % 4)) + 'px"></i>';
      }
      var clovers = "";
      for (var c = 0; c < 14; c += 1) {
        clovers += '<i class="nova-stpatricks-clover" style="--clover-left:' + ((c * 43 + 9) % 100) + '%;--clover-top:' + ((c * 23 + 15) % 85) + '%;--clover-delay:' + (-((c * 6) % 19)) + 's;--clover-duration:' + (12 + ((c * 5) % 8)) + 's;--clover-size:' + (12 + ((c * 3) % 12)) + 'px">☘</i>';
      }
      special = '<div class="nova-stpatricks-scene">' +
        '<div class="nova-stpatricks-glow nova-stpatricks-glow--left"></div>' +
        '<div class="nova-stpatricks-glow nova-stpatricks-glow--right"></div>' +
        '<div class="nova-stpatricks-rainbow"></div>' +
        '<div class="nova-stpatricks-spark-field">' + sparks + '</div>' +
        '<div class="nova-stpatricks-clover-field">' + clovers + '</div>' +
      '</div>';
    }
    if (holiday.id === "easter") {
      var pollen = "";
      for (var p = 0; p < 22; p += 1) {
        pollen += '<i class="nova-easter-pollen" style="--pollen-left:' + ((p * 41 + 7) % 100) + '%;--pollen-top:' + ((p * 29 + 13) % 92) + '%;--pollen-delay:' + (-((p * 5) % 19)) + 's;--pollen-duration:' + (8 + ((p * 7) % 10)) + 's;--pollen-size:' + (2 + (p % 4)) + 'px"></i>';
      }
      special = '<div class="nova-easter-scene">' +
        '<span class="nova-easter-blossom nova-easter-blossom--one">✿</span>' +
        '<span class="nova-easter-blossom nova-easter-blossom--two">✿</span>' +
        '<span class="nova-easter-blossom nova-easter-blossom--three">✿</span>' +
        '<div class="nova-easter-pollen-field">' + pollen + '</div>' +
        '<div class="nova-easter-egg-cluster"><i class="nova-easter-egg"></i><i class="nova-easter-egg"></i><i class="nova-easter-egg"></i></div>' +
      '</div>';
    }
    if (holiday.id === "thanksgiving") {
      var leaves = "";
      for (var t = 0; t < 18; t += 1) {
        leaves += '<i class="nova-thanksgiving-leaf" style="--leaf-left:' + ((t * 37 + 9) % 100) + '%;--leaf-delay:' + (-((t * 5) % 19)) + 's;--leaf-duration:' + (11 + ((t * 3) % 9)) + 's;--leaf-size:' + (12 + ((t * 4) % 12)) + 'px">🍁</i>';
      }
      var motes = "";
      for (var m = 0; m < 24; m += 1) {
        motes += '<i class="nova-thanksgiving-mote" style="--mote-left:' + ((m * 31 + 7) % 100) + '%;--mote-top:' + ((m * 23 + 11) % 92) + '%;--mote-delay:' + (-((m * 4) % 16)) + 's;--mote-duration:' + (5 + ((m * 3) % 7)) + 's;--mote-size:' + (2 + (m % 3)) + 'px"></i>';
      }
      special = '<div class="nova-thanksgiving-scene">' +
        '<div class="nova-thanksgiving-glow nova-thanksgiving-glow--left"></div>' +
        '<div class="nova-thanksgiving-glow nova-thanksgiving-glow--right"></div>' +
        '<div class="nova-thanksgiving-motes">' + motes + '</div>' +
        '<div class="nova-thanksgiving-leaves">' + leaves + '</div>' +
      '</div>';
    }
    if (holiday.id === "halloween") {
      var embers = "";
      for (var e = 0; e < 26; e += 1) {
        embers += '<i class="nova-halloween-ember" style="--ember-left:' + ((e * 43 + 9) % 100) + '%;--ember-bottom:' + ((e * 31 + 4) % 45) + '%;--ember-delay:' + (-((e * 7) % 18)) + 's;--ember-duration:' + (7 + ((e * 5) % 9)) + 's;--ember-size:' + (2 + (e % 4)) + 'px"></i>';
      }
      special = '<div class="nova-halloween-scene">' +
        '<div class="nova-halloween-fog nova-halloween-fog--back"></div>' +
        '<div class="nova-halloween-fog nova-halloween-fog--mid"></div>' +
        '<div class="nova-halloween-fog nova-halloween-fog--front"></div>' +
        '<div class="nova-halloween-bats">' +
          '<i class="nova-halloween-bat nova-halloween-bat--one"></i>' +
          '<i class="nova-halloween-bat nova-halloween-bat--two"></i>' +
          '<i class="nova-halloween-bat nova-halloween-bat--three"></i>' +
          '<i class="nova-halloween-bat nova-halloween-bat--four"></i>' +
          '<i class="nova-halloween-bat nova-halloween-bat--five"></i>' +
        '</div>' +
        '<div class="nova-halloween-embers">' + embers + '</div>' +
        '<div class="nova-halloween-vignette"></div>' +
      '</div>';
    }
    layer.innerHTML = '<div class="nova-holiday-corner nova-holiday-corner--left"><b>' + holiday.motif + '</b><span></span></div>' +
      '<div class="nova-holiday-corner nova-holiday-corner--right"><b>' + holiday.motif + '</b><span></span></div>' +
      special + '<div class="nova-holiday-particles">' + particles + '</div>';
  }
  function newYearTarget(now) {
    now = now || new Date();
    if (now.getMonth() === 0 && now.getDate() === 1) {
      return new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    }
    return new Date(now.getFullYear() + 1, 0, 1, 0, 0, 0, 0);
  }

  function formatCountdownUnit(value) {
    value = Math.max(0, Math.floor(value));
    return value < 10 ? "0" + value : String(value);
  }

  function updateNewYearCountdown() {
    var stats = document.querySelector("#page-home .home-stats--summary");
    if (!stats || document.documentElement.dataset.novaHoliday !== "new-year") return;

    var now = new Date();
    var isNewYearsDay = now.getMonth() === 0 && now.getDate() === 1;
    var target = newYearTarget(now);
    var diff = Math.max(0, target.getTime() - now.getTime());

    var days = Math.floor(diff / 86400000);
    var hours = Math.floor((diff % 86400000) / 3600000);
    var minutes = Math.floor((diff % 3600000) / 60000);
    var seconds = Math.floor((diff % 60000) / 1000);

    stats.classList.add("home-stats--newyear-countdown");
    stats.setAttribute("aria-label", isNewYearsDay ? "Happy New Year" : "Countdown to New Year");
    stats.innerHTML =
      '<div class="nova-newyear-countdown-title">' + (isNewYearsDay ? 'HAPPY NEW YEAR!' : 'COUNTDOWN TO ' + target.getFullYear()) + '</div>' +
      '<div class="nova-newyear-countdown-grid">' +
        '<div class="nova-newyear-countdown-unit"><strong>' + formatCountdownUnit(days) + '</strong><span>DAYS</span></div>' +
        '<div class="nova-newyear-countdown-sep">:</div>' +
        '<div class="nova-newyear-countdown-unit"><strong>' + formatCountdownUnit(hours) + '</strong><span>HOURS</span></div>' +
        '<div class="nova-newyear-countdown-sep">:</div>' +
        '<div class="nova-newyear-countdown-unit"><strong>' + formatCountdownUnit(minutes) + '</strong><span>MIN</span></div>' +
        '<div class="nova-newyear-countdown-sep">:</div>' +
        '<div class="nova-newyear-countdown-unit"><strong>' + formatCountdownUnit(seconds) + '</strong><span>SEC</span></div>' +
      '</div>';
  }

  function startNewYearCountdown() {
    clearInterval(newYearCountdownTimer);
    updateNewYearCountdown();
    newYearCountdownTimer = setInterval(updateNewYearCountdown, 1000);
  }

  function restoreHomeStats() {
    clearInterval(newYearCountdownTimer);
    newYearCountdownTimer = 0;
    var stats = document.querySelector("#page-home .home-stats--summary");
    if (!stats || !stats.classList.contains("home-stats--newyear-countdown")) return;
    stats.classList.remove("home-stats--newyear-countdown");
    stats.setAttribute("aria-label", "Nova library information");
    stats.innerHTML =
      '<div class="home-stat"><div class="home-stat-num home-stat-version">7.1</div><div class="home-stat-lbl">Version</div></div>' +
      '<div class="home-stat-div" aria-hidden="true"></div>' +
      '<div class="home-stat"><div class="home-stat-num">89</div><div class="home-stat-lbl">Games</div></div>' +
      '<div class="home-stat-div" aria-hidden="true"></div>' +
      '<div class="home-stat"><div class="home-stat-num">69</div><div class="home-stat-lbl">Apps</div></div>';
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
    if (holiday && holiday.id === "new-year") startNewYearCountdown();
    else restoreHomeStats();
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
    thanksgivingDate: thanksgivingDate,
    windowsFor: windowsFor,
    active: function () { return activeId; }
  };
})();
