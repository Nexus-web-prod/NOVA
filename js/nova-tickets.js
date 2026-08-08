(function () {
  "use strict";

  var tickets = [];
  var activeTicketId = "";
  var detailRequest = 0;
  var pollTimer = null;
  var refreshInFlight = false;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function currentUser() {
    if (window.__novaV7User) return window.__novaV7User;
    try { return JSON.parse(localStorage.getItem("nova_account") || "null"); }
    catch (error) { return null; }
  }

  function ticketApp() { return document.getElementById("nova-ticket-app"); }
  function ticketShell() { return document.getElementById("nova-ticket-shell"); }
  function supportVisible() {
    var page = document.getElementById("page-support");
    return !!(page && page.classList.contains("active"));
  }

  function relativeTime(timestamp) {
    var diff = Math.max(0, Date.now() - Number(timestamp || 0));
    if (diff < 60000) return "just now";
    if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
    if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
    return new Date(Number(timestamp || 0)).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function fullTime(timestamp) {
    return new Date(Number(timestamp || 0)).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function label(value) {
    return String(value || "").replace(/_/g, " ").replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
  }

  function statusPill(ticket) {
    return '<span class="nova-ticket-status" data-status="' + esc(ticket.status) + '">' + esc(label(ticket.status)) + "</span>";
  }

  function renderSignedOut() {
    var shell = ticketShell();
    if (!shell) return;
    shell.innerHTML = '<div class="nova-ticket-signout" style="grid-column:1/-1"><strong>Sign in for private support</strong><span>Your tickets are tied to your Nova account so only you and staff can read them.</span><button type="button" class="nova-ticket-signin">Sign in</button></div>';
  }

  function renderLoading() {
    var shell = ticketShell();
    if (shell) shell.innerHTML = '<div class="nova-ticket-loading" style="grid-column:1/-1">Loading your tickets...</div>';
  }

  function renderError(error) {
    var shell = ticketShell();
    if (!shell) return;
    shell.innerHTML = '<div class="nova-ticket-error" style="grid-column:1/-1"><strong>Support could not load</strong><span>' + esc(error && error.message || "Try again in a moment.") + '</span><button type="button" class="nova-ticket-action" data-ticket-retry>Retry</button></div>';
  }

  function listMarkup() {
    if (!tickets.length) {
      return '<div class="nova-ticket-list-title">YOUR QUEUE</div><div class="nova-ticket-empty"><strong>No tickets yet</strong><span>Open one when you need help from Nova staff.</span><button type="button" data-new-ticket>Open a ticket</button></div>';
    }
    return '<div class="nova-ticket-list-title">YOUR QUEUE · ' + tickets.length + '</div><div class="nova-ticket-list">' + tickets.map(function (ticket) {
      return '<button type="button" class="nova-ticket-list-item' + (ticket.id === activeTicketId ? " active" : "") + '" data-ticket-id="' + esc(ticket.id) + '">' +
        '<span class="nova-ticket-list-top"><strong>' + esc(ticket.subject) + "</strong>" + statusPill(ticket) + "</span>" +
        '<p>' + esc(ticket.lastMessage || "No messages yet") + '</p><time datetime="' + new Date(ticket.updatedAt).toISOString() + '">' + esc(relativeTime(ticket.updatedAt)) + "</time></button>";
    }).join("") + "</div>";
  }

  function renderLayout() {
    var shell = ticketShell();
    if (!shell) return;
    shell.innerHTML = '<aside class="nova-ticket-list-panel">' + listMarkup() + '</aside><div class="nova-ticket-thread" id="nova-ticket-thread">' +
      (activeTicketId ? '<div class="nova-ticket-loading">Opening ticket...</div>' : '<div class="nova-ticket-empty"><strong>Select a ticket</strong><span>Your private conversation with staff will appear here.</span></div>') + "</div>";
  }

  function renderThread(data) {
    var thread = document.getElementById("nova-ticket-thread");
    if (!thread || !data || !data.ticket) return;
    var ticket = data.ticket;
    var closed = ticket.status === "closed";
    var messages = Array.isArray(data.messages) ? data.messages : [];
    thread.innerHTML = '<header class="nova-ticket-thread-head"><div><h3>' + esc(ticket.subject) + '</h3><div class="nova-ticket-thread-meta">' +
      statusPill(ticket) + '<span class="nova-ticket-category">' + esc(label(ticket.category)) + '</span><span class="nova-ticket-id">' + esc(ticket.id) + "</span></div></div>" +
      '<div class="nova-ticket-actions"><button type="button" class="nova-ticket-action' + (closed ? "" : " danger") + '" data-ticket-status="' + (closed ? "reopen" : "close") + '">' + (closed ? "Reopen" : "Close") + "</button></div></header>" +
      '<div class="nova-ticket-messages" id="nova-ticket-messages">' + messages.map(function (message) {
        var avatar = message.avatarUrl ? '<img src="' + esc(message.avatarUrl) + '" alt="">' : esc((message.displayName || message.username || "N").slice(0, 1).toUpperCase());
        return '<article class="nova-ticket-message"><div class="nova-ticket-message-avatar">' + avatar + '</div><div><div class="nova-ticket-message-head"><strong>' +
          esc(message.displayName || message.username) + "</strong>" + (message.isStaff ? '<span class="nova-ticket-staff">NOVA STAFF</span>' : "") +
          '<time datetime="' + new Date(message.createdAt).toISOString() + '">' + esc(fullTime(message.createdAt)) + '</time></div><div class="nova-ticket-message-body">' + esc(message.body) + "</div></div></article>";
      }).join("") + '</div><form class="nova-ticket-compose" id="nova-ticket-compose"><textarea name="message" maxlength="4000" placeholder="' + (closed ? "Reopen this ticket to reply" : "Reply to Nova support...") + '" aria-label="Ticket reply" ' + (closed ? "disabled" : "") + '></textarea><button class="nova-ticket-send" type="submit" ' + (closed ? "disabled" : "") + ">Send</button></form>";
    var messagesEl = document.getElementById("nova-ticket-messages");
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function loadDetail(ticketId, quiet) {
    var requestId = ++detailRequest;
    try {
      var data = await window.NovaAPI.supportTicket(ticketId);
      if (requestId !== detailRequest || ticketId !== activeTicketId) return;
      renderThread(data);
    } catch (error) {
      if (quiet || requestId !== detailRequest) return;
      var thread = document.getElementById("nova-ticket-thread");
      if (thread) thread.innerHTML = '<div class="nova-ticket-error"><strong>Ticket could not load</strong><span>' + esc(error.message) + "</span></div>";
    }
  }

  async function refresh(options) {
    options = options || {};
    if (!ticketApp() || !supportVisible()) return;
    if (!currentUser()) { renderSignedOut(); return; }
    if (!window.NovaAPI) return;
    if (refreshInFlight) return;
    refreshInFlight = true;
    if (!options.quiet) renderLoading();
    try {
      var data = await window.NovaAPI.supportTickets();
      tickets = Array.isArray(data.tickets) ? data.tickets : [];
      if (activeTicketId && !tickets.some(function (ticket) { return ticket.id === activeTicketId; })) activeTicketId = "";
      if (!activeTicketId && tickets.length) activeTicketId = tickets[0].id;
      renderLayout();
      if (activeTicketId) await loadDetail(activeTicketId, !!options.quiet);
    } catch (error) {
      if (!options.quiet) renderError(error);
    } finally { refreshInFlight = false; }
  }

  function ensureModal() {
    var layer = document.getElementById("nova-ticket-modal-layer");
    if (layer) return layer;
    layer = document.createElement("div");
    layer.id = "nova-ticket-modal-layer";
    layer.className = "nova-ticket-modal-layer";
    layer.hidden = true;
    layer.addEventListener("click", function (event) { if (event.target === layer) closeModal(); });
    layer.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
    document.body.appendChild(layer);
    return layer;
  }

  function openModal(preset) {
    if (!currentUser()) {
      if (window.NovaAccount && window.NovaAccount.open) window.NovaAccount.open("login");
      return;
    }
    preset = preset || {};
    var layer = ensureModal();
    layer.innerHTML = '<div class="nova-ticket-modal" role="dialog" aria-modal="true" aria-labelledby="nova-ticket-modal-title"><div class="nova-ticket-modal-head"><h3 id="nova-ticket-modal-title">Open a support ticket</h3><button class="nova-ticket-modal-close" type="button" aria-label="Close">×</button></div>' +
      '<form class="nova-ticket-modal-form" id="nova-ticket-form"><label>Category<select name="category"><option value="bug">Bug</option><option value="feature">Feature request</option><option value="account">Account help</option><option value="safety">Safety or user report</option><option value="other">Other</option></select></label>' +
      '<label>Subject<input name="subject" maxlength="100" minlength="5" required placeholder="Short summary" value="' + esc(preset.subject || "") + '"></label>' +
      '<label>What happened?<textarea name="message" maxlength="4000" minlength="10" required placeholder="Include the details staff need to help."></textarea></label><div class="nova-ticket-form-error" aria-live="polite"></div>' +
      '<div class="nova-ticket-modal-foot"><button type="button" class="secondary" data-ticket-cancel>Cancel</button><button type="submit">Open ticket</button></div></form></div>';
    layer.hidden = false;
    var category = layer.querySelector('select[name="category"]');
    if (category) category.value = preset.category || "other";
    layer.querySelector(".nova-ticket-modal-close").addEventListener("click", closeModal);
    layer.querySelector("[data-ticket-cancel]").addEventListener("click", closeModal);
    layer.querySelector("form").addEventListener("submit", submitNewTicket);
    setTimeout(function () {
      var focus = layer.querySelector(preset.subject ? "textarea" : 'input[name="subject"]');
      if (focus) focus.focus();
    }, 0);
  }

  function closeModal() {
    var layer = document.getElementById("nova-ticket-modal-layer");
    if (layer) { layer.hidden = true; layer.innerHTML = ""; }
  }

  async function submitNewTicket(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var submit = form.querySelector('button[type="submit"]');
    var errorEl = form.querySelector(".nova-ticket-form-error");
    submit.disabled = true;
    errorEl.textContent = "";
    try {
      var data = await window.NovaAPI.createSupportTicket({
        category: form.elements.category.value,
        subject: form.elements.subject.value,
        message: form.elements.message.value
      });
      activeTicketId = data.ticket.id;
      closeModal();
      await refresh();
    } catch (error) {
      errorEl.textContent = error.message;
      submit.disabled = false;
    }
  }

  async function submitReply(form) {
    var textarea = form.elements.message;
    var message = textarea.value.trim();
    if (!message || !activeTicketId) return;
    var button = form.querySelector("button");
    button.disabled = true;
    textarea.disabled = true;
    try {
      await window.NovaAPI.replySupportTicket(activeTicketId, message);
      textarea.value = "";
      await refresh({ quiet: true });
    } catch (error) {
      textarea.value = message;
      button.disabled = false;
      textarea.disabled = false;
      textarea.setCustomValidity(error.message);
      textarea.reportValidity();
      setTimeout(function () { textarea.setCustomValidity(""); }, 1000);
    }
  }

  async function changeStatus(action, button) {
    if (!activeTicketId) return;
    button.disabled = true;
    try {
      await window.NovaAPI.setSupportTicketStatus(activeTicketId, action);
      await refresh({ quiet: true });
    } catch (error) {
      button.disabled = false;
    }
  }

  function startPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(function () { if (supportVisible() && currentUser()) refresh({ quiet: true }); }, 15000);
  }

  document.addEventListener("click", function (event) {
    var newButton = event.target.closest("#nova-ticket-new-btn,[data-new-ticket]");
    if (newButton) { event.preventDefault(); openModal(); return; }
    var signIn = event.target.closest(".nova-ticket-signin");
    if (signIn) { if (window.NovaAccount && window.NovaAccount.open) window.NovaAccount.open("login"); return; }
    var retry = event.target.closest("[data-ticket-retry]");
    if (retry) { refresh(); return; }
    var item = event.target.closest("[data-ticket-id]");
    if (item) {
      activeTicketId = item.dataset.ticketId;
      renderLayout();
      loadDetail(activeTicketId);
      return;
    }
    var status = event.target.closest("[data-ticket-status]");
    if (status) changeStatus(status.dataset.ticketStatus, status);
  });

  document.addEventListener("submit", function (event) {
    if (event.target.id === "nova-ticket-compose") { event.preventDefault(); submitReply(event.target); }
  });

  document.addEventListener("click", function (event) {
    var button = event.target.closest("#support-bug-btn,#support-feature-btn,#support-report-user-btn");
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (button.id === "support-bug-btn") openModal({ category: "bug", subject: "Bug: " });
    else if (button.id === "support-feature-btn") openModal({ category: "feature", subject: "Feature: " });
    else {
      var username = (document.getElementById("support-report-user-search") || {}).value || "";
      openModal({ category: "safety", subject: username.trim() ? "Report user: " + username.trim() : "Report a user" });
    }
  }, true);

  document.addEventListener("nova:page-change", function (event) {
    if (event.detail && event.detail.page === "support") refresh();
  });
  window.addEventListener("nova:session-changed", function () { if (supportVisible()) refresh(); });
  document.addEventListener("keydown", function (event) { if (event.key === "Escape") closeModal(); });
  document.addEventListener("DOMContentLoaded", function () { startPolling(); if (supportVisible()) refresh(); });

  window.NovaTickets = { open: openModal, refresh: refresh };
})();
