(() => {
  "use strict";

  const PREFIX = "/vortex/";
  const encoded = location.pathname.startsWith(PREFIX) ? location.pathname.slice(PREFIX.length) : "";
  let target;
  try { target = new URL(decodeURIComponent(encoded)); } catch (_) {}

  const profile = target ? globalThis.NovaProxyCompatibility?.classify(target) : null;
  const serviceName = profile?.service || "This service";
  const host = target?.hostname || "Invalid destination";
  document.getElementById("service-name").textContent = serviceName;
  document.getElementById("destination-host").textContent = host;

  const status = document.getElementById("handoff-status");
  const openButton = document.getElementById("open-direct");
  const copyButton = document.getElementById("copy-link");
  const copyLabel = document.getElementById("copy-label");
  const backButton = document.getElementById("go-back");
  const qrRoot = document.getElementById("qr-code");
  const valid = !!target && target.protocol === "https:";

  if (!valid) {
    openButton.disabled = true;
    copyButton.disabled = true;
    qrRoot.innerHTML = '<div class="qr-error">Nova blocked an invalid verification address.</div>';
    status.textContent = "Invalid verification address blocked";
  } else {
    try {
      const qr = qrcode(0, "M");
      qr.addData(target.href, "Byte");
      qr.make();
      qrRoot.innerHTML = qr.createSvgTag(5, 0);
    } catch (_) {
      qrRoot.innerHTML = '<div class="qr-error">This temporary link is too long for a QR code. Use Open or Copy link instead.</div>';
    }
  }

  openButton.addEventListener("click", () => {
    if (!valid) return;
    window.open(target.href, "_blank", "noopener,noreferrer");
    status.textContent = `Opening ${host} in a secure tab. If nothing opens, allow pop-ups or copy the link.`;
  });

  copyButton.addEventListener("click", async () => {
    if (!valid) return;
    try {
      await navigator.clipboard.writeText(target.href);
      copyLabel.textContent = "Link copied";
      status.textContent = "Secure verification link copied";
      setTimeout(() => { copyLabel.textContent = "Copy link"; }, 1800);
    } catch (_) {
      status.textContent = "Could not copy automatically. Use Open secure verification instead.";
    }
  });

  backButton.addEventListener("click", () => history.back());
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") history.back();
  });
  openButton.focus();
})();
