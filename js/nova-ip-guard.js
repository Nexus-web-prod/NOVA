/* Nova 7 device-ban guard. D1 is the only source of truth. */
!function () {
  "use strict";

  var DEVICE_KEY = "nova_device_id";
  var checkTimer = 0;
  var blocked = false;

  function deviceId() {
    try {
      var id = localStorage.getItem(DEVICE_KEY);
      if (!id) {
        id = crypto.randomUUID ? crypto.randomUUID() : "nova-" + Date.now() + "-" + Math.random().toString(36).slice(2);
        localStorage.setItem(DEVICE_KEY, id);
      }
      window.__novaDeviceID = id;
      return id;
    } catch (error) {
      return "ephemeral-" + Math.random().toString(36).slice(2);
    }
  }

  function showBanScreen(status) {
    if (blocked) return;
    blocked = true;
    clearInterval(checkTimer);
    var root = document.createElement("div");
    root.id = "nova-device-block";
    root.setAttribute("role", "alert");
    root.innerHTML = '<div class="nova-device-block-mark">✦</div><strong>Device access restricted</strong><p id="nova-device-block-reason"></p><small id="nova-device-block-expiry"></small>';
    var style = document.createElement("style");
    style.id = "nova-device-block-style";
    style.textContent = "#nova-device-block{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;padding:28px;background:#06060b;color:#f3eff8;text-align:center;font-family:Lato,system-ui,sans-serif}#nova-device-block .nova-device-block-mark{width:52px;height:52px;display:grid;place-items:center;border:1px solid rgba(255,113,135,.34);border-radius:8px;background:rgba(255,113,135,.08);color:#ff91a2;font-size:25px}#nova-device-block strong{font-size:21px}#nova-device-block p{max-width:470px;margin:0;color:#aaa4b2;font-size:13px;line-height:1.6}#nova-device-block small{color:#716b79;font:10px Space Mono,monospace}";
    (document.head || document.documentElement).appendChild(style);
    document.documentElement.appendChild(root);
    document.getElementById("nova-device-block-reason").textContent = status.reason || "This device has been banned from Nova.";
    document.getElementById("nova-device-block-expiry").textContent = status.expiresAt ? "Restriction expires " + new Date(Number(status.expiresAt)).toLocaleString() : "Permanent restriction";
    document.documentElement.style.overflow = "hidden";
  }

  async function checkDevice() {
    if (blocked || document.hidden) return;
    try {
      var response = await fetch("/api/device-status", {
        credentials: "same-origin",
        cache: "no-store",
        headers: { "X-Nova-Device": deviceId() }
      });
      if (!response.ok) return;
      var status = await response.json();
      if (status.banned) showBanScreen(status);
    } catch (error) {
      // A status outage must not make the entire site unavailable.
    }
  }

  deviceId();
  checkDevice();
  checkTimer = setInterval(checkDevice, 45000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) checkDevice(); });
}();
