(function(){
  var KEY = 'nova_control_center';
  var POSITION_MIGRATION_KEY = 'nova_island_position_v588';
  var POSITION_SYNC_KEY = 'nova_island_position_sync_v588';
  var MOTION_MIGRATION_KEY = 'nova_island_motion_v589';
  var MOTION_SYNC_KEY = 'nova_island_motion_sync_v589';
  var LOCAL_DIRTY_KEY = 'nova_control_center_dirty';
  var defaults = {
    displayName: '', statusText: '', avatarInitial: '',
    onlineVisibility: 'everyone',
    accentColor: '#8b8fff', purpleIntensity: 70, backgroundStyle: 'stars',
    islandCloseButton: true, islandPulse: true, islandPosition: 'top-right', islandSize: 'normal', islandSpeed: 100,
    cardSize: 'normal', showRatings: true, showRecents: true, hideUnavailableApps: false, movieCardSize: 'normal',
    friendRequests: 'everyone', everyoneChat: true, voicePresence: true, dmNotifications: true,
    hidePlayCount: false, hideBadges: false, disableActivity: false,
    performanceMode: 'balanced', blurLevel: 'off', backgroundAnimation: false, hoverZoom: false, batterySaver: false,
    animationIntensity: 75, starDensity: 70, soundEffects: false, themeAccentLocked: false,
    textSize: 'normal', highContrast: false, reduceMotion: false, focusOutlines: true
  };
  var remoteTimer = null;
  var remoteLoading = false;
  var initialized = false;
  var bootErrors = [];
  function storageGet(key, fallback){
    try { var value = localStorage.getItem(key); return value == null ? fallback : value; }
    catch(e){ return fallback; }
  }
  function storageSet(key, value){ try { localStorage.setItem(key, value); return true; } catch(e){ return false; } }
  function storageRemove(key){ try { localStorage.removeItem(key); } catch(e){} }
  function sessionGet(key){ try { return window.sessionStorage ? sessionStorage.getItem(key) : null; } catch(e){ return null; } }
  function sessionSet(key, value){ try { if (window.sessionStorage) sessionStorage.setItem(key, value); } catch(e){} }
  function read(){
    try {
      var saved = JSON.parse(storageGet(KEY, '{}') || '{}');
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
      delete saved.islandEnabled;
      return Object.assign({}, defaults, saved);
    }
    catch(e){ return Object.assign({}, defaults); }
  }
  function write(state){ storageSet(KEY, JSON.stringify(state)); }
  function migrateIslandPosition(){
    if (storageGet(POSITION_MIGRATION_KEY, '0') === '1') return;
    var state = read();
    state.islandPosition = 'top-right';
    write(state);
    storageSet(POSITION_MIGRATION_KEY, '1');
    storageSet(POSITION_SYNC_KEY, '1');
  }
  function migrateIslandMotion(){
    if (storageGet(MOTION_MIGRATION_KEY, '0') === '1') return;
    var state = read();
    state.islandSpeed = 100;
    write(state);
    storageSet(MOTION_MIGRATION_KEY, '1');
    storageSet(MOTION_SYNC_KEY, '1');
  }
  function syncStatus(text, state){
    var pill = document.getElementById('settings-sync-status');
    if (!pill) return;
    pill.classList.toggle('syncing', state === 'syncing');
    pill.classList.toggle('error', state === 'error');
    var label = pill.querySelector('span:last-child');
    if (label) label.textContent = text;
  }
  function queueRemoteSync(state){
    clearTimeout(remoteTimer);
    if (!window.__novaV7User || !window.NovaAPI || !NovaAPI.saveSettings) {
      syncStatus('Saved on this device');
      return;
    }
    syncStatus('Syncing with Nova…', 'syncing');
    remoteTimer = setTimeout(function(){
      NovaAPI.saveSettings(Object.assign({}, state, { theme: storageGet('nova_theme', 'dark') || 'dark' }))
        .then(function(){
          storageRemove(LOCAL_DIRTY_KEY);
          storageRemove(POSITION_SYNC_KEY);
          storageRemove(MOTION_SYNC_KEY);
          syncStatus('Synced with Nova');
        })
        .catch(function(){ syncStatus('Saved here · cloud sync failed', 'error'); });
    }, 650);
  }
  function cancelRemoteSync(){
    clearTimeout(remoteTimer);
    remoteTimer = null;
  }
  async function loadRemote(){
    if (remoteLoading || !window.__novaV7User || !window.NovaAPI || !NovaAPI.getSettings) {
      if (!window.__novaV7User) syncStatus('Saved on this device');
      return;
    }
    remoteLoading = true;
    syncStatus('Loading synced settings…', 'syncing');
    try {
      var result = await NovaAPI.getSettings();
      var remote = result && result.settings && typeof result.settings === 'object' ? result.settings : {};
      if (storageGet(LOCAL_DIRTY_KEY, '0') === '1') {
        queueRemoteSync(read());
        return;
      }
      if (Object.keys(remote).length) {
        var remoteTheme = typeof remote.theme === 'string' && remote.theme.length <= 64 ? remote.theme : '';
        if (remoteTheme) {
          var previousTheme = storageGet('nova_theme', 'dark') || 'dark';
          storageSet('nova_theme', remoteTheme);
          if (remoteTheme === 'dark' || remoteTheme === 'light') document.documentElement.setAttribute('data-theme', remoteTheme);
          else if (remoteTheme !== previousTheme) setTimeout(function(){ location.reload(); }, 80);
        }
        delete remote.theme;
        var safeRemote = {};
        Object.keys(defaults).forEach(function(key){ if (Object.prototype.hasOwnProperty.call(remote, key)) safeRemote[key] = remote[key]; });
        if (storageGet(POSITION_SYNC_KEY, '0') === '1') safeRemote.islandPosition = 'top-right';
        if (storageGet(MOTION_SYNC_KEY, '0') === '1') safeRemote.islandSpeed = 100;
        write(Object.assign({}, read(), safeRemote));
        hydrate();
        apply();
        if (storageGet(POSITION_SYNC_KEY, '0') === '1' || storageGet(MOTION_SYNC_KEY, '0') === '1') queueRemoteSync(read());
      } else {
        queueRemoteSync(read());
      }
      syncStatus('Synced with Nova');
    } catch (error) {
      syncStatus('Saved here · cloud unavailable', 'error');
    } finally { remoteLoading = false; }
  }
  function toast(msg){
    if (window.toast) return window.toast(msg);
    var box = document.getElementById('toast-container');
    if (!box) return;
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function(){ el.remove(); }, 2200);
  }
  function ready(fn){
    if (document.readyState === 'complete') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }
  function setData(name, value){
    var attribute = name.indexOf('data-') === 0 ? name : 'data-' + name;
    document.documentElement.setAttribute(attribute, value);
    if (attribute !== name) document.documentElement.removeAttribute(name);
  }
  function tone(hex, amount){
    var n = parseInt(String(hex || '#8b8fff').replace('#',''), 16);
    var r = Math.min(255, Math.max(0, (n >> 16) + amount));
    var g = Math.min(255, Math.max(0, ((n >> 8) & 255) + amount));
    var b = Math.min(255, Math.max(0, (n & 255) + amount));
    return '#' + [r,g,b].map(function(v){ return v.toString(16).padStart(2,'0'); }).join('');
  }
  function scaleRgba(value, factor){
    return String(value).replace(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/, function(_, r, g, b, alpha){
      return 'rgba(' + r + ',' + g + ',' + b + ',' + Math.max(0, Math.min(1, Number(alpha) * factor)).toFixed(3) + ')';
    });
  }
  var themeAccents = {
    dark: { accent:'#8b8fff', accent2:'#5d5df6', glow:'rgba(139,143,255,0.18)', glowS:'rgba(139,143,255,0.07)' },
    nebula: { accent:'#c084fc', accent2:'#a855f7', glow:'rgba(192,132,252,0.18)', glowS:'rgba(192,132,252,0.07)' },
    midnight: { accent:'#60a5fa', accent2:'#3b82f6', glow:'rgba(96,165,250,0.18)', glowS:'rgba(96,165,250,0.07)' },
    crimson: { accent:'#f87171', accent2:'#ef4444', glow:'rgba(248,113,113,0.18)', glowS:'rgba(248,113,113,0.07)' },
    forest: { accent:'#4ade80', accent2:'#22c55e', glow:'rgba(74,222,128,0.18)', glowS:'rgba(74,222,128,0.07)' },
    light: { accent:'#5d5df6', accent2:'#4040d0', glow:'rgba(93,93,246,0.14)', glowS:'rgba(93,93,246,0.06)' }
  };
  function apply(){
    var s = read();
    var fast = s.performanceMode === 'fast' || s.batterySaver;
    var quality = s.performanceMode === 'quality' && !s.batterySaver;
    var parsedIntensity = Number(s.purpleIntensity);
    var intensity = Math.max(0, Math.min(100, Number.isFinite(parsedIntensity) ? parsedIntensity : defaults.purpleIntensity));
    var selectedPalette = s.themeAccentLocked ? themeAccents[storageGet('nova_theme', 'dark')] : null;
    var accent = selectedPalette ? selectedPalette.accent : (s.accentColor || defaults.accentColor);
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.style.setProperty('--accent2', selectedPalette ? selectedPalette.accent2 : tone(accent, -42));
    document.documentElement.style.setProperty('--glow', selectedPalette ? scaleRgba(selectedPalette.glow, intensity / 70) : 'rgba(139,143,255,' + (intensity / 330).toFixed(2) + ')');
    document.documentElement.style.setProperty('--glow-s', selectedPalette ? scaleRgba(selectedPalette.glowS, intensity / 70) : 'rgba(139,143,255,' + (intensity / 850).toFixed(2) + ')');
    setData('card-size', s.cardSize);
    setData('ratings', s.showRatings ? 'on' : 'off');
    setData('recents', s.showRecents ? 'on' : 'off');
    setData('hide-unavailable', s.hideUnavailableApps ? 'on' : 'off');
    setData('movie-size', s.movieCardSize);
    setData('bg-style', fast ? 'flat' : s.backgroundStyle);
    setData('performance-mode', fast ? 'fast' : (quality ? 'quality' : 'balanced'));
    setData('bg-anim', (!fast && s.backgroundAnimation) ? 'on' : 'off');
    setData('hover-zoom', (!fast && s.hoverZoom) ? 'on' : 'off');
    setData('blur-level', fast ? 'off' : (quality ? 'full' : s.blurLevel));
    setData('island-enabled', 'on');
    setData('island-close-button', s.islandCloseButton ? 'on' : 'off');
    setData('island-pulse', s.islandPulse ? 'on' : 'off');
    setData('island-pos', s.islandPosition);
    setData('island-size', s.islandSize);
    setData('island-speed', s.islandSpeed < 85 ? 'fast' : (s.islandSpeed > 115 ? 'slow' : 'normal'));
    setData('everyone-chat', s.everyoneChat ? 'on' : 'off');
    setData('voice-presence', s.voicePresence ? 'on' : 'off');
    setData('friend-requests', s.friendRequests);
    setData('online-visibility', s.onlineVisibility);
    setData('dm-notifications', s.dmNotifications ? 'on' : 'off');
    setData('disable-activity', s.disableActivity ? 'on' : 'off');
    setData('hide-play-count', s.hidePlayCount ? 'on' : 'off');
    setData('hide-badges', s.hideBadges ? 'on' : 'off');
    setData('high-contrast', s.highContrast ? 'on' : 'off');
    setData('focus-outlines', s.focusOutlines ? 'on' : 'off');
    setData('text-size', s.textSize);
    setData('reduce-motion', s.reduceMotion ? 'on' : 'off');
    var animationIntensity = Math.max(0, Math.min(100, Number(s.animationIntensity == null ? defaults.animationIntensity : s.animationIntensity)));
    var starDensity = Math.max(0, Math.min(100, Number(s.starDensity == null ? defaults.starDensity : s.starDensity)));
    document.documentElement.style.setProperty('--nova-animation-intensity', String(animationIntensity / 100));
    document.documentElement.style.setProperty('--nova-star-density', String(starDensity / 100));
    setData('sound-effects', s.soundEffects ? 'on' : 'off');
    storageSet('nova_social_friend_requests', s.friendRequests);
    storageSet('nova_social_visibility', s.onlineVisibility);
    storageSet('nova_dm_notifications', s.dmNotifications ? '1' : '0');
    storageSet('nova_disable_activity', s.disableActivity ? '1' : '0');
    storageSet('nova_hide_play_count', s.hidePlayCount ? '1' : '0');
    storageSet('nova_profile_display_name', s.displayName || '');
    storageSet('nova_profile_status', s.statusText || '');
    storageSet('nova_profile_avatar_initial', s.avatarInitial || '');
    if (s.disableActivity) {
      storageRemove('nova_recents');
      storageRemove('nova_recents_v2');
      document.querySelectorAll('#games-recents-section,#recents-section').forEach(function(el){ el.classList.add('hidden'); });
    }
    document.dispatchEvent(new CustomEvent('nova:settings-changed', { detail: s }));
  }
  function hydrate(){
    var s = read();
    document.querySelectorAll('.nova-control[data-control]').forEach(function(el){
      var key = el.dataset.control;
      if (!(key in s)) return;
      if (el.type === 'checkbox') el.checked = !!s[key];
      else if (el.type === 'color' && !/^#[0-9a-f]{6}$/i.test(String(s[key] || ''))) el.value = defaults[key];
      else el.value = s[key];
    });
    document.querySelectorAll('.theme-opt[data-theme-val]').forEach(function(btn){
      btn.classList.toggle('active', btn.dataset.themeVal === (storageGet('nova_theme', 'dark') || 'dark'));
    });
  }
  function update(key, value){
    var s = read();
    s[key] = value;
    if (key === 'accentColor') s.themeAccentLocked = false;
    if (key === 'islandPosition') storageRemove(POSITION_SYNC_KEY);
    if (key === 'islandSpeed') storageRemove(MOTION_SYNC_KEY);
    if (key === 'batterySaver' && value) {
      s.performanceMode = 'fast';
      s.blurLevel = 'off';
      s.backgroundAnimation = false;
      s.hoverZoom = false;
    }
    write(s);
    storageSet(LOCAL_DIRTY_KEY, '1');
    hydrate();
    apply();
    queueRemoteSync(s);
  }
  function bindPanes(){
    var buttons = Array.from(document.querySelectorAll('.settings-rail-btn'));
    var indicator = document.querySelector('.settings-rail-indicator');
    function moveIndicator(btn){
      if (!btn || !indicator || getComputedStyle(indicator).display === 'none') return;
      indicator.style.height = btn.offsetHeight + 'px';
      indicator.style.transform = 'translateY(' + (btn.offsetTop - 5) + 'px)';
    }
    function activate(btn){
      var pane = btn.dataset.settingsPane;
      buttons.forEach(function(b){ b.classList.toggle('active', b === btn); b.setAttribute('aria-selected', b === btn ? 'true' : 'false'); });
      document.querySelectorAll('.settings-pane').forEach(function(p){ p.classList.toggle('active', p.dataset.settingsPanePanel === pane); });
      sessionSet('nova_settings_pane', pane);
      moveIndicator(btn);
      var page = document.querySelector('.settings-v7-page');
      if (page && typeof page.scrollTo === 'function') page.scrollTo({ top: 0, behavior: 'auto' });
      else if (page) page.scrollTop = 0;
    }
    buttons.forEach(function(btn){
      btn.addEventListener('click', function(){
        activate(btn);
      });
    });
    var remembered = sessionGet('nova_settings_pane');
    var initial = buttons.find(function(btn){ return btn.dataset.settingsPane === remembered; }) || buttons[0];
    if (initial) activate(initial);
    window.addEventListener('resize', function(){ moveIndicator(document.querySelector('.settings-rail-btn.active')); });
  }
  function bindControls(){
    document.querySelectorAll('.nova-control[data-control]').forEach(function(el){
      el.addEventListener('input', function(){
        var val = el.type === 'checkbox' ? el.checked : el.value;
        if (el.type === 'range') val = parseInt(val, 10);
        update(el.dataset.control, val);
      });
      el.addEventListener('change', function(){
        var val = el.type === 'checkbox' ? el.checked : el.value;
        if (el.type === 'range') val = parseInt(val, 10);
        update(el.dataset.control, val);
      });
    });
    document.querySelectorAll('.theme-opt[data-theme-val]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var val = btn.dataset.themeVal || 'dark';
        storageSet('nova_theme', val);
        document.documentElement.setAttribute('data-theme', val);
        document.querySelectorAll('.theme-opt[data-theme-val]').forEach(function(b){ b.classList.toggle('active', b === btn); });
        toast(val === 'light' ? 'Light mode on' : 'Dark mode on');
        queueRemoteSync(read());
      });
    });
    document.querySelectorAll('[data-control-action]').forEach(function(btn){
      btn.addEventListener('click', function(){
        if (btn.dataset.controlAction === 'clear-recents') {
          storageRemove('nova_recents');
          storageRemove('nova_recents_v2');
          toast('Recent activity cleared');
          document.querySelectorAll('#games-recents-row,#recents-row').forEach(function(el){ el.innerHTML = ''; });
          document.querySelectorAll('#games-recents-section,#recents-section').forEach(function(el){ el.classList.add('hidden'); });
        }
      });
    });
  }
  function bindSettingsUtilities(){
    var backupKeys = new Set([
      KEY, 'nova_theme', 'nova_adblock', 'nova_ab_mode', 'nova_tab_cloak', 'nova_homepage',
      'nova_search_engine', 'nova_panic_key', 'nova_panic_url', 'nova_favs', 'nova_app_favs',
      'nova_game_sort', 'nova_app_sort', 'nova_quick_links'
    ]);
    function updateOutputs(){
      var intensity = document.querySelector('[data-control="purpleIntensity"]');
      var intensityOut = document.getElementById('settings-purple-output');
      if (intensity && intensityOut) intensityOut.textContent = intensity.value + '%';
      var speed = document.querySelector('[data-control="islandSpeed"]');
      var speedOut = document.getElementById('settings-island-speed-output');
      if (speed && speedOut) speedOut.textContent = Number(speed.value) < 85 ? 'Fast' : (Number(speed.value) > 115 ? 'Slow' : 'Normal');
      var animation = document.querySelector('[data-control="animationIntensity"]');
      var animationOut = document.getElementById('settings-animation-output');
      if (animation && animationOut) animationOut.textContent = animation.value + '%';
      var density = document.querySelector('[data-control="starDensity"]');
      var densityOut = document.getElementById('settings-star-density-output');
      if (density && densityOut) densityOut.textContent = density.value + '%';
    }
    document.querySelectorAll('[data-control="purpleIntensity"],[data-control="islandSpeed"],[data-control="animationIntensity"],[data-control="starDensity"]').forEach(function(input){ input.addEventListener('input', updateOutputs); });
    document.querySelectorAll('#theme-presets button').forEach(function(button){ button.type = 'button'; });
    document.getElementById('theme-presets')?.addEventListener('click', function(){ setTimeout(function(){ queueRemoteSync(read()); }, 0); });
    updateOutputs();
    var usage = document.getElementById('settings-storage-usage');
    if (usage) {
      var bytes = 0;
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var key = localStorage.key(i) || '';
          bytes += key.length + String(storageGet(key, '') || '').length;
        }
      } catch(e){}
      usage.textContent = (bytes / 1024).toFixed(bytes > 1024 ? 1 : 0) + ' KB stored on this device';
    }
    document.getElementById('settings-reset-btn')?.addEventListener('click', function(){
      if (!window.confirm('Reset Nova interface settings? Your account and Social data will stay intact.')) return;
      [KEY, 'nova_theme', 'nova_adblock', 'nova_ab_mode', 'nova_tab_cloak', 'nova_homepage', 'nova_search_engine', 'nova_panic_key', 'nova_panic_url'].forEach(storageRemove);
      write(Object.assign({}, defaults));
      if (window.__novaV7User && window.NovaAPI && NovaAPI.saveSettings) NovaAPI.saveSettings(Object.assign({}, defaults, { theme: 'dark' })).catch(function(){});
      location.reload();
    });
    document.getElementById('download-save-btn')?.addEventListener('click', function(event){
      event.preventDefault(); event.stopImmediatePropagation();
      var payload = { version: 1, exportedAt: new Date().toISOString(), settings: {} };
      backupKeys.forEach(function(key){ var value = storageGet(key, null); if (value != null) payload.settings[key] = value; });
      var href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      var link = document.createElement('a');
      link.href = href; link.download = 'nova-settings-' + new Date().toISOString().slice(0,10) + '.json'; link.click();
      setTimeout(function(){ URL.revokeObjectURL(href); }, 1000);
      toast('Settings backup exported');
    }, true);
    document.getElementById('upload-save-btn')?.addEventListener('click', function(event){
      event.preventDefault(); event.stopImmediatePropagation();
      document.getElementById('save-file-input')?.click();
    }, true);
    document.getElementById('save-file-input')?.addEventListener('change', function(event){
      event.stopImmediatePropagation();
      var input = event.currentTarget;
      var file = input.files && input.files[0];
      input.value = '';
      if (!file) return;
      if (file.size > 512 * 1024) { toast('That backup file is too large'); return; }
      var reader = new FileReader();
      reader.onload = function(){
        try {
          var parsed = JSON.parse(String(reader.result || '{}'));
          var source = parsed && parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : parsed;
          var restored = 0;
          Object.keys(source).forEach(function(key){
            if (!backupKeys.has(key) || typeof source[key] !== 'string') return;
            storageSet(key, source[key]); restored++;
          });
          if (!restored) throw new Error('No Nova settings found');
          toast('Settings restored');
          setTimeout(function(){ location.reload(); }, 450);
        } catch (error) { toast('That is not a valid Nova settings backup'); }
      };
      reader.readAsText(file);
    }, true);
  }
  function bindSystemControls(){
    function capture(el, type, handler){
      if (!el) return;
      el.addEventListener(type, function(event){
        event.stopImmediatePropagation();
        handler(event);
      }, true);
    }
    function notifySaved(message){ toast(message); queueRemoteSync(read()); }

    var adblock = document.getElementById('adblock-toggle');
    if (adblock) {
      adblock.checked = storageGet('nova_adblock', '0') === '1';
      capture(adblock, 'change', function(){
        storageSet('nova_adblock', adblock.checked ? '1' : '0');
        notifySaved(adblock.checked ? 'Ad blocker on' : 'Ad blocker off');
      });
    }

    var aboutBlank = document.getElementById('ab-mode-toggle');
    if (aboutBlank) {
      aboutBlank.checked = storageGet('nova_ab_mode', '0') === '1';
      capture(aboutBlank, 'change', function(){
        storageSet('nova_ab_mode', aboutBlank.checked ? '1' : '0');
        notifySaved(aboutBlank.checked ? 'About Blank mode will start next time' : 'About Blank mode off');
      });
    }

    var homepage = document.getElementById('homepage-input');
    if (homepage) {
      homepage.value = storageGet('nova_homepage', '');
      capture(homepage, 'change', function(){
        var value = homepage.value.trim();
        if (!value) {
          storageRemove('nova_homepage');
          notifySaved('Browser homepage cleared');
          return;
        }
        if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
        try { new URL(value); }
        catch(e){ toast('Enter a valid homepage URL'); return; }
        homepage.value = value;
        storageSet('nova_homepage', value);
        notifySaved('Browser homepage saved');
      });
    }

    var engines = [
      ['startpage', 'Startpage'], ['ddg', 'DuckDuckGo'], ['bing', 'Bing'], ['brave', 'Brave'], ['google', 'Google']
    ];
    var picker = document.getElementById('search-engine-picker');
    if (picker) {
      var engineButtons = Array.from(picker.querySelectorAll('.se-btn'));
      engineButtons.forEach(function(button, index){
        button.type = 'button';
        button.dataset.searchEngine = (engines[index] || [])[0] || '';
      });
      capture(picker, 'click', function(event){
        var button = event.target.closest('.se-btn');
        if (!button || !button.dataset.searchEngine) return;
        event.preventDefault();
        var selected = button.dataset.searchEngine;
        storageSet('nova_search_engine', selected);
        engineButtons.forEach(function(item, index){
          var active = item === button;
          item.classList.toggle('active', active);
          item.textContent = engines[index][1] + (active ? ' ✓' : '');
        });
        notifySaved('Search engine: ' + button.textContent.replace(' ✓', ''));
      });
    }

    var cloakToggle = document.getElementById('tab-cloak-toggle');
    var cloakTitle = document.getElementById('tab-cloak-title');
    function readCloak(){ try { return JSON.parse(storageGet('nova_tab_cloak', '{}') || '{}'); } catch(e){ return {}; } }
    function saveCloak(value){ storageSet('nova_tab_cloak', JSON.stringify(value)); }
    function applyCloak(){
      var cloak = readCloak();
      document.title = cloak.enabled && cloak.title ? cloak.title : 'Nova';
      var favicon = document.getElementById('favicon-link');
      if (favicon && cloak.enabled && cloak.favicon) favicon.href = cloak.favicon;
    }
    if (cloakToggle) capture(cloakToggle, 'change', function(){
      var cloak = readCloak(); cloak.enabled = cloakToggle.checked; saveCloak(cloak); applyCloak();
      notifySaved(cloak.enabled ? 'Tab cloaking on' : 'Tab cloaking off');
    });
    if (cloakTitle) capture(cloakTitle, 'change', function(){
      var cloak = readCloak(); cloak.title = cloakTitle.value.trim() || 'Google Classroom'; saveCloak(cloak); applyCloak();
      notifySaved('Tab title saved');
    });

    var panicButton = document.getElementById('key-change-btn');
    var panicDisplay = document.getElementById('key-display');
    var panicUrl = document.getElementById('panic-url-input');
    var listening = false;
    if (panicButton) capture(panicButton, 'click', function(event){
      event.preventDefault(); listening = true; panicButton.textContent = 'Press a key…'; panicButton.classList.add('listening');
    });
    if (panicUrl) capture(panicUrl, 'change', function(){
      var value = panicUrl.value.trim();
      if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
      try { new URL(value); } catch(e){ toast('Enter a valid panic URL'); return; }
      panicUrl.value = value; storageSet('nova_panic_url', value); notifySaved('Panic URL saved');
    });
    document.addEventListener('keydown', function(event){
      if (listening) {
        event.preventDefault(); event.stopImmediatePropagation();
        listening = false;
        var key = event.key.toLowerCase();
        storageSet('nova_panic_key', key);
        if (panicDisplay) panicDisplay.textContent = key === ' ' ? 'SPACE' : key.toUpperCase();
        if (panicButton) { panicButton.textContent = 'Change'; panicButton.classList.remove('listening'); }
        notifySaved('Panic key saved');
        return;
      }
      var target = event.target;
      if (target && (target.matches('input,textarea,select') || target.isContentEditable)) return;
      if (event.key.toLowerCase() !== storageGet('nova_panic_key', '`')) return;
      event.preventDefault(); event.stopImmediatePropagation();
      window.location.href = storageGet('nova_panic_url', 'https://classroom.google.com');
    }, true);

    var support = document.getElementById('settings-goto-support-btn');
    capture(support, 'click', function(event){
      event.preventDefault();
      var target = document.querySelector('.nav-tab[data-page="support"]');
      if (target) target.click(); else toast('Support is unavailable right now');
    });
  }
  function appName(card){
    return (card.querySelector('.game-name') || {}).textContent || '';
  }
  function sortApps(){
    var mode = storageGet('nova_app_sort', 'featured') || 'featured';
    document.querySelectorAll('.app-sort-btn').forEach(function(b){ b.classList.toggle('active', b.dataset.appSort === mode); });
    if (mode === 'featured') return;
    ['app-grid','app-fav-grid'].forEach(function(id){
      var grid = document.getElementById(id);
      if (!grid || grid.dataset.sorting === '1') return;
      var cards = Array.from(grid.children).filter(function(el){ return el.classList && el.classList.contains('game-card'); });
      if (!cards.length) return;
      grid.dataset.sorting = '1';
      cards.sort(function(a,b){
        if (mode === 'favorites') {
          var af = a.querySelector('.fav-btn.active') ? 0 : 1;
          var bf = b.querySelector('.fav-btn.active') ? 0 : 1;
          if (af !== bf) return af - bf;
        }
        return appName(a).localeCompare(appName(b));
      });
      var changed = cards.some(function(card, index){ return grid.children[index] !== card; });
      if (changed) cards.forEach(function(card){ grid.appendChild(card); });
      grid.dataset.sorting = '0';
    });
  }
  function bindAppSort(){
    document.querySelectorAll('.app-sort-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        storageSet('nova_app_sort', btn.dataset.appSort);
        sortApps();
      });
    });
    var obs = new MutationObserver(function(){ setTimeout(sortApps, 0); });
    ['app-grid','app-fav-grid'].forEach(function(id){
      var grid = document.getElementById(id);
      if (grid) obs.observe(grid, { childList:true });
    });
    sortApps();
  }
  function guardLocalActivity(){
    if (window.__novaSettingsStorageGuard) return;
    if (typeof Storage === 'undefined' || !Storage.prototype) return;
    window.__novaSettingsStorageGuard = true;
    var originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value){
      try {
        if (this === localStorage && (key === 'nova_recents' || key === 'nova_recents_v2') && read().disableActivity) return;
      } catch(e) {}
      return originalSetItem.call(this, key, value);
    };
  }
  function bootStep(name, fn){
    try { fn(); }
    catch(error){
      bootErrors.push({ step: name, message: String(error && error.message || error) });
      console.error('[Nova Settings] ' + name + ' failed', error);
    }
  }
  function boot(){
    if (initialized) return;
    initialized = true;
    bootStep('activity guard', guardLocalActivity);
    bootStep('Island position migration', migrateIslandPosition);
    bootStep('Island motion migration', migrateIslandMotion);
    bootStep('section navigation', bindPanes);
    bootStep('control hydration', hydrate);
    bootStep('setting controls', bindControls);
    bootStep('browser controls', bindSystemControls);
    bootStep('backup controls', bindSettingsUtilities);
    bootStep('app sorting', bindAppSort);
    bootStep('settings application', apply);
    try { loadRemote(); } catch(error){ bootErrors.push({ step: 'cloud settings', message: String(error && error.message || error) }); }
  }
  window.NovaControlCenter = {
    read: read, apply: apply, hydrate: hydrate, update: update,
    boot: boot, errors: bootErrors, defaults: Object.assign({}, defaults), cancelRemoteSync: cancelRemoteSync
  };
  ready(boot);
  document.addEventListener('nova:page-change', function(e){
    if (!e.detail || e.detail.page === 'settings') {
      hydrate();
      apply();
      if (e.detail && e.detail.page === 'settings') loadRemote();
    }
  });
  window.addEventListener('nova:session-changed', function(){ loadRemote(); });
  window.addEventListener('storage', function(e){
    if (e.key === KEY || e.key === 'nova_theme') {
      hydrate();
      apply();
    }
  });
})();
