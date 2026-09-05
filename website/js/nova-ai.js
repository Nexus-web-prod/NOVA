/**
 * Nova Supernova AI — Google Gemini through the Nova Worker
 * Work help · Game tips · General chat
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'nova_supernova_chats';
  var MAX_HISTORY = 24;
  var MAX_IMAGE_BYTES = 4 * 1024 * 1024;
  var MAX_IMAGE_WIDTH = 1280;

  /* Verified facts for Nova games the model often gets wrong */
  var GAME_KNOWLEDGE = {
    'escape road': {
      genre: 'Driving / car chase / score attack',
      facts: [
        'NOT an escape-room or point-and-click puzzle game — "Escape" refers to escaping police while driving',
        'You drive a car, dodge traffic, avoid crashes, and survive as far as possible for a high score',
        'Police chase / endless driving — steer, boost, and stay on the road'
      ],
      tips: ['Steer smoothly — jerky turns cause crashes', 'Watch traffic ahead and plan lane changes early', 'Repairs/upgrades help you survive longer (depends on version)']
    },
    'escape road 2': { alias: 'escape road' },
    'escape road 3': { alias: 'escape road' },
    'dune dash': {
      genre: 'Endless runner / driving over dunes',
      facts: ['Drive over sand dunes — timing and momentum matter', 'Endless score-chase style game on Nova'],
      tips: ['Build speed on downslopes', 'Time your jumps off dunes']
    },
    'drift boss': {
      genre: 'One-button drifting / driving',
      facts: ['Tap to drift around corners — timing is everything', 'Endless driving game focused on drift timing'],
      tips: ['Tap just before the turn', 'Short drifts beat over-steering']
    },
    'crossy road': {
      genre: 'Endless hopper / arcade',
      facts: ['Hop forward across roads, rivers, and obstacles — NOT a driving sim', 'Timing crossings to avoid cars and hazards'],
      tips: ['Wait for gaps in traffic', 'Use logs and lily pads on water sections']
    },
    'smash karts': {
      genre: 'Multiplayer kart combat racing',
      facts: ['Kart battle arena — drive, shoot, and outlast other players'],
      tips: ['Pick up weapon crates', 'Learn the map shortcuts']
    },
    'geo dash': {
      genre: 'Rhythm platformer / one-button',
      facts: ['Tap to jump/fly through obstacle courses synced to music', 'Also listed as Geometry Dash Lite on Nova'],
      tips: ['Practice mode helps learn tricky sections', 'Memorize patterns — consistency beats speed at first']
    },
    'slope': {
      genre: 'Endless 3D ball rolling',
      facts: ['Roll a ball down a steep neon slope — avoid falling off edges'],
      tips: ['Small movements — overcorrecting sends you off the edge', 'Green boosts can save a bad line if timed well']
    }
  };

  var GAME_TAG_KEYWORDS = {
    car: ['escape road', 'drift boss', 'dune dash', 'smash karts', 'crossy road', 'subway surfers', 'rocket goal', 'happy wheels', 'speed stars'],
    driving: ['escape road', 'drift boss', 'dune dash', 'crossy road', 'subway surfers'],
    racing: ['escape road', 'drift boss', 'smash karts', 'dune dash', 'speed stars'],
    soccer: ['supper liquid soccer', 'basket bros', 'baseball bros', 'wrestle bros'],
    horror: ['fnaf', 'cod zombies'],
    puzzle: ['balatro', '2048', 'google solitaire'],
    platform: ['geo dash', 'hollow knight', 'ovo', 'run 3', 'slope']
  };

  var GAME_SYSTEM_BASE =
    'You are Supernova AI, the gaming assistant built into Nova (a browser gaming platform with 94 games). ' +
    'CRITICAL RULES:\n' +
    '1. NEVER guess game mechanics from the title alone. "Escape Road" is a DRIVING game, not an escape-room puzzle.\n' +
    '2. Only describe games you have verified info for below, or what you can see in a user screenshot.\n' +
    '3. If unsure about a game, say so and ask for a screenshot or what they see on screen — do NOT invent puzzles, inventory systems, or room layouts.\n' +
    '4. When recommending games, ONLY suggest titles from the Nova catalog provided below.\n' +
    '5. When users ask for a type of game (e.g. "fun car game"), recommend matching Nova games with accurate genre descriptions.\n' +
    '6. Be enthusiastic, concise, and give practical tips. Hints before full spoilers when appropriate.\n' +
    '7. When users send screenshots, describe what you actually see before giving advice.';

  var _gamesCatalog = null;
  var _gamesCatalogLoading = null;

  var MODES = {
    work: {
      label: 'Work',
      desc: 'Homework, writing, study help',
      system: 'You are Supernova AI, a helpful work and study assistant built into Nova. Help users with homework, essays, math, science, coding, and productivity. Be clear, accurate, and encouraging. Break down complex topics step by step. When users send images, carefully read and analyze them — homework photos, diagrams, screenshots, etc. Never do anything harmful or unethical. Keep responses concise unless the user asks for detail.',
      chips: ['Explain this concept', 'Help me outline an essay', 'Check my math work', 'Summarize this topic']
    },
    game: {
      label: 'Games',
      desc: 'Tips, strategies & Nova game picks',
      system: GAME_SYSTEM_BASE,
      chips: ['Recommend a fun car game on Nova', 'How do I get a high score?', 'Tips for Escape Road 3', 'What should I play?']
    },
    general: {
      label: 'General',
      desc: 'Ask anything',
      system: 'You are Supernova AI, a friendly and capable assistant built into Nova — a web proxy and gaming platform. Help users with any reasonable question. When users send images, describe and analyze what you see and answer based on it. Be warm, concise, and useful. Stay safe and appropriate.',
      chips: ['What can you help with?', 'Give me a fun fact', 'Help me decide', 'Explain like I\'m 12']
    }
  };

  var state = {
    mode: 'work',
    messages: [],
    sending: false,
    wired: false,
    pendingImage: null
  };

  function normalizeGameName(name) {
    return String(name || '').toLowerCase().trim().replace(/\s+/g, ' ');
  }

  function getKnowledgeEntry(name) {
    var key = normalizeGameName(name);
    var entry = GAME_KNOWLEDGE[key];
    if (!entry) return null;
    if (entry.alias) entry = GAME_KNOWLEDGE[entry.alias];
    return entry;
  }

  function loadGamesCatalog() {
    if (_gamesCatalog) return Promise.resolve(_gamesCatalog);
    if (_gamesCatalogLoading) return _gamesCatalogLoading;
    _gamesCatalogLoading = fetch('/website/data/games.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        _gamesCatalog = (Array.isArray(data) ? data : []).filter(function (g) {
          return g && g.name && g.url && !g.blank && !g.noRating;
        });
        return _gamesCatalog;
      })
      .catch(function () {
        _gamesCatalog = [];
        return _gamesCatalog;
      });
    return _gamesCatalogLoading;
  }

  function getRecentUserText() {
    return state.messages
      .filter(function (m) { return m.role === 'user'; })
      .slice(-3)
      .map(function (m) { return m.text || ''; })
      .join(' ');
  }

  function findMentionedGames(text, catalog) {
    var lower = normalizeGameName(text);
    var found = [];
    (catalog || []).forEach(function (g) {
      var name = normalizeGameName(g.name);
      if (name.length > 3 && lower.indexOf(name) !== -1) found.push(g);
    });
    Object.keys(GAME_KNOWLEDGE).forEach(function (key) {
      if (key.length > 3 && lower.indexOf(key) !== -1) {
        var exists = found.some(function (g) { return normalizeGameName(g.name).indexOf(key) !== -1; });
        if (!exists) found.push({ name: key.replace(/\b\w/g, function (c) { return c.toUpperCase(); }) });
      }
    });
    return found;
  }

  function findRecommendedGames(text, catalog) {
    var lower = (text || '').toLowerCase();
    var wantsRec = /recommend|suggest|fun|good|best|what.*play|which.*game|game.*(try|play)|pick.*game|about.*game/.test(lower);
    var genreAsk = /(car|driving|racing|horror|soccer|puzzle|platformer|platform).{0,24}game|game.{0,24}(car|driv|race)/.test(lower);
    if (!wantsRec && !genreAsk) return [];

    var scores = {};
    Object.keys(GAME_TAG_KEYWORDS).forEach(function (tag) {
      if (lower.indexOf(tag) !== -1 || (tag === 'car' && /driv|racing|vehicle|road/.test(lower))) {
        GAME_TAG_KEYWORDS[tag].forEach(function (slug) { scores[slug] = (scores[slug] || 0) + 2; });
      }
    });

    var results = [];
    (catalog || []).forEach(function (g) {
      var name = normalizeGameName(g.name);
      Object.keys(scores).forEach(function (slug) {
        if (name.indexOf(slug) !== -1 || slug.indexOf(name) !== -1) {
          results.push({ game: g, score: scores[slug] });
        }
      });
    });

    results.sort(function (a, b) { return b.score - a.score; });
    var seen = {};
    return results.filter(function (r) {
      var n = normalizeGameName(r.game.name);
      if (seen[n]) return false;
      seen[n] = true;
      return true;
    }).slice(0, 6).map(function (r) { return r.game; });
  }

  function buildGameContextBlock(catalog, userText) {
    var blocks = [];

    if (catalog && catalog.length) {
      var names = catalog.slice(0, 80).map(function (g) { return g.name; }).join(', ');
      blocks.push('NOVA GAME CATALOG (only recommend from this list — ' + catalog.length + ' games total):\n' + names);
    }

    var mentioned = findMentionedGames(userText, catalog);
    mentioned.forEach(function (g) {
      var entry = getKnowledgeEntry(g.name);
      if (entry) {
        blocks.push(
          'VERIFIED INFO — ' + g.name + ' (' + entry.genre + '):\n' +
          entry.facts.map(function (f) { return '- ' + f; }).join('\n') +
          (entry.tips ? '\nTips:\n' + entry.tips.map(function (t) { return '- ' + t; }).join('\n') : '')
        );
      }
    });

    var recs = findRecommendedGames(userText, catalog);
    if (recs.length) {
      blocks.push(
        'MATCHING NOVA GAMES for this request (recommend these with accurate genres):\n' +
        recs.map(function (g) {
          var entry = getKnowledgeEntry(g.name);
          return '- ' + g.name + (entry ? ' — ' + entry.genre : '');
        }).join('\n')
      );
    }

    return blocks.join('\n\n');
  }

  function ensureGamesCatalog() {
    return loadGamesCatalog();
  }

  function getAccount() {
    try {
      return JSON.parse(localStorage.getItem('nova_account') || 'null');
    } catch (e) {
      return null;
    }
  }

  function isProUser() {
    if (window.NovaSupernovaTier && window.NovaSupernovaTier.isPro()) return true;
    var acct = getAccount();
    if (!acct) return false;
    var roles = Array.isArray(acct.roles) ? acct.roles : [acct.role];
    return !!(acct.supernova || acct.tier === 'supernova' || acct.tier === 'pro' ||
      roles.indexOf('admin') !== -1 || roles.indexOf('owner') !== -1);
  }

  function openSignIn() {
    var btn = document.getElementById('account-btn');
    if (btn) btn.click();
  }

  function toast(msg) {
    if (typeof window.toast === 'function') {
      window.toast(msg);
      return;
    }
    var host = document.getElementById('toast-container');
    if (!host) return;
    var node = document.createElement('div');
    node.className = 'toast';
    node.textContent = msg;
    host.appendChild(node);
    setTimeout(function () {
      node.classList.add('out');
      setTimeout(function () { node.remove(); }, 350);
    }, 4200);
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatText(text) {
    if (!text) return '';
    var html = esc(text);
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  function imageDataUrl(img) {
    return 'data:' + img.mimeType + ';base64,' + img.data;
  }

  function renderMessageImages(images) {
    if (!images || !images.length) return '';
    return images.map(function (img) {
      return '<img class="sn-ai-msg-img" src="' + esc(imageDataUrl(img)) + '" alt="Attached image" loading="lazy">';
    }).join('');
  }

  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !file.type || file.type.indexOf('image/') !== 0) {
        reject(new Error('Please choose an image file'));
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        reject(new Error('Image too large (max 4 MB)'));
        return;
      }

      var reader = new FileReader();
      reader.onload = function (ev) {
        var img = new Image();
        img.onload = function () {
          var w = img.width;
          var h = img.height;
          if (w > MAX_IMAGE_WIDTH) {
            h = Math.round(h * MAX_IMAGE_WIDTH / w);
            w = MAX_IMAGE_WIDTH;
          }
          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          var mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          var dataUrl = canvas.toDataURL(mime, mime === 'image/jpeg' ? 0.85 : undefined);
          var match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (!match) {
            reject(new Error('Failed to process image'));
            return;
          }
          resolve({
            mimeType: match[1],
            data: match[2],
            preview: dataUrl
          });
        };
        img.onerror = function () {
          reject(new Error('Invalid image file'));
        };
        img.src = ev.target.result;
      };
      reader.onerror = function () {
        reject(new Error('Failed to read image'));
      };
      reader.readAsDataURL(file);
    });
  }

  async function setPendingImage(file) {
    try {
      var processed = await compressImage(file);
      state.pendingImage = processed;
      renderPendingImage();
    } catch (err) {
      toast(err.message || 'Could not load image');
    }
  }

  function clearPendingImage() {
    state.pendingImage = null;
    renderPendingImage();
    var fileInput = el('sn-ai-file-input');
    if (fileInput) fileInput.value = '';
  }

  function renderPendingImage() {
    var wrap = el('sn-ai-pending');
    var preview = el('sn-ai-pending-img');
    if (!wrap || !preview) return;

    if (!state.pendingImage) {
      wrap.style.display = 'none';
      preview.removeAttribute('src');
      return;
    }

    preview.src = state.pendingImage.preview || imageDataUrl(state.pendingImage);
    wrap.style.display = 'inline-block';
  }

  function loadChats() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveChats(chats) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
    } catch (e) {}
  }

  function loadModeMessages(mode) {
    var chats = loadChats();
    state.messages = Array.isArray(chats[mode]) ? chats[mode] : [];
  }

  function persistMessages() {
    var chats = loadChats();
    chats[state.mode] = state.messages.slice(-MAX_HISTORY);
    try {
      saveChats(chats);
      document.dispatchEvent(new CustomEvent('nova:supernova-ai-changed', { detail: { aiChats: chats } }));
    } catch (e) {
      toast('Chat too large to save — try clearing older messages');
    }
  }

  function hydrateChats(chats) {
    if (!chats || typeof chats !== 'object') return;
    saveChats(chats);
    loadModeMessages(state.mode);
    renderMessages();
  }

  function el(id) {
    return document.getElementById(id);
  }

  function renderGate() {
    var chat = el('sn-ai-chat');
    var gate = el('sn-ai-gate');
    var inputWrap = el('sn-ai-input-wrap');
    if (!chat || !gate) return;

    if (isProUser()) {
      gate.style.display = 'none';
      chat.style.display = 'flex';
      if (inputWrap) inputWrap.style.display = '';
      return;
    }

    gate.style.display = 'flex';
    chat.style.display = 'none';
    if (inputWrap) inputWrap.style.display = 'none';
  }

  function renderMessages() {
    var container = el('sn-ai-messages');
    if (!container) return;

    if (!state.messages.length) {
      container.innerHTML =
        '<div class="sn-ai-empty">' +
        '<div class="sn-ai-empty-icon">✦</div>' +
        '<div class="sn-ai-empty-title">Supernova AI</div>' +
        '<div class="sn-ai-empty-sub">' + esc(MODES[state.mode].desc) + ' — type, paste, or attach an image.</div>' +
        '</div>';
      renderChips();
      return;
    }

    container.innerHTML = state.messages.map(function (m) {
      var isUser = m.role === 'user';
      var isError = m.role === 'error';
      var imgs = renderMessageImages(m.images);
      var textHtml = formatText(m.text);
      var bubble = imgs + textHtml;
      return (
        '<div class="sn-ai-msg' + (isUser ? ' sn-ai-msg--user' : (isError ? ' sn-ai-msg--error' : ' sn-ai-msg--ai')) + '">' +
        '<div class="sn-ai-msg-avatar">' + (isUser ? 'You' : (isError ? '!' : '✦')) + '</div>' +
        '<div class="sn-ai-msg-bubble">' + bubble + '</div>' +
        '</div>'
      );
    }).join('');

    container.scrollTop = container.scrollHeight;
    renderChips();
  }

  function renderChips() {
    var wrap = el('sn-ai-chips');
    if (!wrap) return;
    var mode = MODES[state.mode];
    wrap.innerHTML = mode.chips.map(function (chip) {
      return '<button type="button" class="sn-ai-chip" data-chip="' + esc(chip) + '">' + esc(chip) + '</button>';
    }).join('');

    wrap.querySelectorAll('.sn-ai-chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var input = el('sn-ai-input');
        if (input) {
          input.value = btn.dataset.chip;
          sendMessage();
        }
      });
    });
  }

  function renderModeTabs() {
    document.querySelectorAll('.sn-ai-mode-btn').forEach(function (btn) {
      var active = btn.dataset.mode === state.mode;
      btn.classList.toggle('active', active);
    });
    var sub = el('sn-ai-mode-desc');
    if (sub) sub.textContent = MODES[state.mode].desc;
  }

  function setMode(mode) {
    if (!MODES[mode] || mode === state.mode) return;
    persistMessages();
    clearPendingImage();
    state.mode = mode;
    loadModeMessages(mode);
    renderModeTabs();
    renderMessages();
  }

  function showTyping(show) {
    var typing = el('sn-ai-typing');
    if (typing) typing.style.display = show ? 'flex' : 'none';
    if (show) {
      var container = el('sn-ai-messages');
      if (container) container.scrollTop = container.scrollHeight;
    }
  }

  function setStatus(message, tone) {
    var status = el('sn-ai-status');
    if (!status) return;
    status.textContent = message || '';
    status.className = 'sn-ai-status' + (tone ? ' sn-ai-status--' + tone : '');
  }

  async function callNovaAI() {
    if (!window.NovaAPI || typeof window.NovaAPI.aiChat !== 'function') {
      throw new Error('Supernova AI is still loading. Try again in a moment.');
    }
    var recentMessages = state.messages.filter(function (message) {
      return message.role === 'user' || message.role === 'model' || message.role === 'assistant';
    }).slice(-MAX_HISTORY);
    var payload = {
      mode: state.mode,
      context: state.mode === 'game' ? buildGameContextBlock(_gamesCatalog || [], getRecentUserText()) : '',
      messages: recentMessages.map(function (message, index) {
        return {
          role: message.role === 'user' ? 'user' : 'assistant',
          text: message.text || '',
          images: index === recentMessages.length - 1 ? (message.images || []) : []
        };
      })
    };
    var data = await window.NovaAPI.aiChat(payload);
    if (!data || !data.reply) throw new Error('Supernova AI returned an empty response');
    return data.reply;
  }

  async function sendMessage() {
    if (state.sending) return;
    if (!isProUser()) {
      toast('Sign in to use Supernova AI');
      openSignIn();
      return;
    }

    var input = el('sn-ai-input');
    if (!input) return;

    var text = input.value.trim();
    var images = null;
    if (state.pendingImage) {
      images = [{
        mimeType: state.pendingImage.mimeType,
        data: state.pendingImage.data
      }];
    }
    if (!text && !images) return;

    input.value = '';
    clearPendingImage();

    var msg = { role: 'user', text: text, ts: Date.now() };
    if (images) msg.images = images;
    state.messages.push(msg);
    persistMessages();
    renderMessages();

    state.sending = true;
    showTyping(true);
    setStatus('Supernova is thinking...', 'working');
    var sendBtn = el('sn-ai-send');
    if (sendBtn) sendBtn.disabled = true;

    try {
      if (state.mode === 'game') await ensureGamesCatalog();
      var reply = await callNovaAI();
      state.messages.push({ role: 'model', text: reply, ts: Date.now() });
      persistMessages();
      renderMessages();
      setStatus('Ready', 'ready');
    } catch (err) {
      var message = err && err.message ? err.message : 'Supernova AI could not complete that request.';
      state.messages.push({ role: 'error', text: message, ts: Date.now() });
      persistMessages();
      renderMessages();
      setStatus(message, 'error');
      toast(message);
    } finally {
      state.sending = false;
      showTyping(false);
      if (sendBtn) sendBtn.disabled = false;
      if (input) input.focus();
    }
  }

  function clearChat() {
    if (!confirm('Clear this conversation?')) return;
    state.messages = [];
    clearPendingImage();
    persistMessages();
    renderMessages();
    toast('Chat cleared');
  }

  function handleImageFiles(files) {
    if (!files || !files.length) return;
    setPendingImage(files[0]);
  }

  function wireDom() {
    if (state.wired) return;

    document.querySelectorAll('.sn-ai-mode-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setMode(btn.dataset.mode);
      });
    });

    var sendBtn = el('sn-ai-send');
    var input = el('sn-ai-input');
    var clearBtn = el('sn-ai-clear');
    var attachBtn = el('sn-ai-attach');
    var fileInput = el('sn-ai-file-input');
    var pendingRemove = el('sn-ai-pending-remove');
    if (!sendBtn || !input) {
      setStatus('Supernova controls did not load. Refresh Nova and try again.', 'error');
      return;
    }
    state.wired = true;

    sendBtn.addEventListener('click', sendMessage);
    {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
      input.addEventListener('paste', function (e) {
        var items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (var i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image/') === 0) {
            e.preventDefault();
            var file = items[i].getAsFile();
            if (file) setPendingImage(file);
            return;
          }
        }
      });
    }
    if (attachBtn && fileInput) {
      attachBtn.addEventListener('click', function () {
        if (!isProUser()) {
          toast('Sign in to use Supernova AI');
          openSignIn();
          return;
        }
        fileInput.click();
      });
      fileInput.addEventListener('change', function () {
        handleImageFiles(fileInput.files);
      });
    }
    if (pendingRemove) pendingRemove.addEventListener('click', clearPendingImage);
    if (clearBtn) clearBtn.addEventListener('click', clearChat);

    var signInBtn = el('sn-ai-gate-signin');
    if (signInBtn) {
      signInBtn.addEventListener('click', openSignIn);
    }
  }

  function init() {
    wireDom();
    loadModeMessages(state.mode);
    ensureGamesCatalog();
    renderGate();
    renderModeTabs();
    renderPendingImage();
    renderMessages();
    setStatus('Ready', 'ready');
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('page-supernova')) init();
  });

  document.addEventListener('nova:page-change', function (e) {
    if (e.detail && e.detail.page === 'supernova') init();
  });

  document.addEventListener('nova:login', function () {
    renderGate();
  });
  document.addEventListener('nova:account-changed', function () {
    renderGate();
  });

  window.NovaSupernovaAI = {
    init: init,
    setMode: setMode,
    clearChat: clearChat,
    sendMessage: sendMessage,
    hydrateChats: hydrateChats,
    getChats: loadChats
  };
})();
