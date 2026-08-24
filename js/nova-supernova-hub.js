/**
 * Nova 7 Supernova Hub
 * Cloud-synced personalization, labs and browser workspaces. Voice rooms live
 * in Nova Island Social and are intentionally not managed by this module.
 */
(function () {
  "use strict";

  var DEFAULTS = {
    identity: { frame: "orbit", badge: "prism", bannerEffect: "aurora", nameGlow: true },
    island: { style: "glass", opacity: 88, density: "comfortable", animation: "fluid" },
    home: { atmosphere: "nebula", compactCards: false, greeting: true },
    labs: { commandPalette: true, focusMode: false, quickPeek: true },
    holiday: { mode: "automatic", selected: "christmas", style: "full", effects: "balanced" },
    appliedTheme: null
  };
  var state = { preferences: clone(DEFAULTS), themes: [], workspaces: [], aiChats: {}, updatedAt: 0 };
  var mounted = false;
  var syncing = false;
  var pendingSave = {};
  var saveTimer = 0;
  var editingWorkspace = "";

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function el(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function toast(message) {
    if (typeof window.toast === "function") return window.toast(message);
    var host = el("toast-container");
    if (!host) return;
    var item = document.createElement("div");
    item.className = "toast";
    item.textContent = message;
    host.appendChild(item);
    setTimeout(function () { item.classList.add("out"); setTimeout(function () { item.remove(); }, 350); }, 3200);
  }
  function account() {
    try { return JSON.parse(localStorage.getItem("nova_account") || "null"); }
    catch (error) { return null; }
  }
  function isPro() {
    return !!(window.NovaSupernovaTier && window.NovaSupernovaTier.isPro());
  }
  function hasChatData(chats) {
    return chats && ["work", "game", "general"].some(function (mode) { return Array.isArray(chats[mode]) && chats[mode].length; });
  }
  function mergePreferences(value) {
    var next = value && typeof value === "object" ? value : {};
    return {
      identity: Object.assign({}, DEFAULTS.identity, next.identity || {}),
      island: Object.assign({}, DEFAULTS.island, next.island || {}),
      home: Object.assign({}, DEFAULTS.home, next.home || {}),
      labs: Object.assign({}, DEFAULTS.labs, next.labs || {}),
      holiday: Object.assign({}, DEFAULTS.holiday, next.holiday || {}),
      appliedTheme: next.appliedTheme || null
    };
  }

  function icon(name) {
    var paths = {
      overview: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>',
      ai: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
      themes: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18"/>',
      identity: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
      island: '<path d="M5 8h14a4 4 0 0 1 0 8H5a4 4 0 0 1 0-8z"/><path d="M9 12h6"/>',
      labs: '<path d="M9 3h6M10 3v5l-5 9a3 3 0 0 0 3 4h8a3 3 0 0 0 3-4l-5-9V3"/><path d="M8 15h8"/>',
      workspaces: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v5"/>',
      referrals: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>'
    };
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + paths[name] + '</svg>';
  }

  function tab(name, label, extra) {
    return '<button type="button" class="sn-section-tab' + (name === "overview" ? " active" : "") + '" data-sn-section="' + name + '">' +
      icon(name) + '<span>' + label + '</span>' + (extra || "") + '</button>';
  }

  function overviewMarkup() {
    return '<div id="sn-panel-overview" class="sn-panel active sn-hub-scroll">' +
      '<section class="sn-overview-hero"><div class="sn-overview-orbit" aria-hidden="true"><span>✦</span></div><div class="sn-overview-copy">' +
      '<span class="sn-kicker">YOUR SUPERNOVA</span><h2 id="sn-overview-greeting">Built around you.</h2>' +
      '<p>One private, cloud-synced space for intelligence, identity and the way you move through Nova.</p>' +
      '<div class="sn-overview-actions"><button type="button" class="sn-primary" data-sn-jump="ai">Ask Supernova AI</button>' +
      '<button type="button" class="sn-secondary" data-sn-jump="themes">Design a theme</button></div></div>' +
      '<div class="sn-cloud-card"><span class="sn-cloud-dot"></span><div><strong id="sn-cloud-title">Connecting</strong><small id="sn-cloud-detail">Preparing your private sync</small></div></div></section>' +
      '<div class="sn-overview-grid">' +
      overviewCard("ai", "Supernova AI", "Three focused assistants with image understanding and synced text history.", "Open AI") +
      overviewCard("themes", "Theme Studio", "Build full color systems, collect holiday editions and carry every choice across devices.", "Create") +
      overviewCard("identity", "Identity", "Choose your frame, badge treatment, banner atmosphere and name glow.", "Customize") +
      overviewCard("island", "Nova Island", "Tune density, transparency, material and motion without changing voice rooms.", "Tune Island") +
      overviewCard("labs", "Early Access Labs", "Try working features early, with every experiment individually controlled.", "Open Labs") +
      overviewCard("workspaces", "Browser Workspaces", "Save focused collections of sites and launch them through Nova from any device.", "View spaces") +
      '</div><div class="sn-voice-preserved"><span>VOICE</span><strong>Voice rooms remain in Nova Island Social</strong><small>The existing four-person rooms, lobby controls and live dictation are unchanged.</small></div></div>';
  }
  function overviewCard(section, title, copy, action) {
    return '<article class="sn-overview-card" data-sn-card="' + section + '"><div class="sn-card-icon">' + icon(section) + '</div>' +
      '<div><h3>' + title + '</h3><p>' + copy + '</p></div><button type="button" data-sn-jump="' + section + '">' + action + ' <span>→</span></button></article>';
  }

  function identityMarkup() {
    return '<div id="sn-panel-identity" class="sn-panel sn-hub-scroll"><div class="sn-panel-heading"><div><span class="sn-kicker">IDENTITY SYSTEM</span>' +
      '<h2>Make your presence unmistakable.</h2><p>These cosmetics follow your Supernova account between devices.</p></div><span class="sn-live-pill">LIVE PREVIEW</span></div>' +
      '<div class="sn-editor-grid"><div class="sn-editor-stack">' +
      selectControl("Profile frame", "The animated edge around your identity.", "identity.frame", [["none","None"],["orbit","Orbit"],["eclipse","Eclipse"],["radiant","Radiant"]]) +
      selectControl("Supernova badge", "How the Pro badge appears in Social.", "identity.badge", [["classic","Classic"],["prism","Prism"],["minimal","Minimal"],["pulse","Pulse"]]) +
      selectControl("Banner atmosphere", "A subtle layer for profile surfaces.", "identity.bannerEffect", [["none","None"],["aurora","Aurora"],["stardust","Stardust"],["horizon","Horizon"]]) +
      toggleControl("Name glow", "Give your display name a restrained Supernova glow.", "identity.nameGlow") +
      '</div><div class="sn-identity-preview" id="sn-identity-preview"><div class="sn-preview-banner"><span></span></div><div class="sn-preview-avatar" id="sn-preview-avatar">N</div>' +
      '<div class="sn-preview-profile"><span class="sn-preview-name" id="sn-preview-name">Nova User</span><span class="social-supernova-badge">✦ SUPERNOVA</span>' +
      '<p>Your identity preview updates instantly.</p><div class="sn-preview-stats"><span><b>PRO</b> Plan</span><span><b>7</b> Nova</span></div></div></div></div></div>';
  }

  function islandMarkup() {
    return '<div id="sn-panel-island" class="sn-panel sn-hub-scroll"><div class="sn-panel-heading"><div><span class="sn-kicker">NOVA ISLAND</span>' +
      '<h2>Shape the command center.</h2><p>Visual controls only—Social voice-room behavior stays exactly as it is.</p></div></div>' +
      '<div class="sn-editor-grid"><div class="sn-editor-stack">' +
      selectControl("Island material", "Choose the surface treatment.", "island.style", [["glass","Deep glass"],["solid","Soft solid"],["outline","Light outline"]]) +
      rangeControl("Transparency", "Balance atmosphere and readability.", "island.opacity", 60, 100) +
      selectControl("Information density", "Control the room inside each row.", "island.density", [["compact","Compact"],["comfortable","Comfortable"],["spacious","Spacious"]]) +
      selectControl("Motion profile", "Choose how the Island responds.", "island.animation", [["quiet","Quiet"],["fluid","Fluid"],["expressive","Expressive"]]) +
      '</div><div class="sn-island-preview"><span class="sn-preview-label">PREVIEW</span><div class="sn-mini-island"><div class="sn-mini-tabs"><b>Pages</b><span>Social</span><span>Recent</span></div>' +
      '<div class="sn-mini-row"><i>⌂</i><div><strong>Home</strong><small>Nova start page</small></div></div><div class="sn-mini-row"><i>◎</i><div><strong>Social</strong><small>Friends and messages</small></div></div>' +
      '<div class="sn-mini-note">Voice rooms remain inside Social</div></div></div></div></div>';
  }

  function labsMarkup() {
    return '<div id="sn-panel-labs" class="sn-panel sn-hub-scroll"><div class="sn-panel-heading"><div><span class="sn-kicker">EARLY ACCESS</span>' +
      '<h2>Labs you can actually use.</h2><p>Every experiment is reversible and synced to your account.</p></div><span class="sn-labs-badge">LABS 01</span></div>' +
      '<div class="sn-labs-grid">' + labCard("commandPalette", "⌘K", "Command Palette", "Jump to any Nova page or Supernova tool without leaving the keyboard.", "Press Ctrl/⌘ + K") +
      labCard("focusMode", "◫", "Focus Mode", "Quiet ambient effects and reduce visual noise while you work or study.", "Applies everywhere") +
      labCard("quickPeek", "↗", "Workspace Quick Peek", "Reveal full destinations before opening links from a workspace.", "Hover any saved link") +
      '</div><div class="sn-labs-foot"><span class="sn-cloud-dot"></span><p>Labs are controlled remotely per account, so your choices follow you without changing regular Nova settings.</p></div></div>';
  }
  function labCard(key, symbol, title, copy, hint) {
    return '<article class="sn-lab-card"><div class="sn-lab-top"><span class="sn-lab-icon">' + symbol + '</span><label class="sn-switch"><input type="checkbox" data-pref="labs.' + key + '"><span></span></label></div>' +
      '<h3>' + title + '</h3><p>' + copy + '</p><small>' + hint + '</small></article>';
  }

  function workspacesMarkup() {
    return '<div id="sn-panel-workspaces" class="sn-panel sn-hub-scroll"><div class="sn-panel-heading"><div><span class="sn-kicker">BROWSER WORKSPACES</span>' +
      '<h2>Your web, arranged by purpose.</h2><p>Save up to eight spaces with twelve links each. Every destination opens through Nova.</p></div>' +
      '<button type="button" class="sn-primary" id="sn-new-workspace">+ New workspace</button></div>' +
      '<div id="sn-workspace-empty" class="sn-workspace-empty"><span>✦</span><h3>No workspaces yet</h3><p>Build a set for school, gaming, research or anything else.</p><button type="button" class="sn-secondary" data-workspace-create>Create your first space</button></div>' +
      '<div class="sn-workspace-grid" id="sn-workspace-grid"></div>' +
      '<section class="sn-workspace-editor" id="sn-workspace-editor" hidden><div class="sn-workspace-editor-head"><div><span class="sn-kicker">WORKSPACE EDITOR</span><h3 id="sn-workspace-editor-title">New workspace</h3></div><button type="button" class="sn-icon-btn" id="sn-workspace-cancel">✕</button></div>' +
      '<label><span>Name</span><input id="sn-workspace-name" maxlength="40" placeholder="School day"></label>' +
      '<label><span>Accent</span><select id="sn-workspace-accent"><option value="violet">Violet</option><option value="gold">Gold</option><option value="cyan">Cyan</option><option value="rose">Rose</option><option value="green">Green</option></select></label>' +
      '<label class="sn-workspace-links-field"><span>Links <small>one per line · Title | https://site.com</small></span><textarea id="sn-workspace-links" rows="7" placeholder="Classroom | https://classroom.google.com\nDocs | https://docs.google.com"></textarea></label>' +
      '<div class="sn-workspace-editor-actions"><span id="sn-workspace-form-status"></span><button type="button" class="sn-primary" id="sn-workspace-save">Save workspace</button></div></section></div>';
  }

  function holidayCollectionMarkup() {
    var holidays = window.NovaHolidayThemes && window.NovaHolidayThemes.list ? window.NovaHolidayThemes.list() : [];
    return '<section class="sn-holiday-collection" aria-label="Holiday Collection"><div class="sn-holiday-head"><div><span class="sn-kicker">HOLIDAY COLLECTION</span>' +
      '<h3>Make Nova change with the season.</h3><p>The featured holiday activates for everyone. Supernova unlocks every edition year-round and can mix decorations with custom colors.</p></div>' +
      '<div class="sn-holiday-status" id="sn-holiday-status"><i></i><span>Checking the season…</span></div></div>' +
      '<div class="sn-holiday-controls"><label class="sn-holiday-control"><span>Seasonal mode</span><select data-pref="holiday.mode"><option value="automatic">Automatic</option><option value="manual">Choose manually</option><option value="off">Off</option></select></label>' +
      '<label class="sn-holiday-control"><span>Theme style</span><select data-pref="holiday.style"><option value="full">Full theme</option><option value="decorations">Decorations only</option></select></label>' +
      '<label class="sn-holiday-control"><span>Effect level</span><select data-pref="holiday.effects"><option value="full">Full</option><option value="balanced">Balanced</option><option value="minimal">Minimal</option></select></label></div>' +
      '<div class="sn-holiday-grid">' + holidays.map(function (holiday) { return '<button type="button" class="sn-holiday-card" data-holiday="' + esc(holiday.id) + '" title="Preview ' + esc(holiday.name) + '"><b>' + holiday.motif + '</b><strong>' + esc(holiday.name) + '</strong><small>' + esc(holiday.note) + '</small></button>'; }).join("") + '</div>' +
      '<div class="sn-holiday-foot"><span id="sn-holiday-next"><strong>Automatic schedule</strong> follows your local date.</span><span>Reduced Motion and Fast Mode automatically use static effects.</span></div></section>';
  }

  function selectControl(title, copy, path, options) {
    return '<label class="sn-control-card"><span><strong>' + title + '</strong><small>' + copy + '</small></span><select data-pref="' + path + '">' +
      options.map(function (option) { return '<option value="' + option[0] + '">' + option[1] + '</option>'; }).join("") + '</select></label>';
  }
  function toggleControl(title, copy, path) {
    return '<label class="sn-control-card"><span><strong>' + title + '</strong><small>' + copy + '</small></span><span class="sn-switch"><input type="checkbox" data-pref="' + path + '"><span></span></span></label>';
  }
  function rangeControl(title, copy, path, min, max) {
    return '<label class="sn-control-card sn-control-card--range"><span><strong>' + title + '</strong><small>' + copy + '</small></span><div><input type="range" min="' + min + '" max="' + max + '" data-pref="' + path + '"><output data-pref-output="' + path + '"></output></div></label>';
  }

  function mountHub() {
    if (mounted || !el("page-supernova")) return;
    mounted = true;
    var page = el("page-supernova");
    page.classList.add("sn-hub-v2");
    var head = page.querySelector(".sn-page-head");
    if (head) head.innerHTML = '<div class="sn-brand-lockup"><div class="sn-brand-star">✦</div><div><span>SUPERNOVA</span><small>THE POWER LAYER OF NOVA 7</small></div></div>' +
      '<div class="sn-head-meta"><span id="sn-head-sync">PRIVATE CLOUD</span><div class="sn-pro-badge">✦ PRO</div></div>';
    var tabs = page.querySelector(".sn-section-tabs");
    if (tabs) {
      tabs.innerHTML = tab("overview", "Overview") + tab("ai", "AI") + tab("themes", "Themes") + tab("identity", "Identity") + tab("island", "Island") + tab("labs", "Labs", '<span class="sn-tab-new">NEW</span>') + tab("workspaces", "Spaces") + tab("referrals", "Referrals");
      var referralTab = tabs.querySelector('[data-sn-section="referrals"]');
      if (referralTab) referralTab.hidden = true;
    }
    var panels = page.querySelector(".sn-panels");
    if (!panels) return;
    panels.querySelectorAll(".sn-panel").forEach(function (panel) { panel.classList.remove("active"); });
    panels.insertAdjacentHTML("afterbegin", overviewMarkup());
    panels.insertAdjacentHTML("beforeend", identityMarkup() + islandMarkup() + labsMarkup() + workspacesMarkup());
    upgradeLegacyPanels();
    wireHub();
    createCommandPalette();
    renderAccountPreview();
  }

  function upgradeLegacyPanels() {
    var ai = el("sn-panel-ai");
    if (ai) {
      ai.classList.add("sn-hub-scroll");
      var footer = ai.querySelector(".sn-ai-footer-note");
      if (footer) footer.textContent = "Powered by Google Gemini · Image understanding · Text history syncs privately";
    }
    var themes = el("sn-panel-themes");
    if (themes) {
      themes.classList.add("sn-hub-scroll");
      themes.insertAdjacentHTML("afterbegin", '<div class="sn-theme-cloudbar"><div><span class="sn-kicker">THEME STUDIO</span><strong>Design a complete Nova color system.</strong></div>' +
        '<div><button type="button" class="sn-secondary" id="sn-theme-export">Export</button><button type="button" class="sn-secondary" id="sn-theme-import">Import</button><input id="sn-theme-import-file" type="file" accept="application/json" hidden></div></div>');
      var studio = el("sn-theme-studio");
      if (studio) studio.insertAdjacentHTML("beforeend", '<div class="sn-theme-seasonal-footer"><div class="sn-holiday-bridge"><span></span><strong>SEASONAL EXTENSIONS</strong><span></span></div>' + holidayCollectionMarkup() + '</div>');
      var note = themes.querySelector(".sn-theme-note");
      if (note) note.textContent = "Saved themes and your active custom design sync privately to your Supernova account.";
    }
  }

  function wireHub() {
    document.addEventListener("click", function (event) {
      var jump = event.target.closest("[data-sn-jump]");
      if (jump) switchSection(jump.dataset.snJump);
      var create = event.target.closest("[data-workspace-create]");
      if (create) openWorkspaceEditor();
    });
    document.querySelectorAll("[data-pref]").forEach(function (control) {
      control.addEventListener("change", function () {
        setPreference(control.dataset.pref, control.type === "checkbox" ? control.checked : (control.type === "range" ? Number(control.value) : control.value));
      });
      if (control.type === "range") control.addEventListener("input", function () {
        var output = document.querySelector('[data-pref-output="' + control.dataset.pref + '"]');
        if (output) output.textContent = control.value + "%";
        setPreference(control.dataset.pref, Number(control.value), true);
      });
    });
    el("sn-new-workspace")?.addEventListener("click", function () { openWorkspaceEditor(); });
    el("sn-workspace-cancel")?.addEventListener("click", closeWorkspaceEditor);
    el("sn-workspace-save")?.addEventListener("click", saveWorkspaceFromForm);
    el("sn-theme-export")?.addEventListener("click", exportThemes);
    el("sn-theme-import")?.addEventListener("click", function () { el("sn-theme-import-file")?.click(); });
    el("sn-theme-import-file")?.addEventListener("change", importThemes);
    document.querySelectorAll(".sn-holiday-card").forEach(function (card) {
      card.addEventListener("click", function () {
        state.preferences.holiday.mode = "manual";
        state.preferences.holiday.selected = card.dataset.holiday;
        syncControls();
        applyPreferences();
        queueSave("preferences", state.preferences);
        toast("Holiday edition applied ✦");
      });
    });
    document.addEventListener("nova:holiday-change", function (event) { renderHolidayStatus(event.detail || {}); });
    document.addEventListener("nova:supernova-ai-changed", function (event) {
      if (syncing || !event.detail) return;
      state.aiChats = event.detail.aiChats || {};
      queueSave("aiChats", state.aiChats);
      updateOverview();
    });
    document.addEventListener("nova:supernova-theme-changed", function (event) {
      if (syncing || !event.detail) return;
      state.themes = event.detail.themes || [];
      state.preferences.appliedTheme = event.detail.appliedTheme || null;
      queueSave("themes", state.themes);
      queueSave("preferences", state.preferences);
      updateOverview();
    });
    document.addEventListener("nova:account-changed", function () { renderAccountPreview(); setTimeout(loadCloudState, 80); });
  }

  function switchSection(section) {
    var button = document.querySelector('.sn-section-tab[data-sn-section="' + section + '"]');
    if (button) button.click();
  }
  function getPreference(path) {
    return path.split(".").reduce(function (value, key) { return value && value[key]; }, state.preferences);
  }
  function setPreference(path, value, fromInput) {
    var parts = path.split(".");
    if (!state.preferences[parts[0]]) state.preferences[parts[0]] = {};
    state.preferences[parts[0]][parts[1]] = value;
    applyPreferences();
    if (!fromInput || path !== "island.opacity") syncControls();
    queueSave("preferences", state.preferences);
  }
  function syncControls() {
    document.querySelectorAll("[data-pref]").forEach(function (control) {
      var value = getPreference(control.dataset.pref);
      if (control.type === "checkbox") control.checked = !!value;
      else if (value != null) control.value = value;
      if (control.type === "range") {
        var output = document.querySelector('[data-pref-output="' + control.dataset.pref + '"]');
        if (output) output.textContent = value + "%";
      }
    });
  }

  function applyPreferences() {
    var root = document.documentElement;
    var prefs = state.preferences;
    root.dataset.snFrame = prefs.identity.frame;
    root.dataset.snBadge = prefs.identity.badge;
    root.dataset.snBanner = prefs.identity.bannerEffect;
    root.dataset.snNameGlow = prefs.identity.nameGlow ? "on" : "off";
    root.dataset.snIslandStyle = prefs.island.style;
    root.dataset.snIslandDensity = prefs.island.density;
    root.dataset.snIslandAnimation = prefs.island.animation;
    root.style.setProperty("--sn-island-opacity", String(prefs.island.opacity / 100));
    root.dataset.snHomeAtmosphere = prefs.home.atmosphere;
    root.dataset.snHomeCompact = prefs.home.compactCards ? "on" : "off";
    root.dataset.snQuickPeek = prefs.labs.quickPeek ? "on" : "off";
    root.classList.toggle("sn-focus-mode", !!prefs.labs.focusMode);
    if (window.NovaHolidayThemes && window.NovaHolidayThemes.setSettings) window.NovaHolidayThemes.setSettings(prefs.holiday);
    else document.dispatchEvent(new CustomEvent("nova:holiday-settings", { detail: prefs.holiday }));
    updateHolidayCards();
    updateHomeGreeting();
  }

  function updateHolidayCards() {
    document.querySelectorAll(".sn-holiday-card").forEach(function (card) {
      card.classList.toggle("active", state.preferences.holiday.mode === "manual" && card.dataset.holiday === state.preferences.holiday.selected);
    });
  }

  function renderHolidayStatus(detail) {
    var status = el("sn-holiday-status");
    var next = el("sn-holiday-next");
    if (status) {
      if (detail.active) status.querySelector("span").textContent = detail.active.name + " is active";
      else if (state.preferences.holiday.mode === "off") status.querySelector("span").textContent = "Seasonal themes are off";
      else status.querySelector("span").textContent = "Between holiday editions";
    }
    if (next && detail.next) {
      var date = new Date(detail.next.start);
      next.innerHTML = '<strong>Next automatic edition:</strong> ' + esc(detail.next.name) + ' · ' + esc(date.toLocaleDateString([], { month: "short", day: "numeric" }));
    }
    updateHolidayCards();
  }

  function updateHomeGreeting() {
    var greeting = el("sn-home-greeting");
    if (!greeting) {
      var hero = document.querySelector("#page-home .nova-hero");
      if (hero) {
        greeting = document.createElement("div");
        greeting.id = "sn-home-greeting";
        greeting.className = "sn-home-greeting";
        hero.insertAdjacentElement("afterend", greeting);
      }
    }
    if (!greeting) return;
    var acct = account();
    greeting.textContent = "Welcome back, " + (acct && (acct.displayName || acct.username) || "Supernova") + ".";
    greeting.hidden = !state.preferences.home.greeting || !isPro();
  }

  function renderAccountPreview() {
    var acct = account() || {};
    var name = acct.displayName || acct.username || "Nova User";
    var nameNode = el("sn-preview-name");
    if (nameNode) nameNode.textContent = name;
    var greeting = el("sn-overview-greeting");
    if (greeting) greeting.textContent = "Built around " + name + ".";
    var avatar = el("sn-preview-avatar");
    if (avatar) {
      avatar.textContent = "";
      if (acct.avatar || acct.avatarUrl) {
        var image = document.createElement("img");
        image.src = acct.avatar || acct.avatarUrl;
        image.alt = "";
        avatar.appendChild(image);
      } else avatar.textContent = name.charAt(0).toUpperCase();
    }
    updateHomeGreeting();
  }

  function queueSave(section, value) {
    if (syncing || !isPro()) return;
    pendingSave[section] = clone(value);
    clearTimeout(saveTimer);
    setCloudStatus("saving");
    saveTimer = setTimeout(flushSave, section === "aiChats" ? 900 : 450);
  }
  async function flushSave() {
    if (!Object.keys(pendingSave).length || !window.NovaAPI || !window.NovaAPI.saveSupernovaState) return;
    var payload = pendingSave;
    pendingSave = {};
    try {
      var data = await window.NovaAPI.saveSupernovaState(payload);
      if (data && data.state) state.updatedAt = data.state.updatedAt || Date.now();
      setCloudStatus("synced");
    } catch (error) {
      pendingSave = Object.assign({}, payload, pendingSave);
      setCloudStatus("error", error.message);
    }
  }
  function setCloudStatus(status, detail) {
    var title = el("sn-cloud-title");
    var sub = el("sn-cloud-detail");
    var head = el("sn-head-sync");
    var map = {
      loading: ["Connecting", "Loading your private Supernova state"],
      saving: ["Saving", "Syncing changes across your devices"],
      synced: ["Cloud synced", "Your Supernova is current on every device"],
      local: ["Local preview", "Sign in with Supernova to enable cloud sync"],
      error: ["Sync paused", detail || "Nova will retry when you make another change"]
    };
    var copy = map[status] || map.loading;
    if (title) title.textContent = copy[0];
    if (sub) sub.textContent = copy[1];
    if (head) head.textContent = status === "synced" ? "CLOUD SYNCED" : copy[0].toUpperCase();
    var card = document.querySelector(".sn-cloud-card");
    if (card) card.dataset.status = status;
  }

  async function loadCloudState() {
    if (!mounted || syncing) return;
    if (!isPro() || !window.NovaAPI || !window.NovaAPI.supernovaState) {
      setCloudStatus("local");
      applyPreferences();
      return;
    }
    syncing = true;
    setCloudStatus("loading");
    try {
      var data = await window.NovaAPI.supernovaState();
      var remote = data && data.state || {};
      var pristine = !Number(remote.updatedAt || 0);
      var localChats = window.NovaSupernovaAI && window.NovaSupernovaAI.getChats ? window.NovaSupernovaAI.getChats() : {};
      var localThemes = window.NovaSupernovaThemes && window.NovaSupernovaThemes.getThemes ? window.NovaSupernovaThemes.getThemes() : [];
      var localApplied = window.NovaSupernovaThemes && window.NovaSupernovaThemes.getAppliedTheme ? window.NovaSupernovaThemes.getAppliedTheme() : null;
      state.preferences = mergePreferences(remote.preferences);
      state.themes = Array.isArray(remote.themes) ? remote.themes : [];
      state.workspaces = Array.isArray(remote.workspaces) ? remote.workspaces : [];
      state.aiChats = remote.aiChats || {};
      state.updatedAt = Number(remote.updatedAt || 0);
      if (pristine) {
        if (hasChatData(localChats)) state.aiChats = localChats;
        if (localThemes.some(Boolean)) state.themes = localThemes;
        if (localApplied) state.preferences.appliedTheme = localApplied;
      }
      if (window.NovaSupernovaAI && window.NovaSupernovaAI.hydrateChats && hasChatData(state.aiChats)) window.NovaSupernovaAI.hydrateChats(state.aiChats);
      if (window.NovaSupernovaThemes && window.NovaSupernovaThemes.hydrateThemes && (state.themes.some(Boolean) || state.preferences.appliedTheme)) {
        window.NovaSupernovaThemes.hydrateThemes(state.themes, state.preferences.appliedTheme);
      }
      applyPreferences();
      syncControls();
      renderWorkspaces();
      updateOverview();
      setCloudStatus("synced");
      if (pristine) {
        syncing = false;
        queueSave("preferences", state.preferences);
        queueSave("themes", state.themes);
        queueSave("workspaces", state.workspaces);
        queueSave("aiChats", state.aiChats);
        return;
      }
    } catch (error) {
      setCloudStatus(error && error.status === 403 ? "local" : "error", error && error.message);
    } finally {
      syncing = false;
    }
  }

  async function resetThemePersonalization() {
    // Reset only theme-related Supernova state. Keep identity, Island, labs,
    // workspaces and AI history intact.
    clearTimeout(saveTimer);
    saveTimer = 0;
    delete pendingSave.themes;
    delete pendingSave.preferences;

    state.themes = [];
    state.preferences.appliedTheme = null;
    state.preferences.holiday = Object.assign({}, DEFAULTS.holiday, { mode: "off" });

    try {
      localStorage.removeItem("nova_holiday_settings");
      localStorage.setItem("nova_holiday_settings", JSON.stringify(state.preferences.holiday));
    } catch (error) {}

    applyPreferences();
    syncControls();
    updateOverview();

    if (isPro() && window.NovaAPI && window.NovaAPI.saveSupernovaState) {
      setCloudStatus("saving");
      try {
        var data = await window.NovaAPI.saveSupernovaState({
          themes: [],
          preferences: clone(state.preferences)
        });
        if (data && data.state) state.updatedAt = data.state.updatedAt || Date.now();
        setCloudStatus("synced");
      } catch (error) {
        // Keep the local reset even if sync is temporarily unavailable.
        pendingSave.themes = [];
        pendingSave.preferences = clone(state.preferences);
        setCloudStatus("error", error && error.message);
      }
    }
    return clone(state);
  }

  function updateOverview() {
    var cards = document.querySelectorAll(".sn-overview-card");
    cards.forEach(function (card) {
      var section = card.dataset.snCard;
      var label = card.querySelector(".sn-card-state");
      if (!label) {
        label = document.createElement("span");
        label.className = "sn-card-state";
        card.appendChild(label);
      }
      if (section === "themes") label.textContent = state.themes.filter(Boolean).length + "/5 saved";
      else if (section === "workspaces") label.textContent = state.workspaces.length + "/8 spaces";
      else if (section === "ai") label.textContent = hasChatData(state.aiChats) ? "History synced" : "Ready";
      else label.textContent = "Configured";
    });
  }

  function openWorkspaceEditor(workspace) {
    editingWorkspace = workspace && workspace.id || "";
    el("sn-workspace-editor-title").textContent = workspace ? "Edit workspace" : "New workspace";
    el("sn-workspace-name").value = workspace ? workspace.name : "";
    el("sn-workspace-accent").value = workspace ? workspace.accent : "violet";
    el("sn-workspace-links").value = workspace ? workspace.links.map(function (link) { return link.title + " | " + link.url; }).join("\n") : "";
    el("sn-workspace-form-status").textContent = "";
    el("sn-workspace-editor").hidden = false;
    el("sn-workspace-empty").hidden = true;
    el("sn-workspace-grid").hidden = true;
    setTimeout(function () { el("sn-workspace-name")?.focus(); }, 0);
  }
  function closeWorkspaceEditor() {
    editingWorkspace = "";
    el("sn-workspace-editor").hidden = true;
    renderWorkspaces();
  }
  function parseWorkspaceLinks(raw) {
    return String(raw || "").split(/\n+/).map(function (line) {
      line = line.trim();
      if (!line) return null;
      var divider = line.indexOf("|");
      var title = divider >= 0 ? line.slice(0, divider).trim() : "";
      var value = divider >= 0 ? line.slice(divider + 1).trim() : line;
      var url;
      try { url = new URL(value); } catch (error) { throw new Error('Invalid URL: "' + value + '"'); }
      if (["http:", "https:"].indexOf(url.protocol) === -1 || url.username || url.password) throw new Error("Links must use http or https");
      return { title: title || url.hostname, url: url.href };
    }).filter(Boolean).slice(0, 12);
  }
  function saveWorkspaceFromForm() {
    var status = el("sn-workspace-form-status");
    try {
      var name = el("sn-workspace-name").value.trim();
      var links = parseWorkspaceLinks(el("sn-workspace-links").value);
      if (!name) throw new Error("Give the workspace a name");
      if (!links.length) throw new Error("Add at least one link");
      var workspace = { id: editingWorkspace || ("space_" + Date.now().toString(36)), name: name, accent: el("sn-workspace-accent").value, links: links };
      var index = state.workspaces.findIndex(function (item) { return item.id === editingWorkspace; });
      if (index >= 0) state.workspaces[index] = workspace;
      else {
        if (state.workspaces.length >= 8) throw new Error("Supernova supports up to eight workspaces");
        state.workspaces.push(workspace);
      }
      queueSave("workspaces", state.workspaces);
      closeWorkspaceEditor();
      updateOverview();
      toast("Workspace saved to Supernova");
    } catch (error) {
      status.textContent = error.message || "Check the workspace details";
    }
  }
  function renderWorkspaces() {
    var grid = el("sn-workspace-grid");
    var empty = el("sn-workspace-empty");
    if (!grid || !empty) return;
    el("sn-workspace-editor").hidden = true;
    grid.hidden = !state.workspaces.length;
    empty.hidden = !!state.workspaces.length;
    grid.innerHTML = state.workspaces.map(function (workspace) {
      return '<article class="sn-workspace-card" data-accent="' + esc(workspace.accent) + '" data-workspace="' + esc(workspace.id) + '"><header><div class="sn-workspace-glyph">' + icon("workspaces") + '</div>' +
        '<div><h3>' + esc(workspace.name) + '</h3><span>' + workspace.links.length + ' link' + (workspace.links.length === 1 ? "" : "s") + ' · Cloud synced</span></div></header>' +
        '<div class="sn-workspace-links">' + workspace.links.map(function (link) { var host = ""; try { host = new URL(link.url).hostname; } catch (error) {} return '<button type="button" class="sn-workspace-link" data-open-url="' + esc(link.url) + '" data-peek="' + esc(link.url) + '"><span>' + esc(link.title) + '</span><small>' + esc(host) + '</small><i>↗</i></button>'; }).join("") + '</div>' +
        '<footer><button type="button" class="sn-secondary" data-space-edit>Edit</button><button type="button" class="sn-danger-link" data-space-delete>Delete</button><button type="button" class="sn-primary" data-space-launch>Open in Nova</button></footer></article>';
    }).join("");
    grid.querySelectorAll("[data-open-url]").forEach(function (button) { button.addEventListener("click", function () { openUrlInNova(button.dataset.openUrl); }); });
    grid.querySelectorAll(".sn-workspace-card").forEach(function (card) {
      var workspace = state.workspaces.find(function (item) { return item.id === card.dataset.workspace; });
      card.querySelector("[data-space-edit]").addEventListener("click", function () { openWorkspaceEditor(workspace); });
      card.querySelector("[data-space-launch]").addEventListener("click", function () { if (workspace.links[0]) openUrlInNova(workspace.links[0].url); });
      card.querySelector("[data-space-delete]").addEventListener("click", function () {
        if (!confirm('Delete "' + workspace.name + '"?')) return;
        state.workspaces = state.workspaces.filter(function (item) { return item.id !== workspace.id; });
        queueSave("workspaces", state.workspaces);
        renderWorkspaces();
        updateOverview();
      });
    });
  }
  function openUrlInNova(url) {
    var browserNav = document.querySelector('.nav-tab[data-page="browser"]') || document.querySelector('.ni-page-item[data-page="browser"]');
    if (browserNav) browserNav.click();
    setTimeout(function () {
      var bar = el("url-bar");
      if (!bar) return;
      bar.value = url;
      bar.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
    }, 120);
  }

  function exportThemes() {
    var payload = { nova: "supernova-theme-pack", version: 1, themes: state.themes, appliedTheme: state.preferences.appliedTheme };
    var link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    link.download = "nova-supernova-themes.json";
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }
  function importThemes(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!data || data.nova !== "supernova-theme-pack" || !Array.isArray(data.themes)) throw new Error("That is not a Supernova theme pack");
        state.themes = data.themes.slice(0, 5);
        if (data.appliedTheme) state.preferences.appliedTheme = data.appliedTheme;
        if (window.NovaSupernovaThemes && window.NovaSupernovaThemes.hydrateThemes) window.NovaSupernovaThemes.hydrateThemes(state.themes, state.preferences.appliedTheme);
        queueSave("themes", state.themes);
        queueSave("preferences", state.preferences);
        updateOverview();
        toast("Theme pack imported");
      } catch (error) { toast(error.message || "Could not import that theme pack"); }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function createCommandPalette() {
    if (el("sn-command-palette")) return;
    var overlay = document.createElement("div");
    overlay.id = "sn-command-palette";
    overlay.className = "sn-command-palette";
    overlay.hidden = true;
    overlay.innerHTML = '<div class="sn-command-box"><header><span>✦</span><input id="sn-command-input" placeholder="Go anywhere in Nova…" autocomplete="off"><kbd>ESC</kbd></header><div class="sn-command-results" id="sn-command-results"></div><footer>Supernova Command Palette <span>↑↓ navigate · ↵ open</span></footer></div>';
    document.body.appendChild(overlay);
    var commands = [
      ["Home", "Nova start page", "home"], ["Browser", "Open the Nova browser", "browser"], ["Games", "Browse the game library", "games"],
      ["Apps", "Browse apps", "apps"], ["Movies", "Open movies", "movies"], ["Social", "Open Nova Island Social", "social"],
      ["Supernova AI", "Ask the assistant", "supernova", "ai"], ["Theme Studio", "Design Nova", "supernova", "themes"],
      ["Identity", "Profile cosmetics", "supernova", "identity"], ["Labs", "Early access controls", "supernova", "labs"],
      ["Workspaces", "Synced browser spaces", "supernova", "workspaces"], ["Settings", "Nova Control Center", "settings"]
    ];
    var active = 0;
    function render(query) {
      var matches = commands.filter(function (command) { return (command[0] + " " + command[1]).toLowerCase().indexOf(String(query || "").toLowerCase()) >= 0; });
      active = Math.min(active, Math.max(0, matches.length - 1));
      el("sn-command-results").innerHTML = matches.map(function (command, index) { return '<button type="button" class="' + (index === active ? "active" : "") + '" data-page="' + command[2] + '" data-section="' + (command[3] || "") + '"><span>' + esc(command[0]) + '<small>' + esc(command[1]) + '</small></span><i>↵</i></button>'; }).join("");
      el("sn-command-results").querySelectorAll("button").forEach(function (button) { button.addEventListener("click", function () { runCommand(button); }); });
      overlay._matches = matches;
    }
    function runCommand(button) {
      var page = button.dataset.page;
      if (page === "social") {
        el("nova-island-star")?.click();
        setTimeout(function () { document.querySelector('.ni-tab[data-ni-tab="friends"]')?.click(); }, 160);
      } else {
        (document.querySelector('.nav-tab[data-page="' + page + '"]') || document.querySelector('.ni-page-item[data-page="' + page + '"]'))?.click();
        if (button.dataset.section) setTimeout(function () { switchSection(button.dataset.section); }, 100);
      }
      overlay.hidden = true;
    }
    document.addEventListener("keydown", function (event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (!state.preferences.labs.commandPalette || !isPro()) return;
        event.preventDefault();
        overlay.hidden = !overlay.hidden;
        if (!overlay.hidden) { render(""); setTimeout(function () { el("sn-command-input")?.focus(); }, 0); }
      } else if (!overlay.hidden && event.key === "Escape") overlay.hidden = true;
      else if (!overlay.hidden && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        var buttons = Array.from(el("sn-command-results").querySelectorAll("button"));
        active = Math.max(0, Math.min(buttons.length - 1, active + (event.key === "ArrowDown" ? 1 : -1)));
        buttons.forEach(function (button, index) { button.classList.toggle("active", index === active); });
      } else if (!overlay.hidden && event.key === "Enter") {
        event.preventDefault();
        el("sn-command-results").querySelectorAll("button")[active]?.click();
      }
    });
    el("sn-command-input").addEventListener("input", function () { active = 0; render(this.value); });
    overlay.addEventListener("click", function (event) { if (event.target === overlay) overlay.hidden = true; });
    render("");
  }

  function init() {
    mountHub();
    state.preferences = mergePreferences(state.preferences);
    applyPreferences();
    syncControls();
    renderWorkspaces();
    updateOverview();
    setTimeout(loadCloudState, 350);
  }
  document.addEventListener("DOMContentLoaded", init);
  document.addEventListener("nova:page-change", function (event) { if (event.detail && event.detail.page === "supernova") { updateOverview(); if (!state.updatedAt) loadCloudState(); } });

  window.NovaSupernovaHub = { init: init, reload: loadCloudState, openUrl: openUrlInNova, resetThemes: resetThemePersonalization, getState: function () { return clone(state); } };
})();
