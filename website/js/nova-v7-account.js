(function () {
  "use strict";
  var mode = "login";

  function esc(value) { var el = document.createElement("div"); el.textContent = value == null ? "" : String(value); return el.innerHTML; }
  function modal() { return document.getElementById("account-modal"); }
  function body() { return document.getElementById("account-modal-body"); }
  function showMessage(text, bad) {
    var el = document.getElementById("nova-v7-account-message");
    if (el) { el.textContent = text || ""; el.classList.toggle("is-error", !!bad); }
  }
  function updateButton(user) {
    document.querySelectorAll("#account-btn, #ni-pc-account-btn").forEach(function (button) {
      if (!button) return;
      var label = user ? (user.displayName || user.username) : "Sign In";
      button.querySelector("span") ? button.querySelector("span").textContent = label : button.setAttribute("aria-label", label);
      button.classList.toggle("logged-in", !!user);
    });
  }
  function open(nextMode) {
    if (nextMode === "login" || nextMode === "signup") mode = nextMode;
    render();
    modal() && modal().classList.remove("hidden");
  }
  function close() { modal() && modal().classList.add("hidden"); }

  function decodeBase64url(value) {
    var normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    normalized += "=".repeat((4 - normalized.length % 4) % 4);
    var binary = atob(normalized);
    return Uint8Array.from(binary, function (character) { return character.charCodeAt(0); });
  }

  function encodeBase64url(bytes) {
    var binary = "";
    bytes.forEach(function (byte) { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  async function migrationProof(password, salt, iterations) {
    if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 250000) throw new Error("That password format cannot be migrated safely.");
    var key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    var bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: decodeBase64url(salt), iterations: iterations }, key, 256);
    return encodeBase64url(new Uint8Array(bits));
  }

  function signedOut() {
    var signup = mode === "signup";
    return '<form class="nova-v7-account-form" id="nova-v7-account-form">' +
      '<div class="nova-v7-segments"><button type="button" data-account-mode="login" class="' + (!signup ? "active" : "") + '">Sign In</button><button type="button" data-account-mode="signup" class="' + (signup ? "active" : "") + '">Create Account</button></div>' +
      '<label>Username<input name="username" autocomplete="username" minlength="3" maxlength="20" required></label>' +
      '<label>Password<input name="password" type="password" autocomplete="' + (signup ? "new-password" : "current-password") + '" minlength="8" maxlength="128" required></label>' +
      '<div id="nova-v7-account-message" class="nova-v7-form-message" aria-live="polite"></div>' +
      '<button class="nova-v7-primary" type="submit">' + (signup ? "Create Nova Account" : "Sign In") + '</button>' +
      (signup ? '<p class="nova-v7-account-note">One account unlocks profiles, friends, groups, and chat immediately.</p>' : "") +
      '</form>';
  }

  function signedIn(user) {
    var accountLabel = user.supernova ? "supernova pro" : (user.role || "user");
    return '<div class="nova-v7-account-card">' +
      '<div class="nova-v7-account-identity"><div class="nova-v7-avatar">' + (user.avatarUrl ? '<img src="' + esc(user.avatarUrl) + '" alt="">' : esc((user.displayName || user.username).charAt(0).toUpperCase())) + '</div><div><strong>' + esc(user.displayName || user.username) + '</strong><span>@' + esc(user.username) + '</span></div><b class="nova-v7-role">' + esc(accountLabel) + '</b></div>' +
      '<div class="nova-v7-social-access"><span>Social access enabled</span></div>' +
      '<div id="nova-v7-account-message" class="nova-v7-form-message" aria-live="polite"></div>' +
      '<form class="nova-v7-account-form nova-v7-password-form" id="nova-v7-password-form"><label>Current password<input name="currentPassword" type="password" autocomplete="current-password" minlength="8" maxlength="128" required></label><label>New password<input name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><button class="nova-v7-primary" type="submit">Update Password</button></form>' +
      '<div class="nova-v7-account-actions"><button type="button" id="nova-v7-open-profile">Edit Profile</button><button type="button" id="nova-v7-signout">Sign Out</button></div></div>';
  }

  function render() {
    var target = body(); if (!target) return;
    var user = window.__novaV7User;
    target.innerHTML = user ? signedIn(user) : signedOut();
    target.querySelectorAll("[data-account-mode]").forEach(function (button) { button.onclick = function () { mode = button.dataset.accountMode; render(); }; });
    var form = document.getElementById("nova-v7-account-form");
    if (form) form.onsubmit = async function (event) {
      event.preventDefault(); showMessage("Working…");
      var values = Object.fromEntries(new FormData(form));
      try {
        var data = mode === "signup" ? await NovaAPI.register(values) : await NovaAPI.login(values);
        window.__novaV7User = data.user; NovaAPI.cacheUser(data.user); updateButton(data.user); render();
        if (mode === "signup") showMessage("Account created. Social is ready.");
      } catch (error) { showMessage(error.message, true); }
    };
    var passwordForm = document.getElementById("nova-v7-password-form");
    if (passwordForm) passwordForm.onsubmit = async function (event) {
      event.preventDefault(); showMessage("Updating password...");
      var values = Object.fromEntries(new FormData(passwordForm));
      try {
        await NovaAPI.changePassword(values);
      } catch (error) {
        if (error.code !== "PASSWORD_MIGRATION_PROOF_REQUIRED") {
          showMessage(error.message, true);
          return;
        }
        try {
          values.legacyProof = await migrationProof(values.currentPassword, error.salt, Number(error.iterations));
          await NovaAPI.changePassword(values);
        } catch (migrationError) {
          showMessage(migrationError.message, true);
          return;
        }
      }
      passwordForm.reset();
      showMessage("Password updated. Other signed-in devices were logged out.");
    };
    var signout = document.getElementById("nova-v7-signout");
    if (signout) signout.onclick = async function () { await NovaAPI.logout(); window.__novaV7User = null; NovaAPI.cacheUser(null); updateButton(null); render(); };
    var edit = document.getElementById("nova-v7-open-profile");
    if (edit) edit.onclick = function () {
      close();
      if (window._novaOpenProfileSettings) {
        window._novaOpenProfileSettings();
      } else {
        document.querySelector('.nav-tab[data-page="settings"]')?.click();
        setTimeout(function () { document.querySelector('.settings-rail-btn[data-settings-pane="profile"]')?.click(); }, 80);
      }
    };
  }

  document.addEventListener("click", function (event) {
    if (!event.target.closest("#account-btn, #ni-pc-account-btn")) return;
    event.preventDefault(); event.stopImmediatePropagation(); open();
  }, true);
  document.addEventListener("DOMContentLoaded", function () { document.getElementById("account-modal-close")?.addEventListener("click", close); updateButton(window.__novaV7User); });
  window.addEventListener("nova:session-changed", function (event) { window.__novaV7User = event.detail.user; updateButton(event.detail.user); if (modal() && !modal().classList.contains("hidden")) render(); });
  window.NovaAccount = { open: open, close: close, render: render };
})();
