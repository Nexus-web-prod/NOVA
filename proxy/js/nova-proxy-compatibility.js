(() => {
  "use strict";
  const profiles = Object.freeze([
    { id: "google-auth", service: "Google", mode: "direct-auth", hosts: ["accounts.google.com", "oauth2.google.com"] },
    { id: "microsoft-auth", service: "Microsoft", mode: "direct-auth", hosts: ["login.microsoftonline.com", "login.live.com"] },
    { id: "apple-auth", service: "Apple", mode: "direct-auth", hosts: ["appleid.apple.com"] },
    { id: "epic-auth", service: "Epic Games", mode: "direct-auth", hosts: ["epicgames.com", "www.epicgames.com"], paths: ["/id/"] },
    { id: "roblox-auth", service: "Roblox", mode: "direct-auth", hosts: ["auth.roblox.com"] }
  ]);

  function classify(input) {
    let url;
    try { url = input instanceof URL ? input : new URL(input); } catch (_) { return null; }
    if (url.protocol !== "https:") return null;
    const profile = profiles.find(item => item.hosts.includes(url.hostname.toLowerCase())
      && (!item.paths || item.paths.some(path => url.pathname.startsWith(path))));
    return profile ? { ...profile, url } : null;
  }

  globalThis.NovaProxyCompatibility = Object.freeze({ profiles, classify });
})();
