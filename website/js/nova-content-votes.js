(function () {
  "use strict";

  var state = { kind: "game", suggestions: [], busy: false, lastFocus: null };
  var voteIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14l2 3v6H3v-6l2-3Z"/><path d="M7 3h10v12H7z"/><path d="m9.5 8 1.7 1.7 3.5-3.7"/></svg>';

  function esc(value) {
    var node = document.createElement("span");
    node.textContent = value == null ? "" : String(value);
    return node.innerHTML;
  }

  function ensureModal() {
    var modal = document.getElementById("nova-content-vote-modal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "nova-content-vote-modal";
    modal.className = "nova-content-vote-modal";
    modal.hidden = true;
    modal.innerHTML = '<div class="nova-content-vote-backdrop" data-vote-close></div>' +
      '<section class="nova-content-vote-dialog" role="dialog" aria-modal="true" aria-labelledby="nova-content-vote-title">' +
        '<header><div class="nova-content-vote-mark">' + voteIcon + '</div><div><span>COMMUNITY PICKS</span><h2 id="nova-content-vote-title">Vote for Apps &amp; Games</h2><p>Help choose what Nova adds next.</p></div><button type="button" class="nova-content-vote-close" data-vote-close aria-label="Close voting">&times;</button></header>' +
        '<div class="nova-content-vote-tabs" role="tablist" aria-label="Suggestion type"><button type="button" role="tab" data-vote-kind="game">Games</button><button type="button" role="tab" data-vote-kind="app">Apps</button></div>' +
        '<form id="nova-content-vote-form"><label for="nova-content-vote-input">What should Nova add?</label><div><input id="nova-content-vote-input" maxlength="80" autocomplete="off" placeholder="Enter an app or game name" required><button type="submit">Suggest + vote</button></div><p id="nova-content-vote-feedback" role="status" aria-live="polite"></p></form>' +
        '<div class="nova-content-vote-list-head"><div><strong>Community ranking</strong><span>One vote per Nova account</span></div><button type="button" id="nova-content-vote-refresh" aria-label="Refresh suggestions">Refresh</button></div>' +
        '<div class="nova-content-vote-list" id="nova-content-vote-list"></div>' +
      '</section>';
    document.body.appendChild(modal);
    modal.querySelectorAll("[data-vote-close]").forEach(function (button) { button.addEventListener("click", close); });
    modal.querySelectorAll("[data-vote-kind]").forEach(function (button) { button.addEventListener("click", function () { setKind(button.dataset.voteKind); }); });
    document.getElementById("nova-content-vote-refresh").addEventListener("click", load);
    document.getElementById("nova-content-vote-form").addEventListener("submit", suggest);
    return modal;
  }

  function feedback(message, error) {
    var node = document.getElementById("nova-content-vote-feedback");
    if (!node) return;
    node.textContent = message || "";
    node.classList.toggle("is-error", !!error);
  }

  function render() {
    var modal = ensureModal();
    modal.querySelectorAll("[data-vote-kind]").forEach(function (button) {
      var active = button.dataset.voteKind === state.kind;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    var input = document.getElementById("nova-content-vote-input");
    input.placeholder = state.kind === "game" ? "Example: Friday Night Funkin" : "Example: Photopea";
    var list = document.getElementById("nova-content-vote-list");
    if (!state.suggestions.length) {
      list.innerHTML = '<div class="nova-content-vote-empty">No ' + (state.kind === "game" ? "games" : "apps") + ' suggested yet. Be the first.</div>';
      return;
    }
    list.innerHTML = state.suggestions.map(function (item, index) {
      var status = item.status === "open" ? "" : '<span class="nova-content-vote-status is-' + esc(item.status) + '">' + esc(item.status) + '</span>';
      return '<article class="nova-content-vote-row"><span class="nova-content-vote-rank">' + (index + 1) + '</span><div><strong>' + esc(item.title) + '</strong>' + status + '</div><button type="button" data-suggestion-id="' + esc(item.id) + '" class="' + (item.voted ? "voted" : "") + '" aria-pressed="' + String(!!item.voted) + '" aria-label="' + (item.voted ? "Remove vote from " : "Vote for ") + esc(item.title) + '"><span>▲</span><b>' + Number(item.votes || 0).toLocaleString() + '</b></button></article>';
    }).join("");
    list.querySelectorAll("[data-suggestion-id]").forEach(function (button) { button.addEventListener("click", function () { toggle(button.dataset.suggestionId, button); }); });
  }

  async function load() {
    var list = document.getElementById("nova-content-vote-list");
    if (list) list.innerHTML = '<div class="nova-content-vote-loading"><i></i>Loading community votes</div>';
    feedback("");
    try {
      var data = await NovaAPI.contentVotes(state.kind);
      state.suggestions = data.suggestions || [];
      render();
    } catch (error) {
      if (list) list.innerHTML = '<div class="nova-content-vote-empty is-error">' + esc(error.message || "Could not load votes") + '</div>';
      if (error.code === "AUTH_REQUIRED") feedback("Sign in to suggest and vote.", true);
    }
  }

  async function setKind(kind) {
    if (kind === state.kind) return;
    state.kind = kind === "app" ? "app" : "game";
    state.suggestions = [];
    render();
    await load();
  }

  async function suggest(event) {
    event.preventDefault();
    if (state.busy) return;
    var input = document.getElementById("nova-content-vote-input");
    var button = event.currentTarget.querySelector("button[type=submit]");
    var title = input.value.trim();
    if (title.length < 2) return feedback("Enter a name with at least two characters.", true);
    state.busy = true; button.disabled = true; button.textContent = "Submitting…"; feedback("");
    try {
      await NovaAPI.updateContentVote({ action: "suggest", kind: state.kind, title: title });
      input.value = "";
      feedback("Suggestion added and your vote counted.");
      await load();
    } catch (error) { feedback(error.message || "Could not submit that suggestion.", true); }
    finally { state.busy = false; button.disabled = false; button.textContent = "Suggest + vote"; }
  }

  async function toggle(id, button) {
    if (state.busy) return;
    state.busy = true; button.disabled = true;
    try {
      var data = await NovaAPI.updateContentVote({ action: "toggle", suggestionId: id });
      state.suggestions = state.suggestions.map(function (item) { return item.id === id ? data.suggestion : item; });
      state.suggestions.sort(function (a, b) { return b.votes - a.votes; });
      render();
    } catch (error) { feedback(error.message || "Could not update your vote.", true); }
    finally { state.busy = false; }
  }

  function open(kind) {
    state.kind = kind === "app" ? "app" : "game";
    state.lastFocus = document.activeElement;
    var modal = ensureModal();
    modal.hidden = false;
    document.body.classList.add("nova-content-vote-open");
    render();
    modal.querySelector("[data-vote-close]").focus();
    load();
  }

  function close() {
    var modal = document.getElementById("nova-content-vote-modal");
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("nova-content-vote-open");
    if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
  }

  function decorateCards() {
    document.querySelectorAll('.game-card').forEach(function (card) {
      var name = card.querySelector('.game-name');
      if (!name || name.textContent.trim() !== 'Vote for Apps & Games') return;
      card.classList.add('nova-content-vote-card');
      if (card.dataset.contentVoteWired) return;
      card.dataset.contentVoteWired = '1';
      card.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        open(card.closest('#page-apps') ? 'app' : 'game');
      }, true);
    });
  }

  document.addEventListener("keydown", function (event) {
    var modal = ensureModal();
    if (modal.hidden) return;
    if (event.key === "Escape") return close();
    if (event.key !== "Tab") return;
    var focusable = Array.from(modal.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled])')).filter(function (node) { return node.offsetParent !== null; });
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  window.NovaContentVote = { open: open, close: close };
  function boot() {
    decorateCards();
    var root = document.body || document.documentElement;
    if (root) new MutationObserver(decorateCards).observe(root, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
