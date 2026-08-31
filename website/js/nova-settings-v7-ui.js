(function () {
  "use strict";

  var page = document.getElementById("page-settings");
  if (!page) return;

  var icons = {
    profile: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    appearance: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></svg>',
    island: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c.8 4.6 4.4 8.2 9 9-4.6.8-8.2 4.4-9 9-.8-4.6-4.4-8.2-9-9 4.6-.8 8.2-4.4 9-9Z"/></svg>',
    content: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 9 5 3-5 3Z"/></svg>',
    privacy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>',
    performance: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14a8 8 0 1 1 16 0"/><path d="m12 14 4-4"/><path d="M4 18h16"/></svg>',
    developer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/></svg>',
    system: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1-2.8-2.8.1-.1a1.7 1.7 0 0 0 .3-1.8A1.7 1.7 0 0 0 3.2 14H3v-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1 2.8-2.8.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3h4v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1 2.8 2.8-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1h.2v4h-.2a1.7 1.7 0 0 0-1.4 1Z"/></svg>'
  };

  function railButton(id, label) {
    return '<button class="settings-rail-btn' + (id === "profile" ? " active" : "") + '" type="button" role="tab" aria-selected="' + (id === "profile") + '" data-settings-pane="' + id + '"><span class="settings-rail-icon">' + icons[id] + '</span><span>' + label + '</span></button>';
  }

  function toggle(control, label, description) {
    return '<div class="settings-control-row"><div class="settings-control-copy"><strong>' + label + '</strong><span>' + description + '</span></div><label class="toggle-switch"><input class="nova-control" data-control="' + control + '" type="checkbox"><span class="toggle-track"><span class="toggle-thumb"></span></span></label></div>';
  }

  function select(control, label, description, options) {
    return '<label class="settings-control-row"><span class="settings-control-copy"><strong>' + label + '</strong><span>' + description + '</span></span><select class="setting-input nova-control" data-control="' + control + '">' + options.map(function (option) { return '<option value="' + option[0] + '">' + option[1] + '</option>'; }).join("") + '</select></label>';
  }

  function paneHead(kicker, title, copy) {
    return '<header class="settings-pane-head"><div><span class="settings-kicker">' + kicker + '</span><h2>' + title + '</h2><p>' + copy + '</p></div></header>';
  }

  page.innerHTML = `
    <div class="content-page settings-v7-page">
      <header class="settings-v7-header">
        <div>
          <span class="settings-kicker">Nova control center</span>
          <h1>Settings</h1>
          <p>Make Nova yours. Changes apply instantly and sync when you are signed in.</p>
        </div>
        <div class="settings-sync-pill" id="settings-sync-status" role="status" aria-live="polite">
          <span class="settings-sync-dot"></span><span>Saved on this device</span>
        </div>
      </header>

      <div class="nova-ad-slot nova-ad-slot--collapsed" data-nova-ad-page="settings" data-nova-ad-location="settings-upper" aria-label="Sponsored content"></div>

      <div class="settings-shell">
        <nav class="settings-rail" role="tablist" aria-label="Settings sections">
          <span class="settings-rail-indicator" aria-hidden="true"></span>
          ${railButton("profile", "Profile")}
          ${railButton("appearance", "Appearance")}
          ${railButton("island", "Nova Island")}
          ${railButton("content", "Content")}
          ${railButton("privacy", "Social & Privacy")}
          ${railButton("performance", "Performance")}
          ${railButton("developer", "Developer Options")}
          ${railButton("system", "Browser & Data")}
        </nav>

        <main class="settings-panes">
          <section class="settings-pane active" data-settings-pane-panel="profile" role="tabpanel">
            ${paneHead("Your Nova identity", "Profile", "This is how you appear in Social, messages, and profile cards.")}
            <div class="settings-profile-card">
              <div class="settings-avatar-editor" id="settings-avatar-drop" tabindex="0" role="button" aria-label="Upload profile image">
                <div class="settings-avatar-orbit" aria-hidden="true"></div>
                <div class="settings-avatar-preview" id="settings-avatar-preview"><span id="settings-avatar-fallback">N</span></div>
                <div class="settings-avatar-drop-copy"><strong>Profile image</strong><span>Drop an image here or choose a source</span></div>
                <div class="settings-avatar-actions">
                  <button type="button" class="settings-icon-action" id="settings-avatar-upload" title="Upload image" aria-label="Upload image"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></button>
                  <button type="button" class="settings-icon-action" id="settings-avatar-camera" title="Take photo" aria-label="Take photo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z"/><circle cx="12" cy="13" r="4"/></svg></button>
                  <button type="button" class="settings-icon-action danger" id="settings-avatar-remove" title="Remove image" aria-label="Remove image"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/></svg></button>
                </div>
                <input id="settings-avatar-file" type="file" accept="image/*" hidden>
                <input id="settings-avatar-camera-input" type="file" accept="image/*" capture="user" hidden>
                <input data-profile-field="avatarUrl" id="settings-avatar-value" type="hidden">
              </div>

              <div class="settings-profile-fields">
                <div class="settings-field-grid">
                  <label class="settings-field"><span>Display name</span><input class="setting-input" data-profile-field="displayName" type="text" maxlength="40" placeholder="Nova user" spellcheck="false"></label>
                  <label class="settings-field"><span>Status</span><input class="setting-input" data-profile-field="statusText" type="text" maxlength="80" placeholder="Exploring Nova"></label>
                </div>
                <label class="settings-field"><span>Bio <small><b id="settings-bio-count">0</b>/280</small></span><textarea class="setting-input" data-profile-field="bio" maxlength="280" placeholder="Tell people a little about you"></textarea></label>
                <div class="settings-field-grid settings-field-grid-three">
                  <label class="settings-field"><span>Pronouns</span><input class="setting-input" data-profile-field="pronouns" type="text" maxlength="32" placeholder="Optional"></label>
                  <label class="settings-field"><span>Location</span><input class="setting-input" data-profile-field="locationText" type="text" maxlength="64" placeholder="Optional"></label>
                  <label class="settings-field"><span>Website</span><input class="setting-input" data-profile-field="websiteUrl" type="url" placeholder="https://..."></label>
                </div>
                <input data-profile-field="bannerUrl" type="hidden">
                <div class="settings-field-grid">
                  <label class="settings-field"><span>Who sees when you are online</span><select class="setting-input" data-profile-field="onlineVisibility"><option value="everyone">Everyone</option><option value="friends">Friends</option><option value="hidden">Nobody</option></select></label>
                  <label class="settings-field"><span>Who sees your activity</span><select class="setting-input" data-profile-field="activityVisibility"><option value="everyone">Everyone</option><option value="friends">Friends</option><option value="hidden">Nobody</option></select></label>
                </div>
              </div>
                              <article class="settings-account-panel">
                  <div class="settings-account-head">
                    <div class="settings-account-copy"><strong>Account</strong><span>Password, sign out, and your Nova account details now live here.</span></div>
                    <span class="settings-account-badge" id="nova-v7-account-badge">Nova account</span>
                  </div>
                  <div class="settings-field-grid">
                    <label class="settings-field"><span>Username</span><input class="setting-input" id="nova-v7-account-username" type="text" placeholder="Sign in to load your account" disabled></label>
                    <label class="settings-field"><span>Role</span><input class="setting-input" id="nova-v7-account-role" type="text" placeholder="Nova user" disabled></label>
                  </div>
                  <div class="settings-account-row">
                    <label class="settings-field"><span>Current password</span><input class="setting-input" id="nova-v7-profile-current-password" type="password" autocomplete="current-password" minlength="8" maxlength="128" placeholder="Current password"></label>
                    <label class="settings-field"><span>New password</span><input class="setting-input" id="nova-v7-profile-new-password" type="password" autocomplete="new-password" minlength="8" maxlength="128" placeholder="New password"></label>
                  </div>
                  <div class="settings-account-actions">
                    <button class="settings-secondary-btn" id="nova-v7-profile-password-save" type="button">Update password</button>
                    <button class="settings-secondary-btn danger" id="nova-v7-profile-signout" type="button">Sign out</button>
                    <span class="settings-inline-status" id="nova-v7-profile-account-status" aria-live="polite">Account tools are available when you are signed in.</span>
                  </div>
                </article>
<footer class="settings-profile-savebar"><span id="nova-v7-profile-status" aria-live="polite">Sign in to edit your shared profile.</span><button class="settings-primary-btn" id="nova-v7-profile-save" type="button"><span>Save profile</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></button></footer>
            </div>
          </section>

          <section class="settings-pane" data-settings-pane-panel="appearance" role="tabpanel">
            ${paneHead("Visual system", "Appearance", "Tune Nova's color, depth, and background without sacrificing readability.")}
            <div class="settings-grid">
              <article class="settings-panel settings-card-wide"><div class="settings-card-title"><strong>Theme</strong><span>Applies across every page</span></div><div id="theme-presets" class="settings-chip-row"></div></article>
              <article class="settings-panel"><div class="settings-card-title"><strong>Base mode</strong><span>Choose the main surface brightness</span></div><div class="theme-toggle"><button class="theme-opt active" data-theme-val="dark" type="button">Dark</button><button class="theme-opt" data-theme-val="light" type="button">Light</button></div></article>
              <article class="settings-panel">${select("textSize", "Text size", "Scale Nova text without changing the layout style", [["small","Small"],["medium","Medium"],["large","Large"]])}</article>
              <article class="settings-panel settings-card-wide settings-accent-wide"><label class="settings-control-row"><span class="settings-control-copy"><strong>Accent color</strong><span>Change Nova's interactive highlight</span></span><input class="nova-control color-input" data-control="accentColor" type="color"></label></article>
              <article class="settings-panel settings-card-wide"><label class="settings-range-row"><span class="settings-control-copy"><strong>Glow intensity</strong><span>Control the depth around active elements</span></span><output id="settings-purple-output">70%</output><input class="nova-control range-input" data-control="purpleIntensity" type="range" min="0" max="100"></label></article>
              <article class="settings-panel">${select("backgroundStyle", "Space background", "Stars, quiet depth, or completely flat", [["stars","Stars"],["quiet","Quiet"],["flat","Flat"]])}</article>
              <article class="settings-panel">${toggle("backgroundAnimation", "Background motion", "Animate stars on capable devices")}</article>
            </div>
          </section>

          <section class="settings-pane" data-settings-pane-panel="island" role="tabpanel">
            ${paneHead("Your command surface", "Nova Island", "Configure how the Island behaves everywhere except focused content and Settings.")}
            <div class="settings-island-preview"><span class="settings-island-star">✦</span><div><strong>Preview</strong><span>The Island is hidden on this page so Settings has the full canvas.</span></div></div>
            <div class="settings-grid">
              <article class="settings-panel">${toggle("islandCloseButton", "Nova Island Close Button", "Show a button for closing the Island")}</article>
              <article class="settings-panel">${toggle("islandPulse", "Star pulse", "Use a subtle attention animation while closed")}</article>
              <article class="settings-panel">${select("islandPosition", "Position", "Choose which edge holds the Island", [["top-right","Top right"],["top-left","Top left"],["bottom-right","Bottom right"]])}</article>
              <article class="settings-panel">${select("islandSize", "Open size", "Balance room for content and controls", [["compact","Compact"],["normal","Normal"],["wide","Wide"]])}</article>
              <article class="settings-panel settings-card-wide"><label class="settings-range-row"><span class="settings-control-copy"><strong>Animation speed</strong><span>Adjust how quickly the Island opens and closes</span></span><output id="settings-island-speed-output">Normal</output><input class="nova-control range-input" data-control="islandSpeed" type="range" min="60" max="140"></label></article>
            </div>
          </section>

          <section class="settings-pane" data-settings-pane-panel="content" role="tabpanel">
            ${paneHead("Games, apps, and movies", "Content", "Control density and decide which information appears in your library.")}
            <div class="settings-grid">
              <article class="settings-panel">${select("cardSize", "Game and app cards", "Adjust the number of items visible", [["compact","Compact"],["normal","Normal"],["large","Large"]])}</article>
              <article class="settings-panel">${select("movieCardSize", "Movie cards", "Use larger artwork on the Movies page", [["normal","Normal"],["large","Large"],["cinema","Cinema"]])}</article>
              <article class="settings-panel">${toggle("showRatings", "Game ratings", "Show community ratings on game cards")}</article>
              <article class="settings-panel">${toggle("showRecents", "Recently played", "Keep your recent row visible")}</article>
              <article class="settings-panel">${toggle("hideUnavailableApps", "Hide unavailable apps", "Remove apps Nova cannot currently open")}</article>
              <article class="settings-panel">${toggle("hidePlayCount", "Hide play counts", "Remove play totals from your own view")}</article>
            </div>
          </section>

          <section class="settings-pane" data-settings-pane-panel="privacy" role="tabpanel">
            ${paneHead("Social control", "Social & Privacy", "Choose how Social reaches you and what activity remains on this device.")}
            <div class="settings-grid">
              <article class="settings-panel">${select("friendRequests", "Friend requests", "Choose who can send a request", [["everyone","Everyone"],["friends","Friends of friends"],["none","Nobody"]])}</article>
              <article class="settings-panel">${toggle("everyoneChat", "Everyone chat", "Show the public Nova conversation")}</article>
              <article class="settings-panel">${toggle("dmNotifications", "Message Island alerts", "Show incoming DMs outside the active conversation")}</article>
              <article class="settings-panel">${toggle("disableActivity", "Private recent activity", "Stop recording local Nova activity across pages, searches, games, apps, movies, rewards, and settings")}</article>
              <article class="settings-panel settings-card-wide"><div class="settings-danger-row"><div><strong>Clear recent activity</strong><span>Removes the complete recent activity feed saved on this device.</span></div><button class="settings-secondary-btn danger" type="button" data-control-action="clear-recents">Clear activity</button></div></article>
            </div>
          </section>

          <section class="settings-pane" data-settings-pane-panel="performance" role="tabpanel">
            ${paneHead("Fast by design", "Performance & Access", "Keep the full Nova experience smooth on desktops and Chromebooks.")}
            <div class="settings-grid">
              <article class="settings-panel">${select("performanceMode", "Performance profile", "Choose the overall visual workload", [["quality","Quality"],["balanced","Balanced"],["fast","Fast"]])}</article>
              <article class="settings-panel">${select("blurLevel", "Glass effects", "Control expensive background blur", [["full","Full"],["low","Low"],["off","Off"]])}</article>
              <article class="settings-panel">${toggle("batterySaver", "Battery saver", "Automatically use Nova's lightest effects")}</article>
              <article class="settings-panel">${toggle("hoverZoom", "Hover depth", "Move cards slightly toward the pointer")}</article>
              <article class="settings-panel settings-card-wide"><label class="settings-range-row"><span class="settings-control-copy"><strong>Animation intensity</strong><span>Scale ambient movement and star drift</span></span><output id="settings-animation-output">75%</output><input class="nova-control range-input" data-control="animationIntensity" type="range" min="0" max="100"></label></article>
              <article class="settings-panel settings-card-wide"><label class="settings-range-row"><span class="settings-control-copy"><strong>Star density</strong><span>Reduce background work or fill out the space field</span></span><output id="settings-star-density-output">70%</output><input class="nova-control range-input" data-control="starDensity" type="range" min="0" max="100"></label></article>
              <article class="settings-panel">${toggle("soundEffects", "Sound effects", "Use quiet interface feedback sounds")}</article>
              <article class="settings-panel">${toggle("highContrast", "High contrast", "Strengthen text and control borders")}</article>
              <article class="settings-panel">${toggle("reduceMotion", "Reduce motion", "Use instant, minimal transitions")}</article>
              <article class="settings-panel">${toggle("focusOutlines", "Keyboard focus", "Show a clear outline while tabbing")}</article>
            </div>
          </section>

          <section class="settings-pane nova-developer-pane" data-settings-pane-panel="developer" role="tabpanel">
            ${paneHead("Advanced browser tools", "Developer Options", "Control and diagnose your own Nova Browser session. These tools never grant additional Nova permissions.")}
            <div class="dev-master-card">
              <div><span class="dev-status-dot" aria-hidden="true"></span><strong>Developer Mode</strong><p>Advanced browser and proxy tools. Changing these options may cause websites to behave differently.</p></div>
              <label class="toggle-switch"><input id="nova-dev-master" type="checkbox" aria-describedby="nova-dev-master-help"><span class="toggle-track"><span class="toggle-thumb"></span></span></label>
            </div>
            <p class="dev-master-help" id="nova-dev-master-help">Turn on Developer Mode to reveal the tools below.</p>
            <div id="nova-dev-controls" hidden>
              <section class="dev-option-group"><header><span>Browser Tools</span><h3>Inspect and test pages</h3></header><div class="settings-grid">
                <article class="settings-panel settings-card-wide"><div class="dev-launch-row"><div><strong>Open Inspector</strong><span>Open a site in Nova Browser, then use the code button or press <kbd>Ctrl/⌘ + Shift + C</kbd>.</span></div><button class="settings-primary-btn" id="nova-dev-inspect-now" type="button">Inspect Current Page</button></div></article>
                <article class="settings-panel"><div class="settings-control-row"><div class="settings-control-copy"><strong>Inspect Element</strong><span>Enable the page inspector and element picker</span></div><label class="toggle-switch"><input class="nova-dev-setting" data-dev-key="inspectElement" type="checkbox"><span class="toggle-track"><span class="toggle-thumb"></span></span></label></div></article>
                <article class="settings-panel"><div class="settings-control-row"><div class="settings-control-copy"><strong>Allow Downloads</strong><span>Only downloads started by a click or tap</span></div><label class="toggle-switch"><input class="nova-dev-setting" data-dev-key="allowDownloads" type="checkbox"><span class="toggle-track"><span class="toggle-thumb"></span></span></label></div></article>
                <article class="settings-panel"><div class="settings-control-row"><div class="settings-control-copy"><strong>Nova Browser Console</strong><span>Capture sanitized page and proxy messages</span></div><label class="toggle-switch"><input class="nova-dev-setting" data-dev-key="browserConsole" type="checkbox"><span class="toggle-track"><span class="toggle-thumb"></span></span></label></div></article>
                <article class="settings-panel"><div class="settings-control-row"><div class="settings-control-copy"><strong>Network Log</strong><span>Record sanitized request routing and timing</span></div><label class="toggle-switch"><input class="nova-dev-setting" data-dev-key="networkLog" type="checkbox"><span class="toggle-track"><span class="toggle-thumb"></span></span></label></div></article>
                <article class="settings-panel"><label class="settings-control-row"><span class="settings-control-copy"><strong>Device Emulation</strong><span>Resize the proxied page, not Nova</span></span><select class="setting-input nova-dev-setting" data-dev-key="deviceEmulation"><option value="off">Off</option><option value="phone">Phone</option><option value="tablet">Tablet</option><option value="desktop">Desktop</option></select></label></article>
                <article class="settings-panel"><div class="settings-control-row"><div class="settings-control-copy"><strong>Mute Proxied Sites</strong><span>Silence audio from browser tabs</span></div><label class="toggle-switch"><input class="nova-dev-setting" data-dev-key="muteSites" type="checkbox"><span class="toggle-track"><span class="toggle-thumb"></span></span></label></div></article>
                <article class="settings-panel"><div class="settings-control-row"><div class="settings-control-copy"><strong>Disable Page JavaScript</strong><span>Never disables Nova's own JavaScript</span></div><label class="toggle-switch"><input class="nova-dev-setting" data-dev-key="disablePageJs" type="checkbox"><span class="toggle-track"><span class="toggle-thumb"></span></span></label></div></article>
                <article class="settings-panel"><div class="settings-control-row"><div class="settings-control-copy"><strong>Allow Website Popups</strong><span>Blocked by default for safety</span></div><label class="toggle-switch"><input class="nova-dev-setting" data-dev-key="allowPopups" type="checkbox"><span class="toggle-track"><span class="toggle-thumb"></span></span></label></div></article>
              </div></section>
              <section class="dev-option-group"><header><span>Proxy</span><h3>Routing and diagnostics</h3></header><div class="settings-grid">
                <article class="settings-panel settings-card-wide"><label class="settings-field"><span>Proxy Mode</span><select class="setting-input nova-dev-setting" data-dev-key="proxyMode"><option value="automatic">Automatic (Recommended)</option><option value="libcurl">Scramjet + libcurl</option><option value="epoxy">Scramjet + Epoxy</option><option value="legacy">Legacy compatibility</option></select><small>Manual modes are for troubleshooting. Automatic is recommended.</small></label></article>
                <article class="settings-panel settings-card-wide"><div class="dev-health-grid" id="nova-dev-health" aria-live="polite"><span>libcurl <b>Checking</b></span><span>Epoxy <b>Checking</b></span><span>Legacy <b>Checking</b></span><span>Wisp <b>Checking</b></span></div><div class="dev-button-row"><button class="settings-secondary-btn" id="nova-dev-open-diagnostics" type="button">Open Diagnostics</button><button class="settings-secondary-btn" id="nova-dev-reset-health" type="button">Reset Health Data</button><button class="settings-secondary-btn" id="nova-dev-reset-compat" type="button">Reset Compatibility</button></div></article>
              </div></section>
              <section class="dev-option-group"><header><span>Advanced</span><h3>Identity and experimental tools</h3></header><div class="settings-grid">
                <article class="settings-panel"><label class="settings-field"><span>User Agent</span><select class="setting-input nova-dev-setting" data-dev-key="userAgent"><option value="default">Default</option><option value="chrome-desktop">Chrome Desktop</option><option value="chrome-mobile">Chrome Mobile</option><option value="firefox">Firefox</option><option value="safari">Safari</option><option value="custom">Custom</option></select></label><input class="setting-input dev-custom-ua" id="nova-dev-custom-ua" type="text" placeholder="Custom user agent" hidden></article>
                <article class="settings-panel"><div class="settings-control-row"><div class="settings-control-copy"><strong>Persist Inspector Changes</strong><span>Experimental local page overrides</span></div><label class="toggle-switch"><input class="nova-dev-setting" data-dev-key="persistEdits" type="checkbox"><span class="toggle-track"><span class="toggle-thumb"></span></span></label></div></article>
                <article class="settings-panel"><div class="settings-control-row"><div class="settings-control-copy"><strong>Experimental WebSocket Compatibility</strong><span>Try alternate socket handling</span></div><label class="toggle-switch"><input class="nova-dev-setting" data-dev-key="experimentalWebSocket" type="checkbox"><span class="toggle-track"><span class="toggle-thumb"></span></span></label></div></article>
                <article class="settings-panel"><div class="settings-control-row"><div class="settings-control-copy"><strong>Experimental Media Fixes</strong><span>Try additional media compatibility rules</span></div><label class="toggle-switch"><input class="nova-dev-setting" data-dev-key="experimentalMedia" type="checkbox"><span class="toggle-track"><span class="toggle-thumb"></span></span></label></div></article>
                <article class="settings-panel settings-card-wide"><div class="settings-control-row"><div class="settings-control-copy"><strong>Verbose Proxy Logging</strong><span>Records routing details while redacting credentials and cookies</span></div><label class="toggle-switch"><input class="nova-dev-setting" data-dev-key="verboseLogging" type="checkbox"><span class="toggle-track"><span class="toggle-thumb"></span></span></label></div></article>
              </div></section>
              <section class="dev-option-group"><header><span>Browser Data</span><h3>Cache and worker tools</h3></header><div class="settings-panel settings-card-wide dev-action-stack"><div class="dev-button-row"><button class="settings-secondary-btn" data-dev-action="clear-browser-cache" type="button">Clear Browser Cache</button><button class="settings-secondary-btn" data-dev-action="clear-proxy-cache" type="button">Clear Proxy Cache</button><button class="settings-secondary-btn" data-dev-action="clear-site-data" type="button">Clear Website Data</button><button class="settings-secondary-btn danger" data-dev-action="clear-everything" type="button">Clear Everything</button></div><div class="dev-button-row"><button class="settings-secondary-btn" data-dev-action="restart-worker" type="button">Restart Proxy Worker</button><button class="settings-secondary-btn" data-dev-action="reregister-worker" type="button">Re-register Proxy Worker</button><button class="settings-secondary-btn" id="nova-dev-export" type="button">Export Diagnostic Report</button></div></div></section>
              <section class="dev-option-group dev-reset-zone"><div><strong>Reset Developer Options</strong><span>Restore safe defaults without changing your account or other Nova settings.</span></div><button class="settings-secondary-btn danger" id="nova-dev-reset" type="button">Reset</button></section>
            </div>
          </section>

          <section class="settings-pane" data-settings-pane-panel="system" role="tabpanel">
            ${paneHead("Browser and recovery", "Browser & Data", "Manage proxy preferences, safety shortcuts, and portable backups.")}
            <div class="settings-grid">
              <article class="settings-panel"><div class="settings-control-row"><div class="settings-control-copy"><strong>Built-in ad blocker</strong><span>Block known ad and tracking domains in the Nova browser</span></div><label class="toggle-switch"><input type="checkbox" id="adblock-toggle"><span class="toggle-track"><span class="toggle-thumb"></span></span></label></div></article>
              <article class="settings-panel"><div class="settings-control-row"><div class="settings-control-copy"><strong>About:blank mode</strong><span>Open Nova in a neutral browser tab</span></div><label class="toggle-switch"><input type="checkbox" id="ab-mode-toggle"><span class="toggle-track"><span class="toggle-thumb"></span></span></label></div></article>
              <article class="settings-panel"><label class="settings-field"><span>Browser homepage</span><input class="setting-input" id="homepage-input" type="url" placeholder="https://search.brave.com" spellcheck="false" autocomplete="off"></label></article>
              <article class="settings-panel"><div class="settings-card-title"><strong>Search engine</strong><span>Used for words entered in the address bar</span></div><div id="search-engine-picker" class="settings-chip-row"></div></article>
              <article class="settings-panel settings-card-wide"><div class="settings-control-row"><div class="settings-control-copy"><strong>Tab cloaking</strong><span>Use a different title and icon for this browser tab</span></div><label class="toggle-switch"><input type="checkbox" id="tab-cloak-toggle"><span class="toggle-track"><span class="toggle-thumb"></span></span></label></div><div class="settings-field-grid settings-cloak-fields"><label class="settings-field"><span>Tab title</span><input class="setting-input" id="tab-cloak-title" type="text" placeholder="Google Classroom" spellcheck="false"></label><div class="settings-field"><span>Tab icon</span><div class="settings-inline-action"><img id="tab-cloak-favicon-preview" src="" alt="" style="display:none"><button class="settings-secondary-btn" id="tab-cloak-favicon-btn" type="button">Choose icon</button></div></div></div></article>
              <article class="settings-panel"><div class="settings-control-row"><div class="settings-control-copy"><strong>Panic key</strong><span>Instantly leave Nova</span></div><div class="key-selector"><div class="key-display" id="key-display">\`</div><button class="settings-secondary-btn" id="key-change-btn" type="button">Change</button></div></div></article>
              <article class="settings-panel"><label class="settings-field"><span>Panic destination</span><input class="setting-input" id="panic-url-input" type="url" placeholder="https://classroom.google.com" spellcheck="false" autocomplete="off"></label></article>
              <article class="settings-panel settings-card-wide"><div class="settings-data-actions"><div><strong>Settings backup</strong><span>Move your local Nova setup to another device.</span></div><button class="settings-secondary-btn" id="download-save-btn" type="button">Export</button><button class="settings-secondary-btn" id="upload-save-btn" type="button">Import</button><input type="file" id="save-file-input" accept=".json,application/json" hidden></div></article>
              <article class="settings-panel settings-card-wide"><div class="settings-data-actions"><div><strong>Run Nova setup again</strong><span>Review your identity, theme, performance, and privacy choices.</span></div><button class="settings-secondary-btn" id="nova-setup-restart-btn" type="button">Open setup</button></div></article>
              <article class="settings-panel settings-card-wide"><div class="settings-danger-row"><div><strong>Reset Nova settings</strong><span>Restore visual and interface preferences. Your account and Social data are not deleted.</span></div><button class="settings-secondary-btn danger" id="settings-reset-btn" type="button">Reset settings</button></div></article>
              <article class="settings-about settings-card-wide"><div class="settings-about-mark">N<span>✦</span>VA</div><div><strong>Nova 7.0</strong><span id="settings-storage-usage">Calculating local data…</span></div><button class="settings-secondary-btn" id="settings-goto-support-btn" type="button">Open support</button></article>
            </div>
          </section>
        </main>
      </div>
    </div>`;
})();
