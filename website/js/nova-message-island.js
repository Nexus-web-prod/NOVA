(function(){
  'use strict';
  var state = {
    poll: null,
    current: null,
    lastCounts: {},
    lastPreviewId: '',
    sessionStartedAt: Date.now(),
    polling: false,
    open: false,
    sending: false,
    demo: false,
    baselineReady: false,
    serverBaselineId: 0,
    streamBaselines: {},
    peerCache: [],
    peerCacheAt: 0,
    lastPollAt: 0,
    lastPollResult: 'starting',
    lastError: '',
    lastSuppressedPeer: '',
    wasOpenBeforeMessage: false,
    openedByMessage: false,
    dismissTimer: null,
    cleanupTimer: null,
    demoScheduled: false
  };
  function acct(){
    try { return JSON.parse(localStorage.getItem('nova_account') || 'null'); }
    catch(e){ return null; }
  }
  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }
  function dmNotificationsOn(){
    return localStorage.getItem('nova_dm_notifications') !== '0' &&
      document.documentElement.getAttribute('data-dm-notifications') !== 'off';
  }
  function isViewingSocialConversation(peer){
    var page = document.getElementById('page-social');
    var dock = document.getElementById('ni-social-dock');
    var island = document.getElementById('nova-island');
    var socialTab = document.querySelector('.ni-tab.active[data-ni-tab="friends"]');
    var pageVisible = !!(page && page.classList.contains('active'));
    var islandVisible = !!(dock && dock.classList.contains('open') && island && island.classList.contains('open') && socialTab);
    if (!pageVisible && !islandVisible) return false;
    var active = typeof window._novaSocialActivePane === 'function' ? window._novaSocialActivePane() : '';
    return !!active && String(active).toLowerCase() === String(peer || '').toLowerCase();
  }
  async function islandApi(path){
    try {
      var res = await fetch(path, { headers: { Accept: 'application/json' } });
      if (!res.ok) return null;
      return await res.json();
    } catch(e) {
      state.lastError = e && e.message ? e.message : String(e);
      return null;
    }
  }
  function dmKey(a,b){
    var s = [String(a).toLowerCase(), String(b).toLowerCase()].sort();
    return 'nova:stream:dm:' + s[0] + ':' + s[1];
  }
  function normalize(row){
    var d = row && row.data || {};
    var msg = Object.assign({_id:String(row.id), ts:row.ts || Date.now()}, d);
    if (msg.from) msg.from = String(msg.from).toLowerCase();
    return msg;
  }
  async function latestDM(me, peer){
    var rows = await rangeDM(me, peer, 0);
    return rows.length ? rows[rows.length - 1] : null;
  }
  async function recentDmPeers(username){
    try { var data = await NovaAPI.social(); return (data.friends || []).map(function(profile){ return profile.username.toLowerCase(); }); }
    catch(e){ return []; }
  }
  async function rangeDM(me, peer, afterId){
    try {
      var data = await NovaAPI.messages('dm:' + String(peer).toLowerCase(), afterId || 0);
      return (data.messages || []).map(function(msg){ return {_id:String(msg.id),ts:msg.createdAt||msg.ts,from:String(msg.from||'').toLowerCase(),text:msg.body||'',type:msg.type||'text'}; });
    } catch(e){ return []; }
  }
  async function getPeers(username, unreadRows){
    var peers = {};
    (unreadRows || []).forEach(function(r){
      var peer = String(r.other_user || '').toLowerCase();
      if (peer && peer !== username) peers[peer] = true;
    });
    if (Date.now() - state.peerCacheAt < 30000) {
      state.peerCache.forEach(function(peer){ peers[peer] = true; });
    } else {
      var recent = await recentDmPeers(username);
      state.peerCache = recent;
      state.peerCacheAt = Date.now();
      state.peerCache.forEach(function(peer){ if (peer !== username) peers[peer] = true; });
    }
    return Object.keys(peers).slice(0, 60);
  }
  async function buildBaseline(username, unreadRows){
    (unreadRows || []).forEach(function(r){
      var peer = String(r.other_user || '').toLowerCase();
      if (peer) state.lastCounts[peer] = parseInt(r.count || 0, 10);
    });
    var peers = await getPeers(username, unreadRows);
    await Promise.all(peers.map(async function(peer){
      var msg = await latestDM(username, peer);
      state.streamBaselines[peer] = msg && msg._id ? parseInt(msg._id, 10) || 0 : 0;
    }));
    state.baselineReady = true;
  }
  async function pollStreams(username, unreadRows){
    var peers = await getPeers(username, unreadRows);
    for (var i = 0; i < peers.length; i++) {
      var peer = peers[i];
      var msgs = await rangeDM(username, peer, state.streamBaselines[peer] || 0);
      if (!msgs.length) continue;
      state.streamBaselines[peer] = parseInt(msgs[msgs.length - 1]._id, 10) || state.streamBaselines[peer] || 0;
      var incoming = msgs.filter(function(msg){
        return msg && msg._id && msg.from && msg.from !== username && msg._id !== state.lastPreviewId && !msg._system;
      }).pop();
      if (!incoming) continue;
      var row = (unreadRows || []).find(function(r){ return String(r.other_user || '').toLowerCase() === peer; });
      state.lastPreviewId = incoming._id;
      var shown = preview({
        peer: peer,
        from: incoming.from || peer,
        text: incoming.text || '',
        type: incoming.type || 'text',
        count: Math.max(1, parseInt(row && row.count || 1, 10) || 1)
      });
      return shown !== false;
    }
    return false;
  }
  async function pollServerIncoming(username){
    var data = await islandApi('/api/message-island/recent?username=' + encodeURIComponent(username) + '&after=' + encodeURIComponent(state.serverBaselineId || 0) + '&since=' + encodeURIComponent(state.sessionStartedAt || 0));
    if (!data || !data.ok) return null;
    state.serverBaselineId = Math.max(state.serverBaselineId || 0, parseInt(data.latestId || 0, 10) || 0);
    var messages = data.messages || [];
    if (!messages.length) return false;
    var incoming = messages.filter(function(msg){
      return msg && msg.id && msg.from && msg.from !== username && msg.id !== state.lastPreviewId;
    }).pop();
    if (!incoming) return false;
    state.lastPreviewId = incoming.id;
    var shown = preview({
      peer: incoming.peer || incoming.from,
      from: incoming.from,
      text: incoming.text || '',
      type: incoming.type || 'text',
      count: Math.max(1, messages.length)
    });
    return shown !== false;
  }
  function ensureUI(){
    var island = document.getElementById('nova-island');
    var content = document.getElementById('nova-island-content');
    if (!island || !content || document.getElementById('ni-message-layer')) return;
    var layer = document.createElement('div');
    layer.id = 'ni-message-layer';
    layer.innerHTML =
      '<button id="ni-message-preview" type="button">' +
        '<div class="ni-msg-avatar" id="ni-msg-avatar">?</div>' +
        '<div class="ni-msg-copy">' +
          '<div class="ni-msg-from" id="ni-msg-from">Message</div>' +
          '<div class="ni-msg-text" id="ni-msg-text">New message</div>' +
        '</div>' +
        '<div class="ni-msg-count" id="ni-msg-count">1</div>' +
      '</button>' +
      '<div id="ni-message-reply">' +
        '<div class="ni-msg-reply-head">' +
          '<button type="button" id="ni-msg-back" title="Back">‹</button>' +
          '<div><div class="ni-msg-reply-label">Replying to</div><div class="ni-msg-reply-name" id="ni-msg-reply-name">Friend</div></div>' +
          '<button type="button" id="ni-msg-close" title="Close">×</button>' +
        '</div>' +
        '<div class="ni-msg-thread" id="ni-msg-thread"></div>' +
        '<div class="ni-msg-compose">' +
          '<input id="ni-msg-input" maxlength="500" autocomplete="off" spellcheck="false" placeholder="Message..." />' +
          '<button type="button" id="ni-msg-send">Send</button>' +
        '</div>' +
      '</div>';
    content.insertBefore(layer, content.firstChild);
    document.getElementById('ni-message-preview').addEventListener('click', function(e){ e.stopPropagation(); openReply(); });
    document.getElementById('ni-msg-back').addEventListener('click', function(e){ e.stopPropagation(); showPreview(); });
    document.getElementById('ni-msg-close').addEventListener('click', function(e){ e.stopPropagation(); dismiss(); });
    document.getElementById('ni-msg-send').addEventListener('click', sendReply);
    document.getElementById('ni-msg-input').addEventListener('keydown', function(e){
      if (e.key === 'Enter') sendReply();
      if (e.key === 'Escape') dismiss();
    });
  }
  function expandIsland(){
    var island = document.getElementById('nova-island');
    var star = document.getElementById('nova-island-star');
    var hint = document.getElementById('nova-island-hint');
    if (!island || !star) return;
    clearTimeout(state.cleanupTimer);
    state.wasOpenBeforeMessage = island.classList.contains('open') &&
      !island.classList.contains('closing') &&
      !island.classList.contains('ni-message-mode');
    state.openedByMessage = !state.wasOpenBeforeMessage;

    island.classList.remove(
      'ni-message-inline',
      'ni-message-inline-visible',
      'ni-message-inline-exit',
      'ni-message-inline-reply',
      'ni-message-compact-visible',
      'ni-message-compact-exit'
    );
    document.body.classList.remove('ni-message-compact-active');

    if (state.wasOpenBeforeMessage) {
      island.classList.remove('ni-message-mode', 'ni-message-reply-mode', 'ni-message-in-island');
      island.classList.add('ni-message-inline', 'ni-message-preview-mode');
      void island.offsetWidth;
      requestAnimationFrame(function(){
        if (island.classList.contains('ni-message-inline')) {
          island.classList.add('ni-message-inline-visible');
        }
      });
    } else {
      island.classList.remove(
        'open',
        'opening',
        'closing',
        'closing-final',
        'ni-message-reply-mode',
        'ni-message-in-island'
      );
      document.body.classList.add('ni-message-compact-active');
      star.classList.add('open');
      island.classList.add('ni-message-mode', 'ni-message-preview-mode');
      if (hint) hint.classList.add('hidden');
      void island.offsetWidth;
      requestAnimationFrame(function(){
        if (island.classList.contains('ni-message-mode')) {
          island.classList.add('ni-message-compact-visible');
        }
      });
    }
    state.open = true;
  }
  function showPreview(){
    var island = document.getElementById('nova-island');
    if (!island) return;
    island.classList.add('ni-message-preview-mode');
    island.classList.remove('ni-message-reply-mode', 'ni-message-inline-reply');
  }
  function openReply(){
    var island = document.getElementById('nova-island');
    if (!island || !state.current) return;
    island.classList.remove('ni-message-preview-mode');
    if (island.classList.contains('ni-message-inline')) island.classList.add('ni-message-inline-reply');
    else island.classList.add('ni-message-reply-mode');
    renderThread();
    setTimeout(function(){
      var input = document.getElementById('ni-msg-input');
      if (input) input.focus();
    }, 180);
  }
  function dismiss(){
    var island = document.getElementById('nova-island');
    if (!island) return;
    var star = document.getElementById('nova-island-star');
    clearTimeout(state.dismissTimer);
    clearTimeout(state.cleanupTimer);

    if (island.classList.contains('ni-message-inline')) {
      island.classList.remove('ni-message-inline-visible');
      island.classList.add('ni-message-inline-exit');
      state.open = false;
      state.cleanupTimer = setTimeout(function(){
        island.classList.remove(
          'ni-message-inline',
          'ni-message-inline-exit',
          'ni-message-preview-mode',
          'ni-message-inline-reply'
        );
        state.current = null;
        state.openedByMessage = false;
        state.wasOpenBeforeMessage = false;
      }, 220);
      return;
    }

    island.classList.remove('ni-message-compact-visible');
    island.classList.add('ni-message-compact-exit');
    state.open = false;
    state.cleanupTimer = setTimeout(function(){
      island.classList.remove(
        'ni-message-mode',
        'ni-message-preview-mode',
        'ni-message-reply-mode',
        'ni-message-in-island',
        'ni-message-compact-exit'
      );
      document.body.classList.remove('ni-message-compact-active');
      if (star) star.classList.remove('open');
      state.current = null;
      state.openedByMessage = false;
      state.wasOpenBeforeMessage = false;
    }, 260);
  }
  function preview(payload){
    if (!payload.demo && !dmNotificationsOn()) return;
    var peer = payload.peer || payload.from || '';
    if (!payload.demo && isViewingSocialConversation(peer)) {
      state.lastSuppressedPeer = String(peer).toLowerCase();
      return false;
    }
    ensureUI();
    state.current = payload;
    state.demo = !!payload.demo;
    var from = payload.from || payload.peer || 'friend';
    var text = payload.type === 'image' ? 'Photo' : (payload.text || 'New message');
    var avatar = document.getElementById('ni-msg-avatar');
    var fromEl = document.getElementById('ni-msg-from');
    var textEl = document.getElementById('ni-msg-text');
    var countEl = document.getElementById('ni-msg-count');
    if (avatar) avatar.textContent = from.charAt(0).toUpperCase();
    if (fromEl) fromEl.textContent = from;
    if (textEl) textEl.textContent = text;
    if (countEl) countEl.textContent = String(payload.count || 1);
    expandIsland();
    showPreview();
    clearTimeout(state.dismissTimer);
    state.dismissTimer = setTimeout(function(){
      var island = document.getElementById('nova-island');
      if (island && island.classList.contains('ni-message-preview-mode')) dismiss();
    }, 4500);
    return true;
  }
  function renderThread(){
    var box = document.getElementById('ni-msg-thread');
    var name = document.getElementById('ni-msg-reply-name');
    if (!box || !state.current) return;
    if (name) name.textContent = state.current.peer || state.current.from || 'Friend';
    var msgText = state.current.type === 'image' ? 'Photo' : (state.current.text || '');
    box.innerHTML =
      '<div class="ni-msg-bubble ni-msg-bubble-peer">' +
        '<div class="ni-msg-bubble-name">' + esc(state.current.from || state.current.peer || 'Friend') + '</div>' +
        '<div>' + esc(msgText) + '</div>' +
      '</div>';
  }
  async function sendReply(){
    if (state.sending || !state.current) return;
    var input = document.getElementById('ni-msg-input');
    var text = input && input.value.trim();
    var me = acct();
    var peer = state.current.peer || state.current.from;
    if (!text || !me || !peer) return;
    state.sending = true;
    var btn = document.getElementById('ni-msg-send');
    if (btn) btn.textContent = '...';
    var username = me.username.toLowerCase();
    var ts = Date.now();
    var cid = 'ni_' + ts + '_' + Math.random().toString(36).slice(2);
    try {
      if (state.demo) {
        if (input) input.value = '';
        var demoBox = document.getElementById('ni-msg-thread');
        if (demoBox) {
          var demoMine = document.createElement('div');
          demoMine.className = 'ni-msg-bubble ni-msg-bubble-me';
          demoMine.textContent = text;
          demoBox.appendChild(demoMine);
          demoBox.scrollTop = demoBox.scrollHeight;
        }
        setTimeout(dismiss, 1100);
        return;
      }
      await NovaAPI.sendMessage({channel:'dm:' + String(peer).toLowerCase(),body:text,messageType:'text'});
      if (input) input.value = '';
      var box = document.getElementById('ni-msg-thread');
      if (box) {
        var mine = document.createElement('div');
        mine.className = 'ni-msg-bubble ni-msg-bubble-me';
        mine.textContent = text;
        box.appendChild(mine);
        box.scrollTop = box.scrollHeight;
      }
      setTimeout(dismiss, 900);
    } catch(e) {
      if (window.toast) window.toast('Reply failed');
    } finally {
      state.sending = false;
      if (btn) btn.textContent = 'Send';
    }
  }
  async function poll(force){
    if (state.polling) return;
    if (!dmNotificationsOn()) {
      state.lastPollAt = Date.now();
      state.lastPollResult = 'dm notifications off';
      return;
    }
    state.polling = true;
    var me = acct();
    state.lastPollAt = Date.now();
    try {
      if (!me) {
        state.lastPollResult = 'no signed-in account';
        return;
      }
      if (document.hidden && !force) {
        state.lastPollResult = 'tab hidden';
        return;
      }
      var username = me.username.toLowerCase();
      var rows = [];
      if (!state.baselineReady) {
        state.serverBaselineId = 0;
        await buildBaseline(username, rows || []);
        state.lastPollResult = 'baseline ready';
        return;
      }
      var serverResult = await pollServerIncoming(username);
      if (serverResult === true) state.lastPollResult = 'shown from server';
      else if (serverResult === false) state.lastPollResult = 'no new messages';
      else state.lastPollResult = await pollStreams(username, rows) ? 'shown from stream fallback' : 'no new messages';
    } finally {
      state.polling = false;
    }
  }
  function start(){
    ensureUI();
    clearInterval(state.poll);
    state.sessionStartedAt = Date.now();
    state.baselineReady = false;
    state.serverBaselineId = 0;
    state.streamBaselines = {};
    state.peerCache = [];
    state.peerCacheAt = 0;
    poll(true);
    state.poll = setInterval(poll, 12000);
    if (state.demoScheduled) return;
    if (location.hash === '#test-message-island') {
      state.demoScheduled = true;
      setTimeout(function(){ demo(); }, 1800);
    } else if (location.hash === '#test-message-island-closed') {
      state.demoScheduled = true;
      setTimeout(function(){
        if (typeof window._novaCloseIsland === 'function') window._novaCloseIsland();
      }, 350);
      setTimeout(function(){ demo(); }, 1200);
    }
  }
  function demo(from, text){
    preview({
      peer: String(from || 'nova_friend').toLowerCase(),
      from: String(from || 'nova_friend').toLowerCase(),
      text: text || 'This is a Nova 6.0 Message Island preview.',
      type: 'text',
      count: 1,
      demo: true
    });
  }
  function status(){
    return {
      intervalMs: 3000,
      baselineReady: state.baselineReady,
      lastPollAt: state.lastPollAt ? new Date(state.lastPollAt).toISOString() : null,
      lastPollResult: state.lastPollResult,
      sessionStartedAt: new Date(state.sessionStartedAt || 0).toISOString(),
      serverBaselineId: state.serverBaselineId,
      peersWatched: Object.keys(state.streamBaselines),
      unreadCounts: state.lastCounts,
      lastError: state.lastError,
      lastSuppressedPeer: state.lastSuppressedPeer,
      hidden: document.hidden,
      hasAccount: !!acct()
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  document.addEventListener('nova:login', start);
  document.addEventListener('nova:account-changed', start);
  document.addEventListener('nova:social-pane-opened', function(e){
    var peer = e && e.detail && e.detail.pane;
    if (!state.current || !peer || !isViewingSocialConversation(peer)) return;
    var currentPeer = state.current.peer || state.current.from || '';
    if (String(currentPeer).toLowerCase() === String(peer).toLowerCase()) dismiss();
  });
  document.addEventListener('nova:message-island-test', function(e){
    var d = e.detail || {};
    demo(d.from, d.text);
  });
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) poll(true); });
  window.addEventListener('focus', function(){ poll(true); });
  window.addEventListener('online', function(){ poll(true); });
  document.addEventListener('click', function(e){
    var island = document.getElementById('nova-island');
    var star = document.getElementById('nova-island-star');
    if (state.open && island && !island.contains(e.target) && star && !star.contains(e.target)) dismiss();
  });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && state.open) dismiss();
  });
  window.NovaMessageIsland = { preview: preview, dismiss: dismiss, poll: poll, test: demo, status: status };
})();
