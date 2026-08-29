(function () {
  "use strict";

  var state = { kind: "game", busy: false, lastFocus: null };
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
        '<header><div class="nova-content-vote-mark">' + voteIcon + '</div><div><span>CONTENT REQUEST</span><h2 id="nova-content-vote-title">Vote for a New Game</h2><p>Tell the Nova team what to add next.</p></div><button type="button" class="nova-content-vote-close" data-vote-close aria-label="Close voting">&times;</button></header>' +
        '<form id="nova-content-vote-form"><label for="nova-content-vote-input">What should Nova add?</label><div><input id="nova-content-vote-input" maxlength="80" autocomplete="off" placeholder="Enter an app or game name" required><button type="submit">Suggest + vote</button></div><p id="nova-content-vote-feedback" role="status" aria-live="polite"></p></form>' +
      '</section>';
    document.body.appendChild(modal);
    modal.querySelectorAll("[data-vote-close]").forEach(function (button) { button.addEventListener("click", close); });
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
    document.getElementById("nova-content-vote-title").textContent = state.kind === "game" ? "Vote for a New Game" : "Vote for a New App";
    var input = document.getElementById("nova-content-vote-input");
    input.placeholder = state.kind === "game" ? "Example: Friday Night Funkin" : "Example: Photopea";
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
      feedback("Your " + state.kind + " suggestion was sent to the Nova team.");
    } catch (error) { feedback(error.message || "Could not submit that suggestion.", true); }
    finally { state.busy = false; button.disabled = false; button.textContent = "Suggest + vote"; }
  }

  function open(kind) {
    state.kind = kind === "app" ? "app" : "game";
    state.lastFocus = document.activeElement;
    var modal = ensureModal();
    modal.hidden = false;
    document.body.classList.add("nova-content-vote-open");
    render();
    modal.querySelector("[data-vote-close]").focus();
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
    });
  }

  function handleVoteCardClick(event) {
    var card = event.target && event.target.closest ? event.target.closest('.game-card') : null;
    if (!card) return;
    var name = card.querySelector('.game-name');
    if (!name || name.textContent.trim() !== 'Vote for Apps & Games') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    open(card.closest('#page-apps') ? 'app' : 'game');
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
    document.addEventListener('click', handleVoteCardClick, true);
    document.addEventListener('nova:page-change', decorateCards);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
