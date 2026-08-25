document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("adblock-toggle");

  async function syncAdBlock() {
    const registration = await navigator.serviceWorker?.ready.catch(() => null);
    registration?.active?.postMessage({
      type: "nova_adblock",
      enabled: !toggle || toggle.checked
    });
  }

  syncAdBlock();
  toggle?.addEventListener("change", syncAdBlock);
});
