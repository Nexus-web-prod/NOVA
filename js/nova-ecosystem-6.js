(function(){
  'use strict';

  var K_BANNERS = 'nova:admin:banners';
  var K_MAINT = 'nova:admin:maintenance';
  var K_REFRESH = 'nova:admin:hard_refresh';
  var state = { notifyTimer: null, lastNotifyCount: 0 };

  function $(sel, root){ return (root || document).querySelector(sel); }
  function $all(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }
  function acct(){
    try { return JSON.parse(localStorage.getItem('nova_account') || 'null'); }
    catch(e){ return null; }
  }
  function toast(msg){
    if (window.toast) { try { window.toast(msg); return; } catch(e){} }
    var c = document.getElementById('toast-container');
    if (!c) return;
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(function(){ el.classList.add('out'); setTimeout(function(){ el.remove(); }, 350); }, 2400);
  }
  async function rest(path){
    if (!window.__NOVA_SUPABASE_URL || !window.__NOVA_SUPABASE_KEY) return null;
    try {
      var res = await fetch(window.__NOVA_SUPABASE_URL + '/rest/v1/' + path, {
        headers: {
          apikey: window.__NOVA_SUPABASE_KEY,
          Authorization: 'Bearer ' + window.__NOVA_SUPABASE_KEY,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) return null;
      var text = await res.text();
      return text ? JSON.parse(text) : null;
    } catch(e){ return null; }
  }
  async function kvGet(key){
    try {
      if (!window.__novaDB) return null;
      var raw = window.__novaDB.getFresh ? await window.__novaDB.getFresh(key) : await window.__novaDB.get(key);
      if (raw == null) return null;
      try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e){ return raw; }
    } catch(e){ return null; }
  }
  async function kvSet(key, value){
    if (!window.__novaDB) return false;
    try {
      if (window.__novaDB.setJson) await window.__novaDB.setJson(key, value);
      else await window.__novaDB.set(key, JSON.stringify(value));
      return true;
    } catch(e){ return false; }
  }
  function goPage(page){
    var tab = document.querySelector('.nav-tab[data-page="' + page + '"]');
    if (tab) tab.click();
  }
  function openUrl(url){
    if (window.goTo) window.goTo(url);
    else location.href = url;
  }
  function closeIsland(){
    if (typeof window._novaSyncIslandVisibility === 'function') {
      requestAnimationFrame(function(){ window._novaSyncIslandVisibility(); });
      return;
    }
    var star = $('#nova-island-star');
    var island = $('#nova-island');
    var shell = $('#shell');
    if (star) star.classList.remove('open');
    if (island) island.classList.remove('open');
    if (shell) shell.classList.remove('island-open');
  }

  function addIslandBadge(){
    var star = $('#nova-island-star');
    if (!star || $('#ni-notify-dot')) return;
    var dot = document.createElement('span');
    dot.id = 'ni-notify-dot';
    dot.textContent = '0';
    star.appendChild(dot);
  }

  function injectIslandTabs(){
    removeIslandHubAndAlerts();

    document.addEventListener('click', function(e){
      var pageBtn = e.target.closest('[data-ni6-page]');
      if (pageBtn) {
        goPage(pageBtn.dataset.ni6Page);
        closeIsland();
      }
      if (e.target.closest('#ni6-command-go')) runCommand();
      if (e.target.closest('#ni6-refresh-notes')) renderNotifications();
      var note = e.target.closest('[data-ni6-action]');
      if (note) handleNotificationAction(note);
      var cont = e.target.closest('[data-ni6-url]');
      if (cont) {
        openUrl(cont.dataset.ni6Url);
        closeIsland();
      }
    });
    document.addEventListener('keydown', function(e){
      if (e.key === 'Enter' && document.activeElement && document.activeElement.id === 'ni6-command-input') runCommand();
    });
  }

  function removeIslandHubAndAlerts(){
    ['#ni-notifications-tab', '#ni-launchpad-tab', '[data-ni-panel="notifications"]', '[data-ni-panel="launchpad"]', '#ni-notify-dot'].forEach(function(sel){
      var el = $(sel);
      if (el) el.remove();
    });
  }

  function runCommand(){
    var input = $('#ni6-command-input');
    var q = input && input.value.trim();
    if (!q) return;
    if (q.charAt(0) === '/') {
      var cmd = q.slice(1).toLowerCase();
      var map = { games:'games', apps:'apps', movies:'movies', social:'social', rewards:'rewards', settings:'settings', admin:'dev' };
      if (map[cmd]) { goPage(map[cmd]); closeIsland(); return; }
      toast('Unknown Nova command');
      return;
    }
    openUrl(q);
    closeIsland();
  }

  function getRecents(){
    var out = [];
    try { out = JSON.parse(localStorage.getItem('nova_recents') || '[]'); } catch(e){}
    if (!out.length) { try { out = JSON.parse(localStorage.getItem('nova_recents_v2') || '[]'); } catch(e){} }
    return Array.isArray(out) ? out : [];
  }

  function renderLaunchpad(){
    var body = $('#ni6-continue-body');
    if (!body) return;
    var recents = getRecents().slice(0, 5);
    if (!recents.length) {
      body.innerHTML = '<div class="ni6-empty">No session history yet. Open a game, app, or site and it will appear here.</div>';
      return;
    }
    body.innerHTML = recents.map(function(r){
      var name = r.name || r.title || r.url || 'Recent item';
      var url = r.url || r.src || '';
      return '<button class="ni6-note ni6-note-button" data-ni6-url="' + esc(url) + '">' +
        '<span class="ni6-note-icon">&rarr;</span><span><strong>' + esc(name) + '</strong><small>Continue where you left off</small></span>' +
      '</button>';
    }).join('');
  }

  async function collectNotifications(){
    var notes = [];
    var me = acct();
    var banners = await kvGet(K_BANNERS);
    var maint = await kvGet(K_MAINT);
    if (maint && maint.enabled) {
      notes.push({ type:'system', title:'Maintenance mode is on', body:maint.message || 'Nova is in maintenance mode.', action:'admin' });
    }
    if (Array.isArray(banners)) {
      banners.filter(function(b){ return b && b.active !== false && b.text; }).slice(-3).forEach(function(b){
        notes.push({ type:'banner', title:'Site update', body:b.text, action:'support' });
      });
    }
    if (me && me.username) {
      var user = String(me.username).toLowerCase();
      var unread = await rest('social_unread?username=eq.' + encodeURIComponent(user) + '&select=other_user,count&limit=50');
      (unread || []).forEach(function(r){
        var count = parseInt(r.count || 0, 10);
        if (count > 0) notes.push({ type:'dm', title:r.other_user, body:count + ' unread message' + (count === 1 ? '' : 's'), action:'social', peer:r.other_user });
      });
      var req = await rest('friend_requests?to_user=eq.' + encodeURIComponent(user) + '&select=from_user,created_at&limit=20');
      (req || []).forEach(function(r){
        notes.push({ type:'friend', title:'Friend request', body:(r.from_user || 'Someone') + ' wants to connect', action:'social' });
      });
      try {
        var badges = JSON.parse(localStorage.getItem('nova_badges_earned') || '{}');
        var badgeCount = Object.keys(badges).length;
        if (badgeCount > 0) notes.push({ type:'reward', title:'Rewards progress', body:badgeCount + ' badges earned in this browser', action:'rewards' });
      } catch(e){}
      if (window._novaIsAdminAuthed || window._novaIsDevUser) {
        notes.push({ type:'admin', title:'Admin tools ready', body:'Operations 6.0 is available in the admin panel', action:'admin' });
      }
    } else {
      notes.push({ type:'account', title:'Sign in to connect Nova', body:'Messages, friends, rewards, and admin tools sync after sign in.', action:'account' });
    }
    return notes;
  }

  async function renderNotifications(){
    var body = $('#ni6-notifications-body');
    var dot = $('#ni-notify-dot');
    var tabCount = $('#ni-tab-alert-count');
    var notes = await collectNotifications();
    state.lastNotifyCount = notes.length;
    if (dot) {
      dot.textContent = notes.length > 9 ? '9+' : String(notes.length);
      dot.style.display = notes.length ? 'inline-flex' : 'none';
    }
    if (tabCount) tabCount.textContent = notes.length ? String(notes.length) : '';
    if (!body) return;
    if (!notes.length) {
      body.innerHTML = '<div class="ni6-empty">All clear. New DMs, friend requests, banners, and admin alerts appear here.</div>';
      return;
    }
    body.innerHTML = notes.map(function(n){
      return '<button class="ni6-note ni6-note-button" data-ni6-action="' + esc(n.action || '') + '" data-peer="' + esc(n.peer || '') + '">' +
        '<span class="ni6-note-icon">' + iconFor(n.type) + '</span>' +
        '<span><strong>' + esc(n.title) + '</strong><small>' + esc(n.body) + '</small></span>' +
      '</button>';
    }).join('');
  }

  function iconFor(type){
    return ({ dm:'M', friend:'+', reward:'*', banner:'!', system:'S', admin:'A', account:'U' })[type] || '.';
  }

  function handleNotificationAction(el){
    var action = el.dataset.ni6Action;
    if (action === 'social') {
      goPage('social');
      closeIsland();
      return;
    }
    if (action === 'rewards') {
      goPage('rewards');
      closeIsland();
      return;
    }
    if (action === 'support') {
      goPage('support');
      closeIsland();
      return;
    }
    if (action === 'admin') {
      goPage('dev');
      closeIsland();
      return;
    }
    if (action === 'account') {
      var btn = $('#account-btn');
      if (btn) btn.click();
      closeIsland();
    }
  }

  function injectAdminOps(){
    var nav = document.querySelector('.nap-nav-btn[data-nap="overview"]');
    var content = $('#nap-content');
    if (!nav || !content || $('#nap-ecosystem')) return;
    nav.insertAdjacentHTML('afterend',
      '<button class="nap-nav-btn" data-nap="ecosystem" id="nap-ecosystem-nav">' +
      '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="4"/></svg> Operations 6.0</button>'
    );
    content.insertAdjacentHTML('beforeend',
      '<div class="nap-section" id="nap-ecosystem" style="display:none;">' +
        '<div class="nap-section-title">Operations 6.0</div>' +
        '<div class="nap-section-sub">Connected health, announcements, and cleanup controls</div>' +
        '<div class="nap-eco-grid">' +
          '<div class="nap-card"><div class="nap-card-title">D1 Health</div><div id="nap-eco-health" class="nap-eco-readout">Not checked</div><button class="nap-btn nap-btn-accent" id="nap-eco-health-btn">Run Health Check</button></div>' +
          '<div class="nap-card"><div class="nap-card-title">Message Island</div><div id="nap-eco-island" class="nap-eco-readout">Waiting</div><button class="nap-btn" id="nap-eco-island-btn">Read Status</button></div>' +
          '<div class="nap-card"><div class="nap-card-title">Broadcast Banner</div><input class="nap-input" id="nap-eco-banner-text" placeholder="Message to show everyone..." style="width:100%;box-sizing:border-box;margin:.35rem 0;"><button class="nap-btn nap-btn-accent" id="nap-eco-banner-btn">Publish Banner</button></div>' +
          '<div class="nap-card"><div class="nap-card-title">Force Client Refresh</div><div class="nap-eco-readout">Signals active users to refresh on next sync.</div><button class="nap-btn" id="nap-eco-refresh-btn">Push Refresh Signal</button></div>' +
          '<div class="nap-card"><div class="nap-card-title">Local Cleanup</div><div class="nap-eco-readout">Clears stale local caches without deleting accounts or favorites.</div><button class="nap-btn nap-btn-danger" id="nap-eco-clean-btn">Clean This Browser</button></div>' +
          '<div class="nap-card"><div class="nap-card-title">Ecosystem Snapshot</div><div id="nap-eco-snapshot" class="nap-eco-readout">Loading...</div></div>' +
        '</div>' +
      '</div>'
    );
    $('#nap-ecosystem-nav').addEventListener('click', function(){ showAdminOps(); });
    $('#nap-eco-health-btn').addEventListener('click', runHealth);
    $('#nap-eco-island-btn').addEventListener('click', readIslandStatus);
    $('#nap-eco-banner-btn').addEventListener('click', publishBanner);
    $('#nap-eco-refresh-btn').addEventListener('click', pushRefresh);
    $('#nap-eco-clean-btn').addEventListener('click', cleanLocalCaches);
    renderAdminSnapshot();
  }

  function showAdminOps(){
    $all('.nap-section').forEach(function(s){ s.style.display = 'none'; });
    $all('.nap-nav-btn').forEach(function(b){ b.classList.remove('active'); });
    var sec = $('#nap-ecosystem');
    var btn = $('#nap-ecosystem-nav');
    if (sec) sec.style.display = 'block';
    if (btn) btn.classList.add('active');
    renderAdminSnapshot();
  }

  async function runHealth(){
    var el = $('#nap-eco-health');
    if (el) el.textContent = 'Checking...';
    try {
      var res = await fetch('/api/health');
      var data = await res.json();
      if (el) el.innerHTML = 'ok=' + esc(data.ok) + '<br>dbBound=' + esc(data.dbBound) + '<br>dbOk=' + esc(data.dbOk);
    } catch(e){
      if (el) el.textContent = 'Health check failed';
    }
  }

  function readIslandStatus(){
    var el = $('#nap-eco-island');
    var status = window.NovaMessageIsland && window.NovaMessageIsland.status ? window.NovaMessageIsland.status() : null;
    if (!el) return;
    el.textContent = status ? JSON.stringify(status, null, 2) : 'Message Island API not ready';
  }

  async function publishBanner(){
    var input = $('#nap-eco-banner-text');
    var text = input && input.value.trim();
    if (!text) return toast('Enter a banner message');
    var banners = await kvGet(K_BANNERS);
    var arr = Array.isArray(banners) ? banners : [];
    arr.push({ text:text, type:'info', active:true, dismissible:true, ts:Date.now(), source:'operations-6' });
    if (await kvSet(K_BANNERS, arr)) {
      input.value = '';
      toast('Banner published');
      renderNotifications();
    } else toast('Banner failed');
  }

  async function pushRefresh(){
    if (await kvSet(K_REFRESH, { ts:Date.now(), reason:'admin operations 6 refresh' })) toast('Refresh signal pushed');
    else toast('Refresh signal failed');
  }

  function cleanLocalCaches(){
    [
      'nova_stats_cache',
      'nova_social_cache',
      'nova_movies_cache',
      'nova_last_health',
      'nova_temp_search'
    ].forEach(function(k){ localStorage.removeItem(k); });
    toast('Stale local caches cleared');
    renderAdminSnapshot();
  }

  function renderAdminSnapshot(){
    var el = $('#nap-eco-snapshot');
    if (!el) return;
    var recents = getRecents().length;
    var favs = 0;
    try { favs += JSON.parse(localStorage.getItem('nova_favs') || '[]').length; } catch(e){}
    try { favs += JSON.parse(localStorage.getItem('nova_app_favs') || '[]').length; } catch(e){}
    var account = acct();
    el.innerHTML = 'Account: ' + esc(account && account.username ? account.username : 'guest') +
      '<br>Recents: ' + recents +
      '<br>Favorites: ' + favs +
      '<br>Notifications: ' + state.lastNotifyCount;
  }

  function startNotificationLoop(){
    removeIslandHubAndAlerts();
    clearInterval(state.notifyTimer);
  }

  function init(){
    injectIslandTabs();
    removeIslandHubAndAlerts();
    injectAdminOps();
    startNotificationLoop();
    [500, 1500, 3500].forEach(function(t){ setTimeout(function(){ injectAdminOps(); removeIslandHubAndAlerts(); }, t); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  document.addEventListener('nova:login', init);
  document.addEventListener('nova:account-changed', init);
  document.addEventListener('nova:admin-auth-changed', function(){ setTimeout(injectAdminOps, 200); renderNotifications(); });
  document.addEventListener('nova:page-change', function(e){ if (e.detail && e.detail.page === 'dev') setTimeout(injectAdminOps, 300); });

  window.NovaEcosystem6 = {
    refreshNotifications: renderNotifications,
    renderLaunchpad: renderLaunchpad,
    showAdminOps: showAdminOps
  };
})();
