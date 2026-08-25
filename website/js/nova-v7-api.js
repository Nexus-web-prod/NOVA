(function () {
  "use strict";

  (function purgeLegacyClientAuthority() {
    try {
      var remove = [];
      for (var index = 0; index < localStorage.length; index += 1) {
        var key = localStorage.key(index) || "";
        if (key.indexOf("nova:user:") === 0 ||
            key.indexOf("nova_db:nova:user:") === 0 ||
            key.indexOf("nova:admin:") === 0 ||
            key.indexOf("nova_db:nova:admin:") === 0 ||
            key === "nova_local_table:nova_users" ||
            key === "nova_local_table:nova_kv") remove.push(key);
      }
      remove.forEach(function (key) { localStorage.removeItem(key); });
    } catch (error) {}
  })();

  var deviceId = localStorage.getItem("nova_device_id");
  if (!deviceId) {
    deviceId = crypto.randomUUID ? crypto.randomUUID() : "nova-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    localStorage.setItem("nova_device_id", deviceId);
  }

  async function request(path, options) {
    options = Object.assign({}, options || {});
    var timeoutMs = Math.max(1000, Number(options.timeoutMs || 20000));
    delete options.timeoutMs;
    var headers = new Headers(options.headers || {});
    headers.set("X-Nova-Device", deviceId);
    if (String(options.method || "GET").toUpperCase() !== "GET") headers.set("X-Nova-Request", "1");
    if (options.body && !(options.body instanceof FormData) && typeof options.body !== "string") {
      headers.set("Content-Type", "application/json");
      options.body = JSON.stringify(options.body);
    }
    var controller = !options.signal && typeof AbortController !== "undefined" ? new AbortController() : null;
    var timeoutId = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;
    if (controller) options.signal = controller.signal;
    var response;
    try {
      response = await fetch(path, Object.assign({ credentials: "same-origin", headers: headers }, options));
    } catch (error) {
      if (error && error.name === "AbortError") {
        var timeoutError = new Error("Nova took too long to respond. Please try again.");
        timeoutError.code = "REQUEST_TIMEOUT";
        timeoutError.status = 408;
        throw timeoutError;
      }
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      var error = new Error((payload.error && payload.error.message) || "Nova could not complete that request");
      error.code = payload.error && payload.error.code;
      error.status = response.status;
      if (payload.error) Object.keys(payload.error).forEach(function (key) { if (!(key in error)) error[key] = payload.error[key]; });
      throw error;
    }
    return payload;
  }

  function cacheUser(user) {
    window.__novaV7User = user || null;
    if (!user) {
      localStorage.removeItem("nova_account");
    } else {
      localStorage.setItem("nova_account", JSON.stringify({
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatarUrl || "",
        avatarUrl: user.avatarUrl || "",
        role: user.role,
        roles: user.roles || [user.role || "user"],
        plan: user.plan || user.tier || "free",
        tier: user.tier || user.plan || "free",
        supernova: !!user.supernova,
        adsDisabled: !!user.adsDisabled,
        supernovaRequestPending: !!user.supernovaRequestPending,
        level: user.level || 1,
        xp: user.xp || 0
      }));
    }
    window.dispatchEvent(new CustomEvent("nova:session-changed", { detail: { user: user || null } }));
    document.dispatchEvent(new CustomEvent("nova:account-changed", { detail: { user: user || null } }));
  }

  var api = {
    deviceId: deviceId,
    request: request,
    me: function () { return request("/api/me"); },
    login: function (body) { return request("/api/auth/login", { method: "POST", body: body }); },
    register: function (body) { return request("/api/auth/register", { method: "POST", body: body }); },
    logout: function () {
      return request("/api/presence", { method: "POST", body: { state: "offline" } })
        .catch(function () {})
        .then(function () { return request("/api/auth/logout", { method: "POST", body: {} }); });
    },
    changePassword: function (body) { return request("/api/auth/change-password", { method: "POST", body: body }); },
    getProfile: function () { return request("/api/profile"); },
    saveProfile: function (body) { return request("/api/profile", { method: "PATCH", body: body }); },
    getSettings: function () { return request("/api/settings"); },
    saveSettings: function (settings) { return request("/api/settings", { method: "PATCH", body: { settings: settings } }); },
    gameStats: function (slugs) { return request("/api/games/stats?slugs=" + encodeURIComponent((slugs || []).join(","))); },
    rateGame: function (slug, rating) { return request("/api/games/rating", { method: "POST", body: { slug: slug, rating: rating } }); },
    recordGameView: function (slug) { return request("/api/games/view", { method: "POST", body: { slug: slug } }); },
    publicProfile: function (username) { return request("/api/profiles/" + encodeURIComponent(username)); },
    publicProfiles: function (usernames) { return request("/api/profiles?usernames=" + encodeURIComponent(usernames.join(","))); },
    social: function () { return request("/api/social"); },
    friendPresence: function () { return request("/api/social/presence"); },
    socialRequests: function () { return request("/api/social/requests"); },
    messages: function (channel, after) { return request("/api/social/messages?channel=" + encodeURIComponent(channel) + "&after=" + (after || 0)); },
    sendMessage: function (body) { return request("/api/social/messages", { method: "POST", body: body }); },
    reactions: function (channel) { return request("/api/social/reactions?channel=" + encodeURIComponent(channel)); },
    toggleReaction: function (channel, messageId, emoji) { return request("/api/social/reactions", { method: "POST", body: { channel: channel, messageId: messageId, emoji: emoji } }); },
    typing: function (channel) { return request("/api/social/typing?channel=" + encodeURIComponent(channel)); },
    setTyping: function (channel, typing) { return request("/api/social/typing", { method: "POST", body: { channel: channel, typing: !!typing } }); },
    friendRequest: function (username) { return request("/api/social/friend-request", { method: "POST", body: { username: username } }); },
    respondFriendRequest: function (username, action) { return request("/api/social/friend-request/respond", { method: "POST", body: { username: username, action: action } }); },
    removeFriend: function (username) { return request("/api/social/friend", { method: "DELETE", body: { username: username } }); },
    socialBlocks: function () { return request("/api/social/blocks"); },
    blockUser: function (username, reason) { return request("/api/social/blocks", { method: "POST", body: { username: username, reason: reason || "" } }); },
    unblockUser: function (username) { return request("/api/social/blocks", { method: "DELETE", body: { username: username } }); },
    report: function (body) { return request("/api/reports", { method: "POST", body: body }); },
    supportTickets: function () { return request("/api/support/tickets"); },
    supportTicket: function (id) { return request("/api/support/tickets?ticket=" + encodeURIComponent(id)); },
    createSupportTicket: function (body) { return request("/api/support/tickets", { method: "POST", body: body }); },
    replySupportTicket: function (ticketId, message) { return request("/api/support/tickets/messages", { method: "POST", body: { ticketId: ticketId, message: message } }); },
    setSupportTicketStatus: function (ticketId, action) { return request("/api/support/tickets/status", { method: "POST", body: { ticketId: ticketId, action: action } }); },
    supernovaState: function () { return request("/api/supernova/state"); },
    saveSupernovaState: function (body) { return request("/api/supernova/state", { method: "PUT", body: body }); },
    supernovaAccess: function () { return request("/api/supernova/access"); },
    claimSupernovaTrial: function () { return request("/api/supernova/trial", { method: "POST", body: {} }); },
    createSupernovaReferral: function (username) { return request("/api/supernova/referrals", { method: "POST", body: { username: username } }); },
    respondSupernovaReferral: function (referralId, action) { return request("/api/supernova/referrals/respond", { method: "POST", body: { referralId: referralId, action: action } }); },
    aiChat: function (body) { return request("/api/ai/chat", { method: "POST", body: body, timeoutMs: 60000 }); },
    createGroup: function (name, usernames) { return request("/api/social/groups", { method: "POST", body: { name: name, usernames: usernames } }); },
    inviteGroup: function (groupId, username) { return request("/api/social/groups/invite", { method: "POST", body: { groupId: groupId, username: username } }); },
    respondGroup: function (groupId, action) { return request("/api/social/groups/respond", { method: "POST", body: { groupId: groupId, action: action } }); },
    leaveGroup: function (groupId) { return request("/api/social/groups/member", { method: "DELETE", body: { groupId: groupId } }); },
    voiceRooms: function () { return request("/api/voice/rooms"); },
    voiceRoom: function (roomId) { return request("/api/voice/room?room=" + encodeURIComponent(roomId)); },
    createVoiceRoom: function (body) { return request("/api/voice/rooms", { method: "POST", body: body }); },
    requestVoiceJoin: function (roomId) { return request("/api/voice/request", { method: "POST", body: { roomId: roomId } }); },
    admitVoiceMember: function (roomId, username, action) { return request("/api/voice/admit", { method: "POST", body: { roomId: roomId, username: username, action: action } }); },
    leaveVoiceRoom: function (roomId) { return request("/api/voice/leave", { method: "POST", body: { roomId: roomId } }); },
    voiceAction: function (body) { return request("/api/voice/action", { method: "POST", body: body }); },
    voiceTranscript: function (roomId, text) { return request("/api/voice/transcript", { method: "POST", body: { roomId: roomId, text: text } }); },
    reportVoice: function (body) { return request("/api/voice/report", { method: "POST", body: body }); },
    voiceIce: function (roomId) { return request("/api/voice/ice?room=" + encodeURIComponent(roomId)); },
    adminOverview: function () { return request("/api/admin/overview"); },
    adminTasks: function (status, scope) { return request("/api/admin/tasks?status=" + encodeURIComponent(status || "") + "&scope=" + encodeURIComponent(scope || "")); },
    adminCreateTask: function (body) { return request("/api/admin/tasks", { method: "POST", body: body }); },
    adminUpdateTask: function (body) { return request("/api/admin/tasks", { method: "PATCH", body: body }); },
    adminUsers: function (query, status) { return request("/api/admin/users?q=" + encodeURIComponent(query || "") + "&status=" + encodeURIComponent(status || "")); },
    adminStaff: function () { return request("/api/admin/staff"); },
    adminUserStatus: function (body) { return request("/api/admin/users/status", { method: "POST", body: body }); },
    adminResetUserPassword: function (body) { return request("/api/admin/users/password", { method: "POST", body: body }); },
    adminChatMessages: function (reason, query, username, channel) { return request("/api/admin/chat/messages?q=" + encodeURIComponent(query || "") + "&username=" + encodeURIComponent(username || "") + "&channel=" + encodeURIComponent(channel || ""), { headers: { "X-Nova-Audit-Reason": reason } }); },
    adminChatRestrictions: function (username) { return request("/api/admin/chat/restrictions?username=" + encodeURIComponent(username || "")); },
    adminCreateChatRestriction: function (body) { return request("/api/admin/chat/restrictions", { method: "POST", body: body }); },
    adminRevokeChatRestriction: function (body) { return request("/api/admin/chat/restrictions", { method: "DELETE", body: body }); },
    adminClearEveryoneChat: function (reason) { return request("/api/admin/chat/everyone/clear", { method: "DELETE", body: { reason: reason } }); },
    adminReports: function (status) { return request("/api/admin/reports?status=" + encodeURIComponent(status || "")); },
    adminReportAction: function (body) { return request("/api/admin/reports/action", { method: "POST", body: body }); },
    adminTickets: function (status, query) { return request("/api/admin/tickets?status=" + encodeURIComponent(status || "") + "&q=" + encodeURIComponent(query || "")); },
    adminTicket: function (id) { return request("/api/admin/tickets?ticket=" + encodeURIComponent(id)); },
    adminTicketAction: function (body) { return request("/api/admin/tickets/action", { method: "POST", body: body }); },
    adminRole: function (body) { return request("/api/admin/roles", { method: "POST", body: body }); },
    adminProxyLogs: function (reason, domain, device) { return request("/api/admin/proxy-logs?domain=" + encodeURIComponent(domain || "") + "&device=" + encodeURIComponent(device || ""), { headers: { "X-Nova-Audit-Reason": reason } }); },
    adminDeviceBans: function () { return request("/api/admin/device-bans"); },
    adminBanDevice: function (body) { return request("/api/admin/device-bans", { method: "POST", body: body }); },
    adminUnbanDevice: function (body) { return request("/api/admin/device-bans", { method: "DELETE", body: body }); },
    siteState: function () { return request("/api/site-state"); },
    adminSite: function () { return request("/api/admin/site"); },
    adminSetMaintenance: function (body) { return request("/api/admin/maintenance", { method: "PATCH", body: body }); },
    adminCreateBanner: function (body) { return request("/api/admin/banners", { method: "POST", body: body }); },
    adminUpdateBanner: function (body) { return request("/api/admin/banners", { method: "PATCH", body: body }); },
    adminDeleteBanner: function (id) { return request("/api/admin/banners", { method: "DELETE", body: { id: id } }); },
    adminSupernova: function () { return request("/api/admin/supernova"); },
    adminSupernovaAction: function (body) { return request("/api/admin/supernova", { method: "POST", body: body }); },
    adminVoice: function () { return request("/api/admin/voice"); },
    adminVoiceAction: function (body) { return request("/api/admin/voice/action", { method: "POST", body: body }); },
    adminAudit: function () { return request("/api/admin/audit"); },
    cacheUser: cacheUser
  };

  window.NovaAPI = api;
  var PRESENCE_ACTIVITY_KEY = "nova_presence_activity_at";
  var IDLE_AFTER_MS = 60 * 1000;
  var OFFLINE_AFTER_MS = 2 * 60 * 1000;
  var lastActivityAt = Date.now();
  var lastActivityStoredAt = 0;
  var lastPresenceAt = 0;
  var currentPresenceState = "";

  function sharedActivityAt() {
    var shared = Number(localStorage.getItem(PRESENCE_ACTIVITY_KEY) || 0);
    return Math.max(lastActivityAt, shared);
  }

  function sendPresence(state, force) {
    if (!window.__novaV7User) return;
    var now = Date.now();
    if (!force && state === currentPresenceState && now - lastPresenceAt < 55000) return;
    currentPresenceState = state;
    lastPresenceAt = now;
    api.request("/api/presence", { method: "POST", body: { state: state } }).catch(function () {
      lastPresenceAt = 0;
    });
  }

  function syncPresence() {
    if (!window.__novaV7User) return;
    var inactiveFor = Date.now() - sharedActivityAt();
    var state = inactiveFor >= OFFLINE_AFTER_MS ? "offline" : (inactiveFor >= IDLE_AFTER_MS ? "idle" : "online");
    var heartbeatDue = state !== "offline" && Date.now() - lastPresenceAt >= 60000;
    if (state !== currentPresenceState || heartbeatDue) sendPresence(state, true);
  }

  function recordActivity() {
    var now = Date.now();
    lastActivityAt = now;
    if (now - lastActivityStoredAt >= 5000) {
      lastActivityStoredAt = now;
      localStorage.setItem(PRESENCE_ACTIVITY_KEY, String(now));
    }
    if (currentPresenceState && currentPresenceState !== "online") sendPresence("online", true);
  }

  document.addEventListener("nova:account-changed", function (event) {
    if (event.detail && event.detail.user) {
      recordActivity();
      sendPresence("online", true);
    } else {
      currentPresenceState = "";
    }
  });

  api.me().then(function (data) {
    window.__novaV7User = data.user || null;
    cacheUser(data.user || null);
  }).catch(function () {});

  ["pointerdown", "keydown", "touchstart", "wheel", "mousemove"].forEach(function (type) {
    document.addEventListener(type, recordActivity, { passive: true, capture: true });
  });

  setInterval(syncPresence, 5000);

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) recordActivity();
  });
  window.addEventListener("focus", recordActivity);
  window.addEventListener("online", recordActivity);
  window.addEventListener("storage", function (event) {
    if (event.key === PRESENCE_ACTIVITY_KEY && Number(event.newValue || 0) > lastActivityAt) syncPresence();
  });

  document.addEventListener("nova:navigate", function (event) {
    if (!event.detail || !event.detail.url) return;
    api.request("/api/proxy/navigation", { method: "POST", body: { url: event.detail.url, result: "opened" } }).catch(function () {});
  });
})();
