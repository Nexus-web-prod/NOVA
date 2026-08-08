/**
 * Nova Shop — v2.0
 * - Nameplate colors fully render (background + border + text all colored)
 * - Themes in shop are NEW exclusives only (settings themes remain free there)
 * - Shop is embedded as a section inside the Rewards page (no separate page/tab)
 * - All icons are custom SVG — zero emojis
 * - New exclusive shop themes: Synthwave, Ice Storm, Ember, Dusk Rose, Toxic, Matrix
 */

(function () {
  'use strict';

  /* ─────────────────────────────────────
     CUSTOM SVG ICONS (no emojis)
  ───────────────────────────────────── */
  var ICONS = {
    sparkle: '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><line x1="20" y1="4" x2="20" y2="10" stroke="#f5c518" stroke-width="2" stroke-linecap="round"/><line x1="20" y1="30" x2="20" y2="36" stroke="#f5c518" stroke-width="2" stroke-linecap="round"/><line x1="4" y1="20" x2="10" y2="20" stroke="#f5c518" stroke-width="2" stroke-linecap="round"/><line x1="30" y1="20" x2="36" y2="20" stroke="#f5c518" stroke-width="2" stroke-linecap="round"/><line x1="8.7" y1="8.7" x2="12.9" y2="12.9" stroke="#f5c518" stroke-width="2" stroke-linecap="round"/><line x1="27.1" y1="27.1" x2="31.3" y2="31.3" stroke="#f5c518" stroke-width="2" stroke-linecap="round"/><line x1="31.3" y1="8.7" x2="27.1" y2="12.9" stroke="#f5c518" stroke-width="2" stroke-linecap="round"/><line x1="12.9" y1="27.1" x2="8.7" y2="31.3" stroke="#f5c518" stroke-width="2" stroke-linecap="round"/><circle cx="20" cy="20" r="4" fill="#f5c518" opacity=".9"/></svg>',

    pulse: '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="15" fill="none" stroke="#8b8fff" stroke-width="1.5" opacity=".3"/><circle cx="20" cy="20" r="10" fill="none" stroke="#8b8fff" stroke-width="1.5" opacity=".6"/><circle cx="20" cy="20" r="5" fill="#8b8fff" opacity=".9"/><circle cx="20" cy="20" r="2.5" fill="white" opacity=".8"/></svg>',

    flame: '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><path d="M20 34 C12 34 8 28 8 22 C8 16 12 12 16 8 C16 14 18 16 20 16 C18 12 22 6 26 4 C26 10 24 14 28 18 C30 20 32 22 32 22 C32 29 27 34 20 34Z" fill="url(#flg)" /><defs><linearGradient id="flg" x1="0%" y1="100%" x2="0%" y2="0%"><stop offset="0%" stop-color="#f87171"/><stop offset="50%" stop-color="#fb923c"/><stop offset="100%" stop-color="#fbbf24"/></linearGradient></defs><ellipse cx="20" cy="26" rx="5" ry="4" fill="#fde68a" opacity=".5"/></svg>',

    crown: '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><path d="M6 28 L8 16 L14 22 L20 10 L26 22 L32 16 L34 28 Z" fill="url(#crg)" stroke="#f5c518" stroke-width="1" stroke-linejoin="round"/><rect x="6" y="28" width="28" height="4" rx="2" fill="#f5c518"/><circle cx="20" cy="10" r="2.5" fill="#fff" opacity=".9"/><circle cx="8" cy="16" r="2" fill="#fff" opacity=".7"/><circle cx="32" cy="16" r="2" fill="#fff" opacity=".7"/><defs><linearGradient id="crg" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#fde68a"/><stop offset="100%" stop-color="#f5c518"/></linearGradient></defs></svg>',

    bolt2x: '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="8" fill="rgba(245,197,24,.1)"/><path d="M22 4 L12 22 L19 22 L17 36 L28 18 L21 18 Z" fill="#f5c518"/><text x="29" y="14" font-size="8" font-weight="900" fill="#f5c518" font-family="monospace">2x</text></svg>',

    bolt3x: '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="8" fill="rgba(139,143,255,.1)"/><path d="M22 4 L12 22 L19 22 L17 36 L28 18 L21 18 Z" fill="#8b8fff"/><text x="29" y="14" font-size="8" font-weight="900" fill="#8b8fff" font-family="monospace">3x</text></svg>',

    xpIcon: '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="#fbbf24" stroke="#f59e0b" stroke-width="1"/></svg>',
  };

  /* ─────────────────────────────────────
     SHOP CATALOG
  ───────────────────────────────────── */
  var SHOP_ITEMS = [

    /* ── NAMEPLATE COLORS ─────────────────────────────── */
    {
      id: 'nameplate_purple',
      name: 'Purple Pulse',
      category: 'nameplate',
      description: 'A glowing purple nameplate — the Nova classic.',
      cost: 150,
      rarity: 'common',
      slot: 'nameplate',
      preview: { bg: 'rgba(139,143,255,0.15)', border: '#8b8fff', glow: 'rgba(139,143,255,0.55)', text: '#c0c0ff', icon: '#8b8fff' },
      icon: '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="8" width="38" height="24" rx="12" fill="rgba(139,143,255,0.15)" stroke="#8b8fff" stroke-width="1.8"/><circle cx="12" cy="20" r="5" fill="rgba(139,143,255,0.3)" stroke="#8b8fff" stroke-width="1.5"/><rect x="19" y="16" width="14" height="3" rx="1.5" fill="#8b8fff" opacity=".8"/><rect x="19" y="22" width="10" height="2" rx="1" fill="#8b8fff" opacity=".4"/></svg>',
    },
    {
      id: 'nameplate_cyan',
      name: 'Cyan Storm',
      category: 'nameplate',
      description: 'Electric teal that crackles off the screen.',
      cost: 200,
      rarity: 'uncommon',
      slot: 'nameplate',
      preview: { bg: 'rgba(78,204,163,0.15)', border: '#4ecca3', glow: 'rgba(78,204,163,0.55)', text: '#80ffdd', icon: '#4ecca3' },
      icon: '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="8" width="38" height="24" rx="12" fill="rgba(78,204,163,0.15)" stroke="#4ecca3" stroke-width="1.8"/><circle cx="12" cy="20" r="5" fill="rgba(78,204,163,0.3)" stroke="#4ecca3" stroke-width="1.5"/><rect x="19" y="16" width="14" height="3" rx="1.5" fill="#4ecca3" opacity=".8"/><rect x="19" y="22" width="10" height="2" rx="1" fill="#4ecca3" opacity=".4"/></svg>',
    },
    {
      id: 'nameplate_gold',
      name: 'Gold Nova',
      category: 'nameplate',
      description: 'Solid gold nameplate for the elite few.',
      cost: 500,
      rarity: 'rare',
      slot: 'nameplate',
      preview: { bg: 'rgba(245,197,24,0.15)', border: '#f5c518', glow: 'rgba(245,197,24,0.55)', text: '#ffe066', icon: '#f5c518' },
      icon: '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="8" width="38" height="24" rx="12" fill="rgba(245,197,24,0.15)" stroke="#f5c518" stroke-width="1.8"/><circle cx="12" cy="20" r="5" fill="rgba(245,197,24,0.3)" stroke="#f5c518" stroke-width="1.5"/><rect x="19" y="16" width="14" height="3" rx="1.5" fill="#f5c518" opacity=".8"/><rect x="19" y="22" width="10" height="2" rx="1" fill="#f5c518" opacity=".4"/></svg>',
    },
    {
      id: 'nameplate_crimson',
      name: 'Crimson Edge',
      category: 'nameplate',
      description: 'Deep red nameplate that means business.',
      cost: 300,
      rarity: 'uncommon',
      slot: 'nameplate',
      preview: { bg: 'rgba(248,113,113,0.15)', border: '#f87171', glow: 'rgba(248,113,113,0.55)', text: '#ffaaaa', icon: '#f87171' },
      icon: '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="8" width="38" height="24" rx="12" fill="rgba(248,113,113,0.15)" stroke="#f87171" stroke-width="1.8"/><circle cx="12" cy="20" r="5" fill="rgba(248,113,113,0.3)" stroke="#f87171" stroke-width="1.5"/><rect x="19" y="16" width="14" height="3" rx="1.5" fill="#f87171" opacity=".8"/><rect x="19" y="22" width="10" height="2" rx="1" fill="#f87171" opacity=".4"/></svg>',
    },
    {
      id: 'nameplate_rainbow',
      name: 'Rainbow Rift',
      category: 'nameplate',
      description: 'Animated rainbow nameplate — a true flex.',
      cost: 1200,
      rarity: 'epic',
      slot: 'nameplate',
      preview: { rainbow: true, glow: 'rgba(180,100,255,0.4)', text: '#ffffff', icon: '#ffffff' },
      icon: '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="rbgi" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#f87171"/><stop offset="25%" stop-color="#f5c518"/><stop offset="50%" stop-color="#4ecca3"/><stop offset="75%" stop-color="#8b8fff"/><stop offset="100%" stop-color="#c084fc"/></linearGradient></defs><rect x="1" y="8" width="38" height="24" rx="12" fill="rgba(180,100,255,0.08)" stroke="url(#rbgi)" stroke-width="1.8"/><circle cx="12" cy="20" r="5" fill="rgba(180,100,255,0.15)" stroke="url(#rbgi)" stroke-width="1.5"/><rect x="19" y="16" width="14" height="3" rx="1.5" fill="url(#rbgi)" opacity=".9"/><rect x="19" y="22" width="10" height="2" rx="1" fill="url(#rbgi)" opacity=".5"/></svg>',
    },
    {
      id: 'nameplate_galaxy',
      name: 'Galaxy Aura',
      category: 'nameplate',
      description: 'A swirling cosmic glow. Legendary status.',
      cost: 2500,
      rarity: 'legendary',
      slot: 'nameplate',
      preview: { bg: 'rgba(192,132,252,0.18)', border: '#c084fc', glow: 'rgba(192,132,252,0.7)', text: '#e8c0ff', icon: '#c084fc', galaxy: true },
      icon: '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="galg" cx="50%" cy="50%"><stop offset="0%" stop-color="#c084fc" stop-opacity=".4"/><stop offset="100%" stop-color="#8b8fff" stop-opacity=".05"/></radialGradient></defs><rect x="1" y="8" width="38" height="24" rx="12" fill="url(#galg)" stroke="#c084fc" stroke-width="1.8"/><circle cx="12" cy="20" r="5" fill="rgba(192,132,252,0.25)" stroke="#c084fc" stroke-width="1.5"/><circle cx="12" cy="20" r="2.5" fill="#c084fc" opacity=".6"/><rect x="19" y="16" width="14" height="3" rx="1.5" fill="#c084fc" opacity=".8"/><rect x="19" y="22" width="10" height="2" rx="1" fill="#c084fc" opacity=".4"/><circle cx="35" cy="12" r="1.2" fill="#f5c518" opacity=".8"/><circle cx="30" cy="28" r=".8" fill="#4ecca3" opacity=".7"/><circle cx="6" cy="14" r=".7" fill="#8b8fff" opacity=".6"/></svg>',
    },

    /* ── THEMES (EXCLUSIVE — not in settings) ──────── */
    {
      id: 'theme_synthwave',
      name: 'Synthwave',
      category: 'theme',
      description: 'Retro-future neon grid. Pink meets electric blue.',
      cost: 600,
      rarity: 'rare',
      slot: 'theme',
      themeKey: 'synthwave',
      preview: { bg: '#0d0015', accent: '#f72585', text: '#d0c0ff' },
      icon: '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="swg" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#f72585"/><stop offset="100%" stop-color="#7209b7"/></linearGradient></defs><rect width="40" height="40" rx="6" fill="#0d0015"/><line x1="4" y1="32" x2="36" y2="32" stroke="#f72585" stroke-width=".8" opacity=".6"/><line x1="4" y1="28" x2="36" y2="28" stroke="#f72585" stroke-width=".5" opacity=".3"/><line x1="4" y1="36" x2="36" y2="36" stroke="#f72585" stroke-width=".5" opacity=".3"/><line x1="14" y1="8" x2="14" y2="36" stroke="#7209b7" stroke-width=".5" opacity=".4"/><line x1="22" y1="8" x2="22" y2="36" stroke="#7209b7" stroke-width=".5" opacity=".4"/><line x1="30" y1="8" x2="30" y2="36" stroke="#7209b7" stroke-width=".5" opacity=".4"/><rect x="7" y="9" width="14" height="3" rx="1.5" fill="url(#swg)" opacity=".9"/></svg>',
    },
    {
      id: 'theme_icestorm',
      name: 'Ice Storm',
      category: 'theme',
      description: 'Frozen crystal blue — cold, clean, and sharp.',
      cost: 600,
      rarity: 'rare',
      slot: 'theme',
      themeKey: 'icestorm',
      preview: { bg: '#010c14', accent: '#a8e6ff', text: '#c8eeff' },
      icon: '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="6" fill="#010c14"/><line x1="20" y1="6" x2="20" y2="34" stroke="#a8e6ff" stroke-width="1.2" opacity=".7"/><line x1="6" y1="20" x2="34" y2="20" stroke="#a8e6ff" stroke-width="1.2" opacity=".7"/><line x1="9.5" y1="9.5" x2="30.5" y2="30.5" stroke="#a8e6ff" stroke-width=".8" opacity=".45"/><line x1="30.5" y1="9.5" x2="9.5" y2="30.5" stroke="#a8e6ff" stroke-width=".8" opacity=".45"/><circle cx="20" cy="20" r="4" fill="rgba(168,230,255,0.2)" stroke="#a8e6ff" stroke-width="1.2"/><circle cx="20" cy="6" r="2" fill="#a8e6ff" opacity=".8"/><circle cx="20" cy="34" r="2" fill="#a8e6ff" opacity=".8"/><circle cx="6" cy="20" r="2" fill="#a8e6ff" opacity=".8"/><circle cx="34" cy="20" r="2" fill="#a8e6ff" opacity=".8"/></svg>',
    },
    {
      id: 'theme_ember',
      name: 'Ember',
      category: 'theme',
      description: 'Deep volcanic orange with magma glow.',
      cost: 700,
      rarity: 'rare',
      slot: 'theme',
      themeKey: 'ember',
      preview: { bg: '#0e0600', accent: '#fb923c', text: '#ffe4cc' },
      icon: '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="emg" cx="50%" cy="80%"><stop offset="0%" stop-color="#fb923c" stop-opacity=".5"/><stop offset="100%" stop-color="#0e0600" stop-opacity="0"/></radialGradient></defs><rect width="40" height="40" rx="6" fill="#0e0600"/><rect width="40" height="40" rx="6" fill="url(#emg)"/><rect x="4" y="6" width="32" height="20" rx="3" fill="#1a0a00"/><rect x="7" y="9" width="12" height="3" rx="1.5" fill="#fb923c" opacity=".9"/><rect x="7" y="15" width="20" height="2" rx="1" fill="rgba(251,146,60,.35)"/><circle cx="32" cy="30" r="3" fill="#ef4444" opacity=".6"/><circle cx="24" cy="33" r="2" fill="#fb923c" opacity=".5"/><circle cx="10" cy="32" r="1.5" fill="#fbbf24" opacity=".4"/></svg>',
    },
    {
      id: 'theme_duskrose',
      name: 'Dusk Rose',
      category: 'theme',
      description: 'Warm pink-purple twilight. Elegant and rare.',
      cost: 800,
      rarity: 'epic',
      slot: 'theme',
      themeKey: 'duskrose',
      preview: { bg: '#0f0510', accent: '#f9a8d4', text: '#f5d0e8' },
      icon: '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="drg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f9a8d4"/><stop offset="100%" stop-color="#c084fc"/></linearGradient></defs><rect width="40" height="40" rx="6" fill="#0f0510"/><rect x="4" y="6" width="32" height="20" rx="3" fill="#1e0820"/><rect x="7" y="9" width="12" height="3" rx="1.5" fill="url(#drg)" opacity=".9"/><rect x="7" y="15" width="20" height="2" rx="1" fill="url(#drg)" opacity=".3"/><circle cx="33" cy="8" r="5" fill="rgba(249,168,212,0.12)" stroke="rgba(249,168,212,0.4)" stroke-width="1"/></svg>',
    },
    {
      id: 'theme_toxic',
      name: 'Toxic',
      category: 'theme',
      description: 'Radioactive lime on pitch black. Dangerously cool.',
      cost: 900,
      rarity: 'epic',
      slot: 'theme',
      themeKey: 'toxic',
      preview: { bg: '#010d02', accent: '#84cc16', text: '#d9f99d' },
      icon: '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="6" fill="#010d02"/><rect x="4" y="6" width="32" height="20" rx="3" fill="#051502"/><rect x="7" y="9" width="12" height="3" rx="1.5" fill="#84cc16" opacity=".9"/><rect x="7" y="15" width="20" height="2" rx="1" fill="rgba(132,204,22,.3)"/><path d="M28 30 C28 26 24 24 20 24 C16 24 12 26 12 30" fill="none" stroke="#84cc16" stroke-width="1.2" opacity=".6"/><circle cx="20" cy="24" r="2.5" fill="#84cc16" opacity=".5"/><line x1="20" y1="27" x2="20" y2="34" stroke="#84cc16" stroke-width="1.2" opacity=".6" stroke-linecap="round"/><line x1="15" y1="32" x2="25" y2="32" stroke="#84cc16" stroke-width="1.2" opacity=".6" stroke-linecap="round"/></svg>',
    },
    {
      id: 'theme_matrix',
      name: 'Matrix',
      category: 'theme',
      description: 'Green on black. The one. The only. Legendary.',
      cost: 3500,
      rarity: 'legendary',
      slot: 'theme',
      themeKey: 'matrix',
      preview: { bg: '#000000', accent: '#00ff41', text: '#00cc33' },
      icon: '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="6" fill="#000"/><text x="7" y="14" font-size="6" fill="#00ff41" opacity=".9" font-family="monospace">01101</text><text x="9" y="20" font-size="6" fill="#00cc33" opacity=".6" font-family="monospace">10010</text><text x="7" y="26" font-size="6" fill="#00ff41" opacity=".8" font-family="monospace">11001</text><text x="9" y="32" font-size="6" fill="#00cc33" opacity=".4" font-family="monospace">01110</text></svg>',
    },
    {
      id: 'theme_rainbow',
      name: 'Rainbow',
      category: 'theme',
      description: 'All the colors. All at once. The rarest theme in the shop — legendary status, legendary price.',
      cost: 5000,
      rarity: 'legendary',
      slot: 'theme',
      themeKey: 'rainbow',
      preview: { bg: '#0a0010', accent: '#ff6ef7', text: '#ffffff' },
      icon: '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="rbw" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#ff4444"/><stop offset="16%" stop-color="#ff9900"/><stop offset="33%" stop-color="#ffee00"/><stop offset="50%" stop-color="#44ff44"/><stop offset="66%" stop-color="#44aaff"/><stop offset="83%" stop-color="#8844ff"/><stop offset="100%" stop-color="#ff44dd"/></linearGradient><linearGradient id="rbwb" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1a0030"/><stop offset="100%" stop-color="#000818"/></linearGradient></defs><rect width="40" height="40" rx="6" fill="url(#rbwb)"/><rect x="0" y="8" width="40" height="5" fill="url(#rbw)" opacity=".95"/><rect x="0" y="15" width="40" height="4" fill="url(#rbw)" opacity=".75"/><rect x="0" y="21" width="40" height="3" fill="url(#rbw)" opacity=".55"/><rect x="0" y="26" width="40" height="2" fill="url(#rbw)" opacity=".35"/><circle cx="20" cy="34" r="3.5" fill="url(#rbw)" opacity=".9"/></svg>',
    },

    /* ── PROFILE EFFECTS ─────────────────────────────── */
    {
      id: 'effect_sparkle',
      name: 'Sparkle Trail',
      category: 'effect',
      description: 'Your account button sparkles when hovered.',
      cost: 400,
      rarity: 'uncommon',
      slot: 'effect',
      icon: ICONS.sparkle,
    },
    {
      id: 'effect_pulse',
      name: 'Pulse Ring',
      category: 'effect',
      description: 'A pulsing glow ring on your profile button.',
      cost: 600,
      rarity: 'rare',
      slot: 'effect',
      icon: ICONS.pulse,
    },
    {
      id: 'effect_fire',
      name: 'Nova Flame',
      category: 'effect',
      description: 'An animated flame effect on your profile.',
      cost: 900,
      rarity: 'epic',
      slot: 'effect',
      icon: ICONS.flame,
    },
    {
      id: 'effect_crown',
      name: 'Crown Badge',
      category: 'effect',
      description: 'A golden crown floats above your username.',
      cost: 2000,
      rarity: 'legendary',
      slot: 'effect',
      icon: ICONS.crown,
    },

    /* ── ORB BOOSTS ─────────────────────────────────── */
    {
      id: 'boost_xp_2x_day',
      name: 'Double Orbs (24h)',
      category: 'boost',
      description: 'All Orbs earned in the next 24 hours are doubled.',
      cost: 350,
      rarity: 'uncommon',
      slot: null,
      consumable: true,
      duration: 86400000,
      multiplier: 2,
      icon: ICONS.bolt2x,
    },
    {
      id: 'boost_xp_3x_day',
      name: 'Triple Orbs (24h)',
      category: 'boost',
      description: 'All Orbs earned in the next 24 hours are tripled.',
      cost: 800,
      rarity: 'rare',
      slot: null,
      consumable: true,
      duration: 86400000,
      multiplier: 3,
      icon: ICONS.bolt3x,
    },
  ];

  /* Exclusive shop-only themes with full CSS vars */
  var EXTRA_THEMES = {
    synthwave: {
      label: 'Synthwave',
      base: 'dark',
      vars: {
        '--accent': '#f72585', '--accent2': '#7209b7',
        '--glow': 'rgba(247,37,133,0.22)', '--glow-s': 'rgba(114,9,183,0.12)',
        '--bg': '#0d0015', '--bg2': '#130020', '--s1': '#1a0030',
        '--text': '#d0c0ff', '--muted': '#9060c0', '--dim': '#604080',
        '--white': '#fce8ff',
        '--glass-bg': 'rgba(247,37,133,0.04)', '--glass-bg-h': 'rgba(247,37,133,0.08)',
        '--glass-b': 'rgba(247,37,133,0.12)', '--glass-bh': 'rgba(247,37,133,0.4)',
        '--toast-bg': 'rgba(13,0,21,0.98)',
      },
    },
    icestorm: {
      label: 'Ice Storm',
      base: 'dark',
      vars: {
        '--accent': '#a8e6ff', '--accent2': '#67d1f5',
        '--glow': 'rgba(168,230,255,0.18)', '--glow-s': 'rgba(103,209,245,0.1)',
        '--bg': '#010c14', '--bg2': '#021020', '--s1': '#03182e',
        '--text': '#c8eeff', '--muted': '#5890b8', '--dim': '#305878',
        '--white': '#e8f8ff',
        '--glass-bg': 'rgba(168,230,255,0.04)', '--glass-bg-h': 'rgba(168,230,255,0.08)',
        '--glass-b': 'rgba(168,230,255,0.12)', '--glass-bh': 'rgba(168,230,255,0.4)',
        '--toast-bg': 'rgba(1,12,20,0.98)',
      },
    },
    ember: {
      label: 'Ember',
      base: 'dark',
      vars: {
        '--accent': '#fb923c', '--accent2': '#ea580c',
        '--glow': 'rgba(251,146,60,0.2)', '--glow-s': 'rgba(234,88,12,0.1)',
        '--bg': '#0e0600', '--bg2': '#1a0a00', '--s1': '#261000',
        '--text': '#ffe4cc', '--muted': '#b06030', '--dim': '#784020',
        '--white': '#fff4eb',
        '--glass-bg': 'rgba(251,146,60,0.04)', '--glass-bg-h': 'rgba(251,146,60,0.08)',
        '--glass-b': 'rgba(251,146,60,0.12)', '--glass-bh': 'rgba(251,146,60,0.4)',
        '--toast-bg': 'rgba(14,6,0,0.98)',
      },
    },
    duskrose: {
      label: 'Dusk Rose',
      base: 'dark',
      vars: {
        '--accent': '#f9a8d4', '--accent2': '#ec4899',
        '--glow': 'rgba(249,168,212,0.2)', '--glow-s': 'rgba(192,132,252,0.1)',
        '--bg': '#0f0510', '--bg2': '#180820', '--s1': '#200c2e',
        '--text': '#f5d0e8', '--muted': '#a06090', '--dim': '#704060',
        '--white': '#fff0f8',
        '--glass-bg': 'rgba(249,168,212,0.04)', '--glass-bg-h': 'rgba(249,168,212,0.08)',
        '--glass-b': 'rgba(249,168,212,0.12)', '--glass-bh': 'rgba(249,168,212,0.4)',
        '--toast-bg': 'rgba(15,5,16,0.98)',
      },
    },
    toxic: {
      label: 'Toxic',
      base: 'dark',
      vars: {
        '--accent': '#84cc16', '--accent2': '#65a30d',
        '--glow': 'rgba(132,204,22,0.2)', '--glow-s': 'rgba(101,163,13,0.1)',
        '--bg': '#010d02', '--bg2': '#031502', '--s1': '#071e04',
        '--text': '#d9f99d', '--muted': '#568020', '--dim': '#385514',
        '--white': '#f0ffe0',
        '--glass-bg': 'rgba(132,204,22,0.04)', '--glass-bg-h': 'rgba(132,204,22,0.08)',
        '--glass-b': 'rgba(132,204,22,0.12)', '--glass-bh': 'rgba(132,204,22,0.4)',
        '--toast-bg': 'rgba(1,13,2,0.98)',
      },
    },
    matrix: {
      label: 'Matrix',
      base: 'dark',
      vars: {
        '--accent': '#00ff41', '--accent2': '#00cc33',
        '--glow': 'rgba(0,255,65,0.2)', '--glow-s': 'rgba(0,204,51,0.08)',
        '--bg': '#000000', '--bg2': '#010801', '--s1': '#030f03',
        '--text': '#00cc33', '--muted': '#006618', '--dim': '#004010',
        '--white': '#ccffcc',
        '--glass-bg': 'rgba(0,255,65,0.04)', '--glass-bg-h': 'rgba(0,255,65,0.08)',
        '--glass-b': 'rgba(0,255,65,0.1)', '--glass-bh': 'rgba(0,255,65,0.35)',
        '--toast-bg': 'rgba(0,0,0,0.99)',
      },
    },
    rainbow: {
      label: 'Rainbow',
      base: 'dark',
      vars: {
        '--accent': '#ff6ef7', '--accent2': '#a855f7',
        '--glow': 'rgba(255,110,247,0.25)', '--glow-s': 'rgba(168,85,247,0.12)',
        '--bg': '#0a0010', '--bg2': '#100018', '--s1': '#180024',
        '--text': '#f0e8ff', '--muted': '#b090d0', '--dim': '#7050a0',
        '--white': '#ffffff',
        '--glass-bg': 'rgba(255,110,247,0.05)', '--glass-bg-h': 'rgba(255,110,247,0.10)',
        '--glass-b': 'rgba(255,110,247,0.15)', '--glass-bh': 'rgba(255,110,247,0.5)',
        '--toast-bg': 'rgba(10,0,16,0.99)',

      },
    },
  };

  /* ─────────────────────────────────────
     STORAGE HELPERS
  ───────────────────────────────────── */
  var KEYS = {
    purchases: 'nova_shop_purchases',
    equipped:  'nova_shop_equipped',
    xp:        'nova_badges_xp',
    boosts:    'nova_shop_boosts',
  };

  function sg(key, def) {
    try { var v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : def; } catch(e) { return def; }
  }
  function ss(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
  }

  function getPurchases() { return sg(KEYS.purchases, {}); }
  function getEquipped()  { return sg(KEYS.equipped, {}); }
  function getXP()        { return sg(KEYS.xp, 0) || 0; }
  function hasPurchased(id) { return !!getPurchases()[id]; }

  function spendXP(amount) {
    var xp = getXP();
    if (xp < amount) return false;
    ss(KEYS.xp, xp - amount);
    return true;
  }

  function getActiveBoost() {
    var boosts = sg(KEYS.boosts, {});
    var now = Date.now();
    var best = null;
    Object.values(boosts).forEach(function(b) {
      if (b.expiresAt > now) {
        if (!best || b.multiplier > best.multiplier) best = b;
      }
    });
    return best;
  }

  /* ─────────────────────────────────────
     RARITY COLORS
  ───────────────────────────────────── */
  var RARITY_COLORS = {
    common: '#a0a0a0', uncommon: '#4ecca3', rare: '#8b8fff',
    epic: '#c060ff', legendary: '#f5c518',
  };

  /* ─────────────────────────────────────
     APPLY NAMEPLATE / EQUIPPED ITEMS
  ───────────────────────────────────── */
  function applyEquipped() {
    var eq = getEquipped();

    var np = eq.nameplate;
    var npItem = np ? SHOP_ITEMS.find(function(i){ return i.id === np; }) : null;
    var acctBtn = document.getElementById('account-btn');
    if (acctBtn) {
      var acctSpan = acctBtn.querySelector('span');
      if (npItem && npItem.preview) {
        var p = npItem.preview;
        if (p.rainbow) {
          // Button border effect
          acctBtn.style.border = '1px solid transparent';
          acctBtn.style.backgroundImage = 'linear-gradient(var(--bg2),var(--bg2)),linear-gradient(90deg,#f87171,#f5c518,#4ecca3,#8b8fff,#c084fc)';
          acctBtn.style.backgroundOrigin = 'border-box';
          acctBtn.style.backgroundClip = 'padding-box,border-box';
          acctBtn.style.boxShadow = '0 0 12px rgba(180,100,255,0.4)';
          acctBtn.style.color = '';
          acctBtn.style.animation = 'nova-rainbow-border 3s linear infinite';
          // Username span: rainbow gradient text
          if (acctSpan) {
            acctSpan.style.background = 'linear-gradient(90deg,#f87171,#f5c518,#4ecca3,#8b8fff,#c084fc)';
            acctSpan.style.webkitBackgroundClip = 'text';
            acctSpan.style.webkitTextFillColor = 'transparent';
            acctSpan.style.backgroundClip = 'text';
            acctSpan.style.textShadow = 'none';
            acctSpan.style.animation = 'nova-rainbow-border 3s linear infinite';
            acctSpan.style.backgroundSize = '200% auto';
          }
        } else {
          // Button border + glow only
          acctBtn.style.border = '1px solid ' + p.border;
          acctBtn.style.backgroundImage = '';
          acctBtn.style.backgroundClip = '';
          acctBtn.style.backgroundOrigin = '';
          acctBtn.style.boxShadow = '0 0 10px ' + p.glow + ', 0 0 3px ' + p.glow;
          acctBtn.style.color = '';
          acctBtn.style.animation = p.galaxy ? 'nova-galaxy-pulse 2s ease-in-out infinite' : '';
          // Username span: solid nameplate color + glow
          if (acctSpan) {
            acctSpan.style.background = '';
            acctSpan.style.webkitBackgroundClip = '';
            acctSpan.style.webkitTextFillColor = '';
            acctSpan.style.backgroundClip = '';
            acctSpan.style.backgroundSize = '';
            acctSpan.style.color = p.text;
            acctSpan.style.textShadow = '0 0 8px ' + p.glow + ', 0 0 2px ' + p.glow;
            acctSpan.style.animation = p.galaxy ? 'nova-galaxy-pulse 2s ease-in-out infinite' : '';
          }
        }
      } else {
        acctBtn.style.border = '';
        acctBtn.style.boxShadow = '';
        acctBtn.style.color = '';
        acctBtn.style.backgroundImage = '';
        acctBtn.style.backgroundClip = '';
        acctBtn.style.backgroundOrigin = '';
        acctBtn.style.animation = '';
        // Reset span
        if (acctSpan) {
          acctSpan.style.background = '';
          acctSpan.style.webkitBackgroundClip = '';
          acctSpan.style.webkitTextFillColor = '';
          acctSpan.style.backgroundClip = '';
          acctSpan.style.backgroundSize = '';
          acctSpan.style.color = '';
          acctSpan.style.textShadow = '';
          acctSpan.style.animation = '';
        }
      }
      // Store nameplate preview on window so social.js can read it for message sender names
      window._novaEquippedNameplate = (npItem && npItem.preview) ? { id: np, preview: npItem.preview } : null;

      var eff = eq.effect;
      acctBtn.dataset.effect = eff || '';
      acctBtn.classList.remove('nova-effect-sparkle','nova-effect-pulse','nova-effect-fire','nova-effect-crown');
      if (eff) acctBtn.classList.add('nova-effect-' + eff.replace('effect_', ''));
    }

    var th = eq.theme;
    /* eq.theme stores the item id (e.g. "theme_synthwave") but EXTRA_THEMES
       is keyed by themeKey (e.g. "synthwave"). Strip the "theme_" prefix. */
    var thKey = th ? th.replace(/^theme_/, '') : null;
    if (thKey && EXTRA_THEMES[thKey]) applyExtraTheme(thKey);
  }

  /* RAF handle for rainbow theme animation */
  var _rainbowRAF = null;

  function stopRainbowAnimation() {
    if (_rainbowRAF) { cancelAnimationFrame(_rainbowRAF); _rainbowRAF = null; }
  }

  function startRainbowAnimation() {
    stopRainbowAnimation();
    var root = document.documentElement;
    /* Base colors for each channel at hue=0: accent=#ff6ef7 (pink/magenta).
       We animate by computing hsl values and writing them directly as CSS vars.
       This ONLY touches CSS custom properties — never applies filter to any element,
       so images, pfps, game icons etc. are completely unaffected. */
    var start = null;
    var PERIOD = 6000; // ms for a full cycle
    function frame(ts) {
      if (!start) start = ts;
      var h = ((ts - start) / PERIOD * 360) % 360;
      // Accent: full saturation, 70% lightness
      root.style.setProperty('--accent',  'hsl(' + h + ',100%,72%)');
      root.style.setProperty('--accent2', 'hsl(' + h + ',100%,55%)');
      // Glow: translucent version of accent
      root.style.setProperty('--glow',   'hsla(' + h + ',100%,72%,0.25)');
      root.style.setProperty('--glow-s', 'hsla(' + h + ',100%,72%,0.12)');
      // Glass borders pulse with the accent
      root.style.setProperty('--glass-b',  'hsla(' + h + ',100%,72%,0.15)');
      root.style.setProperty('--glass-bh', 'hsla(' + h + ',100%,72%,0.50)');
      _rainbowRAF = requestAnimationFrame(frame);
    }
    _rainbowRAF = requestAnimationFrame(frame);
  }

  function applyExtraTheme(key) {
    var t = EXTRA_THEMES[key];
    if (!t) return;
    /* Stop any running rainbow animation before applying a new theme */
    stopRainbowAnimation();
    var root = document.documentElement;
    root.setAttribute('data-theme', t.base);
    Object.entries(t.vars).forEach(function(pair) {
      root.style.setProperty(pair[0], pair[1]);
    });
    /* Sync settings panel: deactivate all preset buttons since this is a shop theme */
    document.querySelectorAll('.theme-preset-btn').forEach(function(btn) {
      btn.classList.remove('active');
    });
    document.querySelectorAll('.theme-opt').forEach(function(opt) {
      opt.classList.remove('active');
    });
    /* Rainbow theme: kick off the CSS-variable animation (no filter used) */
    if (key === 'rainbow') {
      startRainbowAnimation();
    }
  }

  function equipItem(item) {
    var eq = getEquipped();
    if (item.slot) eq[item.slot] = item.id;
    ss(KEYS.equipped, eq);
    /* If this is a theme item, write nova_theme so it persists across reloads
       and nova.js can restore it on boot. We prefix with "shop:" to distinguish
       from built-in settings themes. */
    if (item.slot === 'theme' && item.themeKey) {
      localStorage.setItem('nova_theme', 'shop:' + item.themeKey);
    }
    applyEquipped();
    // Sync nameplate to Supabase so other users see it in Social chat
    if (item.slot === 'nameplate' && typeof window._novaSyncMyNameplate === 'function') {
      window._novaSyncMyNameplate();
    }
  }

  function unequipSlot(slot) {
    var eq = getEquipped();
    delete eq[slot];
    ss(KEYS.equipped, eq);
    /* If unequipping a theme, restore nova_theme to a safe default
       so the next reload doesn't try to re-apply the shop theme */
    if (slot === 'theme') {
      stopRainbowAnimation();
      var cur = localStorage.getItem('nova_theme') || '';
      if (cur.indexOf('shop:') === 0) {
        localStorage.setItem('nova_theme', 'dark');
      }
    }
    applyEquipped();
    // Sync nameplate removal to Supabase
    if (slot === 'nameplate' && typeof window._novaSyncMyNameplate === 'function') {
      window._novaSyncMyNameplate();
    }
  }

  /* ─────────────────────────────────────
     INJECT CSS
  ───────────────────────────────────── */
  function injectCSS() {
    if (document.getElementById('nova-shop-styles')) return;
    var style = document.createElement('style');
    style.id = 'nova-shop-styles';
    style.textContent = `
/* ── Shop panel inside rewards page ── */
#nova-shop-section {
  margin-top: 0;
  padding-top: 0;
}
.nova-shop-section-header {
  display: flex; align-items: center; gap: .7rem; margin-bottom: 1rem; flex-wrap: wrap;
}
.nova-shop-section-title {
  font-family: 'Space Mono', monospace; font-size: .75rem; font-weight: 700;
  color: var(--white); letter-spacing: .1em;
}
.nova-shop-section-sub {
  font-family: 'Space Mono', monospace; font-size: .4rem;
  color: var(--muted); margin-bottom: 1rem;
}
.shop-wallet {
  display: inline-flex; align-items: center; gap: .45rem;
  background: rgba(245,197,24,.1); border: 1px solid rgba(245,197,24,.3);
  border-radius: 100px; padding: .3rem .8rem;
  font-family: 'Space Mono', monospace; font-size: .5rem; font-weight: 700; color: #f5c518;
  letter-spacing: .06em;
}
.shop-boost-indicator {
  display: inline-flex; align-items: center; gap: .4rem;
  background: rgba(139,143,255,.1); border: 1px solid rgba(139,143,255,.25);
  border-radius: 100px; padding: .3rem .8rem;
  font-family: 'Space Mono', monospace; font-size: .42rem; color: #8b8fff;
}
.shop-boost-icon {
  width: 12px; height: 12px;
}
.shop-boost-banner {
  font-family: 'Space Mono', monospace; font-size: .42rem; color: #f5c518;
  margin-bottom: .8rem;
}
.shop-cat-tabs {
  display: flex; gap: .4rem; flex-wrap: wrap; margin-bottom: 1.2rem;
}
.shop-cat-btn {
  font-family: 'Space Mono', monospace; font-size: .38rem; font-weight: 700;
  letter-spacing: .06em; padding: .3rem .7rem; border-radius: 100px;
  border: 1px solid rgba(139,143,255,.2); cursor: pointer;
  background: rgba(139,143,255,.04); color: var(--muted);
  transition: background .15s, color .15s, border-color .15s;
}
.shop-cat-btn.active, .shop-cat-btn:hover {
  background: rgba(139,143,255,.15); color: var(--white);
  border-color: rgba(139,143,255,.4);
}
.shop-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: .8rem;
}
.shop-item-card {
  background: var(--glass-bg); border: 1px solid rgba(139,143,255,.12);
  border-radius: 10px; padding: .7rem .5rem .5rem;
  display: flex; flex-direction: column; align-items: center;
  gap: .35rem; cursor: pointer; position: relative;
  transition: background .15s, border-color .15s, transform .1s;
}
.shop-item-card:hover { background: var(--glass-bg-h); transform: translateY(-1px); }
.shop-item-card.owned { border-color: rgba(78,204,163,.35); }
.shop-item-card.equipped-card { border-color: rgba(245,197,24,.5); }
.shop-item-rarity-dot {
  position: absolute; top: .5rem; right: .5rem;
  width: 6px; height: 6px; border-radius: 50%;
}
.shop-item-icon {
  width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;
}
.shop-item-icon svg { width: 100%; height: 100%; }
.shop-item-name {
  font-family: 'Space Mono', monospace; font-size: .33rem; font-weight: 700;
  color: var(--white); text-align: center; line-height: 1.3;
}
.shop-item-cost {
  font-family: 'Space Mono', monospace; font-size: .32rem; color: #f5c518;
}
.shop-item-cost.free { color: #4ecca3; }
.shop-item-cost.owned-tag { color: #4ecca3; }

/* Modal */
#shop-modal {
  display: none; position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,.7); align-items: center; justify-content: center;
  backdrop-filter: blur(4px);
}
#shop-modal-inner {
  background: var(--bg2); border: 1px solid var(--glass-b);
  border-radius: 16px; padding: 1.5rem; max-width: 320px; width: 90%;
  max-height: 80vh; overflow-y: auto; position: relative;
}
.shop-modal-rarity {
  font-family: 'Space Mono', monospace; font-size: .38rem; font-weight: 700;
  letter-spacing: .1em; margin-bottom: .3rem;
}
.shop-modal-desc {
  font-family: 'Space Mono', monospace; font-size: .4rem;
  color: var(--muted); line-height: 1.6; margin-bottom: .8rem;
}
.shop-modal-preview {
  background: var(--glass-bg); border: 1px solid var(--glass-b);
  border-radius: 10px; padding: .8rem; display: flex;
  align-items: center; justify-content: center; min-height: 48px;
}

/* Nameplate preview inside modal — FULL COLOR */
.shop-modal-np-preview {
  display: flex; align-items: center; gap: .6rem;
  padding: .5rem 1rem; border-radius: 100px;
  font-family: 'Space Mono', monospace; font-size: .45rem; font-weight: 700;
  width: 100%; box-sizing: border-box; justify-content: center;
}

.shop-modal-btn {
  width: 100%; padding: .5rem; border-radius: 8px; border: none; cursor: pointer;
  font-family: 'Space Mono', monospace; font-size: .45rem; font-weight: 700;
  letter-spacing: .06em; transition: opacity .15s;
}
.shop-modal-btn:hover { opacity: .85; }
.shop-modal-btn.buy { background: var(--accent); color: #0a0a14; }
.shop-modal-btn.equip { background: rgba(78,204,163,.2); color: #4ecca3; border: 1px solid rgba(78,204,163,.4); }
.shop-modal-btn.unequip { background: rgba(248,113,113,.15); color: #f87171; border: 1px solid rgba(248,113,113,.3); }
.shop-modal-btn.cant-afford { background: rgba(139,143,255,.08); color: rgba(255,100,100,.6); cursor: not-allowed; border: 1px solid rgba(139,143,255,.15); }
.shop-modal-actions { width: 100%; }

/* Animations */
@keyframes nova-rainbow-border { 0%{filter:hue-rotate(0deg)} 100%{filter:hue-rotate(360deg)} }
@keyframes nova-galaxy-pulse { 0%,100%{box-shadow:0 0 10px rgba(192,132,252,0.5)} 50%{box-shadow:0 0 22px rgba(192,132,252,0.9),0 0 40px rgba(139,143,255,0.3)} }
/* Rainbow theme: CSS-variable-based hue cycling — no filter on any element, so images are never affected */
@keyframes nova-rainbow-hue {
  0%   { --rainbow-h: 0; }
  100% { --rainbow-h: 360; }
}

/* Effect classes */
.nova-effect-sparkle:hover { animation: nova-sparkle .6s ease-in-out; }
@keyframes nova-sparkle { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.6) drop-shadow(0 0 6px #f5c518)} }
.nova-effect-pulse { animation: nova-pulse-ring 1.8s ease-in-out infinite; }
@keyframes nova-pulse-ring { 0%,100%{box-shadow:0 0 0 0 rgba(139,143,255,.5)} 50%{box-shadow:0 0 0 6px rgba(139,143,255,0)} }
.nova-effect-fire { animation: nova-fire 1s ease-in-out infinite; }
@keyframes nova-fire { 0%,100%{filter:drop-shadow(0 -3px 4px rgba(251,146,60,.6))} 50%{filter:drop-shadow(0 -5px 8px rgba(248,113,113,.8))} }
.nova-effect-crown::before { content:''; position:absolute; top:-8px; left:50%; transform:translateX(-50%); width:14px; height:10px; background:url("data:image/svg+xml,%3Csvg viewBox='0 0 14 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 9 L2 4 L5 7 L7 1 L9 7 L12 4 L13 9Z' fill='%23f5c518'/%3E%3C/svg%3E") no-repeat center/contain; }
    `;
    document.head.appendChild(style);
  }

  /* ─────────────────────────────────────
     INJECT SHOP INTO REWARDS PAGE
  ───────────────────────────────────── */
  function injectShopIntoRewards() {
    if (document.getElementById('nova-shop-section')) return;

    /* Target the dedicated shop panel injected in index.html */
    var shopPanel = document.getElementById('rewards-panel-shop');
    if (!shopPanel) {
      setTimeout(injectShopIntoRewards, 400);
      return;
    }

    var shopSection = document.createElement('div');
    shopSection.id = 'nova-shop-section';
    shopSection.innerHTML = `
<div class="nova-shop-section-header" style="margin-top:.4rem;">
  <div class="shop-wallet">
    <svg class="shop-wallet-star" width="12" height="12" viewBox="0 0 24 24" fill="#f5c518" stroke="#f5c518" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
    <span id="shop-xp-balance">0 Orbs</span>
  </div>
  <div id="shop-boost-status" class="shop-boost-indicator" style="display:none;">
    <svg class="shop-boost-icon" viewBox="0 0 24 24" fill="none" stroke="#8b8fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
    <span id="shop-boost-label">2x Orbs Active</span>
  </div>
</div>
<div class="nova-shop-section-sub">Spend Nova Orbs on exclusive cosmetics and boosts</div>
<div id="shop-boost-banner" class="shop-boost-banner"></div>
<div class="shop-cat-tabs" id="shop-cat-tabs">
  <button class="shop-cat-btn active" data-cat="all">ALL</button>
  <button class="shop-cat-btn" data-cat="nameplate">NAMEPLATES</button>
  <button class="shop-cat-btn" data-cat="theme">THEMES</button>
  <button class="shop-cat-btn" data-cat="effect">EFFECTS</button>
  <button class="shop-cat-btn" data-cat="boost">ORB BOOSTS</button>
</div>
<div class="shop-grid" id="shop-grid"></div>
    `;

    /* Inject directly into the dedicated shop panel */
    shopPanel.appendChild(shopSection);

    /* Build modal (appended to body) */
    if (!document.getElementById('shop-modal')) {
      var modal = document.createElement('div');
      modal.id = 'shop-modal';
      modal.innerHTML = `
<div id="shop-modal-inner">
  <button id="shop-modal-close" style="position:absolute;top:.8rem;right:.8rem;background:rgba(139,143,255,.12);border:1px solid rgba(139,143,255,.2);border-radius:6px;padding:.25rem .5rem;color:var(--muted);cursor:pointer;font-size:.5rem;font-family:'Space Mono',monospace;">
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
  </button>
  <div style="display:flex;flex-direction:column;align-items:center;gap:.7rem;text-align:center;">
    <div id="shop-modal-icon" style="width:72px;height:72px;"></div>
    <div>
      <div id="shop-modal-name" style="font-family:'Space Mono',monospace;font-size:.65rem;font-weight:700;color:var(--white);letter-spacing:.06em;margin-bottom:.3rem;"></div>
      <div id="shop-modal-rarity" class="shop-modal-rarity"></div>
      <div id="shop-modal-desc" class="shop-modal-desc"></div>
      <div id="shop-modal-cost" style="font-family:'Space Mono',monospace;font-size:.5rem;font-weight:700;color:#f5c518;margin-bottom:.5rem;"></div>
    </div>
    <div id="shop-modal-preview-wrap" class="shop-modal-preview" style="width:100%;box-sizing:border-box;"></div>
    <div class="shop-modal-actions" style="width:100%;" id="shop-modal-actions"></div>
  </div>
</div>
      `;
      document.body.appendChild(modal);
    }

    renderShopGrid();
    updateShopWallet();
    updateBoostUI();
    wireCatTabs();
  }

  /* ─────────────────────────────────────
     RENDER SHOP GRID
  ───────────────────────────────────── */
  var _currentCat = 'all';

  function renderShopGrid() {
    var grid = document.getElementById('shop-grid');
    if (!grid) return;

    var items = _currentCat === 'all'
      ? SHOP_ITEMS
      : SHOP_ITEMS.filter(function(i){ return i.category === _currentCat; });

    var equipped = getEquipped();

    grid.innerHTML = '';
    items.forEach(function(item) {
      var owned = hasPurchased(item.id) || item.cost === 0;
      var equippedNow = item.slot && equipped[item.slot] === item.id;
      var col = RARITY_COLORS[item.rarity] || '#a0a0a0';

      var card = document.createElement('div');
      card.className = 'shop-item-card' + (owned ? ' owned' : '') + (equippedNow ? ' equipped-card' : '');
      card.style.borderColor = equippedNow ? 'rgba(245,197,24,.5)' : (owned ? 'rgba(78,204,163,.3)' : 'rgba(139,143,255,.12)');

      var dot = document.createElement('div');
      dot.className = 'shop-item-rarity-dot';
      dot.style.background = col;
      card.appendChild(dot);

      var iconWrap = document.createElement('div');
      iconWrap.className = 'shop-item-icon';
      iconWrap.innerHTML = item.icon;
      card.appendChild(iconWrap);

      var nameEl = document.createElement('div');
      nameEl.className = 'shop-item-name';
      nameEl.textContent = item.name;
      card.appendChild(nameEl);

      var costEl = document.createElement('div');
      costEl.className = 'shop-item-cost' + (owned ? ' owned-tag' : '') + (item.cost === 0 ? ' free' : '');
      if (owned) {
        costEl.textContent = equippedNow ? 'ON' : 'OWNED';
        costEl.style.color = equippedNow ? '#f5c518' : '#4ecca3';
      } else if (item.cost === 0) {
        costEl.textContent = 'FREE';
      } else {
        costEl.innerHTML = '<svg width="8" height="8" viewBox="0 0 24 24" fill="#f5c518" stroke="#f5c518" stroke-width="1" style="vertical-align:middle;margin-right:2px"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' + item.cost.toLocaleString() + ' Orbs';
      }
      card.appendChild(costEl);

      card.addEventListener('click', function(){ openShopModal(item); });
      grid.appendChild(card);
    });
  }

  /* ─────────────────────────────────────
     SHOP MODAL
  ───────────────────────────────────── */
  function openShopModal(item) {
    var modal      = document.getElementById('shop-modal');
    var iconEl     = document.getElementById('shop-modal-icon');
    var nameEl     = document.getElementById('shop-modal-name');
    var rarEl      = document.getElementById('shop-modal-rarity');
    var descEl     = document.getElementById('shop-modal-desc');
    var costEl     = document.getElementById('shop-modal-cost');
    var previewWrap= document.getElementById('shop-modal-preview-wrap');
    var actions    = document.getElementById('shop-modal-actions');
    if (!modal) return;

    var owned = hasPurchased(item.id) || item.cost === 0;
    var equippedNow = item.slot && getEquipped()[item.slot] === item.id;
    var xp = getXP();
    var col = RARITY_COLORS[item.rarity] || '#a0a0a0';

    iconEl.innerHTML = item.icon;
    nameEl.textContent = item.name;
    rarEl.textContent = (item.rarity || 'common').toUpperCase();
    rarEl.style.color = col;
    descEl.textContent = item.description;

    if (owned) {
      costEl.innerHTML = equippedNow
        ? '<span style="color:#f5c518">EQUIPPED</span>'
        : '<span style="color:#4ecca3">OWNED</span>';
    } else if (item.cost === 0) {
      costEl.innerHTML = '<span style="color:#4ecca3">FREE</span>';
    } else {
      costEl.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="#f5c518" stroke="#f5c518" stroke-width="1" style="vertical-align:middle;margin-right:3px"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><span style="color:#f5c518">' + item.cost.toLocaleString() + ' Orbs</span>';
    }

    /* Preview */
    previewWrap.innerHTML = '';

    if (item.category === 'nameplate' && item.preview) {
      var p = item.preview;
      var npEl = document.createElement('div');
      npEl.className = 'shop-modal-np-preview';

      if (p.rainbow) {
        /* Rainbow: gradient border + white text */
        npEl.style.backgroundImage = 'linear-gradient(#0c0c1a,#0c0c1a),linear-gradient(90deg,#f87171,#f5c518,#4ecca3,#8b8fff,#c084fc)';
        npEl.style.backgroundOrigin = 'border-box';
        npEl.style.backgroundClip = 'padding-box,border-box';
        npEl.style.border = '2px solid transparent';
        npEl.style.animation = 'nova-rainbow-border 2s linear infinite';
        npEl.style.color = '#ffffff';
        npEl.style.boxShadow = '0 0 12px rgba(180,100,255,0.5)';
      } else {
        /* Solid color: full bg tint + border + glow + text color */
        npEl.style.background = p.bg || 'rgba(139,143,255,0.1)';
        npEl.style.border = '2px solid ' + p.border;
        npEl.style.boxShadow = '0 0 14px ' + p.glow + ', inset 0 0 8px ' + (p.bg || 'transparent');
        npEl.style.color = p.text;
        if (p.galaxy) npEl.style.animation = 'nova-galaxy-pulse 2s ease-in-out infinite';
      }

      /* Avatar icon */
      var avatarSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
      npEl.innerHTML = avatarSvg + '<span style="font-family:Space Mono,monospace;font-size:.45rem;font-weight:700;letter-spacing:.06em;">USERNAME</span>';
      previewWrap.appendChild(npEl);

    } else if (item.category === 'theme' && item.preview) {
      var tp = item.preview;
      var swatch = document.createElement('div');
      swatch.style.cssText = 'width:100%;border-radius:8px;overflow:hidden;background:' + tp.bg + ';padding:.7rem;box-sizing:border-box;';
      swatch.innerHTML = `
        <div style="height:6px;border-radius:3px;background:${tp.accent};margin-bottom:.5rem;opacity:.9;"></div>
        <div style="height:4px;border-radius:2px;background:${tp.text};margin-bottom:.4rem;opacity:.3;width:70%;"></div>
        <div style="height:4px;border-radius:2px;background:${tp.text};opacity:.18;width:50%;"></div>
        <div style="margin-top:.6rem;font-family:Space Mono,monospace;font-size:.35rem;color:${tp.accent};opacity:.7;">SHOP EXCLUSIVE</div>
      `;
      previewWrap.appendChild(swatch);

    } else if (item.category === 'effect') {
      previewWrap.innerHTML = '<div style="display:flex;align-items:center;gap:.5rem;"><div style="width:32px;height:32px;">' + item.icon + '</div><div style="font-family:Space Mono,monospace;font-size:.4rem;color:var(--muted);">Effect applied to your profile button</div></div>';

    } else if (item.category === 'boost') {
      previewWrap.innerHTML = '<div style="display:flex;align-items:center;gap:.5rem;"><div style="width:28px;height:28px;">' + item.icon + '</div><div style="font-family:Space Mono,monospace;font-size:.4rem;color:#f5c518;">Orbs multiplier active for 24 hours after use</div></div>';
    }

    /* Action buttons */
    actions.innerHTML = '';

    if (item.consumable) {
      if (owned || item.cost === 0) {
        var useBtn = document.createElement('button');
        useBtn.className = 'shop-modal-btn equip';
        useBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>ACTIVATE BOOST';
        useBtn.onclick = function() { activateBoost(item); };
        actions.appendChild(useBtn);
      } else {
        var buyBtn = document.createElement('button');
        var canAfford = xp >= item.cost;
        buyBtn.className = canAfford ? 'shop-modal-btn buy' : 'shop-modal-btn cant-afford';
        buyBtn.innerHTML = canAfford
          ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>BUY &amp; ACTIVATE — ' + item.cost + ' Orbs'
          : 'Not enough Orbs (' + xp + ' / ' + item.cost + ')';
        if (canAfford) buyBtn.onclick = function() { buyAndActivateBoost(item); };
        actions.appendChild(buyBtn);
      }
    } else if (owned || item.cost === 0) {
      if (item.slot) {
        if (equippedNow) {
          var unEqBtn = document.createElement('button');
          unEqBtn.className = 'shop-modal-btn unequip';
          unEqBtn.textContent = 'UNEQUIP';
          unEqBtn.onclick = function() {
            unequipSlot(item.slot);
            renderShopGrid();
            modal.style.display = 'none';
            showShopToast('Unequipped ' + item.name);
          };
          actions.appendChild(unEqBtn);
        } else {
          var eqBtn = document.createElement('button');
          eqBtn.className = 'shop-modal-btn equip';
          eqBtn.textContent = 'EQUIP';
          eqBtn.onclick = function() {
            equipItem(item);
            renderShopGrid();
            modal.style.display = 'none';
            showShopToast('Equipped ' + item.name + '!');
          };
          actions.appendChild(eqBtn);
        }
      } else {
        var ownedLabel = document.createElement('div');
        ownedLabel.style.cssText = "font-family:'Space Mono',monospace;font-size:.4rem;color:#4ecca3;text-align:center;";
        ownedLabel.textContent = 'Owned';
        actions.appendChild(ownedLabel);
      }
    } else {
      var canAfford2 = xp >= item.cost;
      var buyBtn2 = document.createElement('button');
      buyBtn2.className = canAfford2 ? 'shop-modal-btn buy' : 'shop-modal-btn cant-afford';
      buyBtn2.innerHTML = canAfford2
        ? 'BUY — ' + item.cost.toLocaleString() + ' Orbs'
        : 'Not enough Orbs (' + xp.toLocaleString() + ' / ' + item.cost.toLocaleString() + ')';
      if (canAfford2) buyBtn2.onclick = function() { buyItem(item); };
      actions.appendChild(buyBtn2);
    }

    modal.style.display = 'flex';
  }

  function buyItem(item) {
    if (!spendXP(item.cost)) { showShopToast('Not enough Orbs!'); return; }
    var p = getPurchases();
    p[item.id] = Date.now();
    ss(KEYS.purchases, p);
    equipItem(item);
    renderShopGrid();
    updateShopWallet();
    document.getElementById('shop-modal').style.display = 'none';
    showShopToast('Purchased ' + item.name + '!');
    if (window.NovaBadges && window.NovaBadges.refresh) window.NovaBadges.refresh();
  }

  function activateBoost(item) {
    var boosts = sg(KEYS.boosts, {});
    boosts[item.id] = { expiresAt: Date.now() + item.duration, multiplier: item.multiplier };
    ss(KEYS.boosts, boosts);
    document.getElementById('shop-modal').style.display = 'none';
    updateBoostUI();
    showShopToast(item.multiplier + 'x Orbs boost activated for 24h!');
  }

  function buyAndActivateBoost(item) {
    if (!spendXP(item.cost)) { showShopToast('Not enough Orbs!'); return; }
    var p = getPurchases(); p[item.id] = Date.now(); ss(KEYS.purchases, p);
    activateBoost(item);
    updateShopWallet();
    if (window.NovaBadges && window.NovaBadges.refresh) window.NovaBadges.refresh();
  }

  /* ─────────────────────────────────────
     BOOST UI
  ───────────────────────────────────── */
  function updateBoostUI() {
    var boost = getActiveBoost();
    var el = document.getElementById('shop-boost-status');
    var label = document.getElementById('shop-boost-label');
    if (!el) return;
    if (boost) {
      el.style.display = 'inline-flex';
      var mins = Math.ceil((boost.expiresAt - Date.now()) / 60000);
      var hrs = Math.floor(mins / 60);
      var rem = mins % 60;
      label.textContent = boost.multiplier + 'x Orbs — ' + (hrs > 0 ? hrs + 'h ' + rem + 'm' : rem + 'm') + ' left';
    } else {
      el.style.display = 'none';
    }
  }

  function updateShopWallet() {
    var el = document.getElementById('shop-xp-balance');
    if (el) el.textContent = window.fmtOrbs ? window.fmtOrbs(getXP()) : getXP().toLocaleString() + ' Orbs';
  }

  /* ─────────────────────────────────────
     TOAST
  ───────────────────────────────────── */
  function showShopToast(msg) {
    if (window.toast) { window.toast(msg); return; }
    var c = document.getElementById('toast-container');
    if (!c) return;
    var t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    c.appendChild(t);
    setTimeout(function(){ t.classList.add('out'); setTimeout(function(){ t.remove(); }, 350); }, 2800);
  }

  /* ─────────────────────────────────────
     CATEGORY FILTER + MODAL CLOSE
  ───────────────────────────────────── */
  function wireCatTabs() {
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('.shop-cat-btn');
      if (btn) {
        document.querySelectorAll('.shop-cat-btn').forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        _currentCat = btn.dataset.cat;
        renderShopGrid();
        return;
      }
      var modal = document.getElementById('shop-modal');
      if (modal && (e.target === modal || e.target.id === 'shop-modal-close' || e.target.closest('#shop-modal-close'))) {
        modal.style.display = 'none';
      }
    });
  }

  /* ─────────────────────────────────────
     ORBS BOOST PATCH
  ───────────────────────────────────── */
  function patchXPSystem() {
    if (window.__novaShopPatched) return;
    window.__novaShopPatched = true;
    var origSet = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(key, value) {
      if (key === 'nova_badges_xp') {
        var boost = getActiveBoost();
        if (boost && boost.multiplier > 1) {
          var prev = sg('nova_badges_xp', 0);
          var next = typeof value === 'string' ? JSON.parse(value) : value;
          var gain = next - prev;
          if (gain > 0) value = JSON.stringify(next + Math.floor(gain * (boost.multiplier - 1)));
        }
      }
      return origSet(key, value);
    };
  }

  /* ─────────────────────────────────────
     HOOK: refresh shop when rewards page opens
  ───────────────────────────────────── */
  function hookRewardsPage() {
    document.querySelectorAll('.nav-tab[data-page="rewards"]').forEach(function(tab) {
      tab.addEventListener('click', function() {
        setTimeout(function() {
          injectShopIntoRewards();
          updateShopWallet();
          updateBoostUI();
          renderShopGrid();
        }, 100);
      });
    });
    /* Also hook nova page change event */
    document.addEventListener('nova:page-change', function(e) {
      if (e.detail && e.detail.page === 'rewards') {
        setTimeout(function() {
          injectShopIntoRewards();
          updateShopWallet();
          updateBoostUI();
          renderShopGrid();
        }, 100);
      }
    });
  }

  /* ─────────────────────────────────────
     BOOT
  ───────────────────────────────────── */
  function boot() {
    injectCSS();
    hookRewardsPage();

    /* If rewards page is already active, inject now */
    var rewardsPage = document.getElementById('page-rewards');
    if (rewardsPage && rewardsPage.classList.contains('active')) {
      injectShopIntoRewards();
    }
    /* Also try after a short delay for pages that load async */
    setTimeout(injectShopIntoRewards, 600);

    applyEquipped();
    // Sync nameplate to Supabase on boot (in case user has one equipped already)
    setTimeout(function() {
      if (typeof window._novaSyncMyNameplate === 'function') window._novaSyncMyNameplate();
    }, 2000);

    setInterval(function() { updateBoostUI(); }, 60000);

    var savedTheme = localStorage.getItem('nova_theme');
    /* Handle both bare key ('synthwave') and prefixed key ('shop:synthwave') */
    var savedExtraKey = savedTheme && savedTheme.indexOf('shop:') === 0
      ? savedTheme.slice(5)
      : savedTheme;
    if (savedExtraKey && EXTRA_THEMES[savedExtraKey]) applyExtraTheme(savedExtraKey);

    setTimeout(patchXPSystem, 500);

    window.addEventListener('storage', function(e) {
      if (e.key === 'nova_badges_xp') updateShopWallet();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.NovaShop = {
    refresh: renderShopGrid,
    getBoost: getActiveBoost,
    applyEquipped: applyEquipped,
    openRewardsShop: injectShopIntoRewards,
  };

})();
