/**
 * Nova Supernova Theme Studio — custom color wheel themes (Pro only)
 */
(function () {
  'use strict';

  var STORAGE_VARS = 'nova_supernova_custom_vars';
  var STORAGE_SLOTS = 'nova_supernova_theme_slots';
  var STORAGE_DRAFT = 'nova_supernova_theme_draft';
  var STORAGE_APPLIED = 'nova_supernova_applied_draft';
  var MAX_SLOTS = 5;
  var WHEEL_SIZE = 220;
  var SV_W = 220;
  var SV_H = 120;

  var state = {
    hue: 250,
    sat: 72,
    light: 58,
    hue2: 280,
    bgDepth: 4,
    wired: false,
    wheelDragging: false,
    svDragging: false,
    dirty: false,
    onThemesTab: false,
    hydrating: false
  };

  function el(id) { return document.getElementById(id); }

  function toast(msg) {
    if (typeof window.toast === 'function') window.toast(msg);
  }

  function getAccount() {
    try { return JSON.parse(localStorage.getItem('nova_account') || 'null'); }
    catch (e) { return null; }
  }

  function isProUser() {
    if (window.NovaSupernovaTier && window.NovaSupernovaTier.isPro()) return true;
    var acct = getAccount();
    if (!acct) return false;
    return !!(acct.supernova || acct.tier === 'supernova' || acct.tier === 'pro');
  }

  function openSignIn() {
    var btn = el('account-btn');
    if (btn) btn.click();
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 0, 100) / 100;
    l = clamp(l, 0, 100) / 100;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs((h / 60) % 2 - 1));
    var m = l - c / 2;
    var r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255)
    };
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function (v) {
      return clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
    }).join('');
  }

  function hslToHex(h, s, l) {
    var rgb = hslToRgb(h, s, l);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }

  function hexToRgb(hex) {
    hex = String(hex || '').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(hex, 16);
    if (isNaN(n)) return { r: 139, g: 143, b: 255 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbaFromHex(hex, a) {
    var c = hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  }

  function generateThemeVars(h, s, l, h2, bgDepth) {
    var accent = hslToHex(h, s, l);
    var accent2 = hslToHex(h2, clamp(s * 0.92, 20, 100), clamp(l - 8, 35, 70));
    var bgL = clamp(bgDepth, 2, 10);
    var bg = hslToHex(h, clamp(s * 0.35, 8, 40), bgL);
    var bg2 = hslToHex(h, clamp(s * 0.3, 6, 35), bgL + 2.5);
    var s1 = hslToHex(h, clamp(s * 0.28, 5, 30), bgL + 5);
    var text = hslToHex(h, clamp(s * 0.18, 8, 30), 78);
    var muted = hslToHex(h, clamp(s * 0.14, 5, 25), 52);
    var dim = hslToHex(h, clamp(s * 0.1, 3, 18), 36);
    var white = hslToHex(h, clamp(s * 0.12, 5, 22), 93);
    var ac = hexToRgb(accent);

    return {
      '--accent': accent,
      '--accent2': accent2,
      '--glow': rgbaFromHex(accent, 0.2),
      '--glow-s': rgbaFromHex(accent2, 0.1),
      '--bg': bg,
      '--bg2': bg2,
      '--s1': s1,
      '--text': text,
      '--muted': muted,
      '--dim': dim,
      '--white': white,
      '--glass-bg': 'rgba(' + ac.r + ',' + ac.g + ',' + ac.b + ',0.04)',
      '--glass-bg-h': 'rgba(' + ac.r + ',' + ac.g + ',' + ac.b + ',0.08)',
      '--glass-b': 'rgba(' + ac.r + ',' + ac.g + ',' + ac.b + ',0.12)',
      '--glass-bh': 'rgba(' + ac.r + ',' + ac.g + ',' + ac.b + ',0.4)',
      '--toast-bg': rgbaFromHex(bg, 0.98)
    };
  }

  function getDraftVars() {
    return generateThemeVars(state.hue, state.sat, state.light, state.hue2, state.bgDepth);
  }

  function snapshotState() {
    return {
      hue: state.hue, sat: state.sat, light: state.light,
      hue2: state.hue2, bgDepth: state.bgDepth
    };
  }

  function restoreState(s) {
    if (!s) return;
    if (s.hue != null) state.hue = s.hue;
    if (s.sat != null) state.sat = s.sat;
    if (s.light != null) state.light = s.light;
    if (s.hue2 != null) state.hue2 = s.hue2;
    if (s.bgDepth != null) state.bgDepth = s.bgDepth;
  }

  function applyVarsToDocument(vars) {
    var root = document.documentElement;
    root.setAttribute('data-theme', 'dark');
    Object.keys(vars).forEach(function (k) { root.style.setProperty(k, vars[k]); });
    updateOrbs(vars);
  }

  function commitTheme(vars) {
    applyVarsToDocument(vars);
    try {
      localStorage.setItem(STORAGE_VARS, JSON.stringify(vars));
      localStorage.setItem(STORAGE_APPLIED, JSON.stringify(snapshotState()));
      localStorage.removeItem(STORAGE_DRAFT);
    } catch (e) {}
    localStorage.setItem('nova_theme', 'supernova:custom');
    state.dirty = false;
    updateApplyButton();
    notifyThemeChange();
  }

  function updateOrbs(vars) {
    var a1 = document.querySelector('.a1');
    var a2 = document.querySelector('.a2');
    if (a1) a1.style.background = 'radial-gradient(circle,' + vars['--glow'] + ' 0%,transparent 70%)';
    if (a2) a2.style.background = 'radial-gradient(circle,' + vars['--glow-s'] + ' 0%,transparent 70%)';
  }

  function getAppliedVars() {
    try {
      var raw = localStorage.getItem(STORAGE_VARS);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function loadAppliedState() {
    try {
      var raw = localStorage.getItem(STORAGE_APPLIED);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  function applySaved() {
    var vars = getAppliedVars();
    if (!vars) return false;
    applyVarsToDocument(vars);
    var applied = loadAppliedState();
    if (applied) restoreState(applied);
    state.dirty = false;
    return true;
  }

  function revertToApplied() {
    if (!state.dirty) return;
    var themeKey = localStorage.getItem('nova_theme') || 'dark';
    if (themeKey.indexOf('supernova:') === 0) {
      var vars = getAppliedVars();
      if (vars) {
        applyVarsToDocument(vars);
        var applied = loadAppliedState();
        if (applied) restoreState(applied);
      }
    } else if (typeof window.applyTheme === 'function') {
      window.applyTheme(themeKey);
    }
    state.dirty = false;
    redrawCanvases();
    syncDraftUI();
    updateApplyButton();
  }

  function saveEditorDraft() {
    try { localStorage.setItem(STORAGE_DRAFT, JSON.stringify(snapshotState())); } catch (e) {}
  }

  function loadEditorDraft() {
    var applied = loadAppliedState();
    if (applied) {
      restoreState(applied);
      return;
    }
    try {
      var raw = localStorage.getItem(STORAGE_DRAFT);
      if (raw) restoreState(JSON.parse(raw));
    } catch (e) {}
  }

  function loadSlots() {
    try {
      var raw = localStorage.getItem(STORAGE_SLOTS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveSlots(slots) {
    try { localStorage.setItem(STORAGE_SLOTS, JSON.stringify(slots)); } catch (e) {}
    notifyThemeChange();
  }

  function notifyThemeChange() {
    if (state.hydrating) return;
    document.dispatchEvent(new CustomEvent('nova:supernova-theme-changed', {
      detail: { themes: loadSlots(), appliedTheme: loadAppliedState() }
    }));
  }

  function hydrateThemes(themes, appliedTheme) {
    state.hydrating = true;
    try {
      var slots = (Array.isArray(themes) ? themes : []).slice(0, MAX_SLOTS).map(function (theme) {
        if (!theme || !theme.draft) return null;
        return {
          name: theme.name || 'Theme',
          draft: theme.draft,
          vars: generateThemeVars(theme.draft.hue, theme.draft.sat, theme.draft.light, theme.draft.hue2, theme.draft.bgDepth),
          ts: theme.ts || Date.now()
        };
      });
      localStorage.setItem(STORAGE_SLOTS, JSON.stringify(slots));
      if (appliedTheme) {
        localStorage.setItem(STORAGE_APPLIED, JSON.stringify(appliedTheme));
        localStorage.setItem(STORAGE_VARS, JSON.stringify(generateThemeVars(appliedTheme.hue, appliedTheme.sat, appliedTheme.light, appliedTheme.hue2, appliedTheme.bgDepth)));
        localStorage.setItem('nova_theme', 'supernova:custom');
        restoreState(appliedTheme);
        applySaved();
      }
      renderSlots();
      redrawCanvases();
      syncDraftUI();
      updateApplyButton();
    } finally {
      state.hydrating = false;
    }
  }

  /* ── Canvas helpers — match internal pixels to displayed size ── */
  function getCanvasPoint(e, canvas) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
      cx: canvas.width / 2,
      cy: canvas.height / 2,
      r: canvas.width / 2 - 4
    };
  }

  function setupCanvases() {
    var wheel = el('sn-theme-wheel');
    var sv = el('sn-theme-sv');
    if (wheel) {
      wheel.width = WHEEL_SIZE;
      wheel.height = WHEEL_SIZE;
    }
    if (sv) {
      sv.width = SV_W;
      sv.height = SV_H;
    }
  }

  /* Hue 0 (red) at top — drawing and picking use the same -90° offset */
  function drawHueWheel(ctx, size) {
    var cx = size / 2, cy = size / 2, r = size / 2 - 4;
    ctx.clearRect(0, 0, size, size);
    for (var h = 0; h < 360; h++) {
      var start = (h - 90 - 0.5) * Math.PI / 180;
      var end = (h - 90 + 0.5) * Math.PI / 180;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      ctx.fillStyle = 'hsl(' + h + ',100%,50%)';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0a12';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = 2;
    ctx.stroke();

    var rad = (state.hue - 90) * Math.PI / 180;
    var pr = r * 0.79;
    var px = cx + Math.cos(rad) * pr;
    var py = cy + Math.sin(rad) * pr;
    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.fillStyle = hslToHex(state.hue, 100, 50);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  function drawSVSquare(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = hslToHex(state.hue, 100, 50);
    ctx.fillRect(0, 0, w, h);
    var gWhite = ctx.createLinearGradient(0, 0, w, 0);
    gWhite.addColorStop(0, '#fff');
    gWhite.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gWhite;
    ctx.fillRect(0, 0, w, h);
    var gBlack = ctx.createLinearGradient(0, 0, 0, h);
    gBlack.addColorStop(0, 'rgba(0,0,0,0)');
    gBlack.addColorStop(1, '#000');
    ctx.fillStyle = gBlack;
    ctx.fillRect(0, 0, w, h);

    var sx = (state.sat / 100) * w;
    var sy = (1 - state.light / 100) * h;
    ctx.beginPath();
    ctx.arc(sx, sy, 7, 0, Math.PI * 2);
    ctx.fillStyle = hslToHex(state.hue, state.sat, state.light);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function redrawCanvases() {
    var wheel = el('sn-theme-wheel');
    var sv = el('sn-theme-sv');
    if (wheel) drawHueWheel(wheel.getContext('2d'), wheel.width);
    if (sv) drawSVSquare(sv.getContext('2d'), sv.width, sv.height);
  }

  function pickHueFromWheel(e, canvas) {
    var p = getCanvasPoint(e, canvas);
    var dx = p.x - p.cx;
    var dy = p.y - p.cy;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var inner = p.r * 0.58;
    if (dist < inner || dist > p.r) return false;
    state.hue = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360;
    if (Math.abs(state.hue2 - state.hue) < 20) state.hue2 = (state.hue + 35) % 360;
    onColorChange();
    return true;
  }

  function pickSVFromSquare(e, canvas) {
    var p = getCanvasPoint(e, canvas);
    state.sat = clamp((p.x / canvas.width) * 100, 0, 100);
    state.light = clamp(100 - (p.y / canvas.height) * 100, 0, 100);
    onColorChange();
  }

  function onColorChange() {
    state.dirty = true;
    saveEditorDraft();
    redrawCanvases();
    syncDraftUI();
    updateApplyButton();
  }

  function updateApplyButton() {
    var btn = el('sn-theme-apply');
    if (!btn) return;
    if (state.dirty) {
      btn.textContent = 'Apply Theme ✦';
      btn.classList.add('sn-theme-apply-btn--dirty');
    } else {
      btn.textContent = 'Theme Applied ✓';
      btn.classList.remove('sn-theme-apply-btn--dirty');
    }
  }

  function syncDraftUI() {
    var vars = getDraftVars();
    var hexEl = el('sn-theme-hex');
    var preview = el('sn-theme-preview');
    var hue2Range = el('sn-theme-hue2');
    var depthRange = el('sn-theme-depth');
    var depthVal = el('sn-theme-depth-val');

    if (hexEl) hexEl.textContent = vars['--accent'].toUpperCase();
    if (hue2Range) hue2Range.value = Math.round(state.hue2);
    if (depthRange) depthRange.value = state.bgDepth;
    if (depthVal) depthVal.textContent = state.bgDepth;

    if (preview) {
      preview.style.setProperty('--pv-accent', vars['--accent']);
      preview.style.setProperty('--pv-accent2', vars['--accent2']);
      preview.style.setProperty('--pv-bg', vars['--bg']);
      preview.style.setProperty('--pv-bg2', vars['--bg2']);
      preview.style.setProperty('--pv-text', vars['--text']);
      preview.style.setProperty('--pv-glow', vars['--glow']);
    }

    var swatches = el('sn-theme-swatches');
    if (swatches) {
      ['--accent', '--accent2', '--bg', '--bg2', '--text'].forEach(function (k) {
        var s = swatches.querySelector('[data-var="' + k + '"]');
        if (s) s.style.background = vars[k];
      });
    }
  }

  function renderSlots() {
    var wrap = el('sn-theme-slots');
    if (!wrap) return;
    var slots = loadSlots();
    wrap.innerHTML = '';
    for (var i = 0; i < MAX_SLOTS; i++) {
      var slot = slots[i];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sn-theme-slot' + (slot ? '' : ' sn-theme-slot--empty');
      btn.title = slot ? ('Load: ' + (slot.name || 'Theme ' + (i + 1))) : 'Empty slot';
      if (slot && slot.vars) {
        btn.style.background = 'linear-gradient(135deg,' + slot.vars['--accent'] + ',' + slot.vars['--accent2'] + ')';
        btn.innerHTML = '<span class="sn-theme-slot-num">' + (i + 1) + '</span>';
      } else {
        btn.innerHTML = '<span class="sn-theme-slot-num">' + (i + 1) + '</span><span class="sn-theme-slot-plus">+</span>';
      }
      (function (idx, data) {
        btn.addEventListener('click', function () {
          if (data) loadSlot(idx);
          else saveToSlot(idx);
        });
        btn.addEventListener('contextmenu', function (e) {
          e.preventDefault();
          if (data) clearSlot(idx);
        });
      })(i, slot);
      wrap.appendChild(btn);
    }
  }

  function saveToSlot(idx) {
    if (!isProUser()) return toast('Sign in to save themes');
    var name = prompt('Name this theme:', 'My Theme ' + (idx + 1));
    if (name === null) return;
    var slots = loadSlots();
    while (slots.length < MAX_SLOTS) slots.push(null);
    slots[idx] = {
      name: name.trim() || ('Theme ' + (idx + 1)),
      vars: getDraftVars(),
      draft: snapshotState(),
      ts: Date.now()
    };
    saveSlots(slots);
    renderSlots();
    toast('Theme saved to slot ' + (idx + 1));
  }

  function loadSlot(idx) {
    var slots = loadSlots();
    var slot = slots[idx];
    if (!slot) return;
    if (slot.draft) restoreState(slot.draft);
    state.dirty = true;
    saveEditorDraft();
    redrawCanvases();
    syncDraftUI();
    updateApplyButton();
    renderSlots();
    toast('Loaded "' + slot.name + '" — click Apply to use across Nova');
  }

  function clearSlot(idx) {
    if (!confirm('Delete theme in slot ' + (idx + 1) + '?')) return;
    var slots = loadSlots();
    slots[idx] = null;
    saveSlots(slots);
    renderSlots();
    toast('Slot cleared');
  }

  function applyTheme() {
    if (!isProUser()) { toast('Sign in to apply themes'); openSignIn(); return; }
    commitTheme(getDraftVars());
    toast('Supernova theme applied ✦');
    updateApplyButton();
  }

  async function resetTheme() {
    // A true reset: remove custom/applied/saved themes, disable holiday themes,
    // and overwrite synced theme state so an old cloud theme cannot come back.
    localStorage.removeItem(STORAGE_VARS);
    localStorage.removeItem(STORAGE_APPLIED);
    localStorage.removeItem(STORAGE_DRAFT);
    localStorage.removeItem(STORAGE_SLOTS);
    localStorage.removeItem('nova_holiday_settings');
    localStorage.setItem('nova_holiday_settings', JSON.stringify({ mode: 'off', selected: 'christmas', style: 'full', effects: 'balanced' }));
    localStorage.setItem('nova_theme', 'dark');
    state.dirty = false;

    if (window.NovaHolidayThemes && window.NovaHolidayThemes.setSettings) {
      window.NovaHolidayThemes.setSettings({ mode: 'off', selected: 'christmas', style: 'full', effects: 'balanced' });
    } else {
      document.dispatchEvent(new CustomEvent('nova:holiday-settings', { detail: { mode: 'off', selected: 'christmas', style: 'full', effects: 'balanced' } }));
    }

    if (window.NovaSupernovaHub && window.NovaSupernovaHub.resetThemes) {
      try { await window.NovaSupernovaHub.resetThemes(); } catch (e) {}
    }

    if (window.__novaV7User && window.NovaAPI && NovaAPI.saveSettings) {
      try {
        var control = JSON.parse(localStorage.getItem('nova_control_center') || '{}');
        await NovaAPI.saveSettings(Object.assign({}, control, { theme: 'dark' }));
      } catch (e) {}
    }

    notifyThemeChange();
    toast('All themes reset to Nova Dark');
    // Reload after cloud/local state is committed so nothing can immediately rehydrate.
    setTimeout(function () { location.reload(); }, 80);
  }

  function randomize() {
    state.hue = Math.floor(Math.random() * 360);
    state.sat = 55 + Math.floor(Math.random() * 40);
    state.light = 48 + Math.floor(Math.random() * 22);
    state.hue2 = (state.hue + 25 + Math.floor(Math.random() * 50)) % 360;
    state.bgDepth = 3 + Math.floor(Math.random() * 5);
    onColorChange();
    toast('Randomized — click Apply to keep');
  }

  function applyPreset(h, s, l, h2, depth) {
    state.hue = h; state.sat = s; state.light = l;
    state.hue2 = h2; state.bgDepth = depth;
    onColorChange();
  }

  function renderGate() {
    var gate = el('sn-theme-gate');
    var studio = el('sn-theme-studio');
    if (!gate || !studio) return;
    var ok = isProUser();
    gate.style.display = ok ? 'none' : 'flex';
    studio.style.display = ok ? 'grid' : 'none';
    if (!ok) {
      var acct = getAccount();
      var title = gate.querySelector('.sn-ai-gate-title');
      var desc = gate.querySelector('.sn-ai-gate-desc');
      var btn = el('sn-theme-gate-signin');
      if (acct && acct.username) {
        if (title) title.textContent = 'Supernova Pro Required';
        if (desc) desc.textContent = 'Theme Studio is exclusive to Supernova Pro. Upgrade your account to design custom themes with the color wheel.';
        if (btn) btn.textContent = 'View Account';
      } else {
        if (title) title.textContent = 'Theme Studio';
        if (desc) desc.textContent = 'Design your own Nova theme with a color wheel — exclusive to Supernova Pro users. Sign in to unlock.';
        if (btn) btn.textContent = 'Sign In to Unlock';
      }
    }
  }

  function wireCanvases() {
    var wheel = el('sn-theme-wheel');
    var sv = el('sn-theme-sv');
    if (!wheel || !sv) return;

    function onWheelDown(e) {
      state.wheelDragging = true;
      pickHueFromWheel(e, wheel);
    }
    function onSVMove(e) {
      if (state.svDragging) pickSVFromSquare(e, sv);
    }
    function onWheelMove(e) {
      if (state.wheelDragging) pickHueFromWheel(e, wheel);
    }
    function up() {
      state.wheelDragging = false;
      state.svDragging = false;
    }

    wheel.addEventListener('mousedown', onWheelDown);
    wheel.addEventListener('touchstart', function (e) { e.preventDefault(); onWheelDown(e.touches[0]); }, { passive: false });
    sv.addEventListener('mousedown', function (e) { state.svDragging = true; pickSVFromSquare(e, sv); });
    sv.addEventListener('touchstart', function (e) { e.preventDefault(); state.svDragging = true; pickSVFromSquare(e.touches[0], sv); }, { passive: false });
    document.addEventListener('mousemove', function (e) { onWheelMove(e); onSVMove(e); });
    document.addEventListener('touchmove', function (e) {
      if (state.wheelDragging && e.touches[0]) onWheelMove(e.touches[0]);
      if (state.svDragging && e.touches[0]) onSVMove(e.touches[0]);
    }, { passive: true });
    document.addEventListener('mouseup', up);
    document.addEventListener('touchend', up);
  }

  function wireControls() {
    var hue2 = el('sn-theme-hue2');
    var depth = el('sn-theme-depth');
    if (hue2) hue2.addEventListener('input', function () {
      state.hue2 = parseInt(hue2.value, 10);
      onColorChange();
    });
    if (depth) depth.addEventListener('input', function () {
      state.bgDepth = parseInt(depth.value, 10);
      onColorChange();
    });

    el('sn-theme-apply')?.addEventListener('click', applyTheme);
    el('sn-theme-reset')?.addEventListener('click', resetTheme);
    el('sn-theme-random')?.addEventListener('click', randomize);
    el('sn-theme-gate-signin')?.addEventListener('click', openSignIn);

    document.querySelectorAll('.sn-theme-preset').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyPreset(
          parseFloat(btn.dataset.h),
          parseFloat(btn.dataset.s),
          parseFloat(btn.dataset.l),
          parseFloat(btn.dataset.h2),
          parseFloat(btn.dataset.depth)
        );
      });
    });
  }

  function wireSectionTabs() {
    document.querySelectorAll('.sn-section-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        var section = tab.dataset.snSection;
        if (state.onThemesTab && section !== 'themes') revertToApplied();
        state.onThemesTab = section === 'themes';

        document.querySelectorAll('.sn-section-tab').forEach(function (t) {
          t.classList.toggle('active', t === tab);
        });
        document.querySelectorAll('.sn-panel').forEach(function (p) {
          p.classList.toggle('active', p.id === 'sn-panel-' + section);
        });
        if (section === 'themes') initThemeStudio();
      });
    });
  }

  function initThemeStudio() {
    renderGate();
    if (!isProUser()) return;
    if (!state.dirty) loadEditorDraft();
    setupCanvases();
    redrawCanvases();
    syncDraftUI();
    updateApplyButton();
    renderSlots();
    state.onThemesTab = true;
  }

  function bootSavedTheme() {
    if ((localStorage.getItem('nova_theme') || '').indexOf('supernova:') === 0) {
      applySaved();
    }
  }

  function init() {
    setupCanvases();
    if (state.wired) {
      initThemeStudio();
      renderGate();
      return;
    }
    state.wired = true;
    wireSectionTabs();
    wireCanvases();
    wireControls();
    bootSavedTheme();
    initThemeStudio();
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (el('page-supernova')) init();
  });

  document.addEventListener('nova:page-change', function (e) {
    if (e.detail && e.detail.page === 'supernova') {
      init();
    } else {
      revertToApplied();
      state.onThemesTab = false;
    }
  });

  document.addEventListener('nova:login', function () {
    renderGate();
    initThemeStudio();
  });

  document.addEventListener('nova:account-changed', function () {
    renderGate();
    if (state.onThemesTab) initThemeStudio();
  });

  window.NovaSupernovaThemes = {
    applySaved: applySaved,
    applyVars: commitTheme,
    generateThemeVars: generateThemeVars,
    hydrateThemes: hydrateThemes,
    getThemes: loadSlots,
    getAppliedTheme: loadAppliedState
  };

  bootSavedTheme();
})();
