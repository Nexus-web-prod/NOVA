(function () {
  "use strict";

  var panel = document.getElementById("sn-referral-panel");
  var trialButton = document.getElementById("plans-sn-trial-btn");
  var note = document.getElementById("plans-sn-cta-note");
  var count = document.getElementById("sn-referral-count");
  var form = document.getElementById("sn-referral-form");
  var username = document.getElementById("sn-referral-username");
  var sendButton = document.getElementById("sn-referral-send");
  var feedback = document.getElementById("sn-referral-feedback");
  var list = document.getElementById("sn-referral-list");
  var incoming = document.getElementById("sn-referral-incoming");
  var loading = false;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function account() {
    try { return JSON.parse(localStorage.getItem("nova_account") || "null"); } catch (error) { return null; }
  }

  function dateLabel(value) {
    if (!value) return "No expiry";
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
  }

  function setFeedback(message, type) {
    if (!feedback) return;
    feedback.textContent = message || "";
    feedback.className = "sn-referral-feedback" + (type ? " is-" + type : "");
  }

  async function refreshAccount() {
    if (!window.NovaAPI) return;
    var result = await window.NovaAPI.me();
    window.NovaAPI.cacheUser(result.user || null);
  }

  function renderIncoming(items) {
    if (!incoming) return;
    incoming.hidden = !items.length;
    incoming.innerHTML = items.map(function (item) {
      return '<div class="sn-referral-invite"><span class="sn-referral-person"><strong>@' + esc(item.fromUsername) + '</strong><small>invited you to try Supernova for 7 days</small></span><span class="sn-referral-actions"><button class="sn-referral-action sn-referral-action--secondary" type="button" data-referral-action="decline" data-referral-id="' + esc(item.id) + '">Decline</button><button class="sn-referral-action" type="button" data-referral-action="accept" data-referral-id="' + esc(item.id) + '">Accept</button></span></div>';
    }).join("");
  }

  function renderSent(items) {
    if (!list) return;
    list.innerHTML = items.length ? items.map(function (item) {
      var detail = item.status === "accepted" && item.expiresAt ? "Access ends " + dateLabel(item.expiresAt) : item.status;
      return '<div class="sn-referral-record"><span class="sn-referral-person"><strong>@' + esc(item.username) + '</strong><small>' + esc(detail) + '</small></span><span class="sn-referral-count">' + esc(item.status) + '</span></div>';
    }).join("") : '<div class="sn-referral-empty">No referral invites sent yet.</div>';
  }

  function render(data) {
    var acct = account();
    if (!acct || !panel) {
      if (panel) panel.hidden = true;
      if (trialButton) trialButton.hidden = true;
      return;
    }
    var referrals = data.referrals || { remaining: 0, limit: 5, sent: [], received: [] };
    panel.hidden = false;
    if (trialButton) trialButton.hidden = !data.trial.eligible;
    if (note) {
      if (data.active && data.membership) note.textContent = data.membership.expiresAt ? "Supernova active until " + dateLabel(data.membership.expiresAt) : "You have Supernova Pro";
      else if (data.trial.claimed) note.textContent = "Your free device trial has already been used";
      else note.textContent = "Try Supernova free on this device";
    }
    if (count) count.textContent = referrals.remaining + " of " + referrals.limit + " invites left";
    if (form) form.hidden = !data.active;
    if (sendButton) sendButton.disabled = referrals.remaining < 1;
    renderIncoming(referrals.received || []);
    renderSent(referrals.sent || []);
  }

  async function load() {
    if (loading || !window.NovaAPI || !account()) return;
    loading = true;
    try {
      render(await window.NovaAPI.supernovaAccess());
    } catch (error) {
      if (error && error.code !== "AUTH_REQUIRED") setFeedback(error.message || "Referral access could not be loaded.", "error");
    } finally {
      loading = false;
    }
  }

  if (trialButton) trialButton.addEventListener("click", async function () {
    trialButton.disabled = true;
    trialButton.textContent = "Starting trial…";
    try {
      var result = await window.NovaAPI.claimSupernovaTrial();
      await refreshAccount();
      setFeedback("Your 3-day Supernova trial is active until " + dateLabel(result.expiresAt) + ".", "success");
      await load();
    } catch (error) {
      setFeedback(error.message || "The trial could not be started.", "error");
      trialButton.disabled = false;
      trialButton.textContent = "Start free 3-day trial";
    }
  });

  if (form) form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var value = String(username.value || "").trim();
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(value)) {
      setFeedback("Enter a valid Nova username.", "error");
      username.focus();
      return;
    }
    sendButton.disabled = true;
    sendButton.textContent = "Sending…";
    try {
      await window.NovaAPI.createSupernovaReferral(value);
      username.value = "";
      setFeedback("Invite sent to @" + value + ".", "success");
      await load();
    } catch (error) {
      setFeedback(error.message || "The invite could not be sent.", "error");
    } finally {
      sendButton.textContent = "Send invite";
      if (!loading) sendButton.disabled = false;
    }
  });

  if (incoming) incoming.addEventListener("click", async function (event) {
    var button = event.target.closest("[data-referral-action]");
    if (!button) return;
    button.disabled = true;
    try {
      var action = button.dataset.referralAction;
      var result = await window.NovaAPI.respondSupernovaReferral(button.dataset.referralId, action);
      if (action === "accept") {
        await refreshAccount();
        setFeedback("Supernova is active until " + dateLabel(result.expiresAt) + ".", "success");
      } else setFeedback("Invite declined.", "success");
      await load();
    } catch (error) {
      setFeedback(error.message || "The invite could not be updated.", "error");
      button.disabled = false;
    }
  });

  document.addEventListener("nova:page-change", function (event) { if (event.detail && event.detail.page === "plans") load(); });
  document.addEventListener("nova:account-changed", load);
  document.addEventListener("nova:logout", function () { if (panel) panel.hidden = true; });
  setTimeout(load, 900);
})();
