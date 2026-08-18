// Nova game detail pages — one cinematic template for the full game catalog.
(function () {
  'use strict';

  var catalog = [];
  var activeGame = null;
  var catalogPromise = null;
  var previousGameScroll = 0;

  function slug(value) {
    return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function loadCatalog() {
    if (!catalogPromise) {
      catalogPromise = fetch('/games.json').then(function (response) {
        if (!response.ok) throw new Error('Game catalog unavailable');
        return response.json();
      }).then(function (items) {
        catalog = Array.isArray(items) ? items.filter(function (game) { return game && game.name && game.url && !game.blank; }) : [];
        return catalog;
      });
    }
    return catalogPromise;
  }

  function categoryFor(game) {
    if (Array.isArray(game.categories) && game.categories.length) return game.categories[0];
    var name = String(game.name || '').toLowerCase();
    if (/fnaf|horror|nightmare|zombie/.test(name)) return 'Horror';
    if (/basket|baseball|soccer|football|wrestle|boxing|sport/.test(name)) return 'Sports';
    if (/road|drive|racing|rider|moto|drift|kart|dash/.test(name)) return 'Racing';
    if (/puzzle|solitaire|chess|2048|quiz|brain/.test(name)) return 'Puzzle';
    if (/shooter|battle|fight|combat|war|doom/.test(name)) return 'Action';
    if (/mario|sonic|run|jump|parkour|obby/.test(name)) return 'Platformer';
    return 'Arcade';
  }

  function descriptionFor(game) {
    var copy = window.NOVA_GAME_COPY && window.NOVA_GAME_COPY[game.name];
    if (copy && copy.description) return copy.description;
    if (game.description) return game.description;
    var category = categoryFor(game).toLowerCase();
    return 'Jump into ' + game.name + ', a ' + category + ' game ready to play instantly inside Nova. Launch it without leaving your space, then come back anytime from Recently Played.';
  }

  function sourceFor(game) {
    var copy = window.NOVA_GAME_COPY && window.NOVA_GAME_COPY[game.name];
    return copy && copy.source || game.descriptionSource || game.url || '';
  }

  function myRatings() {
    try { return JSON.parse(localStorage.getItem('nova_my_ratings') || '{}'); }
    catch (error) { return {}; }
  }

  function renderPersonalRating(message) {
    var value = activeGame ? Number(myRatings()[activeGame.name] || 0) : 0;
    var buttons = Array.from(document.querySelectorAll('#game-detail-rating-stars button'));
    buttons.forEach(function (button) {
      var rating = Number(button.dataset.rating || 0);
      button.classList.toggle('selected', value > 0 && rating <= value);
      button.setAttribute('aria-checked', rating === value ? 'true' : 'false');
    });
    setText('game-detail-rating-feedback', message || (value ? 'Your rating: ' + value + ' out of 5' : 'Choose one to five stars'));
  }

  function submitPersonalRating(value) {
    if (!activeGame) return;
    var gameName = activeGame.name;
    var cards = Array.from(document.querySelectorAll('#page-games .game-card'));
    var matching = cards.find(function (card) { return card.querySelector('.game-name')?.textContent.trim() === gameName; });
    var star = matching?.querySelector('.game-star[data-val="' + value + '"]');
    if (!star) {
      setText('game-detail-rating-feedback', 'Rating is unavailable right now');
      return;
    }
    star.click();
    setText('game-detail-rating-feedback', 'Saving your rating…');
    var attempts = 0;
    var timer = setInterval(function () {
      attempts += 1;
      var saved = Number(myRatings()[gameName] || 0);
      if (saved === value) {
        clearInterval(timer);
        if (!activeGame || activeGame.name !== gameName) return;
        renderPersonalRating('Saved — ' + value + ' out of 5');
        var stats = activeGame ? statsFor(activeGame) : null;
        if (stats) {
          setText('game-detail-rating', stats.count ? Number(stats.avg || 0).toFixed(1) + ' / 5' : '—');
          setText('game-detail-rating-count', stats.count ? stats.count.toLocaleString() + (stats.count === 1 ? ' rating' : ' ratings') : 'Not rated yet');
        }
      } else if (attempts >= 12) {
        clearInterval(timer);
        if (!activeGame || activeGame.name !== gameName) return;
        renderPersonalRating('Could not save your rating — try again');
      }
    }, 250);
  }

  function statsFor(game) {
    try {
      var cache = JSON.parse(localStorage.getItem('nova_stats_cache') || '{}');
      return cache.data && cache.data[slug(game.name)] || { views: 0, avg: 0, count: 0 };
    } catch (error) {
      return { views: 0, avg: 0, count: 0 };
    }
  }

  function showCommunityStats(stats) {
    stats = stats || { views: 0, avg: 0, count: 0 };
    setText('game-detail-rating', stats.count ? Number(stats.avg || 0).toFixed(1) + ' / 5' : '—');
    setText('game-detail-rating-count', stats.count ? Number(stats.count).toLocaleString() + (Number(stats.count) === 1 ? ' rating' : ' ratings') : 'Not rated yet');
    setText('game-detail-plays', Number(stats.views || 0).toLocaleString());
  }

  async function refreshCommunityStats(game) {
    if (!game || !window.NovaAPI || typeof window.NovaAPI.gameStats !== 'function') return;
    var gameSlug = slug(game.name);
    try {
      var payload = await window.NovaAPI.gameStats([gameSlug]);
      var stats = payload && payload.stats && payload.stats[gameSlug];
      if (!stats) return;
      var cache = {};
      try { cache = JSON.parse(localStorage.getItem('nova_stats_cache') || '{}'); } catch (error) {}
      cache.data = cache.data || {};
      cache.data[gameSlug] = stats;
      cache.ts = Date.now();
      localStorage.setItem('nova_stats_cache', JSON.stringify(cache));
      if (activeGame && slug(activeGame.name) === gameSlug) showCommunityStats(stats);
    } catch (error) {}
  }

  function favorites() {
    try { return new Set(JSON.parse(localStorage.getItem('nova_favs') || '[]')); }
    catch (error) { return new Set(); }
  }

  function setText(id, value) {
    var element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function updateFavoriteButton() {
    var button = document.getElementById('game-detail-favorite');
    if (!button || !activeGame) return;
    var selected = favorites().has(activeGame.name);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    var label = button.querySelector('span');
    if (label) label.textContent = selected ? 'Favorited' : 'Favorite';
  }

  function renderRelated(game) {
    var grid = document.getElementById('game-detail-related-grid');
    if (!grid) return;
    var category = categoryFor(game);
    var pool = catalog.filter(function (item) { return item.name !== game.name; });
    var related = pool.filter(function (item) { return categoryFor(item) === category; });
    pool.forEach(function (item) { if (related.indexOf(item) < 0) related.push(item); });
    related = related.slice(0, 6);
    grid.innerHTML = '';
    related.forEach(function (item) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'game-detail-related-card';
      button.setAttribute('aria-label', 'View ' + item.name);
      var media;
      if (item.image) {
        media = document.createElement('img');
        media.src = item.image;
        media.alt = '';
        media.loading = 'lazy';
        media.onerror = function () { media.replaceWith(makeRelatedFallback()); };
      } else media = makeRelatedFallback();
      var label = document.createElement('span');
      label.textContent = item.name;
      button.appendChild(media);
      button.appendChild(label);
      button.addEventListener('click', function () { open(item, { history: true }); });
      grid.appendChild(button);
    });
  }

  function makeRelatedFallback() {
    var fallback = document.createElement('span');
    fallback.className = 'related-fallback';
    fallback.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 9h8l3 2.5a5 5 0 0 1 1.5 5.5l-.4 1.1a2.5 2.5 0 0 1-4.3.7L14.4 17H9.6l-1.4 1.8a2.5 2.5 0 0 1-4.3-.7L3.5 17A5 5 0 0 1 5 11.5L8 9Z"></path></svg>';
    return fallback;
  }

  function showDetailPage() {
    var games = document.getElementById('page-games');
    var detail = document.getElementById('page-game-detail');
    if (!detail) return;
    if (games && games.classList.contains('active')) previousGameScroll = games.scrollTop;
    document.querySelectorAll('.page.active').forEach(function (page) { page.classList.remove('active'); });
    detail.classList.add('active');
    detail.scrollTop = 0;
    document.querySelectorAll('.nav-tab').forEach(function (tab) { tab.classList.toggle('active', tab.dataset.page === 'games'); });
  }

  function open(game, options) {
    if (!game) return;
    options = options || {};
    activeGame = game;
    showDetailPage();
    var image = document.getElementById('game-detail-image');
    var fallback = document.getElementById('game-detail-art-fallback');
    var background = document.getElementById('game-detail-bg');
    var category = categoryFor(game);
    var stats = statsFor(game);
    setText('game-detail-title', game.name);
    setText('game-detail-description', descriptionFor(game));
    var source = document.getElementById('game-detail-description-source');
    if (source) {
      var sourceUrl = sourceFor(game);
      source.href = sourceUrl || '#';
      source.hidden = !/^https?:\/\//i.test(sourceUrl);
      try { source.title = 'Description based on ' + new URL(sourceUrl).hostname.replace(/^www\./, ''); }
      catch (error) { source.title = 'Game overview source'; }
    }
    setText('game-detail-rating', stats.count ? Number(stats.avg || 0).toFixed(1) + ' / 5' : '—');
    setText('game-detail-rating-count', stats.count ? stats.count.toLocaleString() + (stats.count === 1 ? ' rating' : ' ratings') : 'Not rated yet');
    setText('game-detail-plays', Number(stats.views || 0).toLocaleString());
    var meta = document.getElementById('game-detail-meta');
    if (meta) {
      meta.innerHTML = '';
      [category, 'Browser game', 'Nova ready'].forEach(function (value) {
        var chip = document.createElement('span');
        chip.textContent = value;
        meta.appendChild(chip);
      });
    }
    if (background) background.style.backgroundImage = game.image ? 'url("' + String(game.image).replace(/["\\]/g, '') + '")' : '';
    if (image) {
      image.style.display = game.image ? 'block' : 'none';
      image.src = game.image || '';
      image.alt = game.image ? game.name + ' game artwork' : '';
      image.onerror = function () { image.style.display = 'none'; if (fallback) fallback.style.display = 'grid'; };
    }
    if (fallback) fallback.style.display = game.image ? 'none' : 'grid';
    var art = document.getElementById('game-detail-art');
    if (art) art.setAttribute('aria-label', 'Play ' + game.name);
    updateFavoriteButton();
    renderPersonalRating();
    refreshCommunityStats(game);
    renderRelated(game);
    if (options.history !== false) {
      var nextUrl = new URL(location.href);
      nextUrl.searchParams.set('game', slug(game.name));
      history.pushState({ novaGameDetail: slug(game.name) }, '', nextUrl);
    }
    document.title = game.name + ' — Nova';
    setTimeout(function () { document.getElementById('game-detail-title')?.focus({ preventScroll: true }); }, 80);
  }

  function close(options) {
    options = options || {};
    var detail = document.getElementById('page-game-detail');
    var games = document.getElementById('page-games');
    detail?.classList.remove('active');
    games?.classList.add('active');
    if (games) games.scrollTop = previousGameScroll;
    document.querySelectorAll('.nav-tab').forEach(function (tab) { tab.classList.toggle('active', tab.dataset.page === 'games'); });
    activeGame = null;
    document.title = 'Nova 7.0';
    if (options.history !== false) {
      var nextUrl = new URL(location.href);
      nextUrl.searchParams.delete('game');
      history.pushState({}, '', nextUrl);
    }
    setTimeout(function () { document.querySelector('.nav-tab[data-page="games"]')?.focus(); }, 40);
  }

  function launch() {
    if (!activeGame || !/^https?:\/\//i.test(activeGame.url || '')) return;
    window.novaAddRecent?.(activeGame);
    window.novaIncrementViews?.(activeGame.name);
    window.goTo?.(activeGame.url);
  }

  function toggleFavorite() {
    if (!activeGame) return;
    var cards = Array.from(document.querySelectorAll('#page-games .game-card'));
    var matching = cards.find(function (card) { return card.querySelector('.game-name')?.textContent.trim() === activeGame.name; });
    var favoriteButton = matching?.querySelector('.fav-btn');
    if (favoriteButton) favoriteButton.click();
    else {
      var saved = favorites();
      saved.has(activeGame.name) ? saved.delete(activeGame.name) : saved.add(activeGame.name);
      localStorage.setItem('nova_favs', JSON.stringify(Array.from(saved)));
    }
    updateFavoriteButton();
  }

  function share() {
    if (!activeGame) return;
    var data = { title: activeGame.name + ' on Nova', text: 'Play ' + activeGame.name + ' on Nova', url: location.href };
    if (navigator.share) navigator.share(data).catch(function () {});
    else navigator.clipboard?.writeText(location.href).then(function () {
      var label = document.querySelector('#game-detail-share span');
      if (!label) return;
      label.textContent = 'Copied';
      setTimeout(function () { label.textContent = 'Share'; }, 1800);
    }).catch(function () {});
  }

  function findByName(name) {
    return catalog.find(function (game) { return game.name === name; });
  }

  function whenNovaReady(callback) {
    var attempts = 0;
    var timer = setInterval(function () {
      attempts += 1;
      if (typeof window.goTo === 'function' || attempts >= 80) {
        clearInterval(timer);
        callback();
      }
    }, 50);
  }

  document.addEventListener('click', function (event) {
    var detail = document.getElementById('page-game-detail');
    var nav = event.target.closest('.nav-tab');
    if (nav && detail?.classList.contains('active')) {
      detail.classList.remove('active');
      var url = new URL(location.href);
      url.searchParams.delete('game');
      history.replaceState({}, '', url);
      activeGame = null;
      document.title = 'Nova 7.0';
      if (nav.dataset.page === 'games') {
        event.preventDefault();
        event.stopImmediatePropagation();
        close({ history: false });
      }
      return;
    }
    var card = event.target.closest('#page-games .game-card, #games-recents-row .recent-card, #recents-row .recent-card');
    if (!card || event.target.closest('.fav-btn,.game-star')) return;
    var nameElement = card.querySelector('.game-name,.recent-card-name');
    var name = nameElement?.textContent.trim();
    if (!name || name === 'Request A Game') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    loadCatalog().then(function () { open(findByName(name), { history: true }); }).catch(function () {});
  }, true);

  document.addEventListener('mousedown', function (event) {
    var item = event.target.closest('.hsd-item');
    if (!item || item.querySelector('.hsd-item-type')?.textContent.trim() !== 'game') return;
    var name = item.querySelector('.hsd-item-name')?.textContent.trim();
    event.preventDefault();
    event.stopImmediatePropagation();
    loadCatalog().then(function () { open(findByName(name), { history: true }); }).catch(function () {});
  }, true);

  window.addEventListener('popstate', function () {
    var requested = new URL(location.href).searchParams.get('game');
    if (requested) {
      loadCatalog().then(function () { open(catalog.find(function (game) { return slug(game.name) === requested; }), { history: false }); });
    } else if (document.getElementById('page-game-detail')?.classList.contains('active')) close({ history: false });
  });

  document.addEventListener('DOMContentLoaded', function () {
    loadCatalog().catch(function () {});
    document.getElementById('game-detail-back')?.addEventListener('click', function () {
      if (history.state?.novaGameDetail) history.back(); else close();
    });
    document.getElementById('game-detail-see-all')?.addEventListener('click', function () { close(); });
    document.getElementById('game-detail-play')?.addEventListener('click', launch);
    document.getElementById('game-detail-art')?.addEventListener('click', launch);
    document.getElementById('game-detail-favorite')?.addEventListener('click', toggleFavorite);
    document.getElementById('game-detail-share')?.addEventListener('click', share);
    var ratingButtons = Array.from(document.querySelectorAll('#game-detail-rating-stars button'));
    ratingButtons.forEach(function (button) {
      button.addEventListener('click', function () { submitPersonalRating(Number(button.dataset.rating)); });
      button.addEventListener('pointerenter', function () {
        var value = Number(button.dataset.rating);
        ratingButtons.forEach(function (item) { item.classList.toggle('preview', Number(item.dataset.rating) <= value); });
      });
    });
    document.getElementById('game-detail-rating-stars')?.addEventListener('pointerleave', function () {
      ratingButtons.forEach(function (button) { button.classList.remove('preview'); });
    });
    var requested = new URL(location.href).searchParams.get('game');
    if (!requested) return;
    loadCatalog().then(function () {
      var game = catalog.find(function (item) { return slug(item.name) === requested; });
      if (!game) return;
      whenNovaReady(function () {
        document.querySelector('.nav-tab[data-page="games"]')?.click();
        setTimeout(function () { open(game, { history: false }); }, 420);
      });
    }).catch(function () {});
  });

  window.NovaGameDetail = { open: open, close: close };
})();
