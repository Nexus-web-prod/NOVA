(function () {
  "use strict";

  var KEY = "nova_developer_options_v1";
  var defaults = {
    enabled: false, inspectElement: true, allowDownloads: false, browserConsole: false,
    networkLog: false, deviceEmulation: "off", muteSites: false, disablePageJs: false,
    allowPopups: false, proxyMode: "automatic", userAgent: "default", customUserAgent: "",
    persistEdits: false, experimentalWebSocket: false, experimentalMedia: false, verboseLogging: false
  };
  var secretPattern = /(authorization|cookie|set-cookie|password|token|secret|api[-_ ]?key)(["' :=]+)([^\s,"'}]+)/gi;

  function read() {
    try { return Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY) || "{}")); }
    catch (_) { return Object.assign({}, defaults); }
  }
  function save(next) {
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("nova:developer-options", { detail: Object.assign({}, next) }));
  }
  function sanitize(value) {
    return String(value == null ? "" : value).replace(secretPattern, "$1$2[REDACTED]");
  }
  function notify(message) {
    if (typeof window.toast === "function") window.toast(message);
    else {
      var status = document.getElementById("settings-sync-status");
      if (status) status.querySelector("span:last-child").textContent = message;
    }
  }
  function confirmAction(title, message, actionLabel) {
    return new Promise(function (resolve) {
      var overlay = document.createElement("div");
      overlay.className = "dev-dialog-backdrop";
      overlay.innerHTML = '<div class="dev-dialog" role="dialog" aria-modal="true" aria-labelledby="dev-dialog-title"><strong id="dev-dialog-title">' + title + '</strong><p>' + message + '</p><div><button class="settings-secondary-btn" data-result="cancel" type="button">Cancel</button><button class="settings-primary-btn" data-result="ok" type="button">' + actionLabel + '</button></div></div>';
      document.body.appendChild(overlay);
      var finish = function (result) { overlay.remove(); resolve(result); };
      overlay.addEventListener("click", function (event) {
        var button = event.target.closest("[data-result]");
        if (button) finish(button.dataset.result === "ok");
        else if (event.target === overlay) finish(false);
      });
      overlay.querySelector('[data-result="cancel"]').focus();
    });
  }
  function frames() { return Array.from(document.querySelectorAll("#page-browser iframe, .browser-frame iframe, iframe.proxy-frame")); }
  function applyFramePreferences(settings) {
    document.documentElement.dataset.novaDeviceEmulation = settings.enabled ? settings.deviceEmulation : "off";
    frames().forEach(function (frame) {
      frame.muted = !!(settings.enabled && settings.muteSites);
      frame.dataset.devJavascript = settings.enabled && settings.disablePageJs ? "disabled" : "enabled";
      frame.dataset.devPopups = settings.enabled && settings.allowPopups ? "allowed" : "blocked";
    });
  }
  async function applyProxyMode(mode) {
    var diagnostics = window.NovaProxyDiagnostics;
    if (!diagnostics) return;
    if (mode === "libcurl") await diagnostics.forceLibcurl();
    else if (mode === "epoxy") await diagnostics.forceEpoxy();
    else if (mode === "legacy") diagnostics.forceLegacy();
    else diagnostics.clearOverride();
  }
  function expose(settings) {
    window.NovaDeveloperOptions = Object.freeze({
      get: function () { return Object.assign({}, read()); },
      mayDownload: function (userInitiated) { var current = read(); return !!(current.enabled && current.allowDownloads && userInitiated); },
      sanitize: sanitize,
      open: function () {
        window._novaSwitchPage?.("settings");
        setTimeout(function () { document.querySelector('[data-settings-pane="developer"]')?.click(); }, 120);
      },
      inspect: function () {
        var current = read();
        if (!current.enabled || !current.inspectElement) return false;
        window.dispatchEvent(new CustomEvent("nova:inspect-page", { detail: { persist: current.persistEdits } }));
        return true;
      },
      showDownloadBlocked: function () {
        confirmAction("Download blocked", "Downloads from proxied websites are disabled. Enable downloads in Settings → Developer Options.", "Open Developer Options").then(function (open) { if (open) window.NovaDeveloperOptions.open(); });
      }
    });
    applyFramePreferences(settings);
  }
  function healthLabel(value, fallback) {
    var status = value && value.status ? value.status : fallback;
    return status ? status.charAt(0).toUpperCase() + status.slice(1) : "Unknown";
  }
  async function refreshHealth() {
    var target = document.getElementById("nova-dev-health");
    if (!target) return;
    var state = window.NovaProxyManager?.getState?.() || {};
    var health = state.transportHealth || {};
    var values = [healthLabel(health.libcurl, "ready"), healthLabel(health.epoxy, "standby"), healthLabel(health.legacy, "available"), healthLabel(null, state.wispStatus || "checking")];
    target.querySelectorAll("b").forEach(function (node, index) { node.textContent = values[index]; });
  }
  function diagnosticsData() {
    var state = window.NovaProxyManager?.getState?.() || {};
    var frame = frames().find(function (item) { return !item.hidden; });
    return {
      generatedAt: new Date().toISOString(), novaVersion: document.querySelector('meta[name="nova-version"]')?.content || "7.0",
      browser: navigator.userAgent, platform: navigator.platform, target: frame?.dataset?.url || frame?.src || "No active tab",
      engine: state.currentEngine || "Not initialized", transport: state.currentTransport || "Not initialized",
      wisp: state.wispStatus || "Unknown", serviceWorker: navigator.serviceWorker?.controller ? "Active" : "Inactive",
      fallbacks: state.fallbackHistory || [], health: state.transportHealth || {}, lastError: sanitize(state.lastFallbackReason || "None")
    };
  }
  function openDiagnostics() {
    var data = diagnosticsData();
    var modal = document.createElement("div");
    modal.className = "dev-dialog-backdrop";
    modal.innerHTML = '<div class="dev-dialog dev-diagnostics" role="dialog" aria-modal="true"><header><div><span>Current Tab</span><strong>Proxy Diagnostics</strong></div><button class="settings-icon-action" aria-label="Close diagnostics" type="button">×</button></header><dl>' +
      Object.entries({ URL: data.target, Engine: data.engine, Transport: data.transport, Wisp: data.wisp, "Service Worker": data.serviceWorker, Fallbacks: data.fallbacks.length }).map(function (row) { return "<div><dt>" + row[0] + "</dt><dd>" + sanitize(row[1]) + "</dd></div>"; }).join("") +
      '</dl><details open><summary>Transport Health</summary><pre>' + sanitize(JSON.stringify(data.health, null, 2)) + '</pre></details><details><summary>Errors</summary><pre>' + sanitize(data.lastError) + '</pre></details></div>';
    document.body.appendChild(modal);
    modal.addEventListener("click", function (event) { if (event.target === modal || event.target.closest(".settings-icon-action")) modal.remove(); });
    modal.querySelector("button").focus();
  }
  function downloadReport() {
    var report = JSON.stringify(diagnosticsData(), null, 2).replace(secretPattern, "$1$2[REDACTED]");
    var url = URL.createObjectURL(new Blob(["Nova Browser Diagnostic Report\n\n" + report], { type: "text/plain" }));
    var link = document.createElement("a"); link.href = url; link.download = "nova-browser-diagnostics-" + new Date().toISOString().slice(0, 10) + ".txt"; link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  async function clearNamedCaches(match) {
    if (!window.caches) return 0;
    var names = await caches.keys(); var selected = names.filter(match);
    await Promise.all(selected.map(function (name) { return caches.delete(name); })); return selected.length;
  }
  async function handleAction(action) {
    if (action === "clear-browser-cache") { await clearNamedCaches(function (name) { return !/scramjet|proxy|vortex|bare/i.test(name); }); notify("Browser cache cleared"); }
    if (action === "clear-proxy-cache") { await clearNamedCaches(function (name) { return /scramjet|proxy|vortex|bare/i.test(name); }); notify("Proxy cache cleared"); }
    if (action === "clear-site-data") {
      if (!await confirmAction("Clear Website Data?", "This clears locally stored proxied-site compatibility and inspector data. Your Nova account stays signed in.", "Clear Data")) return;
      Object.keys(localStorage).filter(function (key) { return /^(nova_site_|nova_inspector_|nova_proxy_site_)/.test(key); }).forEach(function (key) { localStorage.removeItem(key); }); notify("Proxied website data cleared");
    }
    if (action === "clear-everything") { if (!await confirmAction("Clear Browser Developer Data?", "This clears Nova browser caches, proxy caches, compatibility choices, and proxied website data. Your Nova account and unrelated settings stay intact.", "Clear Everything")) return; await clearNamedCaches(function () { return true; }); Object.keys(localStorage).filter(function (key) { return /^(nova_site_|nova_inspector_|nova_proxy_site_)|compat/i.test(key); }).forEach(function (key) { localStorage.removeItem(key); }); notify("Browser developer data cleared"); }
    if (action === "restart-worker") { var ready = await navigator.serviceWorker?.ready; await ready?.update?.(); (ready?.active || navigator.serviceWorker?.controller)?.postMessage({ type: "nova_proxy_restart" }); notify("Proxy worker restarted"); }
    if (action === "reregister-worker") {
      var regs = await navigator.serviceWorker?.getRegistrations?.() || [];
      var proxyRegs = regs.filter(function (reg) { return /\/sw\.js(?:\?|$)/.test(reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || ""); });
      await Promise.all(proxyRegs.map(function (reg) { return reg.unregister(); }));
      await navigator.serviceWorker?.register?.("/sw.js?novaProxy=20260822-sj2067-r8.19", { scope: "/", updateViaCache: "none" }); notify("Proxy worker re-registered");
    }
  }
  function render(settings) {
    var master = document.getElementById("nova-dev-master");
    var controls = document.getElementById("nova-dev-controls");
    if (!master || !controls) return;
    master.checked = settings.enabled; controls.hidden = !settings.enabled;
    document.querySelector(".dev-master-card")?.classList.toggle("active", settings.enabled);
    document.querySelectorAll(".nova-dev-setting").forEach(function (input) {
      var value = settings[input.dataset.devKey];
      if (input.type === "checkbox") input.checked = !!value; else input.value = value;
    });
    var custom = document.getElementById("nova-dev-custom-ua");
    if (custom) { custom.hidden = settings.userAgent !== "custom"; custom.value = settings.customUserAgent || ""; }
    refreshHealth(); expose(settings);
  }
  function init() {
    var master = document.getElementById("nova-dev-master");
    if (!master) return;
    var settings = read(); render(settings);
    master.addEventListener("change", async function () {
      if (master.checked && !settings.enabled) {
        var allowed = await confirmAction("Enable Developer Mode?", "Developer tools can modify proxied pages, enable downloads, and expose advanced browser diagnostics. These changes affect only your Nova experience.", "Enable");
        if (!allowed) { master.checked = false; return; }
      }
      settings.enabled = master.checked; save(settings); render(settings);
    });
    document.querySelectorAll(".nova-dev-setting").forEach(function (input) {
      input.addEventListener("change", async function () {
        var key = input.dataset.devKey; var value = input.type === "checkbox" ? input.checked : input.value;
        if (key === "allowDownloads" && value && !await confirmAction("Allow Downloads?", "Files downloaded from third-party websites may be unsafe. Nova does not verify downloaded files.", "Allow Downloads")) { input.checked = false; return; }
        settings[key] = value; save(settings); render(settings);
        if (key === "proxyMode") { try { await applyProxyMode(value); notify("Proxy mode updated"); } catch (error) { notify("Proxy mode could not be changed"); } }
      });
    });
    document.getElementById("nova-dev-custom-ua")?.addEventListener("change", function (event) { settings.customUserAgent = event.target.value.trim(); save(settings); });
    document.getElementById("nova-dev-open-diagnostics")?.addEventListener("click", openDiagnostics);
    document.getElementById("nova-dev-inspect-now")?.addEventListener("click", function () { window._novaSwitchPage?.("browser"); setTimeout(function () { window.NovaBrowserDevTools?.inspect?.(); }, 180); });
    document.getElementById("nova-dev-export")?.addEventListener("click", downloadReport);
    document.getElementById("nova-dev-reset-health")?.addEventListener("click", function () { ["nova_proxy_health", "nova_proxy_failures", "nova_proxy_routing_log"].forEach(function (key) { localStorage.removeItem(key); }); refreshHealth(); notify("Proxy health data reset"); });
    document.getElementById("nova-dev-reset-compat")?.addEventListener("click", function () { Object.keys(localStorage).filter(function (key) { return /nova.*compat/i.test(key); }).forEach(function (key) { localStorage.removeItem(key); }); notify("Compatibility data reset"); });
    document.querySelectorAll("[data-dev-action]").forEach(function (button) { button.addEventListener("click", function () { handleAction(button.dataset.devAction).catch(function () { notify("Action could not be completed"); }); }); });
    document.getElementById("nova-dev-reset")?.addEventListener("click", async function () { if (!await confirmAction("Reset Developer Options?", "All developer settings will return to their safe defaults.", "Reset")) return; settings = Object.assign({}, defaults); window.NovaProxyDiagnostics?.clearOverride?.(); save(settings); render(settings); notify("Developer Options reset"); });
    setInterval(function () { if (!document.hidden && settings.enabled) refreshHealth(); }, 5000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  expose(read());
})();
