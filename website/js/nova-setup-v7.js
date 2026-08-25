(function () {
  "use strict";

  var COMPLETE_KEY = "nova_setup_v7_complete";
  var COMPLETE_VERSION = "7.0-launch";
  var MODE_KEY = "nova_setup_v7_mode";
  var GUEST_NAME_KEY = "nova_guest_display_name";
  var GUEST_AVATAR_KEY = "nova_guest_avatar";
  var root = null;
  var cameraStream = null;
  var waitingForAccount = false;
  var transitionTimer = null;
  var started = false;

  var state = {
    step: 1,
    mode: "guest",
    theme: localStorage.getItem("nova_theme") || "dark",
    performance: "balanced",
    animationIntensity: 75,
    starDensity: 70,
    soundEffects: false,
    privacyReviewed: false,
    profileLoaded: false,
    profileTouched: { displayName: false, bio: false, avatarUrl: false },
    profile: {
      displayName: "",
      bio: "",
      statusText: "",
      avatarUrl: "",
      bannerUrl: "",
      pronouns: "",
      locationText: "",
      websiteUrl: "",
      onlineVisibility: "everyone",
      activityVisibility: "friends"
    },
    guestName: localStorage.getItem(GUEST_NAME_KEY) || "Guest",
    guestAvatar: localStorage.getItem(GUEST_AVATAR_KEY) || "violet"
  };

  var THEMES = [
    { key: "dark", label: "Nova Dark", color: "#8b8fff", base: "dark" },
    { key: "nebula", label: "Nebula", color: "#c084fc", base: "dark" },
    { key: "midnight", label: "Midnight", color: "#60a5fa", base: "dark" },
    { key: "crimson", label: "Crimson", color: "#f87171", base: "dark" },
    { key: "forest", label: "Forest", color: "#4ade80", base: "dark" },
    { key: "light", label: "Light", color: "#5d5df6", base: "light" }
  ];

  var FALLBACK_THEME = {
    dark: ["#8b8fff", "#5d5df6", "#04040a", "#080812", "#0c0c1a"],
    nebula: ["#c084fc", "#a855f7", "#06020f", "#0b0418", "#120622"],
    midnight: ["#60a5fa", "#3b82f6", "#020810", "#040e1c", "#071528"],
    crimson: ["#f87171", "#ef4444", "#0f0404", "#180606", "#200808"],
    forest: ["#4ade80", "#22c55e", "#020d06", "#04140a", "#071a0e"],
    light: ["#5d5df6", "#4040d0", "#f2f2f8", "#eaeaf2", "#dcdcec"]
  };

  var ICONS = {
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    guest: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c.8 4.6 4.4 8.2 9 9-4.6.8-8.2 4.4-9 9-.8-4.6-4.4-8.2-9-9 4.6-.8 8.2-4.4 9-9Z"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>',
    image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
    camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z"/><circle cx="12" cy="13" r="4"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>'
  };

  function esc(value) {
    var element = document.createElement("div");
    element.textContent = value == null ? "" : String(value);
    return element.innerHTML;
  }

  function user() { return window.__novaV7User || null; }
  function byId(id) { return document.getElementById(id); }
  function all(selector) { return Array.from(document.querySelectorAll(selector)); }
  function setHidden(element, hidden) { if (element) element.hidden = !!hidden; }

  function controls() {
    return window.NovaControlCenter && typeof NovaControlCenter.read === "function" ? NovaControlCenter.read() : {};
  }

  function readInitialControls() {
    var current = controls();
    if (!THEMES.some(function (theme) { return theme.key === state.theme; })) state.theme = "dark";
    state.performance = ["quality", "balanced", "fast"].includes(current.performanceMode) ? current.performanceMode : "balanced";
    state.animationIntensity = Number.isFinite(Number(current.animationIntensity)) ? Number(current.animationIntensity) : 75;
    state.starDensity = Number.isFinite(Number(current.starDensity)) ? Number(current.starDensity) : 70;
    state.soundEffects = !!current.soundEffects;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) state.animationIntensity = 0;
  }

  function buildThemeButtons() {
    return THEMES.map(function (theme) {
      return '<button class="nova-setup-theme" type="button" data-setup-theme="' + theme.key + '"><span class="nova-setup-theme-swatch" style="--swatch:' + theme.color + '"></span><span>' + theme.label + '</span></button>';
    }).join("");
  }

  function generatedAvatar(name) {
    return '<span class="nova-setup-avatar generated avatar-' + esc(name) + '"></span>';
  }

  function build() {
    root = document.createElement("div");
    root.id = "nova-setup";
    root.className = "nova-setup";
    root.dataset.identity = state.mode;
    root.innerHTML = `
      <div class="nova-setup-stage">
        <header class="nova-setup-topbar">
          <div class="nova-setup-mini-brand">N<span>✦</span>VA <small>7</small></div>
          <div class="nova-setup-step-label" id="nova-setup-step-label">Welcome</div>
          <button class="nova-setup-skip" id="nova-setup-skip" type="button">Skip setup</button>
        </header>

        <main class="nova-setup-viewport">
          <section class="nova-setup-page nova-setup-page-start active" data-setup-page="1" aria-labelledby="nova-setup-start-title">
            <div class="nova-setup-content">
              <div class="nova-setup-kicker">Nova 7</div>
              <div class="nova-setup-wordmark" aria-label="Nova">
                <span class="nova7-logo-part nova7-logo-n">N</span>
                <svg class="nova7-logo-star" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 0 C55 29 71 45 100 50 C71 55 55 71 50 100 C45 71 29 55 0 50 C29 45 45 29 50 0 Z"></path></svg>
                <span class="nova7-logo-va" aria-hidden="true"><span class="nova7-logo-v">V</span><span class="nova7-logo-a">A</span></span>
              </div>
              <h1 id="nova-setup-start-title">Make Nova yours</h1>
              <p class="nova-setup-lead" style="margin-left:auto;margin-right:auto">Choose how you want to begin. You can change account and personalization options later.</p>
              <div class="nova-setup-choice-row">
                <button class="nova-setup-choice primary" id="nova-setup-account-choice" type="button">
                  <span class="nova-setup-choice-icon">${ICONS.user}</span>
                  <span><strong id="nova-setup-account-choice-title">Sign In or Create Account</strong><small>Profiles, Social, and settings that follow you.</small></span>
                  <span class="nova-setup-choice-arrow">›</span>
                </button>
                <button class="nova-setup-choice" id="nova-setup-guest-choice" type="button">
                  <span class="nova-setup-choice-icon">${ICONS.guest}</span>
                  <span><strong>Continue as Guest</strong><small>Jump straight into the browser, games, apps, and movies.</small></span>
                  <span class="nova-setup-choice-arrow">›</span>
                </button>
              </div>
              <div class="nova-setup-save-status" id="nova-setup-global-status" role="status" aria-live="polite"></div>
            </div>
          </section>

          <section class="nova-setup-page" data-setup-page="2" aria-labelledby="nova-setup-identity-title">
            <div class="nova-setup-content">
              <span class="nova-setup-kicker">Your identity</span>
              <h2 id="nova-setup-identity-title">Make it yours</h2>
              <p class="nova-setup-lead" id="nova-setup-identity-lead">Build the profile people see across Nova Social.</p>
              <div class="nova-setup-identity-grid">
                <div>
                  <div class="nova-setup-profile-preview">
                    <div class="nova-setup-social-profile">
                      <div class="nova-setup-avatar-ring"><span class="nova-setup-avatar" data-setup-avatar-preview></span></div>
                      <div class="nova-setup-profile-copy"><strong data-setup-name-preview>Guest</strong><span class="username" data-setup-username-preview>Local identity</span><p data-setup-bio-preview>Saved on this device.</p></div>
                    </div>
                  </div>
                  <div class="nova-setup-local-note" id="nova-setup-identity-note">Guest identity stays on this device. Social and chat require a signed-in account.</div>
                </div>

                <div class="nova-setup-fields">
                  <div id="nova-setup-account-fields" hidden>
                    <div class="nova-setup-avatar-editor" id="nova-setup-avatar-drop">
                      <span class="nova-setup-avatar" data-setup-avatar-preview></span>
                      <div class="nova-setup-avatar-editor-copy"><strong>Profile image</strong><span>Drop an image here, upload one, or use your camera.</span></div>
                      <div class="nova-setup-avatar-actions">
                        <button class="nova-setup-icon-button" id="nova-setup-avatar-upload" type="button" title="Upload image" aria-label="Upload image">${ICONS.image}</button>
                        <button class="nova-setup-icon-button" id="nova-setup-avatar-camera" type="button" title="Take photo" aria-label="Take photo">${ICONS.camera}</button>
                      </div>
                    </div>
                    <div class="nova-setup-field" style="margin-top:16px"><span>Display name</span><input id="nova-setup-display-name" maxlength="40" autocomplete="name" spellcheck="false"></div>
                    <div class="nova-setup-field" style="margin-top:16px"><span>Username</span><input id="nova-setup-username" readonly></div>
                    <label class="nova-setup-field" style="margin-top:16px"><span class="nova-setup-field-head"><span>Bio</span><span><b id="nova-setup-bio-count">0</b>/280</span></span><textarea id="nova-setup-bio" maxlength="280" placeholder="Tell people a little about you"></textarea></label>
                  </div>

                  <div id="nova-setup-guest-fields">
                    <label class="nova-setup-field"><span>Guest display name</span><input id="nova-setup-guest-name" maxlength="24" autocomplete="off" spellcheck="false" value="${esc(state.guestName)}"></label>
                    <div class="nova-setup-field" style="margin-top:18px"><span>Nova avatar</span><div class="nova-setup-avatar-choices">
                      ${["violet", "rose", "blue", "green"].map(function (name) { return '<button class="nova-setup-avatar-choice" type="button" data-guest-avatar="' + name + '" aria-label="Use ' + name + ' Nova avatar">' + generatedAvatar(name) + '</button>'; }).join("")}
                    </div></div>
                  </div>
                  <div class="nova-setup-save-status" id="nova-setup-identity-status" role="status" aria-live="polite"></div>
                </div>
              </div>
            </div>
          </section>

          <section class="nova-setup-page" data-setup-page="3" aria-labelledby="nova-setup-experience-title">
            <div class="nova-setup-content">
              <span class="nova-setup-kicker">Look and feel</span>
              <h2 id="nova-setup-experience-title">Choose your experience</h2>
              <p class="nova-setup-lead">Preview Nova while you tune its theme, visual workload, and motion.</p>
              <div class="nova-setup-experience-grid">
                <div class="nova-setup-live-preview" id="nova-setup-live-preview">
                  <div class="nova-setup-preview-island"><span class="nova-setup-preview-star">✦</span><div><strong>Nova Island</strong><span>Ready when you are</span></div></div>
                  <div class="nova-setup-preview-search">Search or enter a URL...</div>
                  <div class="nova-setup-preview-person"><span class="nova-setup-avatar" data-setup-avatar-preview></span><div><strong data-setup-name-preview>Guest</strong><span data-setup-bio-preview>Your Nova identity</span></div></div>
                </div>
                <div class="nova-setup-options">
                  <div><div class="nova-setup-section-label" style="margin-bottom:10px">Theme</div><div class="nova-setup-theme-grid">${buildThemeButtons()}</div></div>
                  <div><div class="nova-setup-section-label" style="margin-bottom:10px">Performance</div><div class="nova-setup-segments" id="nova-setup-performance">
                    <button type="button" data-performance="balanced">Adaptive<span>Recommended</span></button>
                    <button type="button" data-performance="quality">Full<span>Maximum depth</span></button>
                    <button type="button" data-performance="fast">Lite<span>Lowest workload</span></button>
                  </div></div>
                  <div class="nova-setup-range"><label for="nova-setup-animation">Animation intensity</label><output id="nova-setup-animation-output">75%</output><input id="nova-setup-animation" type="range" min="0" max="100" value="75"></div>
                  <div class="nova-setup-range"><label for="nova-setup-stars">Star density</label><output id="nova-setup-stars-output">70%</output><input id="nova-setup-stars" type="range" min="0" max="100" value="70"></div>
                  <div class="nova-setup-toggle-row"><div class="nova-setup-toggle-copy"><strong>Sound effects</strong><span>Quiet by default</span></div><label class="nova-setup-switch"><input id="nova-setup-sounds" type="checkbox"><span></span></label></div>
                  <div class="nova-setup-motion-note" id="nova-setup-motion-note" hidden>Your device requests reduced motion. Nova will keep transitions minimal.</div>
                </div>
              </div>
            </div>
          </section>

          <section class="nova-setup-page" data-setup-page="4" aria-labelledby="nova-setup-privacy-title">
            <div class="nova-setup-content narrow">
              <span class="nova-setup-kicker">Clear by design</span>
              <h2 id="nova-setup-privacy-title">Privacy</h2>
              <p class="nova-setup-lead">A short explanation of the information Nova needs to operate and protect the service.</p>
              <div class="nova-setup-privacy-list">
                <div class="nova-setup-privacy-row"><span class="nova-setup-privacy-number">01</span><strong>What Nova records</strong><p>Account and profile data you submit, Social activity, settings you sync, and destinations opened through Nova's browser.</p></div>
                <div class="nova-setup-privacy-row"><span class="nova-setup-privacy-number">02</span><strong>Why browser activity is logged</strong><p>Sanitized destination URLs and one-way hashed random device IDs support abuse investigations, device bans, and service reliability. Credentials, URL fragments, and sensitive query values are removed.</p></div>
                <div class="nova-setup-privacy-row"><span class="nova-setup-privacy-number">03</span><strong>Automatic deletion</strong><p>Standard browser records expire after 14 days. Records connected to a security incident can remain for 90 days. Administrative audits expire after one year.</p></div>
                <div class="nova-setup-privacy-row"><span class="nova-setup-privacy-number">04</span><strong>What Nova never records</strong><p>Nova does not store your account password in readable form, sell personal data, or record the contents of pages you visit through the proxy.</p></div>
                <div class="nova-setup-privacy-row"><span class="nova-setup-privacy-number">05</span><strong>Account-based Social access</strong><p>Browsing works for guests. Sending messages, friend requests, and group invitations requires a signed-in Nova account.</p></div>
              </div>
              <div class="nova-setup-privacy-links"><a class="nova-setup-text-link" href="#nova-privacy" data-legal="privacy">Privacy Policy</a><a class="nova-setup-text-link" href="#nova-terms" data-legal="terms">Terms of Service</a></div>
            </div>
          </section>

          <section class="nova-setup-page" data-setup-page="5" aria-labelledby="nova-setup-ready-title">
            <div class="nova-setup-content narrow nova-setup-ready">
              <div class="nova-setup-avatar-ring"><span class="nova-setup-avatar" data-setup-avatar-preview></span></div>
              <span class="nova-setup-kicker">Everything is in place</span>
              <h2 id="nova-setup-ready-title">Your Nova is ready</h2>
              <p class="nova-setup-lead" style="margin-left:auto;margin-right:auto">Enter Nova with your identity, appearance, and privacy choices applied.</p>
              <div class="nova-setup-ready-summary">
                <div class="nova-setup-ready-item"><span>Identity</span><strong id="nova-setup-summary-identity">Guest</strong></div>
                <div class="nova-setup-ready-item"><span>Experience</span><strong id="nova-setup-summary-experience">Nova Dark · Adaptive</strong></div>
                <div class="nova-setup-ready-item"><span>Privacy</span><strong>Reviewed · 14-day standard log retention</strong></div>
              </div>
              <div class="nova-setup-social-access" id="nova-setup-social-access">Sign in to use Social.</div>
              <div class="nova-setup-save-status" id="nova-setup-final-status" role="status" aria-live="polite"></div>
            </div>
          </section>
        </main>

        <footer class="nova-setup-footer" id="nova-setup-footer" hidden>
          <button class="nova-setup-secondary nova-setup-back" id="nova-setup-back" type="button">${ICONS.back}<span>Back</span></button>
          <div class="nova-setup-progress" aria-hidden="true">${[1, 2, 3, 4, 5].map(function (number) { return '<span data-progress="' + number + '"></span>'; }).join("")}</div>
          <div class="nova-setup-footer-actions"><button class="nova-setup-primary" id="nova-setup-next" type="button"><span>Continue</span>${ICONS.arrow}</button></div>
        </footer>
      </div>

      <input id="nova-setup-avatar-file" type="file" accept="image/*" hidden>
      <input id="nova-setup-avatar-camera-file" type="file" accept="image/*" capture="user" hidden>
      <div class="nova-setup-legal" id="nova-setup-legal" role="dialog" aria-modal="true" hidden></div>
      <div class="nova-setup-camera" id="nova-setup-camera" role="dialog" aria-modal="true" aria-label="Take profile photo" hidden></div>
    `;
    document.body.appendChild(root);
    bind();
    render();
  }

  function setStatus(id, message, bad) {
    var element = byId(id);
    if (!element) return;
    element.textContent = message || "";
    element.classList.toggle("error", !!bad);
  }

  function identityName() {
    if (state.mode === "account") return state.profile.displayName || (user() && (user().displayName || user().username)) || "Nova user";
    return state.guestName.trim() || "Guest";
  }

  function identityBio() {
    if (state.mode === "account") return state.profile.bio || state.profile.statusText || "Nova user";
    return "Saved on this device. Social unlocks with a signed-in account.";
  }

  function renderAvatar(element) {
    if (!element) return;
    var name = identityName();
    element.className = "nova-setup-avatar";
    element.innerHTML = "";
    if (state.mode === "account" && state.profile.avatarUrl) {
      var image = document.createElement("img");
      image.src = state.profile.avatarUrl;
      image.alt = "";
      image.onerror = function () { image.remove(); element.textContent = name.charAt(0).toUpperCase() || "N"; };
      element.appendChild(image);
      return;
    }
    if (state.mode === "guest") {
      element.classList.add("generated", "avatar-" + state.guestAvatar);
      return;
    }
    element.textContent = name.charAt(0).toUpperCase() || "N";
  }

  function renderIdentity() {
    if (!root) return;
    root.dataset.identity = state.mode;
    var account = state.mode === "account";
    setHidden(byId("nova-setup-account-fields"), !account);
    setHidden(byId("nova-setup-guest-fields"), account);
    var lead = byId("nova-setup-identity-lead");
    var note = byId("nova-setup-identity-note");
    if (lead) lead.textContent = account ? "Build the profile people see across Nova Social." : "Create a lightweight identity for this device.";
    if (note) note.textContent = account ? "Your profile is saved to Nova and appears in Social." : "Guest identity stays on this device. Social and chat require a signed-in account.";

    if (account) {
      var displayName = byId("nova-setup-display-name");
      var username = byId("nova-setup-username");
      var bio = byId("nova-setup-bio");
      if (displayName && document.activeElement !== displayName) displayName.value = state.profile.displayName || identityName();
      if (username) username.value = "@" + ((user() && user().username) || "user");
      if (bio && document.activeElement !== bio) bio.value = state.profile.bio || "";
      if (byId("nova-setup-bio-count")) byId("nova-setup-bio-count").textContent = String((state.profile.bio || "").length);
    } else {
      var guestName = byId("nova-setup-guest-name");
      if (guestName && document.activeElement !== guestName) guestName.value = state.guestName;
    }

    all("[data-setup-avatar-preview]").forEach(renderAvatar);
    all("[data-setup-name-preview]").forEach(function (element) { element.textContent = identityName(); });
    all("[data-setup-username-preview]").forEach(function (element) { element.textContent = account ? "@" + ((user() && user().username) || "user") : "Local identity"; });
    all("[data-setup-bio-preview]").forEach(function (element) { element.textContent = identityBio(); });
    all("[data-guest-avatar]").forEach(function (button) { button.classList.toggle("active", button.dataset.guestAvatar === state.guestAvatar); });
  }

  function renderExperience() {
    all("[data-setup-theme]").forEach(function (button) { button.classList.toggle("active", button.dataset.setupTheme === state.theme); });
    all("[data-performance]").forEach(function (button) { button.classList.toggle("active", button.dataset.performance === state.performance); });
    var animation = byId("nova-setup-animation");
    var stars = byId("nova-setup-stars");
    var sounds = byId("nova-setup-sounds");
    if (animation) animation.value = String(state.animationIntensity);
    if (stars) stars.value = String(state.starDensity);
    if (sounds) sounds.checked = state.soundEffects;
    if (byId("nova-setup-animation-output")) byId("nova-setup-animation-output").textContent = state.animationIntensity + "%";
    if (byId("nova-setup-stars-output")) byId("nova-setup-stars-output").textContent = state.starDensity + "%";
    document.documentElement.style.setProperty("--nova-animation-intensity", String(state.animationIntensity / 100));
    document.documentElement.style.setProperty("--nova-star-density", String(state.starDensity / 100));
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setHidden(byId("nova-setup-motion-note"), !reduced);
  }

  function renderReady() {
    var theme = THEMES.find(function (item) { return item.key === state.theme; }) || THEMES[0];
    var performance = state.performance === "quality" ? "Full" : (state.performance === "fast" ? "Lite" : "Adaptive");
    if (byId("nova-setup-summary-identity")) byId("nova-setup-summary-identity").textContent = state.mode === "account" ? identityName() + " · @" + ((user() && user().username) || "user") : identityName() + " · Local guest";
    if (byId("nova-setup-summary-experience")) byId("nova-setup-summary-experience").textContent = theme.label + " · " + performance;
    var access = byId("nova-setup-social-access");
    if (!access) return;
    access.classList.remove("enabled");
    if (state.mode === "guest") {
      access.textContent = "A signed-in account unlocks Social, messages, and friend requests.";
    } else {
      access.classList.add("enabled");
      access.textContent = "Account ready. Social is enabled.";
    }
  }

  function render() {
    if (!root) return;
    renderIdentity();
    renderExperience();
    renderReady();
    var footer = byId("nova-setup-footer");
    setHidden(footer, state.step === 1);
    if (byId("nova-setup-step-label")) byId("nova-setup-step-label").textContent = ["Welcome", "Identity", "Experience", "Privacy", "Ready"][state.step - 1];
    all("[data-progress]").forEach(function (item) { item.classList.toggle("active", Number(item.dataset.progress) === state.step); });
    var next = byId("nova-setup-next");
    if (next) next.querySelector("span").textContent = state.step === 5 ? "Enter Nova" : "Continue";
    var accountTitle = byId("nova-setup-account-choice-title");
    if (accountTitle) accountTitle.textContent = user() ? "Continue as " + (user().displayName || user().username) : "Sign In or Create Account";
  }

  function goTo(step) {
    if (!root || step < 1 || step > 5 || step === state.step) return;
    var oldStep = state.step;
    var backwards = step < oldStep;
    var oldPage = root.querySelector('[data-setup-page="' + oldStep + '"]');
    var nextPage = root.querySelector('[data-setup-page="' + step + '"]');
    clearTimeout(transitionTimer);
    if (oldPage) {
      oldPage.classList.remove("active", "from-back");
      oldPage.classList.add("leaving");
      oldPage.classList.toggle("to-back", backwards);
    }
    state.step = step;
    if (step === 3) {
      updateControl("themeAccentLocked", true);
      updateControl("backgroundAnimation", state.performance !== "fast" && state.animationIntensity > 0);
    }
    render();
    if (nextPage) {
      nextPage.classList.remove("leaving", "to-back", "from-back");
      if (backwards) nextPage.classList.add("from-back");
      requestAnimationFrame(function () { nextPage.classList.add("active"); });
    }
    transitionTimer = setTimeout(function () {
      if (oldPage) oldPage.classList.remove("leaving", "to-back");
    }, 260);
    setTimeout(function () { nextPage && nextPage.querySelector("h1,h2")?.focus({ preventScroll: true }); }, 50);
  }

  async function loadAccountProfile() {
    if (!user()) return;
    state.mode = "account";
    var fallback = {
      displayName: user().displayName || user().username,
      avatarUrl: user().avatarUrl || ""
    };
    state.profile = Object.assign({}, state.profile, fallback);
    renderIdentity();
    setStatus("nova-setup-identity-status", "Loading your Nova profile...");
    try {
      var data = await NovaAPI.getProfile();
      state.profile = Object.assign({}, state.profile, data.profile || fallback);
      state.profileLoaded = true;
      state.profileTouched = { displayName: false, bio: false, avatarUrl: false };
      setStatus("nova-setup-identity-status", "Your current profile is ready to edit.");
    } catch (error) {
      setStatus("nova-setup-identity-status", error.message || "Nova could not load your profile.", true);
    }
    render();
  }

  async function chooseAccount() {
    if (user()) {
      var choice = byId("nova-setup-account-choice");
      if (choice) choice.disabled = true;
      setStatus("nova-setup-global-status", "Loading your Nova profile...");
      try {
        await loadAccountProfile();
        setStatus("nova-setup-global-status", "");
        goTo(2);
      } finally {
        if (choice) choice.disabled = false;
      }
      return;
    }
    waitingForAccount = true;
    setStatus("nova-setup-global-status", "Sign in or create your account to continue.");
    if (window.NovaAccount && NovaAccount.open) NovaAccount.open("signup");
    else byId("account-btn")?.click();
  }

  function chooseGuest() {
    state.mode = "guest";
    waitingForAccount = false;
    setStatus("nova-setup-global-status", "");
    goTo(2);
  }

  function validateIdentity() {
    if (state.mode === "account") {
      state.profile.displayName = String(byId("nova-setup-display-name")?.value || "").trim();
      state.profile.bio = String(byId("nova-setup-bio")?.value || "").trim();
      if (!state.profile.displayName) {
        setStatus("nova-setup-identity-status", "Add a display name before continuing.", true);
        byId("nova-setup-display-name")?.focus();
        return false;
      }
    } else {
      state.guestName = String(byId("nova-setup-guest-name")?.value || "").trim() || "Guest";
    }
    setStatus("nova-setup-identity-status", "");
    render();
    return true;
  }

  function applyTheme(key) {
    state.theme = key;
    localStorage.setItem("nova_theme", key);
    updateControl("themeAccentLocked", true);
    var actual = document.querySelector('.theme-preset-btn[data-theme-key="' + CSS.escape(key) + '"]');
    if (actual) {
      actual.click();
    } else {
      var values = FALLBACK_THEME[key] || FALLBACK_THEME.dark;
      var theme = THEMES.find(function (item) { return item.key === key; }) || THEMES[0];
      document.documentElement.setAttribute("data-theme", theme.base);
      document.documentElement.style.setProperty("--accent", values[0]);
      document.documentElement.style.setProperty("--accent2", values[1]);
      document.documentElement.style.setProperty("--bg", values[2]);
      document.documentElement.style.setProperty("--bg2", values[3]);
      document.documentElement.style.setProperty("--s1", values[4]);
    }
    var preview = byId("nova-setup-live-preview");
    if (preview) {
      preview.classList.remove("theme-ripple");
      void preview.offsetWidth;
      preview.classList.add("theme-ripple");
    }
    renderExperience();
  }

  function updateControl(key, value) {
    if (window.NovaControlCenter && NovaControlCenter.update) NovaControlCenter.update(key, value);
  }

  function setPerformance(value) {
    state.performance = value;
    updateControl("performanceMode", value);
    if (value === "fast") {
      updateControl("blurLevel", "off");
      updateControl("backgroundAnimation", false);
    } else if (value === "quality") {
      updateControl("blurLevel", "full");
      updateControl("backgroundAnimation", state.animationIntensity > 0);
    } else {
      updateControl("blurLevel", "low");
      updateControl("backgroundAnimation", state.animationIntensity > 0);
    }
    renderExperience();
  }

  async function acceptImage(file) {
    if (!file) return;
    setStatus("nova-setup-identity-status", "Preparing your image...");
    var drop = byId("nova-setup-avatar-drop");
    drop?.classList.add("processing");
    try {
      if (!window.NovaProfileTools || !NovaProfileTools.prepareImage) throw new Error("Profile images are still loading. Try again.");
      state.profile.avatarUrl = await NovaProfileTools.prepareImage(file);
      state.profileTouched.avatarUrl = true;
      setStatus("nova-setup-identity-status", "Image ready. It will be saved when you enter Nova.");
      renderIdentity();
    } catch (error) {
      setStatus("nova-setup-identity-status", error.message || "Nova could not prepare that image.", true);
    } finally {
      drop?.classList.remove("processing", "drag-active");
    }
  }

  function stopCamera() {
    if (cameraStream) cameraStream.getTracks().forEach(function (track) { track.stop(); });
    cameraStream = null;
    var layer = byId("nova-setup-camera");
    if (layer) { layer.hidden = true; layer.innerHTML = ""; }
  }

  async function openCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      byId("nova-setup-avatar-camera-file")?.click();
      return;
    }
    stopCamera();
    var layer = byId("nova-setup-camera");
    if (!layer) return;
    layer.innerHTML = '<div class="nova-setup-dialog"><header><div><span class="nova-setup-kicker">Profile image</span><h3>Take a photo</h3></div><button class="nova-setup-dialog-close" type="button" data-camera-close aria-label="Close camera">' + ICONS.close + '</button></header><div class="nova-setup-camera-view"><video autoplay muted playsinline></video><div class="nova-setup-camera-loading">Starting camera...</div></div><div class="nova-setup-camera-actions"><button class="nova-setup-secondary" type="button" data-camera-close>Cancel</button><button class="nova-setup-primary" id="nova-setup-camera-capture" type="button" disabled>Capture</button></div></div>';
    layer.hidden = false;
    layer.querySelectorAll("[data-camera-close]").forEach(function (button) { button.onclick = stopCamera; });
    var video = layer.querySelector("video");
    var capture = byId("nova-setup-camera-capture");
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "user" } }, audio: false });
      video.srcObject = cameraStream;
      await video.play();
      layer.querySelector(".nova-setup-camera-loading").hidden = true;
      capture.disabled = false;
    } catch (error) {
      stopCamera();
      setStatus("nova-setup-identity-status", error && error.name === "NotAllowedError" ? "Camera permission was not allowed." : "Camera is unavailable on this device.", true);
      return;
    }
    capture.onclick = async function () {
      capture.disabled = true;
      var size = Math.min(video.videoWidth || 720, video.videoHeight || 720);
      var canvas = document.createElement("canvas");
      canvas.width = size; canvas.height = size;
      var context = canvas.getContext("2d");
      context.translate(size, 0); context.scale(-1, 1);
      context.drawImage(video, ((video.videoWidth || size) - size) / 2, ((video.videoHeight || size) - size) / 2, size, size, 0, 0, size, size);
      var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, "image/webp", .9); });
      stopCamera();
      if (blob) acceptImage(new File([blob], "nova-profile.webp", { type: "image/webp" }));
    };
  }

  function legalContent(type) {
    if (type === "terms") {
      return {
        kicker: "Nova 7",
        title: "Terms of Service",
        sections: [
          ["Use Nova responsibly", "Do not use Nova to harm other people, disrupt the service, evade a lawful restriction, distribute malware, or access accounts and systems without permission."],
          ["Accounts and Social", "Keep your credentials private. You are responsible for activity from your account. Nova may restrict accounts or devices used for abuse, harassment, spam, or attempts to compromise the service."],
          ["Content", "Only share content you have the right to share. Public and reported content may be reviewed for moderation and security."],
          ["Service changes", "Nova may update, limit, or discontinue features to protect users, meet technical requirements, or improve the service."],
          ["No guarantee", "Nova is provided as available. Availability, compatibility, and uninterrupted proxy access cannot be guaranteed."]
        ]
      };
    }
    return {
      kicker: "Nova 7",
      title: "Privacy Policy",
      sections: [
        ["Data you provide", "Nova stores account details, profile fields, settings, friendships, groups, messages, reports, and other information you choose to submit."],
        ["Browser security records", "Nova logs sanitized destination URLs and one-way hashes of random device identifiers. Sensitive URL fields, credentials, and URL fragments are removed before storage."],
        ["Retention", "Standard navigation logs expire after 14 days, security incident records after 90 days, and administrative audit records after one year."],
        ["How data is used", "Data operates account, Social, personalization, moderation, security, device bans, and service reliability features. Nova does not sell personal information."],
        ["Your choices", "Guests can browse without an account. Settings can be kept on-device, profile fields can be edited, recent local activity can be cleared, and signed-in users can sign out at any time."]
      ]
    };
  }

  function openLegal(type) {
    var data = legalContent(type);
    var layer = byId("nova-setup-legal");
    if (!layer) return;
    layer.innerHTML = '<div class="nova-setup-dialog"><header><div><span class="nova-setup-kicker">' + esc(data.kicker) + '</span><h3>' + esc(data.title) + '</h3></div><button class="nova-setup-dialog-close" type="button" data-legal-close aria-label="Close">' + ICONS.close + '</button></header><div class="nova-setup-legal-body">' + data.sections.map(function (section) { return '<section><strong>' + esc(section[0]) + '</strong><p>' + esc(section[1]) + '</p></section>'; }).join("") + '</div></div>';
    layer.hidden = false;
    layer.querySelector("[data-legal-close]")?.addEventListener("click", closeLegal);
  }

  function closeLegal() {
    var layer = byId("nova-setup-legal");
    if (layer) { layer.hidden = true; layer.innerHTML = ""; }
  }

  async function suppressInitialWhatsNew() {
    try {
      var response = await fetch("/website/data/whats-new.json", { cache: "no-store" });
      var data = await response.json();
      if (data && data.version) localStorage.setItem("nova_seen_version", data.version);
    } catch (error) {
      localStorage.setItem("nova_seen_version", document.querySelector('meta[name="nova-version"]')?.content || "7.0");
    }
    byId("whats-new-overlay")?.classList.add("hidden");
  }

  async function saveSetup(skip) {
    var current = controls();
    if (window.NovaControlCenter && NovaControlCenter.cancelRemoteSync) NovaControlCenter.cancelRemoteSync();
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var settings = Object.assign({}, current, {
      theme: state.theme,
      performanceMode: state.performance,
      animationIntensity: state.animationIntensity,
      starDensity: state.starDensity,
      soundEffects: state.soundEffects,
      reduceMotion: reduced || !!current.reduceMotion,
      setupVersion: 7,
      setupMode: state.mode,
      setupCompletedAt: new Date().toISOString()
    });

    if (state.mode === "account" && !user()) throw new Error("Your session ended. Sign in again before saving setup.");
    if (state.mode === "account") {
      if (!skip && !state.profileLoaded) {
        var draft = Object.assign({}, state.profile);
        var currentProfile = await NovaAPI.getProfile();
        state.profile = Object.assign({}, currentProfile.profile || {}, {
          displayName: state.profileTouched.displayName ? draft.displayName : ((currentProfile.profile && currentProfile.profile.displayName) || identityName()),
          bio: state.profileTouched.bio ? draft.bio : ((currentProfile.profile && currentProfile.profile.bio) || ""),
          avatarUrl: state.profileTouched.avatarUrl ? draft.avatarUrl : ((currentProfile.profile && currentProfile.profile.avatarUrl) || "")
        });
        state.profileLoaded = true;
      }
      var jobs = [NovaAPI.saveSettings(settings)];
      if (!skip) jobs.push(NovaAPI.saveProfile(Object.assign({}, state.profile, {
        displayName: identityName(),
        bio: state.profile.bio || ""
      })));
      var results = await Promise.all(jobs);
      var profileResult = results.find(function (result) { return result && result.profile; });
      if (profileResult) window.dispatchEvent(new CustomEvent("nova:profile-updated", { detail: profileResult.profile }));
      var me = await NovaAPI.me();
      window.__novaV7User = me.user;
      NovaAPI.cacheUser(me.user);
    } else {
      localStorage.setItem(GUEST_NAME_KEY, identityName());
      localStorage.setItem(GUEST_AVATAR_KEY, state.guestAvatar);
    }

    localStorage.setItem("nova_control_center", JSON.stringify(settings));
    localStorage.setItem("nova_theme", state.theme);
    localStorage.setItem(MODE_KEY, state.mode);
    localStorage.setItem("nova_consent", "accepted");
    await suppressInitialWhatsNew();
  }

  async function finish(skip) {
    if (!root || root.classList.contains("is-saving")) return;
    root.classList.add("is-saving");
    var next = byId("nova-setup-next");
    var skipButton = byId("nova-setup-skip");
    if (next) next.disabled = true;
    if (skipButton) skipButton.disabled = true;
    var statusId = state.step === 5 ? "nova-setup-final-status" : "nova-setup-global-status";
    setStatus(statusId, state.mode === "account" ? "Saving your Nova profile and settings..." : "Saving your Nova setup...");
    try {
      await saveSetup(!!skip);
      localStorage.setItem(COMPLETE_KEY, COMPLETE_VERSION);
      setStatus(statusId, "Nova is ready.");
      transitionHome();
    } catch (error) {
      root.classList.remove("is-saving");
      if (next) next.disabled = false;
      if (skipButton) skipButton.disabled = false;
      setStatus(statusId, error.message || "Nova could not save your setup. Try again.", true);
    }
  }

  function transitionHome() {
    var home = document.querySelector('.nav-tab[data-page="home"]');
    if (home) home.click();
    var stage = root.querySelector(".nova-setup-stage");
    var island = byId("nova-island");
    if (stage && island) {
      var source = stage.getBoundingClientRect();
      var target = island.getBoundingClientRect();
      var targetX = target.left + target.width / 2 - (source.left + source.width / 2);
      var targetY = target.top + target.height / 2 - (source.top + source.height / 2);
      var scale = Math.max(.08, Math.min(.24, target.width / Math.max(source.width, 1)));
      stage.style.setProperty("--setup-x", targetX + "px");
      stage.style.setProperty("--setup-y", targetY + "px");
      stage.style.setProperty("--setup-scale", String(scale));
    }
    root.classList.add("is-finishing");
    var shell = byId("shell");
    setTimeout(function () {
      stopCamera();
      closeLegal();
      root?.remove();
      root = null;
      started = false;
      document.documentElement.classList.remove("nova-setup-active", "nova-setup-pending");
      if (shell) {
        shell.classList.remove("nova-setup-home-reveal");
        void shell.offsetWidth;
        shell.classList.add("nova-setup-home-reveal");
      }
      if (window.NovaControlCenter && NovaControlCenter.apply) NovaControlCenter.apply();
      if (window._novaSyncIslandVisibility) window._novaSyncIslandVisibility();
      setTimeout(function () { shell?.classList.remove("nova-setup-home-reveal"); }, 700);
    }, 640);
  }

  function bind() {
    byId("nova-setup-account-choice")?.addEventListener("click", chooseAccount);
    byId("nova-setup-guest-choice")?.addEventListener("click", chooseGuest);
    byId("nova-setup-skip")?.addEventListener("click", function () {
      state.mode = user() ? "account" : "guest";
      finish(true);
    });
    byId("nova-setup-back")?.addEventListener("click", function () { goTo(Math.max(1, state.step - 1)); });
    byId("nova-setup-next")?.addEventListener("click", function () {
      if (state.step === 2 && !validateIdentity()) return;
      if (state.step === 4) state.privacyReviewed = true;
      if (state.step === 5) { finish(false); return; }
      goTo(state.step + 1);
    });

    byId("nova-setup-display-name")?.addEventListener("input", function (event) { state.profile.displayName = event.target.value.slice(0, 40); state.profileTouched.displayName = true; renderIdentity(); });
    byId("nova-setup-bio")?.addEventListener("input", function (event) { state.profile.bio = event.target.value.slice(0, 280); state.profileTouched.bio = true; if (byId("nova-setup-bio-count")) byId("nova-setup-bio-count").textContent = String(state.profile.bio.length); renderIdentity(); });
    byId("nova-setup-guest-name")?.addEventListener("input", function (event) { state.guestName = event.target.value.slice(0, 24); renderIdentity(); });
    all("[data-guest-avatar]").forEach(function (button) { button.addEventListener("click", function () { state.guestAvatar = button.dataset.guestAvatar; renderIdentity(); }); });

    var uploadInput = byId("nova-setup-avatar-file");
    var cameraInput = byId("nova-setup-avatar-camera-file");
    byId("nova-setup-avatar-upload")?.addEventListener("click", function (event) { event.stopPropagation(); uploadInput?.click(); });
    byId("nova-setup-avatar-camera")?.addEventListener("click", function (event) { event.stopPropagation(); openCamera(); });
    [uploadInput, cameraInput].forEach(function (input) {
      input?.addEventListener("change", function () { var file = input.files && input.files[0]; input.value = ""; if (file) acceptImage(file); });
    });
    var drop = byId("nova-setup-avatar-drop");
    if (drop) {
      ["dragenter", "dragover"].forEach(function (type) { drop.addEventListener(type, function (event) { event.preventDefault(); drop.classList.add("drag-active"); }); });
      ["dragleave", "dragend"].forEach(function (type) { drop.addEventListener(type, function () { drop.classList.remove("drag-active"); }); });
      drop.addEventListener("drop", function (event) {
        event.preventDefault();
        drop.classList.remove("drag-active");
        var file = Array.from(event.dataTransfer && event.dataTransfer.files || []).find(function (item) { return String(item.type || "").startsWith("image/"); });
        if (file) acceptImage(file); else setStatus("nova-setup-identity-status", "Drop an image file.", true);
      });
    }

    all("[data-setup-theme]").forEach(function (button) { button.addEventListener("click", function () { applyTheme(button.dataset.setupTheme); }); });
    all("[data-performance]").forEach(function (button) { button.addEventListener("click", function () { setPerformance(button.dataset.performance); }); });
    byId("nova-setup-animation")?.addEventListener("input", function (event) {
      state.animationIntensity = Number(event.target.value);
      updateControl("animationIntensity", state.animationIntensity);
      updateControl("backgroundAnimation", state.performance !== "fast" && state.animationIntensity > 0);
      renderExperience();
    });
    byId("nova-setup-stars")?.addEventListener("input", function (event) {
      state.starDensity = Number(event.target.value);
      updateControl("starDensity", state.starDensity);
      renderExperience();
    });
    byId("nova-setup-sounds")?.addEventListener("change", function (event) {
      state.soundEffects = event.target.checked;
      updateControl("soundEffects", state.soundEffects);
      renderExperience();
    });

    root.addEventListener("click", function (event) {
      var link = event.target.closest("[data-legal]");
      if (link) { event.preventDefault(); openLegal(link.dataset.legal); return; }
    });
    root.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      if (!byId("nova-setup-camera")?.hidden) stopCamera();
      else if (!byId("nova-setup-legal")?.hidden) closeLegal();
    });
  }

  function start(restart) {
    if (started || root) return;
    started = true;
    readInitialControls();
    state.step = 1;
    state.privacyReviewed = false;
    state.profileLoaded = false;
    state.profileTouched = { displayName: false, bio: false, avatarUrl: false };
    state.mode = user() ? "account" : "guest";
    if (user()) {
      state.profile = Object.assign({}, state.profile, {
        displayName: user().displayName || user().username,
        avatarUrl: user().avatarUrl || ""
      });
    }
    document.documentElement.classList.add("nova-setup-active", "nova-setup-pending");
    build();
    if (restart && user()) loadAccountProfile();
  }

  function bindRestart() {
    document.addEventListener("click", function (event) {
      var button = event.target.closest("#nova-setup-restart-btn");
      if (!button) return;
      event.preventDefault();
      localStorage.removeItem(COMPLETE_KEY);
      start(true);
    });
  }

  window.addEventListener("nova:session-changed", function (event) {
    var current = event.detail && event.detail.user;
    render();
    if (!root || !waitingForAccount || !current) return;
    waitingForAccount = false;
    if (window.NovaAccount && NovaAccount.close) NovaAccount.close();
    loadAccountProfile().then(function () { goTo(2); });
  });

  document.addEventListener("DOMContentLoaded", function () {
    bindRestart();
    if (localStorage.getItem(COMPLETE_KEY) !== COMPLETE_VERSION) start(false);
    else document.documentElement.classList.remove("nova-setup-pending");
  });
})();
