(function () {
  "use strict";

  function byId(id) { return document.getElementById(id); }
  function user() { return window.__novaV7User || null; }
  function accountStatus(text, bad) {
    var el = byId("nova-v7-profile-account-status");
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("is-error", !!bad);
  }
  function setEnabled(enabled) {
    ["nova-v7-profile-current-password", "nova-v7-profile-new-password", "nova-v7-profile-password-save", "nova-v7-profile-signout"].forEach(function (id) {
      var el = byId(id);
      if (el) el.disabled = !enabled;
    });
  }
  function refresh() {
    var me = user();
    var name = byId("nova-v7-account-username");
    var role = byId("nova-v7-account-role");
    var badge = byId("nova-v7-account-badge");
    if (name) name.value = me ? (me.username || "") : "";
    if (role) role.value = me ? (me.supernova ? "Supernova Pro" : (me.role || "Nova user")) : "";
    if (badge) badge.textContent = me ? (me.supernova ? "Supernova Pro" : "Nova account") : "Guest";
    setEnabled(!!me);
    accountStatus(me ? "Account tools are ready." : "Sign in to update your password or sign out.", false);
  }

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

  async function updatePassword() {
    if (!user()) return refresh();
    var current = byId("nova-v7-profile-current-password");
    var next = byId("nova-v7-profile-new-password");
    if (!current || !next) return;
    var currentPassword = current.value.trim();
    var newPassword = next.value.trim();
    if (!currentPassword || !newPassword) {
      accountStatus("Enter your current password and a new password.", true);
      return;
    }
    var button = byId("nova-v7-profile-password-save");
    if (button) button.disabled = true;
    accountStatus("Updating password…", false);
    var payload = { currentPassword: currentPassword, newPassword: newPassword };
    try {
      await NovaAPI.changePassword(payload);
      current.value = "";
      next.value = "";
      accountStatus("Password updated. Other signed-in devices were logged out.", false);
    } catch (error) {
      if (error && error.code === "PASSWORD_MIGRATION_PROOF_REQUIRED") {
        try {
          payload.legacyProof = await migrationProof(currentPassword, error.salt, Number(error.iterations));
          await NovaAPI.changePassword(payload);
          current.value = "";
          next.value = "";
          accountStatus("Password updated. Other signed-in devices were logged out.", false);
        } catch (migrationError) {
          accountStatus((migrationError && migrationError.message) || "Nova could not update your password.", true);
        }
      } else {
        accountStatus((error && error.message) || "Nova could not update your password.", true);
      }
    } finally {
      if (button) button.disabled = !user();
    }
  }

  async function signOut() {
    if (!user()) return refresh();
    var button = byId("nova-v7-profile-signout");
    if (button) button.disabled = true;
    accountStatus("Signing out…", false);
    try {
      await NovaAPI.logout();
      window.__novaV7User = null;
      NovaAPI.cacheUser(null);
      window.dispatchEvent(new CustomEvent("nova:session-changed", { detail: { user: null } }));
      accountStatus("Signed out.", false);
    } catch (error) {
      accountStatus((error && error.message) || "Nova could not sign you out.", true);
    } finally {
      refresh();
    }
  }

  function bind() {
    byId("nova-v7-profile-password-save")?.addEventListener("click", updatePassword);
    byId("nova-v7-profile-signout")?.addEventListener("click", signOut);
    refresh();
  }

  document.addEventListener("DOMContentLoaded", function () { setTimeout(bind, 0); });
  window.addEventListener("nova:session-changed", function (event) {
    if (event && event.detail) window.__novaV7User = event.detail.user;
    refresh();
  });
})();
