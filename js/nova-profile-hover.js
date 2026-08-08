(function () {
  "use strict";
  var cache = new Map(), timer, hideTimer, activeName = "";
  var card = document.createElement("aside");
  card.id = "nova-profile-popover";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "Nova profile");

  function esc(value) { var el = document.createElement("div"); el.textContent = value == null ? "" : String(value); return el.innerHTML; }
  function usernameFrom(target) {
    var direct = target.closest("[data-username], [data-np-user]");
    if (direct) return (direct.dataset.username || direct.dataset.npUser || "").trim().toLowerCase();
    var row = target.closest(".social-friend-item, .social-message");
    if (!row) return "";
    var name = row.querySelector(".social-friend-name, [data-np-user]");
    return name ? (name.dataset.npUser || name.textContent || "").trim().split(/\s/)[0].toLowerCase() : "";
  }
  async function get(username) {
    var hit = cache.get(username);
    if (hit && Date.now() - hit.at < 60000) return hit.profile;
    var data = await NovaAPI.publicProfile(username); cache.set(username, { at: Date.now(), profile: data.profile }); return data.profile;
  }
  function place(anchor) {
    var rect = anchor.getBoundingClientRect(), width = Math.min(340, innerWidth - 24);
    var left = Math.min(innerWidth - width - 12, Math.max(12, rect.left));
    var top = rect.bottom + 10;
    if (top + card.offsetHeight > innerHeight - 12) top = Math.max(12, rect.top - card.offsetHeight - 10);
    card.style.left = left + "px"; card.style.top = top + "px"; card.style.width = width + "px";
  }
  function render(profile, anchor) {
    var initial = (profile.displayName || profile.username).charAt(0).toUpperCase();
    var presenceClass = profile.presenceState === "online" ? "is-online" : (profile.presenceState === "idle" ? "is-idle" : "");
    card.innerHTML = '<div class="nova-profile-banner"' + (profile.bannerUrl ? ' style="background-image:url(\'' + esc(profile.bannerUrl) + '\')"' : "") + '></div>' +
      '<div class="nova-profile-content"><div class="nova-profile-avatar ' + presenceClass + '">' + (profile.avatarUrl ? '<img src="' + esc(profile.avatarUrl) + '" alt="">' : esc(initial)) + '</div>' +
      '<div class="nova-profile-heading"><div><strong>' + esc(profile.displayName || profile.username) + '</strong><span>@' + esc(profile.username) + '</span></div><b>' + esc(profile.role || "user") + '</b></div>' +
      (profile.statusText ? '<p class="nova-profile-status">' + esc(profile.statusText) + '</p>' : "") +
      '<p class="nova-profile-bio">' + esc(profile.bio || "No bio yet.") + '</p>' +
      '<div class="nova-profile-meta"><span>Lv ' + Number(profile.level || 1) + '</span>' + (profile.pronouns ? '<span>' + esc(profile.pronouns) + '</span>' : "") + (profile.locationText ? '<span>' + esc(profile.locationText) + '</span>' : "") + '</div></div>';
    card.classList.add("visible"); place(anchor);
  }
  function show(anchor, username) {
    clearTimeout(hideTimer); activeName = username; card.innerHTML = '<div class="nova-profile-loading">Loading profile…</div>'; card.classList.add("visible"); place(anchor);
    get(username).then(function (profile) { if (activeName === username) render(profile, anchor); }).catch(function () { card.classList.remove("visible"); });
  }
  function scheduleHide() { clearTimeout(hideTimer); hideTimer = setTimeout(function () { activeName = ""; card.classList.remove("visible"); }, 180); }
  document.addEventListener("mouseover", function (event) { var username = usernameFrom(event.target); if (!username) return; clearTimeout(timer); timer = setTimeout(function () { show(event.target, username); }, 260); });
  document.addEventListener("mouseout", function (event) { if (usernameFrom(event.target)) { clearTimeout(timer); scheduleHide(); } });
  card.addEventListener("mouseenter", function () { clearTimeout(hideTimer); });
  card.addEventListener("mouseleave", scheduleHide);
  window.addEventListener("nova:profile-updated", function (event) { if (event.detail && event.detail.username) cache.delete(event.detail.username); });
  document.addEventListener("DOMContentLoaded", function () { document.body.appendChild(card); });
})();
