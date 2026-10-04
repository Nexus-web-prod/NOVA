(function () {
  "use strict";

  var MAX_BACKUP_BYTES = 1024 * 1024;
  var SAFE_KEYS = new Set([
    "nova_theme", "nova_quality", "nova_search_engine", "nova_homepage",
    "nova_panic_key", "nova_panic_url", "nova_bookmarks", "nova_recents",
    "nova_favs", "nova_app_favs", "nova_nicknames", "nova_tab_cloak",
    "nova-settings", "nova_setup_complete", "nova_setup_v7_complete",
    "nova_adblock", "nova_link_target", "nova_sound_enabled"
  ]);
  var JSON_KEYS = new Set([
    "nova_bookmarks", "nova_recents", "nova_favs", "nova_app_favs",
    "nova_nicknames", "nova_tab_cloak", "nova-settings"
  ]);

  function text(value, max) {
    return String(value == null ? "" : value)
      .replace(/[\u0000-\u001f\u007f<>"'&]/g, "")
      .trim()
      .slice(0, max);
  }

  function safeUrl(value, allowLocal) {
    var raw = String(value || "").trim().slice(0, 2048);
    if (allowLocal && /^\/(?!\/)[A-Za-z0-9_./?%=&+#-]+$/.test(raw)) return raw;
    try {
      var parsed = new URL(raw);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return "";
      return parsed.href;
    } catch (error) { return ""; }
  }

  function safeImage(value) {
    var raw = String(value || "").trim();
    if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(raw) && raw.length <= 125000) return raw;
    return safeUrl(raw, true);
  }

  function sanitizeBookmarks(value) {
    var rows = Array.isArray(value) ? value : [];
    return rows.slice(0, 30).map(function (row) {
      return { name: text(row && row.name, 40), url: safeUrl(row && row.url, false) };
    }).filter(function (row) { return row.name && row.url; });
  }

  function sanitizeRecents(value) {
    var rows = Array.isArray(value) ? value : [];
    return rows.slice(0, 20).map(function (row) {
      return {
        name: text(row && row.name, 80),
        image: safeImage(row && row.image),
        url: safeUrl(row && row.url, true)
      };
    }).filter(function (row) { return row.name && row.url; });
  }

  function sanitizeNicknames(value) {
    var output = Object.create(null);
    if (!value || typeof value !== "object" || Array.isArray(value)) return output;
    Object.keys(value).slice(0, 200).forEach(function (key) {
      var username = text(key, 20).toLowerCase();
      var nickname = text(value[key], 30);
      if (/^[a-z0-9_]{3,20}$/.test(username) && nickname) output[username] = nickname;
    });
    return output;
  }

  function sanitizeTree(value, depth) {
    depth = depth || 0;
    if (depth > 6) return null;
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string") return text(value, 4000);
    if (Array.isArray(value)) return value.slice(0, 100).map(function (item) { return sanitizeTree(item, depth + 1); });
    if (!value || typeof value !== "object") return null;
    var output = Object.create(null);
    Object.keys(value).slice(0, 100).forEach(function (key) {
      if (["__proto__", "prototype", "constructor"].includes(key)) return;
      var safeKey = text(key, 80);
      if (safeKey) output[safeKey] = sanitizeTree(value[key], depth + 1);
    });
    return output;
  }

  function sanitizeJsonKey(key, raw) {
    var value;
    try { value = JSON.parse(raw); } catch (error) { return null; }
    if (key === "nova_bookmarks") return JSON.stringify(sanitizeBookmarks(value));
    if (key === "nova_recents") return JSON.stringify(sanitizeRecents(value));
    if (key === "nova_nicknames") return JSON.stringify(sanitizeNicknames(value));
    if (["nova_favs", "nova_app_favs"].includes(key)) {
      return JSON.stringify((Array.isArray(value) ? value : []).slice(0, 500).map(function (item) { return text(item, 100); }).filter(Boolean));
    }
    if (key === "nova_tab_cloak") {
      return JSON.stringify({
        enabled: !!(value && value.enabled),
        title: text(value && value.title, 80),
        favicon: safeImage(value && value.favicon)
      });
    }
    if (key === "nova-settings") {
      var settings = sanitizeTree(value);
      return JSON.stringify(settings && !Array.isArray(settings) ? settings : {});
    }
    return null;
  }

  function sanitizeScalarKey(key, raw) {
    if (["nova_homepage", "nova_panic_url"].includes(key)) return safeUrl(raw, false);
    if (key === "nova_panic_key") return text(raw, 1);
    if (key === "nova_theme") return text(raw, 32);
    if (key === "nova_quality") return text(raw, 16);
    if (key === "nova_search_engine") return text(raw, 20);
    if (key === "nova_setup_v7_complete") return raw === "7.1-launch" || raw === "7.0-launch" ? raw : "0";
    if (["nova_adblock", "nova_setup_complete", "nova_sound_enabled"].includes(key)) {
      return ["1", "true"].includes(String(raw).toLowerCase()) ? "1" : "0";
    }
    if (key === "nova_link_target") return raw === "new" ? "new" : "current";
    return text(raw, 200);
  }

  function sanitizeStoredUi() {
    SAFE_KEYS.forEach(function (key) {
      var raw = localStorage.getItem(key);
      if (raw === null) return;
      if (JSON_KEYS.has(key)) {
        var sanitized = sanitizeJsonKey(key, raw);
        if (sanitized === null) localStorage.removeItem(key);
        else localStorage.setItem(key, sanitized);
      } else {
        localStorage.setItem(key, sanitizeScalarKey(key, raw));
      }
    });
  }

  function importBackup(file) {
    if (!file || file.size > MAX_BACKUP_BYTES) throw new Error("Backup must be a JSON file under 1 MB");
    return file.text().then(function (source) {
      var payload = JSON.parse(source);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Backup is not valid");
      var imported = 0;
      Object.keys(payload).forEach(function (key) {
        if (!SAFE_KEYS.has(key)) return;
        var raw = String(payload[key] == null ? "" : payload[key]);
        var sanitized = JSON_KEYS.has(key) ? sanitizeJsonKey(key, raw) : null;
        if (JSON_KEYS.has(key) && sanitized === null) return;
        raw = sanitized !== null ? sanitized : sanitizeScalarKey(key, raw);
        localStorage.setItem(key, raw);
        imported += 1;
      });
      sanitizeStoredUi();
      return imported;
    });
  }

  sanitizeStoredUi();

  document.addEventListener("change", function (event) {
    if (!event.target || !["panic-url-input", "homepage-input"].includes(event.target.id)) return;
    var cleaned = safeUrl(event.target.value, false);
    if (cleaned) {
      event.target.value = cleaned;
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    event.target.value = "";
    if (window.toast) window.toast("Enter a complete HTTP or HTTPS address");
  }, true);

  document.addEventListener("click", function (event) {
    var button = event.target && event.target.closest("#bm-add-btn, #browser-bookmark-btn");
    if (!button) return;
    var nameInput = document.getElementById("bm-name-input");
    var urlInput = button.id === "browser-bookmark-btn"
      ? document.getElementById("url-bar")
      : document.getElementById("bm-url-input");
    if (nameInput) nameInput.value = text(nameInput.value, 40);
    if (!urlInput) return;
    var raw = String(urlInput.value || "").trim();
    if (button.id === "bm-add-btn" && raw && !/^https?:\/\//i.test(raw)) raw = "https://" + raw;
    var cleaned = safeUrl(raw, false);
    if (cleaned) {
      urlInput.value = cleaned;
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (window.toast) window.toast("Enter a complete HTTP or HTTPS address");
  }, true);

  document.addEventListener("click", function (event) {
    if (!event.target || !event.target.closest("#download-save-btn")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    var backup = Object.create(null);
    SAFE_KEYS.forEach(function (key) {
      var raw = localStorage.getItem(key);
      if (raw === null) return;
      var sanitized = JSON_KEYS.has(key) ? sanitizeJsonKey(key, raw) : null;
      if (JSON_KEYS.has(key) && sanitized === null) return;
      backup[key] = sanitized === null ? sanitizeScalarKey(key, raw) : sanitized;
    });
    var href = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    var link = document.createElement("a");
    link.href = href;
    link.download = "nova-preferences-" + new Date().toISOString().slice(0, 10) + ".json";
    link.click();
    setTimeout(function () { URL.revokeObjectURL(href); }, 1000);
    if (window.toast) window.toast("Safe preferences downloaded");
  }, true);

  document.addEventListener("change", function (event) {
    if (!event.target || event.target.id !== "save-file-input") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    var input = event.target;
    var file = input.files && input.files[0];
    importBackup(file).then(function (count) {
      if (window.toast) window.toast("Restored " + count + " safe preferences");
      setTimeout(function () { location.reload(); }, 350);
    }).catch(function (error) {
      if (window.toast) window.toast(error.message || "Invalid backup file");
    }).finally(function () { input.value = ""; });
  }, true);
})();
