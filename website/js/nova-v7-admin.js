(function () {
  "use strict";
  window.__novaV7AdminEnabled = true;

  var STAFF_ROLES = ["developer", "admin", "owner"];
  var state = { view: "overview", users: [], reports: [], tickets: [], supernova: { members: [], requests: [] }, voice: { rooms: [], reports: [], restrictions: [] }, deviceBans: [], banners: [], reportStatus: "", refreshTimer: 0 };
  var icons = {
    overview: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
    health: '<svg viewBox="0 0 24 24"><path d="M3 12h4l2.2-5 4.2 10 2.1-5H21"/><circle cx="12" cy="12" r="10"/></svg>',
    views: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20V7"/></svg>',
    users: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    staff: '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>',
    reports: '<svg viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
    tickets: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2.5 2.5 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2.5 2.5 0 0 0 0-4z"/><path d="M13 5v2m0 3v4m0 3v2"/></svg>',
    contentVotes: '<svg viewBox="0 0 24 24"><path d="M5 11h14l2 4v6H3v-6l2-4Z"/><path d="M7 3h10v12H7z"/><path d="m9.5 8 1.7 1.7 3.5-3.7"/></svg>',
    chat: '<svg viewBox="0 0 24 24"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="m9 10 2 2 4-4"/></svg>',
    voice: '<svg viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>',
    supernova: '<svg viewBox="0 0 24 24"><path d="M12 2.5 14.2 9.8 21.5 12l-7.3 2.2L12 21.5l-2.2-7.3L2.5 12l7.3-2.2z"/></svg>',
    proxy: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    devices: '<svg viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="10" y1="18" x2="14" y2="18"/><path d="M9 9.5l2 2 4-4"/></svg>',
    banners: '<svg viewBox="0 0 24 24"><path d="M3 11v2a2 2 0 0 0 2 2h2l4 4V5L7 9H5a2 2 0 0 0-2 2z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    maintenance: '<svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/></svg>',
    audit: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>',
    refresh: '<svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    close: '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    chevron: '<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>',
    check: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="8" y1="8" x2="16" y2="16"/><line x1="16" y1="8" x2="8" y2="16"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6m3 0V4h8v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    tasks: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/><path d="m6.5 8 .8.8 1.4-1.6"/></svg>'
  };

  function esc(value) {
    var el = document.createElement("div");
    el.textContent = value == null ? "" : String(value);
    return el.innerHTML;
  }
  function isStaff(user) { return !!(user && STAFF_ROLES.includes(user.role)); }
  function isOwner() { return !!(window.__novaV7User && window.__novaV7User.role === "owner"); }
  function isDeveloperUp() { return !!(window.__novaV7User && ["developer", "owner"].includes(window.__novaV7User.role)); }
  function canManageAccounts() { return !!(window.__novaV7User && ["admin", "developer", "owner"].includes(window.__novaV7User.role)); }
  function roleRank(role) { return ({ user: 0, admin: 1, developer: 2, owner: 3 })[role] || 0; }
  function fmtTime(value) { return value ? new Date(Number(value)).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", hour12: true }) : "—"; }
  function relativeTime(value) {
    var seconds = Math.max(0, Math.floor((Date.now() - Number(value || 0)) / 1000));
    if (seconds < 60) return "just now";
    if (seconds < 3600) return Math.floor(seconds / 60) + "m ago";
    if (seconds < 86400) return Math.floor(seconds / 3600) + "h ago";
    return Math.floor(seconds / 86400) + "d ago";
  }
  function roleTone(role) { return ["owner", "admin", "developer"].includes(role) ? "staff" : "standard"; }
  function statusBadge(status) { var value = status || "open"; return '<span class="nova-admin-status is-' + esc(value) + '"><i></i>' + esc(String(value).replace(/_/g, " ")) + "</span>"; }
  function avatar(user) {
    var label = (user.displayName || user.username || "?").trim();
    return '<span class="nova-admin-avatar">' + (user.avatarUrl ? '<img src="' + esc(user.avatarUrl) + '" alt="">' : esc(label.charAt(0).toUpperCase())) + "</span>";
  }
  function setBusy(button, busy, label) {
    if (!button) return;
    if (busy) { button.dataset.label = button.innerHTML; button.disabled = true; button.innerHTML = '<span class="nova-admin-spinner"></span>' + esc(label || "Working"); }
    else { button.disabled = false; if (button.dataset.label) button.innerHTML = button.dataset.label; }
  }
  function toast(message, tone) {
    var host = document.getElementById("nova-admin-toasts");
    if (!host) return;
    var node = document.createElement("div");
    node.className = "nova-admin-toast " + (tone ? "is-" + tone : "");
    node.innerHTML = (tone === "success" ? icons.check : "") + '<span>' + esc(message) + "</span>";
    host.appendChild(node);
    setTimeout(function () { node.classList.add("leaving"); setTimeout(function () { node.remove(); }, 220); }, 3200);
  }

  function syncAccess(user) {
    var allowed = isStaff(user);
    window._novaIsDevUser = allowed;
    window._novaIsAdminAuthed = allowed;
    [document.getElementById("dev-nav-tab"), document.getElementById("ni-admin-page-item")].forEach(function (el) {
      if (el) el.style.display = allowed ? "" : "none";
    });
  }

  function navButton(view, label) {
    return '<button type="button" data-admin-view="' + view + '" class="' + (state.view === view ? "active" : "") + '" aria-label="' + esc(label) + '" title="' + esc(label) + '">' + icons[view] + "<span>" + esc(label) + "</span>" + (view === "tasks" ? '<b id="nova-admin-task-badge" class="nova-admin-task-badge" hidden>0</b>' : '') + "</button>";
  }

  function shell() {
    var user = window.__novaV7User;
    return '<div class="nova-v7-admin" data-admin-role="' + esc(user.role) + '">' +
      '<header class="nova-admin-topbar"><div class="nova-admin-brand"><span class="nova-admin-mark">✦</span><div><strong>Nova Control</strong><small>Administration</small></div></div>' +
      '<div class="nova-admin-top-actions"><span class="nova-admin-environment"><i></i>Turso connected</span><button type="button" class="nova-admin-icon-btn" id="nova-admin-refresh" title="Refresh current view" aria-label="Refresh current view">' + icons.refresh + '</button><span class="nova-admin-role is-' + esc(user.role) + '">' + esc(user.role) + "</span></div></header>" +
      '<div class="nova-admin-body"><aside class="nova-admin-sidebar"><div class="nova-admin-nav-group"><label>Workspace</label>' + navButton("overview", "Overview") + navButton("health", "Health") + navButton("views", "Views") + navButton("tasks", "Tasks") + '</div><div class="nova-admin-nav-group"><label>Manage</label>' + navButton("users", "People") + (isDeveloperUp() ? navButton("staff", "Staff access") : "") + navButton("tickets", "Support tickets") + navButton("contentVotes", "Content votes") + (canManageAccounts() ? navButton("chat", "Chat moderation") + navButton("voice", "Voice safety") : "") + navButton("reports", "Reports") + navButton("supernova", "Supernova") + '</div>' +
      (isDeveloperUp() ? '<div class="nova-admin-nav-group"><label>Publish</label>' + navButton("banners", "Banners") + navButton("maintenance", "Maintenance") + '</div>' : '') +
      (canManageAccounts() ? '<div class="nova-admin-nav-group"><label>Security</label>' + navButton("devices", "Device bans") + (isDeveloperUp() ? navButton("proxy", "Proxy activity") + navButton("audit", "Audit log") : "") + "</div>" : "") +
      '<div class="nova-admin-sidebar-user">' + avatar(user) + '<div><strong>' + esc(user.displayName || user.username) + '</strong><span>@' + esc(user.username) + "</span></div></div></aside>" +
      '<main class="nova-admin-workspace"><div id="nova-v7-admin-content"></div></main></div><div id="nova-admin-layer"></div><div id="nova-admin-toasts" aria-live="polite"></div></div>';
  }

  function denied() {
    return '<div class="nova-v7-admin-denied"><span>✦</span><h2>Admin access required</h2><p>Your Nova account does not have a staff role.</p></div>';
  }

  function mount() {
    var page = document.getElementById("page-dev");
    var user = window.__novaV7User;
    if (!page) return;
    if (!isStaff(user)) { page.innerHTML = denied(); return; }
    var mounted = page.querySelector(".nova-v7-admin");
    if (!mounted || mounted.dataset.adminRole !== user.role) page.innerHTML = shell();
    wireShell();
    load(state.view);
  }

  function wireShell() {
    var root = document.querySelector(".nova-v7-admin");
    if (!root || root.dataset.wired) return;
    root.dataset.wired = "1";
    root.querySelectorAll("[data-admin-view]").forEach(function (button) {
      button.addEventListener("click", function () { load(button.dataset.adminView); });
    });
    document.getElementById("nova-admin-refresh").addEventListener("click", function () { load(state.view, true); refreshTaskBadge(); });
    refreshTaskBadge();
    clearInterval(state.refreshTimer);
    state.refreshTimer = setInterval(function () {
      if (!document.hidden && document.getElementById("page-dev").classList.contains("active")) {
        refreshTaskBadge();
        if (state.view === "overview") load("overview", true, true);
        if (state.view === "health") { var hv = document.getElementById("nova-admin-health-view"); var last = Number((hv && hv.dataset.lastHealthRefresh) || 0); if (!last || Date.now() - last >= 60000) { if (hv) hv.dataset.lastHealthRefresh = String(Date.now()); refreshHealthView(false); } }
      }
    }, 30000);
  }

  async function refreshTaskBadge() {
    var badge = document.getElementById("nova-admin-task-badge"); if (!badge) return;
    try {
      var data = await NovaAPI.adminTasks("", "mine");
      var count = (data.tasks || []).filter(function (task) { return ["open","in_progress","waiting"].includes(task.status); }).length;
      badge.textContent = count > 99 ? "99+" : String(count); badge.hidden = !count;
    } catch (error) { badge.hidden = true; }
  }

  function selectView(view) {
    state.view = view;
    document.querySelectorAll("[data-admin-view]").forEach(function (button) { button.classList.toggle("active", button.dataset.adminView === view); });
  }

  async function load(view, force, quiet) {
    if (["proxy", "audit", "staff", "banners", "maintenance"].includes(view) && !isDeveloperUp()) view = "overview";
    if (["chat", "voice", "devices"].includes(view) && !canManageAccounts()) view = "overview";
    selectView(view);
    var content = document.getElementById("nova-v7-admin-content");
    if (!content) return;
    if (!quiet) content.innerHTML = loadingView();
    try {
      if (view === "overview") await loadOverview(content, quiet);
      else if (view === "health") await loadHealthView(content);
      else if (view === "views") await loadViewsView(content);
      else if (view === "contentVotes") await loadContentVotesView(content);
      else if (view === "tasks") await loadTasksView(content);
      else if (view === "users") await loadUsersView(content);
      else if (view === "staff") await loadStaffView(content);
      else if (view === "tickets") await loadTicketsView(content);
      else if (view === "chat") await loadChatView(content);
      else if (view === "voice") await loadVoiceView(content);
      else if (view === "reports") await loadReportsView(content);
      else if (view === "supernova") await loadSupernovaView(content);
      else if (view === "banners") await loadBannersView(content);
      else if (view === "maintenance") await loadMaintenanceView(content);
      else if (view === "devices") await loadDeviceBansView(content);
      else if (view === "proxy") renderProxyView(content);
      else if (view === "audit") await loadAuditView(content);
    } catch (error) {
      if (state.view !== view) return;
      content.innerHTML = errorView(error.message);
      var retry = document.getElementById("nova-admin-retry");
      if (retry) retry.onclick = function () { load(view, true); };
    }
  }

  function loadingView() { return '<div class="nova-admin-loading"><span class="nova-admin-spinner"></span><span>Loading</span></div>'; }
  function errorView(message) { return '<div class="nova-admin-state is-error"><strong>Could not load this view</strong><span>' + esc(message || "Unknown error") + '</span><button type="button" id="nova-admin-retry">Try again</button></div>'; }
  function viewHeading(eyebrow, title, subtitle, actions) {
    return '<div class="nova-admin-view-heading"><div><span>' + esc(eyebrow) + '</span><h1>' + esc(title) + '</h1><p>' + esc(subtitle) + '</p></div>' + (actions || "") + "</div>";
  }
  function metric(label, value, detail, tone) {
    return '<article class="nova-admin-metric ' + (tone ? "is-" + tone : "") + '"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong><small>' + esc(detail) + "</small></article>";
  }

  async function loadOverview(content, quiet) {
    var data = await NovaAPI.adminOverview();
    if (state.view !== "overview") return;
    var m = data.metrics || {};
    var reports = data.recentReports || [];
    content.innerHTML = viewHeading("Workspace", "Overview", "Live account, social, and moderation status.", '<button type="button" class="nova-admin-secondary" id="nova-admin-health">Check system</button>') +
      '<div class="nova-admin-metrics">' + metric("Accounts", m.totalUsers || 0, (m.activeUsers || 0) + " active", "purple") + metric("Online now", m.onlineUsers || 0, "Presence in last 2.5 min", "green") + metric("Open reports", m.openReports || 0, "Needs review", m.openReports ? "orange" : "green") + metric("Messages", m.messages24h || 0, "Last 24 hours") + metric("Staff tasks", m.openTasks || 0, "Open / in progress", m.openTasks ? "orange" : "green") + "</div>" +
      '<div class="nova-admin-signal-row"><div><span>Open tickets</span><strong>' + esc(m.openTickets || 0) + '</strong></div><div><span>Restricted accounts</span><strong>' + esc(m.suspendedUsers || 0) + '</strong></div><div><span>Social timeouts</span><strong>' + esc(m.activeChatRestrictions || 0) + '</strong></div><div id="nova-admin-health-result"><span>Backend</span><strong>Turso</strong></div></div>' +
      '<section class="nova-admin-panel"><header><div><h2>Moderation queue</h2><p>Newest unresolved reports</p></div><button type="button" class="nova-admin-text-btn" id="nova-admin-open-reports">View all ' + icons.chevron + '</button></header><div class="nova-admin-report-preview">' + (reports.length ? reports.map(reportPreview).join("") : emptyInline("No reports need attention.")) + "</div></section>" +
      '<section class="nova-admin-panel nova-admin-quick-panel"><header><div><h2>Quick actions</h2><p>Common administration workflows</p></div></header><div class="nova-admin-quick-actions"><button type="button" data-quick="tasks">' + icons.tasks + '<span><strong>Staff tasks</strong><small>Requests and assignments</small></span></button><button type="button" data-quick="users">' + icons.search + '<span><strong>Find an account</strong><small>Search people and roles</small></span></button><button type="button" data-quick="tickets">' + icons.tickets + '<span><strong>Answer tickets</strong><small>Private user support</small></span></button>' + (canManageAccounts() ? '<button type="button" data-quick="chat">' + icons.chat + '<span><strong>Investigate chat</strong><small>Search messages and bans</small></span></button>' : '') + '<button type="button" data-quick="reports">' + icons.reports + '<span><strong>Review reports</strong><small>Assign or resolve cases</small></span></button>' + (isDeveloperUp() ? '<button type="button" data-quick="audit">' + icons.audit + '<span><strong>Open audit log</strong><small>Review staff actions</small></span></button>' : "") + "</div></section>";
    document.getElementById("nova-admin-open-reports").onclick = function () { load("reports"); };
    content.querySelectorAll("[data-quick]").forEach(function (button) { button.onclick = function () { load(button.dataset.quick); }; });
    content.querySelectorAll("[data-report-open]").forEach(function (button) { button.onclick = function () { load("reports"); }; });
    var healthButton = document.getElementById("nova-admin-health");
    if (healthButton) healthButton.onclick = function () { load("health"); };
  }

  function reportPreview(report) {
    return '<button type="button" data-report-open="' + esc(report.id) + '"><span class="nova-admin-report-icon">' + icons.reports + '</span><span><strong>' + esc(report.targetUser ? "@" + report.targetUser : report.reportType || "Report") + '</strong><small>' + esc(report.reason) + '</small></span>' + statusBadge(report.status) + '<time>' + esc(relativeTime(report.createdAt)) + "</time></button>";
  }

  async function runHealthCheck() {
    var button = document.getElementById("nova-admin-health");
    var result = document.getElementById("nova-admin-health-result");
    setBusy(button, true, "Checking");
    try {
      var response = await fetch("/api/health", { credentials: "same-origin" });
      var data = await response.json();
      if (!response.ok || !data.ok) throw new Error("Health check failed");
      result.innerHTML = '<span>Backend</span><strong class="is-healthy">Online · schema ' + esc(data.schemaVersion) + "</strong>";
      toast("System check passed", "success");
    } catch (error) { result.innerHTML = '<span>Backend</span><strong class="is-unhealthy">Unavailable</strong>'; toast(error.message, "error"); }
    setBusy(button, false);
  }

  function analyticsNumber(value) {
    return Number(value || 0).toLocaleString("en-US");
  }

  function analyticsDateLabel(day) {
    if (!day) return "—";
    var parts = String(day).split("-");
    var date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2] || 1)));
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }

  function analyticsMonthLabel(month) {
    if (!month) return "—";
    var parts = String(month).split("-");
    var date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, 1));
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  }

  function analyticsBars(rows, labelFn) {
    if (!rows || !rows.length) return '<div class="nova-admin-views-empty">No view data yet.</div>';
    var max = Math.max.apply(null, rows.map(function (row) { return Number(row.views || 0); }).concat([1]));
    return '<div class="nova-admin-views-bars">' + rows.map(function (row) {
      var key = row.day || row.month;
      var width = Math.max(2, Math.round((Number(row.views || 0) / max) * 100));
      return '<div class="nova-admin-views-bar-row"><span>' + esc(labelFn(key)) + '</span><div><i style="width:' + width + '%"></i></div><strong>' + esc(analyticsNumber(row.views)) + '</strong></div>';
    }).join('') + '</div>';
  }

  async function loadViewsView(content) {
    content.innerHTML = viewHeading("Analytics", "Views", "Nova page views by day, month, and all time.") + loadingView();
    var data = await NovaAPI.adminViews();
    if (state.view !== "views") return;
    var daily = data.daily || [];
    var monthly = data.monthly || [];
    content.innerHTML = viewHeading("Analytics", "Views", "Nova page views by day, month, and all time.") +
      '<div class="nova-admin-metrics nova-admin-view-metrics">' +
        metric("All-time views", analyticsNumber(data.allTime), data.trackedFrom ? "Since " + analyticsDateLabel(data.trackedFrom) : "Tracking starts after deployment", "violet") +
        metric("Today", analyticsNumber(data.today), "UTC day", "green") +
        metric("This month", analyticsNumber(data.thisMonth), "UTC month", "blue") +
      '</div>' +
      '<section class="nova-admin-panel nova-admin-views-panel"><header><div><h2>Day by day</h2><p>Last 31 tracked days</p></div></header>' + analyticsBars(daily, analyticsDateLabel) + '</section>' +
      '<section class="nova-admin-panel nova-admin-views-panel"><header><div><h2>Month by month</h2><p>Last 24 tracked months</p></div></header>' + analyticsBars(monthly, analyticsMonthLabel) + '</section>' +
      '<div class="nova-admin-health-note"><strong>Privacy-friendly counting</strong><span>Nova stores only one aggregated counter per UTC day. No IP address, account, device ID, or per-visitor analytics history is saved.</span></div>';
  }

  async function loadContentVotesView(content) {
    content.innerHTML = viewHeading("Community", "Content votes", "Ranked app and game suggestions submitted inside Nova.") +
      '<div class="nova-admin-toolbar"><select id="nova-admin-content-vote-status"><option value="">All statuses</option><option value="open">Open</option><option value="planned">Planned</option><option value="added">Added</option><option value="declined">Declined</option></select></div><div id="nova-admin-content-votes-list">' + loadingView() + '</div>';
    document.getElementById("nova-admin-content-vote-status").onchange = refreshContentVotes;
    await refreshContentVotes();
  }

  async function refreshContentVotes() {
    var target = document.getElementById("nova-admin-content-votes-list");
    if (!target) return;
    target.innerHTML = loadingView();
    try {
      var status = (document.getElementById("nova-admin-content-vote-status") || {}).value || "";
      var data = await NovaAPI.adminContentVotes(status);
      var suggestions = data.suggestions || [];
      var gameCount = suggestions.filter(function (item) { return item.kind === "game"; }).length;
      var appCount = suggestions.length - gameCount;
      var totalVotes = suggestions.reduce(function (sum, item) { return sum + Number(item.votes || 0); }, 0);
      target.innerHTML = '<div class="nova-admin-metrics nova-admin-content-vote-metrics">' + metric("Suggestions", suggestions.length, "Across both libraries", "purple") + metric("Games", gameCount, "Game ideas") + metric("Apps", appCount, "App ideas") + metric("Votes", totalVotes, "Community votes", "green") + '</div>' +
        (suggestions.length ? '<div class="nova-admin-content-vote-list">' + suggestions.map(contentVoteCard).join("") + '</div>' : emptyState("No suggestions here", "New in-app votes will appear automatically."));
      target.querySelectorAll("[data-content-vote-status]").forEach(function (select) {
        select.onchange = async function () {
          select.disabled = true;
          try { await NovaAPI.adminUpdateContentVote({ id: select.dataset.contentVoteStatus, status: select.value }); toast("Suggestion status updated", "success"); await refreshContentVotes(); }
          catch (error) { toast(error.message, "error"); select.disabled = false; }
        };
      });
    } catch (error) { target.innerHTML = errorView(error.message); }
  }

  function contentVoteCard(item) {
    var statuses = ["open", "planned", "added", "declined"];
    return '<article class="nova-admin-content-vote-card"><span class="nova-admin-content-vote-kind is-' + esc(item.kind) + '">' + esc(item.kind) + '</span><div><h3>' + esc(item.title) + '</h3><p>Suggested by ' + (item.creator ? "@" + esc(item.creator) : "unknown") + ' · ' + esc(fmtTime(item.createdAt)) + '</p></div><strong><span>▲</span>' + esc(Number(item.votes || 0).toLocaleString("en-US")) + '</strong><select data-content-vote-status="' + esc(item.id) + '" aria-label="Status for ' + esc(item.title) + '">' + statuses.map(function (status) { return '<option value="' + status + '"' + (item.status === status ? " selected" : "") + '>' + status.charAt(0).toUpperCase() + status.slice(1) + '</option>'; }).join("") + '</select></article>';
  }

  function healthStatusLabel(status) {
    if (status === "healthy") return "Operational";
    if (status === "degraded") return "Degraded";
    return "Down";
  }

  function healthServiceCard(service) {
    var latency = Number(service.latencyMs || 0);
    return '<article class="nova-admin-health-service is-' + esc(service.status) + '">' +
      '<div class="nova-admin-health-dot"></div><div class="nova-admin-health-copy"><span>' + esc(service.category || "System") + '</span><strong>' + esc(service.name) + '</strong><small>' + esc(service.detail || "No details") + '</small></div>' +
      '<div class="nova-admin-health-meta"><b>' + esc(healthStatusLabel(service.status)) + '</b><time>' + (latency ? esc(latency + " ms") : "—") + '</time></div></article>';
  }

  async function loadHealthView(content) {
    content.innerHTML = viewHeading("Monitoring", "Health", "Live status for Nova's internal systems and external dependencies.", '<button type="button" class="nova-admin-primary" id="nova-admin-health-refresh">' + icons.refresh + '<span>Run checks</span></button>') +
      '<div id="nova-admin-health-view">' + loadingView() + '</div>';
    var button = document.getElementById("nova-admin-health-refresh");
    if (button) button.onclick = function () { refreshHealthView(true); };
    await refreshHealthView(false);
  }

  async function refreshHealthView(manual) {
    var target = document.getElementById("nova-admin-health-view");
    var button = document.getElementById("nova-admin-health-refresh");
    if (!target || state.view !== "health") return;
    if (manual) setBusy(button, true, "Checking");
    try {
      var data = await NovaAPI.adminHealth();
      if (state.view !== "health" || !target.isConnected) return;
      target.dataset.lastHealthRefresh = String(Date.now());
      var counts = data.counts || {};
      var groups = {};
      (data.services || []).forEach(function (service) { (groups[service.category || "Other"] ||= []).push(service); });
      var overallLabel = data.overall === "healthy" ? "All systems operational" : (data.overall === "degraded" ? "Some systems degraded" : "Service disruption detected");
      target.innerHTML = '<section class="nova-admin-health-hero is-' + esc(data.overall) + '"><div><span>Overall status</span><h2>' + esc(overallLabel) + '</h2><p>Last checked ' + esc(fmtTime(data.checkedAt)) + ' · Turso schema ' + esc(data.schemaVersion || "—") + '</p></div><div class="nova-admin-health-counts"><span><i class="is-healthy"></i><b>' + esc(counts.healthy || 0) + '</b> operational</span><span><i class="is-degraded"></i><b>' + esc(counts.degraded || 0) + '</b> degraded</span><span><i class="is-down"></i><b>' + esc(counts.down || 0) + '</b> down</span></div></section>' +
        Object.keys(groups).map(function (group) { return '<section class="nova-admin-panel nova-admin-health-group"><header><div><h2>' + esc(group) + '</h2><p>' + esc(groups[group].length + ' monitored service' + (groups[group].length === 1 ? '' : 's')) + '</p></div></header><div class="nova-admin-health-list">' + groups[group].map(healthServiceCard).join('') + '</div></section>'; }).join('') +
        '<div class="nova-admin-health-note"><strong>Low-impact monitoring</strong><span>Checks only run while this Health page is open. Automatic refresh is once per minute and does not poll Social/game data.</span></div>';
      if (manual) toast("Health checks complete", data.overall === "healthy" ? "success" : "");
    } catch (error) {
      target.innerHTML = errorView(error.message);
    } finally { if (manual) setBusy(button, false); }
  }

  async function loadTasksView(content) {
    var createLabel = isDeveloperUp() ? "New task" : "New request";
    content.innerHTML = viewHeading("Workspace", "Tasks", "Staff requests, assignments, escalations, and action follow-through.", '<button type="button" class="nova-admin-primary" id="nova-admin-new-task">' + icons.plus + '<span>' + createLabel + '</span></button>') +
      '<div class="nova-admin-toolbar nova-admin-task-toolbar"><select id="nova-admin-task-scope"><option value="">Relevant to me</option><option value="mine">Assigned to me</option><option value="requests">Requests</option><option value="created">Created by me</option>' + (isDeveloperUp() ? '<option value="all">All staff</option>' : '') + '</select><select id="nova-admin-task-status"><option value="">Active + recent</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="waiting">Waiting</option><option value="completed">Completed</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option></select></div><div id="nova-admin-tasks-list">' + loadingView() + '</div>';
    document.getElementById("nova-admin-new-task").onclick = openTaskDialog;
    document.getElementById("nova-admin-task-scope").onchange = refreshTasks;
    document.getElementById("nova-admin-task-status").onchange = refreshTasks;
    await refreshTasks();
  }

  async function refreshTasks() {
    var target = document.getElementById("nova-admin-tasks-list"); if (!target) return;
    target.innerHTML = loadingView();
    try {
      var data = await NovaAPI.adminTasks((document.getElementById("nova-admin-task-status") || {}).value || "", (document.getElementById("nova-admin-task-scope") || {}).value || "");
      var tasks = data.tasks || [];
      target.innerHTML = tasks.length ? '<div class="nova-admin-task-list">' + tasks.map(taskCard).join("") + '</div>' : emptyState("Nothing in this queue", "New requests and assigned work will appear here.");
      target.querySelectorAll("[data-task-status]").forEach(function (button) { button.onclick = function () { updateTaskStatus(button.dataset.taskId, button.dataset.taskStatus); }; });
      target.querySelectorAll("[data-task-claim]").forEach(function (button) { button.onclick = async function () { try { await NovaAPI.adminUpdateTask({ id: button.dataset.taskClaim, claim: true }); toast("Task claimed", "success"); await refreshTasks(); refreshTaskBadge(); } catch (error) { toast(error.message, "error"); } }; });
      target.querySelectorAll("[data-task-user]").forEach(function (button) { button.onclick = function () { openTaskUser(button.dataset.taskUser); }; });
    } catch (error) { target.innerHTML = errorView(error.message); }
  }

  function taskCard(task) {
    var priority = task.priority || "normal";
    var who = task.assignedTo ? "@" + task.assignedTo : (task.assignedRole ? task.assignedRole : "Unassigned");
    var target = task.targetUsername ? '<button type="button" class="nova-admin-text-btn" data-task-user="' + esc(task.targetUsername) + '">@' + esc(task.targetUsername) + '</button>' : '<span>General</span>';
    var actions = "";
    if (["open","in_progress","waiting"].includes(task.status)) {
      var meRole = (window.__novaV7User || {}).role || "user";
      if (!task.assignedTo && (task.assignedRole === meRole || isOwner() || (meRole === "developer" && task.kind === "request"))) actions += '<button type="button" class="nova-admin-secondary" data-task-claim="' + esc(task.id) + '">Claim</button>';
      actions += '<button type="button" class="nova-admin-secondary" data-task-id="' + esc(task.id) + '" data-task-status="in_progress">Start</button>';
      actions += '<button type="button" class="nova-admin-secondary" data-task-id="' + esc(task.id) + '" data-task-status="waiting">Waiting</button>';
      actions += '<button type="button" class="nova-admin-primary" data-task-id="' + esc(task.id) + '" data-task-status="completed">Complete</button>';
      if (task.kind === "request") actions += '<button type="button" class="nova-admin-danger-text" data-task-id="' + esc(task.id) + '" data-task-status="rejected">Reject</button>';
    }
    return '<article class="nova-admin-task-card is-' + esc(priority) + '"><header><div><span class="nova-admin-task-kind">' + esc(task.kind) + ' · ' + esc(priority) + '</span><h3>' + esc(task.title) + '</h3></div>' + statusBadge(task.status) + '</header><p>' + esc(task.description || "No additional details") + '</p><div class="nova-admin-task-meta"><span>From <strong>@' + esc(task.creator) + '</strong></span><span>Assigned <strong>' + esc(who) + '</strong></span><span>Target ' + target + '</span><span>Updated <strong>' + esc(relativeTime(task.updatedAt)) + '</strong></span></div>' + (task.resolution ? '<div class="nova-admin-task-resolution"><strong>Resolution</strong><span>' + esc(task.resolution) + '</span></div>' : '') + '<footer>' + actions + '</footer></article>';
  }

  async function updateTaskStatus(id, status) {
    var resolution = "";
    if (["completed","rejected","cancelled"].includes(status)) {
      resolution = prompt(status === "completed" ? "Completion note (optional)" : "Reason", "") || "";
    }
    try { await NovaAPI.adminUpdateTask({ id: id, status: status, resolution: resolution }); toast("Task updated", "success"); await refreshTasks(); refreshTaskBadge(); }
    catch (error) { toast(error.message, "error"); }
  }

  async function openTaskUser(username) {
    await load("users");
    var input = document.getElementById("nova-admin-user-q");
    if (input) input.value = username;
    await searchUsers();
    openUserDrawer(username);
  }

  function openTaskDialog() {
    var layer = document.getElementById("nova-admin-layer"); if (!layer) return;
    var dev = isDeveloperUp();
    layer.innerHTML = '<div class="nova-admin-layer-backdrop" data-close-layer></div><div class="nova-admin-dialog nova-admin-task-dialog" role="dialog" aria-modal="true"><header><div><span>Staff workflow</span><h2>' + (dev ? "Create task or request" : "Request Developer / Owner action") + '</h2></div><button type="button" class="nova-admin-icon-btn" data-close-layer>' + icons.close + '</button></header>' +
      (dev ? '<label>Kind</label><select id="nova-admin-task-kind"><option value="task">Task</option><option value="request">Request</option></select>' : '') +
      '<label>Type</label><select id="nova-admin-task-type"><option value="general">General</option><option value="password_reset">Password reset</option><option value="account_action">Account action</option><option value="role_change">Role / permission</option><option value="moderation_review">Moderation review</option><option value="report_review">Report review</option><option value="support_followup">Support follow-up</option><option value="voice_issue">Voice issue</option><option value="game_issue">Game / app issue</option><option value="proxy_issue">Proxy / site issue</option><option value="theme_ui">Theme / UI</option><option value="site_change">Site change</option></select>' +
      '<label>Title</label><input id="nova-admin-task-title" maxlength="100" placeholder="What needs to happen?">' +
      '<label>Details</label><textarea id="nova-admin-task-description" maxlength="1200" placeholder="Give enough context to act without chasing you down."></textarea>' +
      '<div class="nova-admin-form-row"><div><label>Priority</label><select id="nova-admin-task-priority"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option></select></div><div><label>Assign role</label><select id="nova-admin-task-role">' + (dev ? '<option value="admin">Admin</option><option value="developer">Developer</option><option value="owner">Owner</option>' : '<option value="developer">Developer</option><option value="owner">Owner</option>') + '</select></div></div>' +
      '<label>Specific staff username <small>optional</small></label><input id="nova-admin-task-assignee" placeholder="username">' +
      '<label>Affected user <small>optional</small></label><input id="nova-admin-task-target" placeholder="username">' +
      '<footer><button type="button" class="nova-admin-secondary" data-close-layer>Cancel</button><button type="button" class="nova-admin-primary" id="nova-admin-task-create">Create</button></footer></div>';
    layer.classList.add("open"); layer.querySelectorAll("[data-close-layer]").forEach(function (b) { b.onclick = closeLayer; });
    document.getElementById("nova-admin-task-title").focus();
    document.getElementById("nova-admin-task-create").onclick = async function () {
      var button = this;
      var body = { kind: dev ? document.getElementById("nova-admin-task-kind").value : "request", taskType: document.getElementById("nova-admin-task-type").value,
        title: document.getElementById("nova-admin-task-title").value.trim(), description: document.getElementById("nova-admin-task-description").value.trim(),
        priority: document.getElementById("nova-admin-task-priority").value, assignedRole: document.getElementById("nova-admin-task-role").value,
        assignedUsername: document.getElementById("nova-admin-task-assignee").value.trim(), targetUsername: document.getElementById("nova-admin-task-target").value.trim() };
      if (!body.title) return toast("Add a title", "error");
      setBusy(button, true, "Creating");
      try { await NovaAPI.adminCreateTask(body); toast(body.kind === "request" ? "Request sent" : "Task created", "success"); closeLayer(); await refreshTasks(); refreshTaskBadge(); }
      catch (error) { toast(error.message, "error"); setBusy(button, false); }
    };
  }

  async function loadUsersView(content) {
    content.innerHTML = viewHeading("Manage", "People", "Accounts, access levels, and account status.") +
      '<div class="nova-admin-toolbar"><div class="nova-admin-search">' + icons.search + '<input id="nova-admin-user-q" type="search" placeholder="Search name or username" autocomplete="off"></div><select id="nova-admin-user-status" aria-label="Filter account status"><option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="banned">Banned</option></select><button type="button" class="nova-admin-primary" id="nova-admin-user-search">Search</button></div><div id="nova-admin-users-list">' + loadingView() + "</div>";
    var search = function () { searchUsers(); };
    document.getElementById("nova-admin-user-search").onclick = search;
    document.getElementById("nova-admin-user-q").onkeydown = function (event) { if (event.key === "Enter") search(); };
    document.getElementById("nova-admin-user-status").onchange = search;
    await searchUsers();
  }

  async function searchUsers() {
    var target = document.getElementById("nova-admin-users-list");
    if (!target) return;
    var q = document.getElementById("nova-admin-user-q").value;
    var status = document.getElementById("nova-admin-user-status").value;
    target.innerHTML = loadingView();
    try {
      var data = await NovaAPI.adminUsers(q, status);
      state.users = data.users || [];
      target.innerHTML = state.users.length ? '<div class="nova-admin-table-wrap"><table class="nova-admin-table nova-admin-people-table"><thead><tr><th>Person</th><th>Role</th><th>Status</th><th>Plan</th><th>Joined</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>' + state.users.map(userRow).join("") + "</tbody></table></div>" : emptyState("No accounts found", "Try a different search or status filter.");
      target.querySelectorAll("[data-manage-user]").forEach(function (button) { button.onclick = function () { openUserDrawer(button.dataset.manageUser); }; });
    } catch (error) {
      target.innerHTML = errorView(error.message);
      var retry = target.querySelector("#nova-admin-retry");
      if (retry) retry.onclick = searchUsers;
    }
  }

  function userRow(user) {
    return '<tr><td><div class="nova-admin-person">' + avatar(user) + '<span><strong>' + esc(user.displayName || user.username) + '</strong><small>@' + esc(user.username) + '</small></span></div></td><td><span class="nova-admin-role-cell is-' + roleTone(user.role) + '">' + esc(user.role) + '</span></td><td>' + statusBadge(user.accountStatus) + '</td><td>' + planBadge(user) + '</td><td><time title="' + esc(fmtTime(user.joinedAt)) + '">' + esc(relativeTime(user.joinedAt)) + '</time></td><td><button type="button" class="nova-admin-row-action" data-manage-user="' + esc(user.username) + '">Manage ' + icons.chevron + "</button></td></tr>";
  }

  async function loadStaffView(content) {
    content.innerHTML = viewHeading("Security", "Staff access", "Add administrators and developers without sharing the owner account.") +
      '<section class="nova-admin-panel nova-admin-staff-grant"><header><div><h2>Grant staff access</h2><p>The account must already exist. Every change is recorded in the audit log.</p></div></header><form id="nova-admin-staff-form"><div class="nova-admin-staff-fields"><label><span>Username</span><input id="nova-admin-staff-user" autocomplete="off" spellcheck="false" placeholder="Nova username" required></label><label><span>Access level</span><select id="nova-admin-staff-role">' + (isOwner() ? '<option value="developer">Developer</option>' : '') + '<option value="admin">Admin</option></select></label><label><span>Expires</span><select id="nova-admin-staff-expiry"><option value="0">No expiry</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option></select></label></div><label class="nova-admin-staff-reason"><span>Audit reason</span><input id="nova-admin-staff-reason" maxlength="240" placeholder="Why this person needs staff access" required></label><footer><p>Admins handle moderation. Developers are above Admin and can manage Admin access, system controls, tasks, and advanced staff tools.</p><button type="submit" class="nova-admin-primary" id="nova-admin-staff-grant">' + icons.plus + '<span>Grant access</span></button></footer></form></section>' +
      '<section class="nova-admin-panel nova-admin-staff-directory"><header><div><h2>Current staff</h2><p>Owner, administrators, and developers with active access.</p></div><button type="button" class="nova-admin-icon-btn" id="nova-admin-staff-refresh" title="Refresh staff" aria-label="Refresh staff">' + icons.refresh + '</button></header><div id="nova-admin-staff-list">' + loadingView() + '</div></section>';
    document.getElementById("nova-admin-staff-form").onsubmit = grantStaffAccess;
    document.getElementById("nova-admin-staff-refresh").onclick = refreshStaffDirectory;
    await refreshStaffDirectory();
  }

  async function refreshStaffDirectory() {
    var target = document.getElementById("nova-admin-staff-list");
    if (!target || state.view !== "staff") return;
    target.innerHTML = loadingView();
    try {
      var data = await NovaAPI.adminStaff();
      if (state.view !== "staff") return;
      var rank = { owner: 0, developer: 1, admin: 2 };
      var staff = (data.staff || []).filter(function (user) { return Object.prototype.hasOwnProperty.call(rank, user.role); });
      staff.sort(function (a, b) { return rank[a.role] - rank[b.role] || String(a.username).localeCompare(String(b.username)); });
      target.innerHTML = staff.length ? '<div class="nova-admin-staff-list">' + staff.map(staffRecord).join("") + '</div>' : emptyInline("No staff accounts found.");
      target.querySelectorAll("[data-revoke-staff]").forEach(function (button) {
        button.onclick = function () { openStaffRevokeDialog(button.dataset.revokeStaff, button.dataset.staffRole); };
      });
    } catch (error) { target.innerHTML = errorView(error.message); }
  }

  function staffRecord(user) {
    var removable = user.role !== "owner" && user.username !== (window.__novaV7User || {}).username && roleRank((window.__novaV7User || {}).role) > roleRank(user.role);
    return '<article class="nova-admin-staff-record">' + avatar(user) + '<div class="nova-admin-staff-person"><strong>' + esc(user.displayName || user.username) + '</strong><span>@' + esc(user.username) + '</span></div><span class="nova-admin-role-cell is-staff">' + esc(user.role) + '</span><span class="nova-admin-staff-status">' + statusBadge(user.accountStatus) + '<small>Joined ' + esc(relativeTime(user.joinedAt)) + '</small></span>' + (removable ? '<button type="button" class="nova-admin-secondary" data-revoke-staff="' + esc(user.username) + '" data-staff-role="' + esc(user.role) + '">Remove access</button>' : '<span class="nova-admin-staff-protected">Protected</span>') + '</article>';
  }

  async function grantStaffAccess(event) {
    event.preventDefault();
    var button = document.getElementById("nova-admin-staff-grant");
    var username = document.getElementById("nova-admin-staff-user").value.trim();
    var role = document.getElementById("nova-admin-staff-role").value;
    var days = Number(document.getElementById("nova-admin-staff-expiry").value || 0);
    var reason = document.getElementById("nova-admin-staff-reason").value.trim();
    if (!username) return toast("Enter an existing Nova username", "error");
    if (!reason) return toast("Add an audit reason", "error");
    setBusy(button, true, "Granting");
    try {
      await NovaAPI.adminRole({ username: username, role: role, action: "grant", reason: reason, expiresAt: days ? Date.now() + days * 86400000 : null });
      document.getElementById("nova-admin-staff-user").value = "";
      document.getElementById("nova-admin-staff-reason").value = "";
      toast("Staff access granted", "success");
      await refreshStaffDirectory();
    } catch (error) { toast(error.message, "error"); }
    setBusy(button, false);
  }

  function openStaffRevokeDialog(username, role) {
    var layer = document.getElementById("nova-admin-layer");
    if (!layer) return;
    layer.innerHTML = '<div class="nova-admin-layer-backdrop" data-close-layer></div><div class="nova-admin-dialog" role="dialog" aria-modal="true"><header><div><span>Staff access</span><h2>Remove ' + esc(role) + ' access</h2></div><button type="button" class="nova-admin-icon-btn" data-close-layer aria-label="Close">' + icons.close + '</button></header><p>@' + esc(username) + ' will immediately lose access to Nova Control.</p><label for="nova-admin-staff-revoke-reason">Audit reason</label><textarea id="nova-admin-staff-revoke-reason" maxlength="240" placeholder="Why access is being removed"></textarea><footer><button type="button" class="nova-admin-secondary" data-close-layer>Cancel</button><button type="button" class="nova-admin-danger" id="nova-admin-staff-revoke-confirm">Remove access</button></footer></div>';
    layer.classList.add("open");
    layer.querySelectorAll("[data-close-layer]").forEach(function (button) { button.onclick = closeLayer; });
    document.getElementById("nova-admin-staff-revoke-reason").focus();
    document.getElementById("nova-admin-staff-revoke-confirm").onclick = async function () {
      var button = this;
      var reason = document.getElementById("nova-admin-staff-revoke-reason").value.trim();
      if (!reason) return toast("Add an audit reason", "error");
      setBusy(button, true, "Removing");
      try {
        await NovaAPI.adminRole({ username: username, role: role, action: "revoke", reason: reason });
        toast("Staff access removed", "success"); closeLayer(); await refreshStaffDirectory();
      } catch (error) { toast(error.message, "error"); setBusy(button, false); }
    };
  }

  async function loadTicketsView(content) {
    content.innerHTML = viewHeading("Manage", "Support tickets", "Private conversations between Nova users and staff.") +
      '<div class="nova-admin-toolbar"><div class="nova-admin-search">' + icons.search + '<input id="nova-admin-ticket-q" type="search" placeholder="Ticket, subject, or username" autocomplete="off"></div><select id="nova-admin-ticket-status" aria-label="Filter ticket status"><option value="">All statuses</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="waiting_user">Waiting for user</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select><button type="button" class="nova-admin-primary" id="nova-admin-ticket-search">Search</button></div><div id="nova-admin-ticket-list">' + loadingView() + "</div>";
    document.getElementById("nova-admin-ticket-search").onclick = searchAdminTickets;
    document.getElementById("nova-admin-ticket-q").onkeydown = function (event) { if (event.key === "Enter") searchAdminTickets(); };
    document.getElementById("nova-admin-ticket-status").onchange = searchAdminTickets;
    await searchAdminTickets();
  }

  async function searchAdminTickets() {
    var target = document.getElementById("nova-admin-ticket-list");
    if (!target) return;
    var q = document.getElementById("nova-admin-ticket-q").value;
    var status = document.getElementById("nova-admin-ticket-status").value;
    target.innerHTML = loadingView();
    try {
      var data = await NovaAPI.adminTickets(status, q);
      state.tickets = data.tickets || [];
      target.innerHTML = state.tickets.length ? '<div class="nova-admin-table-wrap"><table class="nova-admin-table nova-admin-ticket-table"><thead><tr><th>Ticket</th><th>User</th><th>Status</th><th>Priority</th><th>Assigned</th><th>Updated</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>' + state.tickets.map(adminTicketRow).join("") + "</tbody></table></div>" : emptyState("No tickets found", "This support queue is clear for the selected filter.");
      target.querySelectorAll("[data-admin-ticket]").forEach(function (row) {
        row.onclick = function () { openAdminTicket(row.dataset.adminTicket); };
        row.onkeydown = function (event) { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openAdminTicket(row.dataset.adminTicket); } };
      });
    } catch (error) { target.innerHTML = errorView(error.message); }
  }

  function ticketPriorityBadge(priority) {
    return '<span class="nova-admin-ticket-priority is-' + esc(priority || "normal") + '">' + esc(priority || "normal") + "</span>";
  }

  function adminTicketRow(ticket) {
    return '<tr data-admin-ticket="' + esc(ticket.id) + '" tabindex="0" aria-label="Open ticket ' + esc(ticket.subject) + '"><td><div class="nova-admin-ticket-subject"><strong>' + esc(ticket.subject) + '</strong><small>' + esc(ticket.id) + " · " + esc(ticket.category) + '</small></div></td><td><div class="nova-admin-person">' + avatar(ticket) + '<span><strong>' + esc(ticket.displayName || ticket.username) + '</strong><small>@' + esc(ticket.username) + '</small></span></div></td><td>' + statusBadge(ticket.status) + '</td><td>' + ticketPriorityBadge(ticket.priority) + '</td><td><span class="nova-admin-ticket-assignee">' + esc(ticket.assignedTo ? "@" + ticket.assignedTo : "Unassigned") + '</span></td><td><time title="' + esc(fmtTime(ticket.updatedAt)) + '">' + esc(relativeTime(ticket.updatedAt)) + '</time></td><td><button type="button" class="nova-admin-row-action">Open ' + icons.chevron + "</button></td></tr>";
  }

  async function openAdminTicket(ticketId) {
    var layer = document.getElementById("nova-admin-layer");
    if (!layer) return;
    layer.innerHTML = '<div class="nova-admin-layer-backdrop" data-close-layer></div><aside class="nova-admin-drawer nova-admin-ticket-drawer"><div class="nova-admin-loading"><span class="nova-admin-spinner"></span><span>Opening ticket</span></div></aside>';
    layer.classList.add("open");
    layer.querySelector("[data-close-layer]").onclick = closeLayer;
    try {
      var data = await NovaAPI.adminTicket(ticketId);
      var ticket = data.ticket;
      var messages = data.messages || [];
      var drawer = layer.querySelector(".nova-admin-ticket-drawer");
      if (!drawer || !layer.classList.contains("open")) return;
      drawer.innerHTML = '<header><div><span class="nova-admin-ticket-kicker">' + esc(ticket.id) + '</span><h2>' + esc(ticket.subject) + '</h2><p>@' + esc(ticket.username) + ' · ' + esc(ticket.category) + '</p></div><button type="button" class="nova-admin-icon-btn" data-close-layer title="Close" aria-label="Close">' + icons.close + '</button></header>' +
        '<div class="nova-admin-ticket-controls"><label>Status<select id="nova-admin-ticket-detail-status"><option value="open">Open</option><option value="in_progress">In progress</option><option value="waiting_user">Waiting for user</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></label><label>Priority<select id="nova-admin-ticket-detail-priority"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><div class="nova-admin-ticket-owner"><span>Assigned to</span><strong>' + esc(ticket.assignedTo ? "@" + ticket.assignedTo : "No one") + '</strong><button type="button" class="nova-admin-secondary" id="nova-admin-ticket-claim">Claim</button></div></div>' +
        '<div class="nova-admin-ticket-assign"><input id="nova-admin-ticket-assign-user" autocomplete="off" placeholder="Assign staff username"><button type="button" class="nova-admin-secondary" id="nova-admin-ticket-assign-btn">Assign</button>' + (ticket.assignedTo ? '<button type="button" class="nova-admin-text-btn" id="nova-admin-ticket-unassign">Unassign</button>' : "") + '</div>' +
        '<div class="nova-admin-ticket-messages">' + messages.map(adminTicketMessage).join("") + '</div><form class="nova-admin-ticket-compose" id="nova-admin-ticket-compose"><textarea id="nova-admin-ticket-reply" maxlength="4000" placeholder="Reply as Nova staff" ' + (ticket.status === "closed" ? "disabled" : "") + '></textarea><button type="submit" class="nova-admin-primary" ' + (ticket.status === "closed" ? "disabled" : "") + '>Send reply</button></form>';
      drawer.querySelector("[data-close-layer]").onclick = closeLayer;
      var status = document.getElementById("nova-admin-ticket-detail-status");
      var priority = document.getElementById("nova-admin-ticket-detail-priority");
      status.value = ticket.status;
      priority.value = ticket.priority;
      status.onchange = function () { updateAdminTicket(ticketId, { action: "status", status: status.value }, status, true); };
      priority.onchange = function () { updateAdminTicket(ticketId, { action: "priority", priority: priority.value }, priority); };
      document.getElementById("nova-admin-ticket-claim").onclick = function () { updateAdminTicket(ticketId, { action: "claim" }, this, true); };
      document.getElementById("nova-admin-ticket-assign-btn").onclick = function () {
        var username = document.getElementById("nova-admin-ticket-assign-user").value.trim();
        if (!username) return toast("Enter a staff username", "error");
        updateAdminTicket(ticketId, { action: "assign", username: username }, this, true);
      };
      var unassign = document.getElementById("nova-admin-ticket-unassign");
      if (unassign) unassign.onclick = function () { updateAdminTicket(ticketId, { action: "unassign" }, this, true); };
      document.getElementById("nova-admin-ticket-compose").onsubmit = function (event) { event.preventDefault(); sendAdminTicketReply(ticketId, event.currentTarget); };
      var messageList = drawer.querySelector(".nova-admin-ticket-messages");
      messageList.scrollTop = messageList.scrollHeight;
    } catch (error) {
      var target = layer.querySelector(".nova-admin-ticket-drawer");
      if (target) target.innerHTML = errorView(error.message);
    }
  }

  function adminTicketMessage(message) {
    return '<article class="nova-admin-ticket-message">' + avatar(message) + '<div><header><strong>' + esc(message.displayName || message.username) + '</strong>' + (message.isStaff ? '<span>STAFF</span>' : "") + '<time>' + esc(fmtTime(message.createdAt)) + '</time></header><p>' + esc(message.body) + "</p></div></article>";
  }

  async function updateAdminTicket(ticketId, body, control, reopen) {
    if (control) control.disabled = true;
    try {
      await NovaAPI.adminTicketAction(Object.assign({ ticketId: ticketId }, body));
      toast("Ticket updated", "success");
      if (reopen) await openAdminTicket(ticketId);
      searchAdminTickets();
    } catch (error) { toast(error.message, "error"); }
    if (control && document.body.contains(control)) control.disabled = false;
  }

  async function sendAdminTicketReply(ticketId, form) {
    var textarea = document.getElementById("nova-admin-ticket-reply");
    var button = form.querySelector("button");
    var message = textarea.value.trim();
    if (!message) return;
    setBusy(button, true, "Sending");
    textarea.disabled = true;
    try {
      await NovaAPI.replySupportTicket(ticketId, message);
      toast("Reply sent", "success");
      await openAdminTicket(ticketId);
      searchAdminTickets();
    } catch (error) { toast(error.message, "error"); textarea.disabled = false; setBusy(button, false); }
  }

  function planBadge(user) {
    return '<span class="nova-admin-plan ' + (user && user.supernova ? "is-supernova" : "is-free") + '">' + (user && user.supernova ? "✦ Supernova" : "Free") + "</span>";
  }

  function openUserDrawer(username) {
    var user = state.users.find(function (item) { return item.username === username; });
    var layer = document.getElementById("nova-admin-layer");
    if (!user || !layer) return;
    var currentUser = window.__novaV7User || {};
    var protectedAccount = user.role === "owner" || user.username === currentUser.username || roleRank(currentUser.role) <= roleRank(user.role);
    var accountControls = canManageAccounts() && !protectedAccount ? '<section><label>Account status</label><div class="nova-admin-form-row"><select id="nova-admin-status-value"><option value="active" ' + (user.accountStatus === "active" ? "selected" : "") + '>Active</option><option value="suspended" ' + (user.accountStatus === "suspended" ? "selected" : "") + '>Suspended</option><option value="banned" ' + (user.accountStatus === "banned" ? "selected" : "") + ' >Banned</option></select><button type="button" class="nova-admin-primary" id="nova-admin-status-apply">Apply</button></div><textarea id="nova-admin-status-reason" placeholder="Reason required for restrictions"></textarea></section>' : "";
    var roleOptions = isOwner() ? '<option value="developer">Developer</option><option value="admin">Admin</option>' : '<option value="admin">Admin</option>';
    var roleControls = isDeveloperUp() && user.role !== "owner" && roleRank(currentUser.role) > roleRank(user.role) ? '<section><label>Staff access</label><div class="nova-admin-form-row"><select id="nova-admin-role-value">' + roleOptions + '</select><button type="button" class="nova-admin-primary" id="nova-admin-role-grant">Grant</button></div><input id="nova-admin-role-reason" placeholder="Audit reason"><button type="button" class="nova-admin-danger-text" id="nova-admin-role-revoke">Revoke current staff role</button></section>' : "";
    var passwordControls = isDeveloperUp() && user.username !== currentUser.username && roleRank(currentUser.role) > roleRank(user.role) ? '<section><label>Reset password</label><p class="nova-admin-drawer-copy">Sets a temporary password, signs this account out everywhere, completes matching staff requests, and records the reason.</p><input id="nova-admin-reset-password-value" type="password" minlength="8" maxlength="128" autocomplete="new-password" placeholder="Temporary password"><input id="nova-admin-reset-password-reason" maxlength="240" placeholder="Audit reason"><button type="button" class="nova-admin-secondary" id="nova-admin-reset-password-apply">Reset password</button></section>' : (!isDeveloperUp() && user.username !== currentUser.username ? '<section><label>Password help</label><p class="nova-admin-drawer-copy">Admins cannot directly reset passwords. Send a tracked request to a Developer or Owner.</p><input id="nova-admin-password-request-reason" maxlength="500" placeholder="Why is a reset needed?"><button type="button" class="nova-admin-secondary" id="nova-admin-password-request">Request password reset</button></section>' : "");
    var chatControls = canManageAccounts() && !protectedAccount ? '<section><label>Nova Social</label><p class="nova-admin-drawer-copy">Temporarily stop this account from chatting, reacting, or creating group conversations.</p><div class="nova-admin-form-row"><button type="button" class="nova-admin-danger" id="nova-admin-timeout-user">Timeout Social</button><button type="button" class="nova-admin-secondary" id="nova-admin-open-user-chat">Review chat</button></div></section>' : "";
    layer.innerHTML = '<div class="nova-admin-layer-backdrop" data-close-layer></div><aside class="nova-admin-drawer"><header><div class="nova-admin-person">' + avatar(user) + '<span><strong>' + esc(user.displayName || user.username) + '</strong><small>@' + esc(user.username) + '</small></span></div><button type="button" class="nova-admin-icon-btn" data-close-layer title="Close" aria-label="Close">' + icons.close + '</button></header><div class="nova-admin-drawer-meta"><div><span>Role</span><strong>' + esc(user.role) + '</strong></div><div><span>Status</span><strong>' + esc(user.accountStatus) + '</strong></div><div><span>Plan</span><strong>' + (user.supernova ? "Supernova Pro" : "Free") + '</strong></div><div><span>Joined</span><strong>' + esc(fmtTime(user.joinedAt)) + '</strong></div></div>' + chatControls + accountControls + roleControls + passwordControls + "</aside>";
    layer.classList.add("open");
    layer.querySelectorAll("[data-close-layer]").forEach(function (button) { button.onclick = closeLayer; });
    var statusButton = document.getElementById("nova-admin-status-apply");
    if (statusButton) statusButton.onclick = function () { applyUserStatus(user, statusButton); };
    var openChat = document.getElementById("nova-admin-open-user-chat");
    if (openChat) openChat.onclick = function () { closeLayer(); load("chat"); setTimeout(function () { var input = document.getElementById("nova-admin-chat-user"); if (input) { input.value = user.username; input.focus(); } }, 240); };
    var timeoutSocial = document.getElementById("nova-admin-timeout-user");
    if (timeoutSocial) timeoutSocial.onclick = function () { openChatTimeoutDialog(user.username); };
    var grant = document.getElementById("nova-admin-role-grant");
    var revoke = document.getElementById("nova-admin-role-revoke");
    if (grant) grant.onclick = function () { applyUserRole(user, "grant", grant); };
    if (revoke) { revoke.style.display = ["developer", "admin"].includes(user.role) ? "inline-flex" : "none"; revoke.onclick = function () { applyUserRole(user, "revoke", revoke); }; }
    var resetPassword = document.getElementById("nova-admin-reset-password-apply");
    if (resetPassword) resetPassword.onclick = function () { resetUserPassword(user, resetPassword); };
    var requestPassword = document.getElementById("nova-admin-password-request");
    if (requestPassword) requestPassword.onclick = function () { requestPasswordReset(user, requestPassword); };
  }

  function closeLayer() {
    var layer = document.getElementById("nova-admin-layer");
    if (!layer) return;
    layer.classList.remove("open");
    setTimeout(function () { if (!layer.classList.contains("open")) layer.innerHTML = ""; }, 220);
  }

  async function applyUserStatus(user, button) {
    var status = document.getElementById("nova-admin-status-value").value;
    var reason = document.getElementById("nova-admin-status-reason").value.trim();
    if (status !== "active" && !reason) return toast("Add a reason before restricting the account", "error");
    if (status === user.accountStatus) return toast("That status is already applied");
    setBusy(button, true, "Applying");
    try {
      await NovaAPI.adminUserStatus({ username: user.username, status: status, reason: reason });
      toast("Account status updated", "success"); closeLayer(); await searchUsers();
    } catch (error) { toast(error.message, "error"); setBusy(button, false); }
  }

  async function applyUserRole(user, action, button) {
    var selected = document.getElementById("nova-admin-role-value").value;
    var role = action === "revoke" ? user.role : selected;
    var reason = document.getElementById("nova-admin-role-reason").value.trim();
    if (!reason) return toast("Add an audit reason for the role change", "error");
    setBusy(button, true, action === "grant" ? "Granting" : "Revoking");
    try {
      await NovaAPI.adminRole({ username: user.username, role: role, action: action, reason: reason });
      toast("Staff access updated", "success"); closeLayer(); await searchUsers();
    } catch (error) { toast(error.message, "error"); setBusy(button, false); }
  }

  async function resetUserPassword(user, button) {
    var password = document.getElementById("nova-admin-reset-password-value").value;
    var reason = document.getElementById("nova-admin-reset-password-reason").value.trim();
    if (password.length < 8) return toast("Use at least 8 characters", "error");
    if (!reason) return toast("Add an audit reason", "error");
    setBusy(button, true, "Resetting");
    try {
      await NovaAPI.adminResetUserPassword({ username: user.username, newPassword: password, reason: reason });
      toast("Password reset. The account was signed out everywhere.", "success");
      closeLayer();
    } catch (error) { toast(error.message, "error"); setBusy(button, false); }
  }

  async function requestPasswordReset(user, button) {
    var reason = (document.getElementById("nova-admin-password-request-reason") || {}).value || "";
    reason = reason.trim();
    if (!reason) return toast("Explain why the password reset is needed", "error");
    setBusy(button, true, "Requesting");
    try {
      await NovaAPI.adminCreateTask({ kind: "request", taskType: "password_reset", title: "Reset password for @" + user.username,
        description: reason, priority: "high", assignedRole: "developer", targetUsername: user.username, requestedAction: "password_reset", source: "people" });
      toast("Password reset request sent to Developers", "success"); refreshTaskBadge(); closeLayer();
    } catch (error) { toast(error.message, "error"); setBusy(button, false); }
  }

  async function loadSupernovaView(content) {
    var data = await NovaAPI.adminSupernova();
    if (state.view !== "supernova") return;
    state.supernova = { members: data.members || [], requests: data.requests || [] };
    var grantAction = canManageAccounts() ? '<button type="button" class="nova-admin-primary" id="nova-admin-supernova-grant">' + icons.plus + '<span>Grant membership</span></button>' : '';
    content.innerHTML = viewHeading("Plans", "Supernova Pro", canManageAccounts() ? "Review upgrades and manage active memberships." : "View upgrade requests and active memberships.", grantAction) +
      '<div class="nova-admin-supernova-summary">' + metric("Active members", state.supernova.members.length, "Turso-backed memberships", "purple") + metric("Upgrade requests", state.supernova.requests.length, state.supernova.requests.length ? "Waiting for review" : "Queue clear", state.supernova.requests.length ? "orange" : "green") + '</div>' +
      '<section class="nova-admin-panel nova-admin-supernova-panel"><header><div><h2>Upgrade requests</h2><p>Cash upgrade requests submitted from the Plans page</p></div></header><div class="nova-admin-supernova-list">' + (state.supernova.requests.length ? state.supernova.requests.map(supernovaRequestRecord).join("") : emptyInline("No Supernova requests need attention.")) + '</div></section>' +
      '<section class="nova-admin-panel nova-admin-supernova-panel"><header><div><h2>Active memberships</h2><p>Grant details, expirations, and membership controls</p></div></header><div class="nova-admin-supernova-list">' + (state.supernova.members.length ? state.supernova.members.map(supernovaMemberRecord).join("") : emptyInline("No active Supernova memberships.")) + "</div></section>";
    var grantButton = document.getElementById("nova-admin-supernova-grant");
    if (grantButton) grantButton.onclick = openSupernovaGrantDialog;
    content.querySelectorAll("[data-supernova-approve]").forEach(function (button) {
      button.onclick = function () { approveSupernovaRequest(button.dataset.supernovaApprove, button); };
    });
    content.querySelectorAll("[data-supernova-deny]").forEach(function (button) {
      button.onclick = function () { openSupernovaDecisionDialog("deny", button.dataset.supernovaDeny); };
    });
    content.querySelectorAll("[data-supernova-revoke]").forEach(function (button) {
      button.onclick = function () { openSupernovaDecisionDialog("revoke", button.dataset.supernovaRevoke); };
    });
  }

  function supernovaRequestRecord(request) {
    var actions = canManageAccounts() ? '<div class="nova-admin-supernova-actions"><button type="button" class="nova-admin-secondary" data-supernova-deny="' + esc(request.id) + '">Deny</button><button type="button" class="nova-admin-primary" data-supernova-approve="' + esc(request.id) + '">' + icons.check + '<span>Approve</span></button></div>' : statusBadge("assigned");
    return '<article class="nova-admin-supernova-record is-request"><div class="nova-admin-person">' + avatar(request) + '<span><strong>' + esc(request.displayName || request.username) + '</strong><small>@' + esc(request.username) + ' · requested ' + esc(relativeTime(request.createdAt)) + '</small></span></div><p>' + esc(request.reason || "Supernova Pro upgrade request") + '</p>' + actions + '</article>';
  }

  function supernovaMemberRecord(member) {
    var expiry = member.expiresAt ? "Expires " + fmtTime(member.expiresAt) : "No expiry";
    var action = canManageAccounts() ? '<button type="button" class="nova-admin-secondary" data-supernova-revoke="' + esc(member.username) + '">Revoke</button>' : planBadge({ supernova: true });
    return '<article class="nova-admin-supernova-record is-member"><div class="nova-admin-person">' + avatar(member) + '<span><strong>' + esc(member.displayName || member.username) + '</strong><small>@' + esc(member.username) + '</small></span></div><div class="nova-admin-supernova-details"><strong>' + esc(expiry) + '</strong><span>Granted ' + esc(fmtTime(member.grantedAt)) + (member.grantedBy ? " by @" + esc(member.grantedBy) : "") + '</span>' + (member.note ? '<small>' + esc(member.note) + '</small>' : "") + '</div>' + action + '</article>';
  }

  async function approveSupernovaRequest(requestId, button) {
    setBusy(button, true, "Approving");
    try {
      await NovaAPI.adminSupernovaAction({ action: "approve", requestId: requestId, note: "Upgrade request approved" });
      toast("Supernova membership activated", "success");
      await loadSupernovaView(document.getElementById("nova-v7-admin-content"));
    } catch (error) { toast(error.message, "error"); setBusy(button, false); }
  }

  function openSupernovaGrantDialog() {
    var layer = document.getElementById("nova-admin-layer");
    if (!layer) return;
    layer.innerHTML = '<div class="nova-admin-layer-backdrop" data-close-layer></div><div class="nova-admin-dialog" role="dialog" aria-modal="true"><header><div><span>Supernova Pro</span><h2>Grant membership</h2></div><button type="button" class="nova-admin-icon-btn" data-close-layer aria-label="Close">' + icons.close + '</button></header><label for="nova-admin-supernova-user">Username</label><input id="nova-admin-supernova-user" autocomplete="off" placeholder="Nova username"><div class="nova-admin-dialog-grid"><div><label for="nova-admin-supernova-duration">Duration</label><select id="nova-admin-supernova-duration"><option value="0">No expiry</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option></select></div><div><label for="nova-admin-supernova-note">Audit note</label><input id="nova-admin-supernova-note" maxlength="240" placeholder="Why this was granted"></div></div><footer><button type="button" class="nova-admin-secondary" data-close-layer>Cancel</button><button type="button" class="nova-admin-primary" id="nova-admin-supernova-confirm">Grant Supernova</button></footer></div>';
    layer.classList.add("open");
    layer.querySelectorAll("[data-close-layer]").forEach(function (button) { button.onclick = closeLayer; });
    document.getElementById("nova-admin-supernova-user").focus();
    document.getElementById("nova-admin-supernova-confirm").onclick = async function () {
      var button = this;
      var username = document.getElementById("nova-admin-supernova-user").value.trim();
      var days = Number(document.getElementById("nova-admin-supernova-duration").value || 0);
      var note = document.getElementById("nova-admin-supernova-note").value.trim();
      if (!username) return toast("Enter a Nova username", "error");
      setBusy(button, true, "Granting");
      try {
        await NovaAPI.adminSupernovaAction({ action: "grant", username: username, note: note || "Manual Supernova grant", expiresAt: days ? Date.now() + days * 86400000 : null });
        toast("Supernova membership activated", "success"); closeLayer();
        await loadSupernovaView(document.getElementById("nova-v7-admin-content"));
      } catch (error) { toast(error.message, "error"); setBusy(button, false); }
    };
  }

  function openSupernovaDecisionDialog(action, target) {
    var layer = document.getElementById("nova-admin-layer");
    if (!layer) return;
    var denying = action === "deny";
    var title = denying ? "Deny upgrade request" : "Revoke membership";
    layer.innerHTML = '<div class="nova-admin-layer-backdrop" data-close-layer></div><div class="nova-admin-dialog" role="dialog" aria-modal="true"><header><div><span>Supernova Pro</span><h2>' + title + '</h2></div><button type="button" class="nova-admin-icon-btn" data-close-layer aria-label="Close">' + icons.close + '</button></header><p>' + (denying ? "The request will be removed from the upgrade queue." : "@" + esc(target) + " will return to the free plan immediately.") + '</p><label for="nova-admin-supernova-decision-note">Audit note</label><textarea id="nova-admin-supernova-decision-note" placeholder="Record why this action is being taken"></textarea><footer><button type="button" class="nova-admin-secondary" data-close-layer>Cancel</button><button type="button" class="nova-admin-danger" id="nova-admin-supernova-decision-confirm">' + (denying ? "Deny request" : "Revoke Supernova") + '</button></footer></div>';
    layer.classList.add("open");
    layer.querySelectorAll("[data-close-layer]").forEach(function (button) { button.onclick = closeLayer; });
    document.getElementById("nova-admin-supernova-decision-note").focus();
    document.getElementById("nova-admin-supernova-decision-confirm").onclick = async function () {
      var button = this;
      var note = document.getElementById("nova-admin-supernova-decision-note").value.trim();
      if (!note) return toast("Add an audit note", "error");
      setBusy(button, true, denying ? "Denying" : "Revoking");
      try {
        var body = { action: action, note: note };
        if (denying) body.requestId = target;
        else body.username = target;
        await NovaAPI.adminSupernovaAction(body);
        toast(denying ? "Upgrade request denied" : "Supernova membership revoked", "success"); closeLayer();
        await loadSupernovaView(document.getElementById("nova-v7-admin-content"));
      } catch (error) { toast(error.message, "error"); setBusy(button, false); }
    };
  }

  async function loadVoiceView(content) {
    var data = await NovaAPI.adminVoice();
    if (state.view !== "voice") return;
    state.voice = { rooms: data.rooms || [], reports: data.reports || [], restrictions: data.restrictions || [] };
    var activeRooms = state.voice.rooms.filter(function (room) { return room.status === "active"; });
    var openReports = state.voice.reports.filter(function (report) { return ["open", "assigned"].includes(report.status); });
    content.innerHTML = viewHeading("Safety", "Voice moderation", "Live room controls, reported dictation excerpts, and voice-only restrictions.", '<button type="button" class="nova-admin-primary" id="nova-admin-voice-restrict-new">' + icons.shield + '<span>Restrict voice access</span></button>') +
      '<div class="nova-admin-voice-summary">' + metric("Active rooms", activeRooms.length, "Live right now", activeRooms.length ? "green" : "purple") + metric("Open reports", openReports.length, openReports.length ? "Needs review" : "Queue clear", openReports.length ? "orange" : "green") + metric("Voice restrictions", state.voice.restrictions.length, "Active accounts", state.voice.restrictions.length ? "orange" : "purple") + '</div>' +
      '<div class="nova-admin-privacy-note"><strong>No audio or full transcripts are stored</strong><span>Only the reported or safety-flagged dictation excerpt appears here.</span></div>' +
      '<section class="nova-admin-panel nova-admin-voice-panel"><header><div><h2>Live and recent rooms</h2><p>Rooms automatically end after two hours or when Supernova sponsorship expires</p></div></header><div class="nova-admin-voice-room-list">' + (state.voice.rooms.length ? state.voice.rooms.map(voiceRoomRecord).join("") : emptyInline("No voice rooms have been created.")) + '</div></section>' +
      '<section class="nova-admin-panel nova-admin-voice-panel"><header><div><h2>Voice reports</h2><p>User reports with the optional short dictation excerpt they submitted</p></div></header><div class="nova-admin-voice-report-list">' + (state.voice.reports.length ? state.voice.reports.map(voiceReportRecord).join("") : emptyInline("No voice reports need attention.")) + '</div></section>' +
      '<section class="nova-admin-panel nova-admin-voice-panel"><header><div><h2>Active restrictions</h2><p>Voice-only restrictions do not disable the rest of the Nova account</p></div></header><div class="nova-admin-voice-restriction-list">' + (state.voice.restrictions.length ? state.voice.restrictions.map(voiceRestrictionRecord).join("") : emptyInline("No accounts are restricted from voice.")) + '</div></section>';
    document.getElementById("nova-admin-voice-restrict-new").onclick = function () { openVoiceRestrictionDialog(""); };
    content.querySelectorAll("[data-voice-end]").forEach(function (button) { button.onclick = function () { openVoiceEndDialog(button.dataset.voiceEnd, button.dataset.voiceName); }; });
    content.querySelectorAll("[data-voice-report-action]").forEach(function (button) { button.onclick = function () { openVoiceReportDecision(button.dataset.voiceReportAction, button.dataset.voiceReport); }; });
    content.querySelectorAll("[data-voice-restrict]").forEach(function (button) { button.onclick = function () { openVoiceRestrictionDialog(button.dataset.voiceRestrict); }; });
    content.querySelectorAll("[data-voice-unrestrict]").forEach(function (button) { button.onclick = function () { openVoiceUnrestrictDialog(button.dataset.voiceUnrestrict); }; });
  }

  function voiceRoomRecord(room) {
    var active = room.status === "active";
    var scope = room.scopeType === "group" ? "Social group" : (room.scopeType === "invite" ? "Invite only" : "Friends");
    return '<article class="nova-admin-voice-room-record"><span class="nova-admin-voice-live-dot ' + (active ? "is-live" : "") + '"></span><div><strong>' + esc(room.name) + '</strong><small>' + esc(scope) + ' · host @' + esc(room.hostUsername || room.createdBy) + '</small></div><div class="nova-admin-voice-room-stats"><span>' + esc(room.connectedCount || 0) + '/' + esc(room.maxMembers || 6) + ' connected</span><small>' + esc(active ? "Started " + relativeTime(room.createdAt) : "Ended " + fmtTime(room.endedAt)) + '</small></div>' + statusBadge(room.status) + (active ? '<button type="button" class="nova-admin-danger" data-voice-end="' + esc(room.id) + '" data-voice-name="' + esc(room.name) + '">End room</button>' : '') + '</article>';
  }

  function voiceReportRecord(report) {
    var open = ["open", "assigned"].includes(report.status);
    return '<article class="nova-admin-voice-report-record"><header><div><span>ROOM ' + esc(report.roomId) + '</span><strong>@' + esc(report.reporter || "deleted-user") + ' reported @' + esc(report.target || "unknown-user") + '</strong></div>' + statusBadge(report.status) + '</header><p>' + esc(report.reason || "Voice room report") + '</p>' + (report.transcriptExcerpt ? '<blockquote><span>Reported dictation excerpt</span>' + esc(report.transcriptExcerpt) + '</blockquote>' : '') + '<footer><time>' + esc(fmtTime(report.createdAt)) + '</time><div>' + (report.target ? '<button type="button" class="nova-admin-secondary" data-voice-restrict="' + esc(report.target) + '">Restrict user</button>' : '') + (open ? '<button type="button" class="nova-admin-secondary" data-voice-report="' + esc(report.id) + '" data-voice-report-action="dismiss-report">Dismiss</button><button type="button" class="nova-admin-primary" data-voice-report="' + esc(report.id) + '" data-voice-report-action="resolve-report">Resolve</button>' : '') + '</div></footer></article>';
  }

  function voiceRestrictionRecord(item) {
    return '<article class="nova-admin-voice-restriction-record"><div class="nova-admin-person"><span class="nova-admin-avatar">' + esc((item.username || "?").charAt(0).toUpperCase()) + '</span><span><strong>@' + esc(item.username) + '</strong><small>Restricted ' + esc(relativeTime(item.createdAt)) + '</small></span></div><div><strong>' + esc(item.reason) + '</strong><span>' + esc(item.expiresAt ? "Expires " + fmtTime(item.expiresAt) : "No expiry") + '</span></div><button type="button" class="nova-admin-secondary" data-voice-unrestrict="' + esc(item.username) + '">Remove restriction</button></article>';
  }

  function openVoiceEndDialog(roomId, name) {
    openVoiceReasonDialog("End voice room", 'End “' + (name || "this room") + '” for everyone now.', "End room", async function (reason, button) {
      setBusy(button, true, "Ending");
      await NovaAPI.adminVoiceAction({ action: "end", roomId: roomId, reason: reason });
      toast("Voice room ended", "success"); closeLayer(); await loadVoiceView(document.getElementById("nova-v7-admin-content"));
    });
  }

  function openVoiceReportDecision(action, reportId) {
    var resolving = action === "resolve-report";
    openVoiceReasonDialog(resolving ? "Resolve voice report" : "Dismiss voice report", resolving ? "Mark this report handled and record the outcome." : "Dismiss this report and record why no further action is needed.", resolving ? "Resolve report" : "Dismiss report", async function (reason, button) {
      setBusy(button, true, resolving ? "Resolving" : "Dismissing");
      await NovaAPI.adminVoiceAction({ action: action, reportId: reportId, reason: reason });
      toast(resolving ? "Voice report resolved" : "Voice report dismissed", "success"); closeLayer(); await loadVoiceView(document.getElementById("nova-v7-admin-content"));
    });
  }

  function openVoiceReasonDialog(title, copy, actionLabel, submit) {
    var layer = document.getElementById("nova-admin-layer");
    if (!layer) return;
    layer.innerHTML = '<div class="nova-admin-layer-backdrop" data-close-layer></div><div class="nova-admin-dialog" role="dialog" aria-modal="true"><header><div><span>Voice safety</span><h2>' + esc(title) + '</h2></div><button type="button" class="nova-admin-icon-btn" data-close-layer aria-label="Close">' + icons.close + '</button></header><p>' + esc(copy) + '</p><label for="nova-admin-voice-reason">Audit reason</label><textarea id="nova-admin-voice-reason" maxlength="500" placeholder="Record why this action is being taken"></textarea><footer><button type="button" class="nova-admin-secondary" data-close-layer>Cancel</button><button type="button" class="nova-admin-danger" id="nova-admin-voice-reason-confirm">' + esc(actionLabel) + '</button></footer></div>';
    layer.classList.add("open"); layer.querySelectorAll("[data-close-layer]").forEach(function (button) { button.onclick = closeLayer; });
    document.getElementById("nova-admin-voice-reason").focus();
    document.getElementById("nova-admin-voice-reason-confirm").onclick = async function () {
      var button = this, reason = document.getElementById("nova-admin-voice-reason").value.trim();
      if (!reason) return toast("Add an audit reason", "error");
      try { await submit(reason, button); } catch (error) { toast(error.message, "error"); setBusy(button, false); }
    };
  }

  function openVoiceRestrictionDialog(username) {
    var layer = document.getElementById("nova-admin-layer");
    if (!layer) return;
    layer.innerHTML = '<div class="nova-admin-layer-backdrop" data-close-layer></div><div class="nova-admin-dialog" role="dialog" aria-modal="true"><header><div><span>Voice safety</span><h2>Restrict voice access</h2></div><button type="button" class="nova-admin-icon-btn" data-close-layer aria-label="Close">' + icons.close + '</button></header><label for="nova-admin-voice-user">Username</label><input id="nova-admin-voice-user" autocomplete="off" value="' + esc(username || "") + '" placeholder="Nova username"><label for="nova-admin-voice-duration">Duration</label><select id="nova-admin-voice-duration"><option value="1">1 hour</option><option value="24">24 hours</option><option value="168">7 days</option><option value="720">30 days</option><option value="0">No expiry</option></select><label for="nova-admin-voice-restriction-reason">Reason</label><textarea id="nova-admin-voice-restriction-reason" maxlength="500" placeholder="Why this account cannot use voice"></textarea><footer><button type="button" class="nova-admin-secondary" data-close-layer>Cancel</button><button type="button" class="nova-admin-danger" id="nova-admin-voice-restrict-confirm">Apply restriction</button></footer></div>';
    layer.classList.add("open"); layer.querySelectorAll("[data-close-layer]").forEach(function (button) { button.onclick = closeLayer; });
    (username ? document.getElementById("nova-admin-voice-restriction-reason") : document.getElementById("nova-admin-voice-user")).focus();
    document.getElementById("nova-admin-voice-restrict-confirm").onclick = async function () {
      var button = this, target = document.getElementById("nova-admin-voice-user").value.trim(), reason = document.getElementById("nova-admin-voice-restriction-reason").value.trim();
      var hours = Number(document.getElementById("nova-admin-voice-duration").value || 0);
      if (!target || !reason) return toast("Username and reason are required", "error");
      setBusy(button, true, "Applying");
      try { await NovaAPI.adminVoiceAction({ action: "restrict", username: target, reason: reason, expiresAt: hours ? Date.now() + hours * 3600000 : null }); toast("Voice restriction applied", "success"); closeLayer(); await loadVoiceView(document.getElementById("nova-v7-admin-content")); }
      catch (error) { toast(error.message, "error"); setBusy(button, false); }
    };
  }

  function openVoiceUnrestrictDialog(username) {
    openVoiceReasonDialog("Remove voice restriction", "Restore voice access for @" + username + ".", "Restore access", async function (reason, button) {
      setBusy(button, true, "Restoring");
      await NovaAPI.adminVoiceAction({ action: "unrestrict", username: username, reason: reason });
      toast("Voice access restored", "success"); closeLayer(); await loadVoiceView(document.getElementById("nova-v7-admin-content"));
    });
  }

  async function loadChatView(content) {
    content.innerHTML = viewHeading("Manage", "Chat moderation", "Search safely, review filter events, and manage Nova Social timeouts.", '<div class="nova-admin-heading-actions"><button type="button" class="nova-admin-danger" id="nova-admin-clear-everyone-chat">Clear Everyone chat</button><button type="button" class="nova-admin-primary" id="nova-admin-chat-ban-new">' + icons.shield + '<span>Timeout Social</span></button></div>') +
      '<div class="nova-admin-chat-search"><div class="nova-admin-toolbar"><div class="nova-admin-search">' + icons.search + '<input id="nova-admin-chat-q" type="search" placeholder="Message text" autocomplete="off"></div><input id="nova-admin-chat-user" type="search" placeholder="Username" autocomplete="off"><select id="nova-admin-chat-channel" aria-label="Channel type"><option value="">All chats</option><option value="everyone">Everyone</option><option value="dm">Direct messages</option><option value="group">Groups</option></select></div><div class="nova-admin-toolbar nova-admin-chat-audit"><input id="nova-admin-chat-reason" maxlength="240" placeholder="Investigation reason (recorded in the audit log)"><button type="button" class="nova-admin-primary" id="nova-admin-chat-search-btn">Search chat</button></div></div>' +
      '<section class="nova-admin-panel nova-admin-chat-restrictions"><header><div><h2>Active Social timeouts</h2><p>Timeouts restrict Social actions without locking the whole account</p></div><button type="button" class="nova-admin-text-btn" id="nova-admin-chat-refresh">Refresh</button></header><div id="nova-admin-chat-restrictions-list">' + loadingView() + '</div></section>' +
      '<div id="nova-admin-chat-results">' + emptyState("Search chat evidence", "Enter a username or message text and record why you are investigating.") + '</div>';
    document.getElementById("nova-admin-chat-ban-new").onclick = function () { openChatTimeoutDialog(""); };
    document.getElementById("nova-admin-clear-everyone-chat").onclick = openClearEveryoneChatDialog;
    document.getElementById("nova-admin-chat-search-btn").onclick = searchChatMessages;
    document.getElementById("nova-admin-chat-refresh").onclick = refreshChatRestrictions;
    ["nova-admin-chat-q", "nova-admin-chat-user", "nova-admin-chat-reason"].forEach(function (id) {
      document.getElementById(id).onkeydown = function (event) { if (event.key === "Enter") searchChatMessages(); };
    });
    await refreshChatRestrictions();
  }

  async function refreshChatRestrictions() {
    var target = document.getElementById("nova-admin-chat-restrictions-list");
    if (!target) return;
    target.innerHTML = loadingView();
    try {
      var data = await NovaAPI.adminChatRestrictions();
      var restrictions = data.restrictions || [];
      target.innerHTML = restrictions.length ? '<div class="nova-admin-chat-ban-list">' + restrictions.map(chatRestrictionRow).join("") + '</div>' : emptyInline("No active Social timeouts.");
      target.querySelectorAll("[data-chat-unban]").forEach(function (button) { button.onclick = function () { openChatUnbanDialog(button.dataset.chatUnban, button.dataset.chatUsername); }; });
    } catch (error) { target.innerHTML = errorView(error.message); }
  }

  function chatRestrictionRow(item) {
    var expires = item.expiresAt ? "Timeout ends " + fmtTime(item.expiresAt) : "Permanent Social ban";
    var endLabel = item.expiresAt ? "End timeout" : "Remove ban";
    var issuer = String(item.id || "").indexOf("auto_chat_") === 0 ? " · automatic" : (item.issuedBy ? " · by @" + esc(item.issuedBy) : "");
    return '<article class="nova-admin-chat-ban"><div class="nova-admin-person">' + avatar(item) + '<span><strong>@' + esc(item.username) + '</strong><small>' + esc(item.scope === "everyone" ? "Everyone chat only" : "All Nova Social chat") + '</small></span></div><div class="nova-admin-chat-ban-reason"><strong>' + esc(item.reason) + '</strong><span>' + esc(expires) + issuer + '</span></div><button type="button" class="nova-admin-secondary" data-chat-unban="' + esc(item.id) + '" data-chat-username="' + esc(item.username) + '">' + endLabel + '</button></article>';
  }

  async function searchChatMessages() {
    var target = document.getElementById("nova-admin-chat-results");
    var button = document.getElementById("nova-admin-chat-search-btn");
    if (!target || !button) return;
    var query = document.getElementById("nova-admin-chat-q").value.trim();
    var username = document.getElementById("nova-admin-chat-user").value.trim();
    var channel = document.getElementById("nova-admin-chat-channel").value;
    var reason = document.getElementById("nova-admin-chat-reason").value.trim();
    if (!query && !username) return toast("Enter a username or message text", "error");
    if (!reason) return toast("Record an investigation reason", "error");
    setBusy(button, true, "Searching"); target.innerHTML = loadingView();
    try {
      var data = await NovaAPI.adminChatMessages(reason, query, username, channel);
      var messages = data.messages || [], events = data.filteredEvents || [];
      target.innerHTML = '<div class="nova-admin-chat-result-grid"><section class="nova-admin-panel"><header><div><h2>Messages</h2><p>' + esc(messages.length) + ' matching result' + (messages.length === 1 ? '' : 's') + '</p></div></header><div class="nova-admin-chat-message-list">' + (messages.length ? messages.map(chatMessageResult).join("") : emptyInline("No stored messages matched.")) + '</div></section><section class="nova-admin-panel"><header><div><h2>Blocked attempts</h2><p>Safety-filter events expire after 30 days</p></div></header><div class="nova-admin-chat-event-list">' + (events.length ? events.map(chatFilterResult).join("") : emptyInline("No filter events matched.")) + '</div></section></div>';
      target.querySelectorAll("[data-chat-ban-user]").forEach(function (action) { action.onclick = function () { openChatTimeoutDialog(action.dataset.chatBanUser); }; });
    } catch (error) { target.innerHTML = errorView(error.message); }
    setBusy(button, false);
  }

  function chatMessageResult(message) {
    var channel = message.channelKind === "everyone" ? "Everyone" : (message.channelKind === "dm" ? "Direct message" : "Group");
    return '<article class="nova-admin-chat-message"><div class="nova-admin-person">' + avatar(message) + '<span><strong>@' + esc(message.username) + '</strong><small>' + esc(channel) + ' · ' + esc(fmtTime(message.createdAt)) + '</small></span></div><p>' + esc(message.body || "[No text]") + '</p><button type="button" class="nova-admin-row-action" data-chat-ban-user="' + esc(message.username) + '">Manage</button></article>';
  }

  function chatFilterResult(event) {
    return '<article class="nova-admin-chat-event"><div><span>' + esc(String(event.ruleCode || "filter").replace(/_/g, " ")) + '</span><strong>@' + esc(event.username || "deleted-user") + '</strong><time>' + esc(fmtTime(event.createdAt)) + '</time></div><p>' + esc(event.excerpt || "[No text]") + '</p><button type="button" class="nova-admin-row-action" data-chat-ban-user="' + esc(event.username || "") + '">Manage</button></article>';
  }


  function openClearEveryoneChatDialog() {
    var layer = document.getElementById("nova-admin-layer");
    if (!layer) return;
    layer.innerHTML = '<div class="nova-admin-layer-backdrop" data-close-layer></div><div class="nova-admin-dialog" role="dialog" aria-modal="true"><header><div><span>Nova Social moderation</span><h2>Clear Everyone chat</h2></div><button type="button" class="nova-admin-icon-btn" data-close-layer aria-label="Close">' + icons.close + '</button></header><p>This removes every currently visible message from Everyone chat. Direct messages and groups are not affected.</p><label for="nova-admin-clear-everyone-reason">Audit reason</label><textarea id="nova-admin-clear-everyone-reason" maxlength="240" placeholder="Why are you clearing Everyone chat?"></textarea><footer><button type="button" class="nova-admin-secondary" data-close-layer>Cancel</button><button type="button" class="nova-admin-danger" id="nova-admin-clear-everyone-confirm">Clear Everyone chat</button></footer></div>';
    layer.classList.add("open");
    layer.querySelectorAll("[data-close-layer]").forEach(function (button) { button.onclick = closeLayer; });
    var reason = document.getElementById("nova-admin-clear-everyone-reason");
    if (reason) reason.focus();
    document.getElementById("nova-admin-clear-everyone-confirm").onclick = async function () {
      var button = this;
      var auditReason = (reason && reason.value || "").trim();
      if (!auditReason) return toast("An audit reason is required", "error");
      setBusy(button, true, "Clearing");
      try {
        var result = await NovaAPI.adminClearEveryoneChat(auditReason);
        toast("Everyone chat cleared (" + Number(result.deletedMessages || 0) + " messages)", "success");
        closeLayer();
      } catch (error) {
        toast(error.message, "error");
        setBusy(button, false);
      }
    };
  }

  function openChatTimeoutDialog(username) {
    var layer = document.getElementById("nova-admin-layer");
    if (!layer) return;
    layer.innerHTML = '<div class="nova-admin-layer-backdrop" data-close-layer></div><div class="nova-admin-dialog" role="dialog" aria-modal="true"><header><div><span>Nova Social moderation</span><h2>Timeout from Social</h2></div><button type="button" class="nova-admin-icon-btn" data-close-layer aria-label="Close">' + icons.close + '</button></header><p>This prevents messages, reactions, and new group activity for the selected duration.</p><label for="nova-admin-chat-ban-user">Username</label><input id="nova-admin-chat-ban-user" autocomplete="off" value="' + esc(username || "") + '" placeholder="Nova username"><div class="nova-admin-dialog-grid"><div><label for="nova-admin-chat-ban-scope">Scope</label><select id="nova-admin-chat-ban-scope"><option value="all">All Nova Social chat</option><option value="everyone">Everyone chat only</option></select></div><div><label for="nova-admin-chat-ban-duration">Duration</label><select id="nova-admin-chat-ban-duration"><option value="5">5 minutes</option><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60" selected>1 hour</option><option value="360">6 hours</option><option value="1440">24 hours</option><option value="10080">7 days</option><option value="43200">30 days</option><option value="0">Permanent ban</option></select></div></div><label for="nova-admin-chat-ban-reason">Reason</label><textarea id="nova-admin-chat-ban-reason" maxlength="240" placeholder="Why this account is being timed out"></textarea><footer><button type="button" class="nova-admin-secondary" data-close-layer>Cancel</button><button type="button" class="nova-admin-danger" id="nova-admin-chat-ban-confirm">Apply timeout</button></footer></div>';
    layer.classList.add("open"); layer.querySelectorAll("[data-close-layer]").forEach(function (button) { button.onclick = closeLayer; });
    (username ? document.getElementById("nova-admin-chat-ban-reason") : document.getElementById("nova-admin-chat-ban-user")).focus();
    document.getElementById("nova-admin-chat-ban-confirm").onclick = async function () {
      var button = this, target = document.getElementById("nova-admin-chat-ban-user").value.trim();
      var scope = document.getElementById("nova-admin-chat-ban-scope").value, minutes = Number(document.getElementById("nova-admin-chat-ban-duration").value || 0);
      var reason = document.getElementById("nova-admin-chat-ban-reason").value.trim();
      if (!target || !reason) return toast("Username and reason are required", "error");
      setBusy(button, true, "Applying");
      try { await NovaAPI.adminCreateChatRestriction({ username: target, scope: scope, reason: reason, expiresAt: minutes ? Date.now() + minutes * 60000 : null }); toast(minutes ? "Social timeout applied" : "Permanent Social ban applied", "success"); closeLayer(); await refreshChatRestrictions(); }
      catch (error) { toast(error.message, "error"); setBusy(button, false); }
    };
  }

  function openChatUnbanDialog(id, username) {
    var layer = document.getElementById("nova-admin-layer");
    if (!layer) return;
    layer.innerHTML = '<div class="nova-admin-layer-backdrop" data-close-layer></div><div class="nova-admin-dialog" role="dialog" aria-modal="true"><header><div><span>Nova Social moderation</span><h2>End Social timeout</h2></div><button type="button" class="nova-admin-icon-btn" data-close-layer aria-label="Close">' + icons.close + '</button></header><p>@' + esc(username) + ' will be able to use Social again immediately.</p><label for="nova-admin-chat-unban-reason">Audit reason</label><textarea id="nova-admin-chat-unban-reason" maxlength="240" placeholder="Why this timeout is being ended"></textarea><footer><button type="button" class="nova-admin-secondary" data-close-layer>Cancel</button><button type="button" class="nova-admin-primary" id="nova-admin-chat-unban-confirm">End timeout</button></footer></div>';
    layer.classList.add("open"); layer.querySelectorAll("[data-close-layer]").forEach(function (button) { button.onclick = closeLayer; }); document.getElementById("nova-admin-chat-unban-reason").focus();
    document.getElementById("nova-admin-chat-unban-confirm").onclick = async function () { var button = this, reason = document.getElementById("nova-admin-chat-unban-reason").value.trim(); if (!reason) return toast("Add an audit reason", "error"); setBusy(button, true, "Ending"); try { await NovaAPI.adminRevokeChatRestriction({ id: id, reason: reason }); toast("Social timeout ended", "success"); closeLayer(); await refreshChatRestrictions(); } catch (error) { toast(error.message, "error"); setBusy(button, false); } };
  }

  async function loadReportsView(content) {
    content.innerHTML = viewHeading("Manage", "Reports", "Review, assign, and close moderation cases.") + '<div class="nova-admin-filter-tabs" id="nova-admin-report-tabs"><button class="active" data-report-status="">Active queue</button><button data-report-status="open">Open</button><button data-report-status="assigned">Assigned</button><button data-report-status="resolved">Resolved</button><button data-report-status="dismissed">Dismissed</button></div><div id="nova-admin-reports-list">' + loadingView() + "</div>";
    state.reportStatus = "";
    content.querySelectorAll("[data-report-status]").forEach(function (button) { button.onclick = function () { content.querySelectorAll("[data-report-status]").forEach(function (item) { item.classList.toggle("active", item === button); }); state.reportStatus = button.dataset.reportStatus; fetchReports(state.reportStatus); }; });
    await fetchReports("");
  }

  async function fetchReports(status) {
    var target = document.getElementById("nova-admin-reports-list");
    if (!target) return;
    target.innerHTML = loadingView();
    try {
      var data = await NovaAPI.adminReports(status);
      state.reports = data.reports || [];
      var visible = status ? state.reports : state.reports.filter(function (report) { return ["open", "assigned", "appealed"].includes(report.status); });
      target.innerHTML = visible.length ? '<div class="nova-admin-report-list">' + visible.map(reportCard).join("") + "</div>" : emptyState("Queue clear", "There are no reports in this view.");
      target.querySelectorAll("[data-report-action]").forEach(function (button) { button.onclick = function () { handleReportAction(button.dataset.reportId, button.dataset.reportAction, button); }; });
    } catch (error) {
      target.innerHTML = errorView(error.message);
      var retry = target.querySelector("#nova-admin-retry");
      if (retry) retry.onclick = function () { fetchReports(status); };
    }
  }

  function reportCard(report) {
    var active = ["open", "assigned", "appealed"].includes(report.status);
    return '<article class="nova-admin-report-card"><header><div><span>' + esc(report.reportType || "user") + '</span><strong>' + (report.targetUser ? "@" + esc(report.targetUser) : "General report") + '</strong></div>' + statusBadge(report.status) + '</header><p>' + esc(report.reason) + '</p><footer><div><span>Reported by <strong>' + esc(report.reporter || "Deleted account") + '</strong></span><time title="' + esc(fmtTime(report.createdAt)) + '">' + esc(relativeTime(report.createdAt)) + '</time>' + (report.assignedTo ? '<span>Assigned to <strong>' + esc(report.assignedTo) + "</strong></span>" : "") + '</div><div class="nova-admin-report-actions">' + (active ? (report.status !== "assigned" ? '<button type="button" data-report-action="assign" data-report-id="' + esc(report.id) + '">Assign to me</button>' : "") + '<button type="button" class="is-success" data-report-action="resolve" data-report-id="' + esc(report.id) + '">Resolve</button><button type="button" data-report-action="dismiss" data-report-id="' + esc(report.id) + '">Dismiss</button>' : '<button type="button" data-report-action="reopen" data-report-id="' + esc(report.id) + '">Reopen</button>') + "</div></footer></article>";
  }

  async function handleReportAction(id, action, button) {
    if (["resolve", "dismiss"].includes(action)) return openReportDialog(id, action);
    setBusy(button, true, action === "assign" ? "Assigning" : "Reopening");
    try { await NovaAPI.adminReportAction({ id: id, action: action, reason: "" }); toast("Report updated", "success"); await fetchReports(state.reportStatus); }
    catch (error) { toast(error.message, "error"); setBusy(button, false); }
  }

  function openReportDialog(id, action) {
    var report = state.reports.find(function (item) { return item.id === id; });
    var layer = document.getElementById("nova-admin-layer");
    if (!report || !layer) return;
    layer.innerHTML = '<div class="nova-admin-layer-backdrop" data-close-layer></div><div class="nova-admin-dialog" role="dialog" aria-modal="true"><header><div><span>Report action</span><h2>' + (action === "resolve" ? "Resolve report" : "Dismiss report") + '</h2></div><button type="button" class="nova-admin-icon-btn" data-close-layer aria-label="Close">' + icons.close + '</button></header><p>' + esc(report.reason) + '</p><label for="nova-admin-report-note">Resolution note</label><textarea id="nova-admin-report-note" placeholder="Record why this case is being ' + esc(action === "resolve" ? "resolved" : "dismissed") + '"></textarea><footer><button type="button" class="nova-admin-secondary" data-close-layer>Cancel</button><button type="button" class="nova-admin-primary" id="nova-admin-report-confirm">Confirm</button></footer></div>';
    layer.classList.add("open");
    layer.querySelectorAll("[data-close-layer]").forEach(function (button) { button.onclick = closeLayer; });
    document.getElementById("nova-admin-report-note").focus();
    document.getElementById("nova-admin-report-confirm").onclick = async function () {
      var button = this;
      var reason = document.getElementById("nova-admin-report-note").value.trim();
      if (!reason) return toast("Add a resolution note", "error");
      setBusy(button, true, "Saving");
      try { await NovaAPI.adminReportAction({ id: id, action: action, reason: reason }); toast("Report " + (action === "resolve" ? "resolved" : "dismissed"), "success"); closeLayer(); await fetchReports(state.reportStatus); }
      catch (error) { toast(error.message, "error"); setBusy(button, false); }
    };
  }

  async function loadMaintenanceView(content) {
    var data = await NovaAPI.adminSite();
    if (state.view !== "maintenance") return;
    var maintenance = data.maintenance || { enabled: false, message: "" };
    content.innerHTML = viewHeading("Publish", "Maintenance", "Control Nova's existing full-screen maintenance experience.") +
      '<section class="nova-admin-maintenance-control ' + (maintenance.enabled ? "is-active" : "") + '"><header><div class="nova-admin-maintenance-symbol">' + icons.maintenance + '</div><div><span>Site access</span><h2>' + (maintenance.enabled ? "Maintenance is active" : "Nova is available") + '</h2><p>' + (maintenance.enabled ? "Visitors see the original Nova maintenance screen. Staff retain bypass access." : "Visitors can use Nova normally.") + '</p></div><label class="nova-admin-switch" title="Toggle maintenance mode"><input id="nova-admin-maintenance-enabled" type="checkbox" ' + (maintenance.enabled ? "checked" : "") + '><span></span><b>' + (maintenance.enabled ? "On" : "Off") + '</b></label></header><div class="nova-admin-maintenance-message"><label for="nova-admin-maintenance-message">Visitor message</label><textarea id="nova-admin-maintenance-message" maxlength="280" placeholder="Nova is currently under maintenance. Check back soon.">' + esc(maintenance.message) + '</textarea><small>Shown inside the original animated maintenance screen.</small></div><footer><span>' + (maintenance.updatedAt ? "Last changed " + esc(fmtTime(maintenance.updatedAt)) + (maintenance.updatedBy ? " by @" + esc(maintenance.updatedBy) : "") : "No maintenance changes recorded") + '</span><button type="button" class="nova-admin-primary" id="nova-admin-maintenance-save">Save maintenance state</button></footer></section>' +
      '<div class="nova-admin-maintenance-note"><strong>The original mode is preserved</strong><span>The star field, full-screen lockout, custom message, and staff bypass presentation remain unchanged.</span></div>';
    var toggle = document.getElementById("nova-admin-maintenance-enabled");
    toggle.onchange = function () {
      var control = content.querySelector(".nova-admin-maintenance-control");
      var label = content.querySelector(".nova-admin-switch b");
      control.classList.toggle("is-active", toggle.checked);
      if (label) label.textContent = toggle.checked ? "On" : "Off";
    };
    document.getElementById("nova-admin-maintenance-save").onclick = async function () {
      var button = this;
      var message = document.getElementById("nova-admin-maintenance-message").value.trim();
      setBusy(button, true, "Saving");
      try {
        var response = await NovaAPI.adminSetMaintenance({ enabled: toggle.checked, message: message });
        if (window.__novaApplyMaintenance) window.__novaApplyMaintenance(response.maintenance);
        toast(toggle.checked ? "Maintenance mode enabled" : "Maintenance mode disabled", "success");
        await loadMaintenanceView(content);
      } catch (error) { toast(error.message, "error"); setBusy(button, false); }
    };
  }

  async function loadBannersView(content) {
    var data = await NovaAPI.adminSite();
    if (state.view !== "banners") return;
    state.banners = data.banners || [];
    content.innerHTML = viewHeading("Publish", "Banners", "Create time-limited notices that appear across Nova.", '<button type="button" class="nova-admin-primary" id="nova-admin-new-banner">' + icons.plus + '<span>New banner</span></button>') +
      '<div class="nova-admin-banner-summary"><span><strong>' + esc(state.banners.filter(function (item) { return bannerState(item) === "live"; }).length) + '</strong> live</span><span><strong>' + esc(state.banners.length) + '</strong> total</span></div>' +
      (state.banners.length ? '<div class="nova-admin-banner-list">' + state.banners.map(bannerRecord).join("") + '</div>' : emptyState("No banners yet", "Create a notice for updates, events, or service information."));
    document.getElementById("nova-admin-new-banner").onclick = openBannerDialog;
    content.querySelectorAll("[data-toggle-banner]").forEach(function (button) {
      button.onclick = async function () {
        var banner = state.banners.find(function (item) { return item.id === button.dataset.toggleBanner; });
        if (!banner) return;
        setBusy(button, true, banner.active ? "Disabling" : "Enabling");
        try { await NovaAPI.adminUpdateBanner({ id: banner.id, active: !banner.active }); toast(banner.active ? "Banner disabled" : "Banner enabled", "success"); await refreshSiteState(); await loadBannersView(content); }
        catch (error) { toast(error.message, "error"); setBusy(button, false); }
      };
    });
    content.querySelectorAll("[data-delete-banner]").forEach(function (button) { button.onclick = function () { openDeleteBannerDialog(button.dataset.deleteBanner); }; });
  }

  function bannerState(banner) {
    if (!banner.active) return "disabled";
    if (banner.expiresAt && banner.expiresAt <= Date.now()) return "expired";
    if (banner.startsAt && banner.startsAt > Date.now()) return "scheduled";
    return "live";
  }

  function bannerRecord(banner) {
    var currentState = bannerState(banner);
    var expiry = banner.expiresAt ? "Expires " + fmtTime(banner.expiresAt) : "No expiry";
    return '<article class="nova-admin-banner-record is-' + esc(banner.type || "info") + '"><i></i><div class="nova-admin-banner-copy"><header><span class="nova-admin-banner-tone">' + esc(banner.type || "info") + '</span><span class="nova-admin-banner-state is-' + currentState + '">' + currentState + '</span></header><p>' + esc(banner.text) + '</p><footer><span>' + esc(expiry) + '</span><span>' + (banner.dismissible ? "Dismissible" : "Persistent") + '</span><span>Created ' + esc(fmtTime(banner.createdAt)) + (banner.createdBy ? " by @" + esc(banner.createdBy) : "") + '</span></footer></div><div class="nova-admin-banner-actions"><button type="button" class="nova-admin-secondary" data-toggle-banner="' + esc(banner.id) + '">' + (banner.active ? "Disable" : "Enable") + '</button><button type="button" class="nova-admin-icon-btn is-danger" data-delete-banner="' + esc(banner.id) + '" title="Delete banner" aria-label="Delete banner">' + icons.trash + '</button></div></article>';
  }

  function openBannerDialog() {
    var layer = document.getElementById("nova-admin-layer");
    if (!layer) return;
    layer.innerHTML = '<div class="nova-admin-layer-backdrop" data-close-layer></div><div class="nova-admin-dialog" role="dialog" aria-modal="true"><header><div><span>Site notice</span><h2>Create banner</h2></div><button type="button" class="nova-admin-icon-btn" data-close-layer aria-label="Close">' + icons.close + '</button></header><label for="nova-admin-banner-message">Message</label><textarea id="nova-admin-banner-message" maxlength="300" placeholder="What should Nova users know?"></textarea><div class="nova-admin-dialog-grid"><div><label for="nova-admin-banner-tone">Tone</label><select id="nova-admin-banner-tone"><option value="info">Information</option><option value="success">Success</option><option value="warn">Warning</option><option value="danger">Urgent</option></select></div><div><label for="nova-admin-banner-duration">Duration</label><select id="nova-admin-banner-duration"><option value="0">No expiry</option><option value="1">24 hours</option><option value="7">7 days</option><option value="30">30 days</option></select></div></div><label class="nova-admin-check"><input type="checkbox" id="nova-admin-banner-dismissible" checked><span>' + icons.check + '</span><b>Allow users to dismiss this banner</b></label><footer><button type="button" class="nova-admin-secondary" data-close-layer>Cancel</button><button type="button" class="nova-admin-primary" id="nova-admin-banner-create">Publish banner</button></footer></div>';
    layer.classList.add("open");
    layer.querySelectorAll("[data-close-layer]").forEach(function (button) { button.onclick = closeLayer; });
    document.getElementById("nova-admin-banner-message").focus();
    document.getElementById("nova-admin-banner-create").onclick = async function () {
      var button = this;
      var message = document.getElementById("nova-admin-banner-message").value.trim();
      var tone = document.getElementById("nova-admin-banner-tone").value;
      var days = Number(document.getElementById("nova-admin-banner-duration").value || 0);
      var dismissible = document.getElementById("nova-admin-banner-dismissible").checked;
      if (!message) return toast("Add a banner message", "error");
      setBusy(button, true, "Publishing");
      try { await NovaAPI.adminCreateBanner({ message: message, tone: tone, dismissible: dismissible, expiresAt: days ? Date.now() + days * 86400000 : null }); toast("Banner published", "success"); closeLayer(); await refreshSiteState(); await loadBannersView(document.getElementById("nova-v7-admin-content")); }
      catch (error) { toast(error.message, "error"); setBusy(button, false); }
    };
  }

  function openDeleteBannerDialog(id) {
    var banner = state.banners.find(function (item) { return item.id === id; });
    var layer = document.getElementById("nova-admin-layer");
    if (!banner || !layer) return;
    layer.innerHTML = '<div class="nova-admin-layer-backdrop" data-close-layer></div><div class="nova-admin-dialog" role="dialog" aria-modal="true"><header><div><span>Site notice</span><h2>Delete banner</h2></div><button type="button" class="nova-admin-icon-btn" data-close-layer aria-label="Close">' + icons.close + '</button></header><p>' + esc(banner.text) + '</p><footer><button type="button" class="nova-admin-secondary" data-close-layer>Cancel</button><button type="button" class="nova-admin-danger" id="nova-admin-banner-delete">Delete banner</button></footer></div>';
    layer.classList.add("open");
    layer.querySelectorAll("[data-close-layer]").forEach(function (button) { button.onclick = closeLayer; });
    document.getElementById("nova-admin-banner-delete").onclick = async function () {
      var button = this;
      setBusy(button, true, "Deleting");
      try { await NovaAPI.adminDeleteBanner(id); toast("Banner deleted", "success"); closeLayer(); await refreshSiteState(); await loadBannersView(document.getElementById("nova-v7-admin-content")); }
      catch (error) { toast(error.message, "error"); setBusy(button, false); }
    };
  }

  async function refreshSiteState() {
    try {
      var publicState = await NovaAPI.siteState();
      if (window.__novaApplyMaintenance) window.__novaApplyMaintenance(publicState.maintenance);
      if (window.__novaRenderBanners) window.__novaRenderBanners(publicState.banners || []);
    } catch (error) {}
  }

  function renderProxyView(content) {
    content.innerHTML = viewHeading("Security", "Proxy activity", "Owner-only, audited access to retained navigation records.") + '<div class="nova-admin-privacy-note"><strong>Privacy controls active</strong><span>Every view is written to the audit log. Records expire automatically.</span></div><div class="nova-admin-toolbar is-stacked"><input id="nova-admin-proxy-reason" placeholder="Investigation reason (required)"><div><input id="nova-admin-proxy-domain" placeholder="Filter domain"><input id="nova-admin-proxy-device" placeholder="Exact device hash"><button type="button" class="nova-admin-primary" id="nova-admin-proxy-load">Open records</button></div></div><div id="nova-admin-proxy-list">' + emptyState("Records are locked", "Enter a reason to open this audited view.") + "</div>";
    document.getElementById("nova-admin-proxy-load").onclick = loadProxy;
  }

  async function loadProxy() {
    var target = document.getElementById("nova-admin-proxy-list");
    var button = document.getElementById("nova-admin-proxy-load");
    var reason = document.getElementById("nova-admin-proxy-reason").value.trim();
    var domain = document.getElementById("nova-admin-proxy-domain").value.trim();
    var device = document.getElementById("nova-admin-proxy-device").value.trim();
    if (!reason) return toast("An investigation reason is required", "error");
    setBusy(button, true, "Opening"); target.innerHTML = loadingView();
    try {
      var data = await NovaAPI.adminProxyLogs(reason, domain, device);
      var rows = data.logs || [];
      target.innerHTML = rows.length ? '<div class="nova-admin-proxy-list">' + rows.map(proxyRecord).join("") + "</div>" : emptyState("No matching records", "Change the filters and try again.");
      wireValueActions(target);
      target.querySelectorAll("[data-ban-device]").forEach(function (banButton) {
        banButton.onclick = function () { openDeviceBanDialog(banButton.dataset.banDevice, banButton.dataset.deviceAccount || ""); };
      });
      toast("Audited records opened", "success");
    } catch (error) {
      target.innerHTML = errorView(error.message); toast(error.message, "error");
      var retry = target.querySelector("#nova-admin-retry");
      if (retry) retry.onclick = loadProxy;
    }
    setBusy(button, false);
  }

  function proxyRecord(row) {
    var account = row.username || "Guest";
    return '<article class="nova-admin-proxy-record"><header><div><strong>' + esc(row.domain || "Unknown destination") + '</strong><span>' + esc(account) + ' · ' + esc(fmtTime(row.createdAt)) + '</span></div>' + statusBadge(row.result) + '</header><div class="nova-admin-proxy-destination"><label>Destination URL</label><div><code>' + esc(row.url || "—") + '</code><button type="button" class="nova-admin-value-action" data-copy-value="' + esc(row.url || "") + '" title="Copy full URL" aria-label="Copy full URL">' + icons.copy + '</button></div></div><footer><div class="nova-admin-device-value"><label>Device hash</label><code>' + esc(row.deviceId || "—") + '</code></div><div class="nova-admin-record-actions"><button type="button" class="nova-admin-secondary" data-copy-value="' + esc(row.deviceId || "") + '">' + icons.copy + '<span>Copy</span></button><button type="button" class="nova-admin-danger" data-ban-device="' + esc(row.deviceId || "") + '" data-device-account="' + esc(account) + '">' + icons.shield + '<span>Ban device</span></button></div></footer></article>';
  }

  async function loadDeviceBansView(content) {
    content.innerHTML = viewHeading("Security", "Device bans", "Block devices, set expirations, and review who applied each restriction.", '<button type="button" class="nova-admin-primary" id="nova-admin-add-device-ban">' + icons.shield + '<span>Ban device</span></button>') + '<div class="nova-admin-privacy-note"><strong>Device hashes only</strong><span>Nova stores one-way hashes, not the device identifier sent by the browser.</span></div><div id="nova-admin-device-bans-list">' + loadingView() + '</div>';
    document.getElementById("nova-admin-add-device-ban").onclick = function () { openDeviceBanDialog("", ""); };
    await refreshDeviceBans();
  }

  async function refreshDeviceBans() {
    var target = document.getElementById("nova-admin-device-bans-list");
    if (!target) return;
    target.innerHTML = loadingView();
    try {
      var data = await NovaAPI.adminDeviceBans();
      state.deviceBans = data.bans || [];
      target.innerHTML = state.deviceBans.length ? '<div class="nova-admin-device-ban-list">' + state.deviceBans.map(deviceBanRecord).join("") + '</div>' : emptyState("No devices are banned", "New device restrictions will appear here.");
      wireValueActions(target);
      target.querySelectorAll("[data-unban-device]").forEach(function (button) {
        button.onclick = function () { openDeviceUnbanDialog(button.dataset.unbanDevice); };
      });
    } catch (error) {
      target.innerHTML = errorView(error.message);
      var retry = target.querySelector("#nova-admin-retry");
      if (retry) retry.onclick = refreshDeviceBans;
    }
  }

  function deviceBanRecord(ban) {
    var expiry = ban.expiresAt ? fmtTime(ban.expiresAt) : "Permanent";
    return '<article class="nova-admin-device-ban-record"><header><div><span>Restricted device</span><strong>' + esc(ban.username ? "@" + ban.username : "Unlinked device") + '</strong></div>' + statusBadge("banned") + '</header><div class="nova-admin-device-ban-hash"><code>' + esc(ban.deviceId) + '</code><button type="button" class="nova-admin-value-action" data-copy-value="' + esc(ban.deviceId) + '" title="Copy device hash" aria-label="Copy device hash">' + icons.copy + '</button></div><p>' + esc(ban.reason) + '</p><footer><div><span>Banned by <strong>' + esc(ban.bannedBy ? "@" + ban.bannedBy : "System") + '</strong></span><span>Created <strong>' + esc(fmtTime(ban.createdAt)) + '</strong></span><span>Expires <strong>' + esc(expiry) + '</strong></span>' + (ban.lastSeenAt ? '<span>Last seen <strong>' + esc(fmtTime(ban.lastSeenAt)) + '</strong></span>' : '') + '</div><button type="button" class="nova-admin-secondary" data-unban-device="' + esc(ban.deviceId) + '">Remove ban</button></footer></article>';
  }

  function openDeviceBanDialog(deviceId, account) {
    var layer = document.getElementById("nova-admin-layer");
    if (!layer) return;
    layer.innerHTML = '<div class="nova-admin-layer-backdrop" data-close-layer></div><div class="nova-admin-dialog" role="dialog" aria-modal="true"><header><div><span>Device security</span><h2>Ban device</h2></div><button type="button" class="nova-admin-icon-btn" data-close-layer aria-label="Close">' + icons.close + '</button></header>' + (account ? '<p>This device was most recently used by <strong>' + esc(account === "Guest" ? account : "@" + account) + '</strong>.</p>' : '') + '<label for="nova-admin-ban-device-id">Device hash</label><input id="nova-admin-ban-device-id" autocomplete="off" spellcheck="false" value="' + esc(deviceId) + '" placeholder="Paste the complete hash from Proxy Activity"><label for="nova-admin-ban-duration">Duration</label><select id="nova-admin-ban-duration"><option value="0">Permanent</option><option value="1">24 hours</option><option value="7">7 days</option><option value="30">30 days</option></select><label for="nova-admin-ban-reason">Reason</label><textarea id="nova-admin-ban-reason" placeholder="Explain why this device is being restricted"></textarea><footer><button type="button" class="nova-admin-secondary" data-close-layer>Cancel</button><button type="button" class="nova-admin-danger" id="nova-admin-ban-confirm">Ban device</button></footer></div>';
    layer.classList.add("open");
    layer.querySelectorAll("[data-close-layer]").forEach(function (button) { button.onclick = closeLayer; });
    var first = document.getElementById(deviceId ? "nova-admin-ban-reason" : "nova-admin-ban-device-id");
    if (first) first.focus();
    document.getElementById("nova-admin-ban-confirm").onclick = async function () {
      var button = this;
      var hash = document.getElementById("nova-admin-ban-device-id").value.trim();
      var reason = document.getElementById("nova-admin-ban-reason").value.trim();
      var days = Number(document.getElementById("nova-admin-ban-duration").value || 0);
      if (!hash) return toast("Paste a complete device hash", "error");
      if (!reason) return toast("Add a reason for this ban", "error");
      setBusy(button, true, "Banning");
      try {
        await NovaAPI.adminBanDevice({ deviceId: hash, reason: reason, expiresAt: days ? Date.now() + days * 86400000 : null });
        toast("Device banned", "success"); closeLayer();
        if (state.view === "devices") await refreshDeviceBans();
      } catch (error) { toast(error.message, "error"); setBusy(button, false); }
    };
  }

  function openDeviceUnbanDialog(deviceId) {
    var layer = document.getElementById("nova-admin-layer");
    if (!layer) return;
    layer.innerHTML = '<div class="nova-admin-layer-backdrop" data-close-layer></div><div class="nova-admin-dialog" role="dialog" aria-modal="true"><header><div><span>Device security</span><h2>Remove device ban</h2></div><button type="button" class="nova-admin-icon-btn" data-close-layer aria-label="Close">' + icons.close + '</button></header><p><code>' + esc(deviceId) + '</code></p><label for="nova-admin-unban-reason">Audit reason</label><textarea id="nova-admin-unban-reason" placeholder="Explain why access is being restored"></textarea><footer><button type="button" class="nova-admin-secondary" data-close-layer>Cancel</button><button type="button" class="nova-admin-primary" id="nova-admin-unban-confirm">Remove ban</button></footer></div>';
    layer.classList.add("open");
    layer.querySelectorAll("[data-close-layer]").forEach(function (button) { button.onclick = closeLayer; });
    document.getElementById("nova-admin-unban-reason").focus();
    document.getElementById("nova-admin-unban-confirm").onclick = async function () {
      var button = this;
      var reason = document.getElementById("nova-admin-unban-reason").value.trim();
      if (!reason) return toast("Add an audit reason", "error");
      setBusy(button, true, "Removing");
      try { await NovaAPI.adminUnbanDevice({ deviceId: deviceId, reason: reason }); toast("Device ban removed", "success"); closeLayer(); await refreshDeviceBans(); }
      catch (error) { toast(error.message, "error"); setBusy(button, false); }
    };
  }

  function wireValueActions(root) {
    root.querySelectorAll("[data-copy-value]").forEach(function (button) {
      button.onclick = function () { copyValue(button.dataset.copyValue || ""); };
    });
  }

  async function copyValue(value) {
    if (!value) return toast("Nothing to copy", "error");
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value);
      else {
        var input = document.createElement("textarea");
        input.value = value; input.style.position = "fixed"; input.style.opacity = "0";
        document.body.appendChild(input); input.select(); document.execCommand("copy"); input.remove();
      }
      toast("Copied to clipboard", "success");
    } catch (error) { toast("Could not copy that value", "error"); }
  }

  async function loadAuditView(content) {
    content.innerHTML = viewHeading("Security", "Audit log", "Immutable staff and privacy-sensitive actions.") + loadingView();
    var data = await NovaAPI.adminAudit();
    if (state.view !== "audit") return;
    var rows = data.logs || [];
    content.innerHTML = viewHeading("Security", "Audit log", "Immutable staff and privacy-sensitive actions.") + (rows.length ? '<div class="nova-admin-table-wrap"><table class="nova-admin-table nova-admin-audit-table"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Reason</th></tr></thead><tbody>' + rows.map(function (row) { return '<tr><td><time>' + esc(fmtTime(row.createdAt)) + '</time></td><td><strong>' + esc(row.actor || "System") + '</strong></td><td><code>' + esc(row.action) + '</code></td><td>' + esc(row.targetType || "—") + (row.targetId ? '<small title="' + esc(row.targetId) + '">' + esc(String(row.targetId).slice(0, 12)) + "</small>" : "") + '</td><td title="' + esc(row.reason) + '">' + esc(row.reason || "—") + "</td></tr>"; }).join("") + "</tbody></table></div>" : emptyState("No audit entries", "Staff actions will appear here."));
  }

  function emptyInline(message) { return '<div class="nova-admin-empty-inline">' + icons.check + '<span>' + esc(message) + "</span></div>"; }
  function emptyState(title, message) { return '<div class="nova-admin-state"><strong>' + esc(title) + '</strong><span>' + esc(message) + "</span></div>"; }

  window.addEventListener("nova:session-changed", function (event) { var page = document.getElementById("page-dev"); syncAccess(event.detail.user); if (page && page.classList.contains("active")) mount(); });
  document.addEventListener("nova:page-change", function (event) { if (event.detail && event.detail.page === "dev") setTimeout(mount, 0); });
  document.addEventListener("keydown", function (event) { if (event.key === "Escape" && document.getElementById("nova-admin-layer") && document.getElementById("nova-admin-layer").classList.contains("open")) closeLayer(); });
  document.addEventListener("DOMContentLoaded", function () { syncAccess(window.__novaV7User); });
})();
