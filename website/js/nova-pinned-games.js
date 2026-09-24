// Keep featured Nova games in their requested position without changing the
// existing search, rating, favorites, or sort behavior.
(function () {
  'use strict';

  var pinnedName = 'Nova Eaglercraft';

  function pinCard(grid) {
    if (!grid) return;
    var cards = Array.prototype.slice.call(grid.querySelectorAll('.game-card'));
    var card = cards.find(function (item) {
      var label = item.querySelector('.game-name');
      return label && label.textContent.trim() === pinnedName;
    });
    if (card && grid.firstElementChild !== card) grid.insertBefore(card, grid.firstElementChild);
  }

  function pinAll() {
    pinCard(document.getElementById('game-grid'));
    pinCard(document.getElementById('game-player-grid'));
  }

  var observer = new MutationObserver(pinAll);
  ['game-grid', 'game-player-grid'].forEach(function (id) {
    var grid = document.getElementById(id);
    if (grid) observer.observe(grid, { childList: true });
  });
  pinAll();
}());
