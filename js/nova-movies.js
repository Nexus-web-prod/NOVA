// Nova Movies - cinematic catalog, previews, and full-screen playback.
(function () {
  'use strict';

  let movies = [];
  let activeMovie = null;
  let featuredMovie = null;
  let searchQuery = '';
  let activeGenre = 'All';
  let previewTimer = null;
  let previewStopTimer = null;
  let playerRequest = 0;
  let lastTrigger = null;

  const urlCache = {};
  const URL_TEMPLATES = [
    id => `https://drive.usercontent.google.com/download?id=${id}&export=download&authuser=0`,
    id => `https://drive.usercontent.google.com/uc?id=${id}&export=download`,
    id => `https://docs.google.com/uc?export=download&id=${id}`,
  ];

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function movieKey(movie) {
    return String(movie?.id || movie?.src || '');
  }

  function gdThumb(fileId) {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`;
  }

  function artFor(movie) {
    return movie?.backdrop || movie?.thumb || gdThumb(movie?.id || '');
  }

  function thumbFor(movie) {
    return movie?.thumb || movie?.backdrop || gdThumb(movie?.id || '');
  }

  function metaFor(movie) {
    return [movie?.year, movie?.genre].filter(Boolean).join(' · ');
  }

  function uniqueGenres(items) {
    const genres = new Set(items.map(movie => movie.genre).filter(Boolean));
    return ['All', ...Array.from(genres).sort()];
  }

  function filteredMovies() {
    const query = searchQuery.trim().toLowerCase();
    return movies.filter(movie => {
      const genreMatches = activeGenre === 'All' || movie.genre === activeGenre;
      const searchable = [movie.title, movie.description, movie.tagline, movie.genre, movie.year]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return genreMatches && (!query || searchable.includes(query));
    });
  }

  function setPreviewState(isPlaying) {
    const hero = document.getElementById('movies-hero');
    const button = document.getElementById('movies-hero-preview');
    const label = document.getElementById('movies-preview-label');
    hero?.classList.toggle('is-previewing', isPlaying);
    button?.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
    if (label) label.textContent = isPlaying ? 'Pause' : 'Preview';
  }

  function stopHeroPreview(options = {}) {
    clearTimeout(previewTimer);
    clearTimeout(previewStopTimer);
    const video = document.getElementById('movies-hero-video');
    if (video) {
      video.pause();
      if (options.release !== false) {
        video.removeAttribute('src');
        video.removeAttribute('data-movie-id');
        video.load();
      }
    }
    setPreviewState(false);
  }

  function syncFeaturedCard() {
    const key = movieKey(featuredMovie);
    document.querySelectorAll('#movies-grid .movie-card').forEach(card => {
      const selected = card.dataset.id === key;
      card.classList.toggle('is-featured', selected);
      card.setAttribute('aria-current', selected ? 'true' : 'false');
    });
  }

  function setHero(movie, options = {}) {
    if (!movie) return;
    const changed = movieKey(featuredMovie) !== movieKey(movie);
    featuredMovie = movie;

    const hero = document.getElementById('movies-hero');
    const bg = document.getElementById('movies-hero-bg');
    const title = document.getElementById('movies-hero-title');
    const meta = document.getElementById('movies-hero-meta');
    const desc = document.getElementById('movies-hero-desc');
    const play = document.getElementById('movies-hero-play');
    const preview = document.getElementById('movies-hero-preview');
    const position = document.getElementById('movies-featured-position');
    const total = document.getElementById('movies-featured-total');

    if (changed) {
      stopHeroPreview();
      hero?.classList.remove('hero-refresh');
      requestAnimationFrame(() => hero?.classList.add('hero-refresh'));
    }
    if (bg) bg.style.backgroundImage = `url("${artFor(movie)}")`;
    if (title) title.textContent = movie.title || 'Movie';
    if (meta) {
      meta.innerHTML = [movie.year, movie.genre, 'HD']
        .filter(Boolean)
        .map(value => `<span>${escapeHtml(value)}</span>`)
        .join('');
    }
    if (desc) desc.textContent = movie.description || movie.tagline || '';
    if (position) position.textContent = String(Math.max(1, movies.indexOf(movie) + 1)).padStart(2, '0');
    if (total) total.textContent = String(movies.length).padStart(2, '0');
    if (play) play.onclick = event => launchFromHero(movie, event.currentTarget);
    if (preview) preview.onclick = () => toggleHeroPreview(movie);

    syncFeaturedCard();
    if (options.preview) {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(() => playHeroPreview(movie), 420);
    }
  }

  function playHeroPreview(movie) {
    const video = document.getElementById('movies-hero-video');
    if (!video || !movie?.src || movieKey(featuredMovie) !== movieKey(movie)) return;

    if (video.dataset.movieId !== movieKey(movie)) {
      video.dataset.movieId = movieKey(movie);
      video.src = movie.src;
      video.load();
    }
    video.muted = true;
    video.play().then(() => setPreviewState(true)).catch(() => setPreviewState(false));
  }

  function toggleHeroPreview(movie) {
    const video = document.getElementById('movies-hero-video');
    if (!video) return;
    if (!video.paused && video.dataset.movieId === movieKey(movie)) {
      video.pause();
      setPreviewState(false);
      return;
    }
    playHeroPreview(movie);
  }

  function renderGenreBar(genres) {
    const bar = document.getElementById('movies-genre-bar');
    if (!bar) return;
    bar.innerHTML = genres.map(genre => `
      <button class="movie-genre-btn${genre === activeGenre ? ' active' : ''}"
        data-genre="${escapeHtml(genre)}" type="button" role="tab"
        aria-selected="${genre === activeGenre ? 'true' : 'false'}">${escapeHtml(genre)}</button>
    `).join('');
    bar.querySelectorAll('.movie-genre-btn').forEach(button => {
      button.addEventListener('click', () => {
        activeGenre = button.dataset.genre;
        renderGenreBar(genres);
        renderGrid();
      });
    });
  }

  function renderGrid() {
    const grid = document.getElementById('movies-grid');
    const empty = document.getElementById('movies-empty');
    const count = document.getElementById('movies-result-count');
    const clear = document.getElementById('movies-search-clear');
    if (!grid) return;

    const list = filteredMovies();
    if (count) count.textContent = `${list.length} ${list.length === 1 ? 'title' : 'titles'}`;
    if (clear) clear.classList.toggle('visible', Boolean(searchQuery));
    empty?.classList.toggle('visible', !list.length);

    grid.innerHTML = list.map((movie, index) => `
      <button class="movie-card${movieKey(movie) === movieKey(featuredMovie) ? ' is-featured' : ''}"
        data-id="${escapeHtml(movieKey(movie))}" type="button"
        aria-label="Play ${escapeHtml(movie.title)}"
        aria-current="${movieKey(movie) === movieKey(featuredMovie) ? 'true' : 'false'}">
        <span class="movie-card-thumb">
          <img src="${escapeHtml(thumbFor(movie))}" alt="" loading="${index < 4 ? 'eager' : 'lazy'}"
            onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"/>
          <span class="movie-card-thumb-fallback" style="display:none">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m10 9 5 3-5 3z"></path></svg>
          </span>
          <span class="movie-card-scrim"></span>
          <span class="movie-card-topline"><span>${escapeHtml(movie.genre || 'Movie')}</span><span>${escapeHtml(movie.year || '')}</span></span>
          <span class="movie-card-play-btn" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
          </span>
          <span class="movie-card-info">
            <span class="movie-card-title">${escapeHtml(movie.title)}</span>
            <span class="movie-card-meta">${escapeHtml(metaFor(movie))}</span>
            <span class="movie-card-desc">${escapeHtml(movie.tagline || movie.description || '')}</span>
          </span>
        </span>
      </button>
    `).join('');

    grid.querySelectorAll('.movie-card').forEach(card => {
      const movie = movies.find(item => movieKey(item) === card.dataset.id);
      if (!movie) return;
      card.addEventListener('mouseenter', () => setHero(movie, { preview: true }));
      card.addEventListener('mouseleave', () => {
        clearTimeout(previewTimer);
        previewStopTimer = setTimeout(() => {
          if (!document.getElementById('movies-hero')?.matches(':hover')) stopHeroPreview();
        }, 220);
      });
      card.addEventListener('focus', () => setHero(movie));
      card.addEventListener('click', () => launchFromCard(movie, card));
    });
  }

  function setLoading(message, visible) {
    const loading = document.getElementById('movies-player-loading');
    const text = document.getElementById('movies-loading-text');
    if (text && message) text.textContent = message;
    if (loading) loading.classList.toggle('hidden', !visible);
  }

  function ensureOverlay() {
    if (document.getElementById('movies-player-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'movies-player-overlay';
    overlay.className = 'hidden';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Nova movie player');
    overlay.innerHTML = `
      <div class="movies-player-shell">
        <header class="movies-player-topbar">
          <button id="movies-player-close" type="button" aria-label="Back to Movies" title="Back to Movies">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg>
          </button>
          <div class="movies-player-brand"><span>✦</span>NOVA MOVIES</div>
          <div id="movies-player-top-meta"></div>
        </header>
        <div class="movies-player-frame-wrap">
          <div class="movies-watermark movies-watermark-player">NOVA</div>
          <div id="movies-player-loading">
            <span class="movies-spinner" aria-hidden="true"></span>
            <span id="movies-loading-text">Preparing movie</span>
          </div>
          <video id="movies-player-video" controls playsinline preload="auto"></video>
        </div>
        <footer class="movies-player-info">
          <div class="movies-player-copy">
            <div id="movies-player-title"></div>
            <div id="movies-player-meta"></div>
          </div>
          <p id="movies-player-desc"></p>
        </footer>
      </div>`;
    document.body.appendChild(overlay);

    const video = document.getElementById('movies-player-video');
    document.getElementById('movies-player-close')?.addEventListener('click', closePlayer);
    video?.addEventListener('playing', () => setLoading('', false));
    video?.addEventListener('canplay', () => setLoading('', false));
    video?.addEventListener('waiting', () => setLoading('Buffering', true));
    video?.addEventListener('stalled', () => setLoading('Buffering', true));
    video?.addEventListener('error', () => {
      if (activeMovie) setLoading('This movie could not be loaded', true);
    });
  }

  function launchFromCard(movie, card) {
    lastTrigger = card || document.activeElement;
    setHero(movie);
    card?.classList.add('is-launching');
    document.getElementById('movies-hero')?.classList.add('is-launching');
    setTimeout(() => {
      card?.classList.remove('is-launching');
      openPlayer(movie);
    }, 260);
  }

  function launchFromHero(movie, trigger) {
    lastTrigger = trigger || document.activeElement;
    document.getElementById('movies-hero')?.classList.add('is-launching');
    setTimeout(() => openPlayer(movie), 220);
  }

  function tryVideoSrc(video, src, timeoutMs = 10000) {
    return new Promise(resolve => {
      const cleanup = () => {
        video.removeEventListener('canplay', onReady);
        video.removeEventListener('error', onError);
        clearTimeout(timer);
      };
      const onReady = () => { cleanup(); resolve(true); };
      const onError = () => { cleanup(); resolve(false); };
      const timer = setTimeout(() => { cleanup(); resolve(false); }, timeoutMs);
      video.addEventListener('canplay', onReady, { once: true });
      video.addEventListener('error', onError, { once: true });
      video.src = src;
      video.load();
    });
  }

  async function openPlayer(movieOrId) {
    const movie = typeof movieOrId === 'object'
      ? movieOrId
      : movies.find(item => movieKey(item) === String(movieOrId));
    if (!movie) return;

    const request = ++playerRequest;
    activeMovie = movie;
    stopHeroPreview();
    ensureOverlay();

    const overlay = document.getElementById('movies-player-overlay');
    const video = document.getElementById('movies-player-video');
    const frame = document.querySelector('#movies-player-overlay .movies-player-frame-wrap');
    const title = document.getElementById('movies-player-title');
    const desc = document.getElementById('movies-player-desc');
    const meta = document.getElementById('movies-player-meta');
    const topMeta = document.getElementById('movies-player-top-meta');

    if (title) title.textContent = movie.title || 'Movie';
    if (desc) desc.textContent = movie.description || '';
    if (meta) meta.textContent = metaFor(movie);
    if (topMeta) topMeta.textContent = movie.year || '';
    if (frame) frame.style.backgroundImage = `url("${artFor(movie)}")`;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.poster = artFor(movie);
      video.load();
    }
    setLoading('Preparing movie', true);

    overlay?.classList.remove('hidden');
    requestAnimationFrame(() => overlay?.classList.add('active'));
    document.body.classList.add('movies-player-open');
    document.dispatchEvent(new CustomEvent('nova:focused-content-open', { detail: { type: 'movie' } }));
    setTimeout(() => document.getElementById('movies-hero')?.classList.remove('is-launching'), 460);
    setTimeout(() => document.getElementById('movies-player-close')?.focus(), 80);

    if (!video) return;
    const sources = movie.src
      ? [movie.src]
      : (urlCache[movie.id] ? [urlCache[movie.id]] : URL_TEMPLATES.map(template => template(movie.id)));

    for (let index = 0; index < sources.length; index += 1) {
      if (request !== playerRequest || !activeMovie) return;
      if (sources.length > 1) setLoading(`Loading source ${index + 1} of ${sources.length}`, true);
      const ready = await tryVideoSrc(video, sources[index]);
      if (request !== playerRequest || !activeMovie) return;
      if (ready) {
        if (!movie.src) urlCache[movie.id] = sources[index];
        setLoading('', false);
        video.play().catch(() => {});
        return;
      }
    }
    setLoading('This movie could not be loaded', true);
  }

  function closePlayer() {
    playerRequest += 1;
    const overlay = document.getElementById('movies-player-overlay');
    const video = document.getElementById('movies-player-video');
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.removeAttribute('poster');
      video.load();
    }
    overlay?.classList.remove('active');
    document.getElementById('movies-hero')?.classList.remove('is-launching');
    document.body.classList.remove('movies-player-open');
    activeMovie = null;
    document.dispatchEvent(new CustomEvent('nova:focused-content-close', { detail: { type: 'movie' } }));
    setTimeout(() => {
      overlay?.classList.add('hidden');
      if (lastTrigger && document.contains(lastTrigger)) lastTrigger.focus();
    }, 320);
  }

  function resetFilters() {
    const search = document.getElementById('movies-search');
    searchQuery = '';
    activeGenre = 'All';
    if (search) search.value = '';
    renderGenreBar(uniqueGenres(movies));
    renderGrid();
  }

  async function init() {
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && activeMovie) closePlayer();
    });

    const search = document.getElementById('movies-search');
    search?.addEventListener('input', () => {
      searchQuery = search.value;
      renderGrid();
    });
    document.getElementById('movies-search-clear')?.addEventListener('click', () => {
      searchQuery = '';
      if (search) {
        search.value = '';
        search.focus();
      }
      renderGrid();
    });
    document.getElementById('movies-reset-filter')?.addEventListener('click', resetFilters);
    document.getElementById('movies-hero')?.addEventListener('mouseenter', () => clearTimeout(previewStopTimer));
    document.getElementById('movies-hero')?.addEventListener('mouseleave', () => {
      previewStopTimer = setTimeout(() => stopHeroPreview(), 220);
    });
    document.getElementById('movies-hero-video')?.addEventListener('ended', () => stopHeroPreview());

    try {
      const response = await fetch('/movies.json');
      if (!response.ok) throw new Error(`Movies request failed: ${response.status}`);
      const data = await response.json();
      movies = Array.isArray(data) ? data.filter(movie => movie && movie.title) : [];
    } catch (error) {
      movies = [];
      const grid = document.getElementById('movies-grid');
      if (grid) grid.innerHTML = '<div class="movies-load-error">The movie catalog is unavailable.</div>';
      document.getElementById('movies-empty')?.classList.add('visible');
      return;
    }

    const genres = uniqueGenres(movies);
    setHero(movies[0]);
    renderGenreBar(genres);
    renderGrid();

    document.addEventListener('nova:page-change', event => {
      if (event.detail?.page === 'movies') {
        renderGenreBar(uniqueGenres(movies));
        renderGrid();
        setHero(featuredMovie || movies[0]);
      } else {
        stopHeroPreview();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
