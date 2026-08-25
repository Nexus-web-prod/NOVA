/**
 * Nova 5.4: The Badges Update
 * Badge / Achievement System
 * All tracking is localStorage-based so it works without a server account.
 */

(function() {
'use strict';

/* Nova Orbs — display currency (storage key remains nova_badges_xp) */
function orbWord(n) {
  n = Math.abs(Number(n) || 0);
  return n === 1 ? 'Orb' : 'Orbs';
}
function fmtOrbs(n, opts) {
  opts = opts || {};
  n = Number(n) || 0;
  var sign = opts.plus && n > 0 ? '+' : (opts.signed && n < 0 ? '-' : '');
  var abs = Math.abs(n);
  return sign + abs.toLocaleString() + ' ' + orbWord(abs);
}
window.fmtOrbs = fmtOrbs;
window.orbWord = orbWord;

/* ─────────────────────────────────────────
   BADGE DATA (matches badges.json in context)
───────────────────────────────────────── */
var BADGES = [{"id":"first_launch","name":"Welcome to Nova","description":"Open Nova for the very first time.","category":"general","rarity":"common","xp":10,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><circle cx='32' cy='32' r='30' fill='#1a1a2e'/><polygon points='32,8 36,26 54,26 40,38 45,56 32,45 19,56 24,38 10,26 28,26' fill='#f5c518' stroke='#f5c518' stroke-linejoin='round'/></svg>"},{"id":"first_app","name":"App Curious","description":"Open your first app on Nova.","category":"apps","rarity":"common","xp":15,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#0f3460'/><rect x='10' y='10' width='20' height='20' rx='4' fill='#e94560'/><rect x='34' y='10' width='20' height='20' rx='4' fill='#16213e'/><rect x='10' y='34' width='20' height='20' rx='4' fill='#16213e'/><rect x='34' y='34' width='20' height='20' rx='4' fill='#e94560'/></svg>"},{"id":"app_5","name":"Getting Around","description":"Open 5 different apps.","category":"apps","rarity":"common","xp":25,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#0f3460'/><rect x='8' y='8' width='14' height='14' rx='3' fill='#e94560'/><rect x='25' y='8' width='14' height='14' rx='3' fill='#e94560'/><rect x='42' y='8' width='14' height='14' rx='3' fill='#e94560'/><rect x='8' y='25' width='14' height='14' rx='3' fill='#e94560'/><rect x='25' y='25' width='14' height='14' rx='3' fill='#e94560'/><rect x='8' y='42' width='48' height='14' rx='3' fill='#533483'/></svg>"},{"id":"app_10","name":"App Explorer","description":"Open 10 different apps.","category":"apps","rarity":"common","xp":40,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#0f3460'/><circle cx='32' cy='32' r='18' fill='none' stroke='#e94560' stroke-width='3'/><text x='32' y='38' text-anchor='middle' font-size='18' font-weight='bold' fill='#e94560' font-family='Arial'>10</text><circle cx='32' cy='10' r='4' fill='#f5c518'/><circle cx='54' cy='32' r='4' fill='#f5c518'/><circle cx='32' cy='54' r='4' fill='#f5c518'/><circle cx='10' cy='32' r='4' fill='#f5c518'/></svg>"},{"id":"app_25","name":"App Addict","description":"Open 25 different apps.","category":"apps","rarity":"uncommon","xp":75,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><rect x='6' y='6' width='10' height='10' rx='2' fill='#e94560'/><rect x='19' y='6' width='10' height='10' rx='2' fill='#e94560'/><rect x='32' y='6' width='10' height='10' rx='2' fill='#e94560'/><rect x='45' y='6' width='10' height='10' rx='2' fill='#e94560'/><rect x='6' y='19' width='10' height='10' rx='2' fill='#e94560'/><rect x='19' y='19' width='10' height='10' rx='2' fill='#f5c518'/><rect x='32' y='19' width='10' height='10' rx='2' fill='#f5c518'/><rect x='45' y='19' width='10' height='10' rx='2' fill='#e94560'/><rect x='6' y='32' width='10' height='10' rx='2' fill='#e94560'/><rect x='19' y='32' width='10' height='10' rx='2' fill='#f5c518'/><rect x='32' y='32' width='10' height='10' rx='2' fill='#f5c518'/><rect x='45' y='32' width='10' height='10' rx='2' fill='#e94560'/><rect x='6' y='45' width='10' height='10' rx='2' fill='#e94560'/><rect x='19' y='45' width='10' height='10' rx='2' fill='#e94560'/><rect x='32' y='45' width='10' height='10' rx='2' fill='#e94560'/><rect x='45' y='45' width='10' height='10' rx='2' fill='#e94560'/></svg>"},{"id":"app_50","name":"Nova Veteran","description":"Open 50 different apps.","category":"apps","rarity":"rare","xp":150,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#0f3460'/><circle cx='32' cy='32' r='28' fill='none' stroke='#f5c518' stroke-width='2'/><text x='32' y='26' text-anchor='middle' font-size='10' fill='#f5c518' font-family='Arial'>VETERAN</text><text x='32' y='42' text-anchor='middle' font-size='20' font-weight='bold' fill='#f5c518' font-family='Arial'>50</text></svg>"},{"id":"first_game","name":"Game On","description":"Open your first game on Nova.","category":"games","rarity":"common","xp":15,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><rect x='8' y='20' width='48' height='28' rx='8' fill='#0f3460'/><circle cx='21' cy='34' r='4' fill='none' stroke='#4ecca3' stroke-width='2'/><circle cx='43' cy='34' r='5' fill='#e94560'/><rect x='18' y='30' width='6' height='2' fill='#4ecca3'/><rect x='19' y='29' width='2' height='6' fill='#4ecca3'/></svg>"},{"id":"game_5","name":"Casual Player","description":"Play 5 different games.","category":"games","rarity":"common","xp":30,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><rect x='8' y='20' width='48' height='28' rx='8' fill='#533483'/><text x='32' y='39' text-anchor='middle' font-size='16' font-weight='bold' fill='white' font-family='Arial'>x5</text></svg>"},{"id":"game_10","name":"Regular Gamer","description":"Play 10 different games.","category":"games","rarity":"common","xp":50,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><rect x='8' y='18' width='48' height='30' rx='8' fill='#0f3460'/><circle cx='20' cy='33' r='3' fill='#e94560'/><circle cx='44' cy='33' r='3' fill='#e94560'/><rect x='17' y='30' width='6' height='2' fill='#4ecca3'/><rect x='18' y='29' width='2' height='6' fill='#4ecca3'/><text x='32' y='56' text-anchor='middle' font-size='9' fill='#f5c518' font-family='Arial'>10 GAMES</text></svg>"},{"id":"game_25","name":"Dedicated Player","description":"Play 25 different games.","category":"games","rarity":"uncommon","xp":80,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><polygon points='32,6 40,22 58,24 45,37 48,55 32,47 16,55 19,37 6,24 24,22' fill='none' stroke='#f5c518' stroke-width='2'/><text x='32' y='37' text-anchor='middle' font-size='14' font-weight='bold' fill='#f5c518' font-family='Arial'>25</text></svg>"},{"id":"login_streak_3","name":"Three Day Streak","description":"Log in to Nova 3 days in a row.","category":"streaks","rarity":"common","xp":30,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><rect x='10' y='30' width='12' height='24' rx='3' fill='#4ecca3'/><rect x='26' y='22' width='12' height='32' rx='3' fill='#4ecca3'/><rect x='42' y='14' width='12' height='40' rx='3' fill='#f5c518'/></svg>"},{"id":"login_streak_7","name":"Week Warrior","description":"Log in to Nova 7 days in a row.","category":"streaks","rarity":"common","xp":60,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><path d='M32 12 Q44 20 44 32 Q44 50 32 54 Q20 50 20 32 Q20 20 32 12Z' fill='#e94560'/><text x='32' y='36' text-anchor='middle' font-size='12' font-weight='bold' fill='white' font-family='Arial'>7</text></svg>"},{"id":"login_streak_14","name":"Fortnight Force","description":"Log in to Nova 14 days in a row.","category":"streaks","rarity":"uncommon","xp":100,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#0f3460'/><path d='M32 8 L56 20 L56 44 L32 56 L8 44 L8 20 Z' fill='none' stroke='#f5c518' stroke-width='2'/><text x='32' y='36' text-anchor='middle' font-size='14' font-weight='bold' fill='#f5c518' font-family='Arial'>14</text></svg>"},{"id":"login_streak_30","name":"Monthly Devotee","description":"Log in to Nova 30 days in a row.","category":"streaks","rarity":"rare","xp":200,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><circle cx='32' cy='30' r='22' fill='none' stroke='#e94560' stroke-width='3' stroke-dasharray='4 2'/><text x='32' y='26' text-anchor='middle' font-size='10' fill='#e94560' font-family='Arial'>30 DAYS</text><text x='32' y='40' text-anchor='middle' font-size='9' fill='#f5c518' font-family='Arial'>STREAK</text></svg>"},{"id":"morning_user","name":"Early Bird","description":"Open Nova before 8 AM.","category":"general","rarity":"common","xp":20,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#0f3460'/><circle cx='32' cy='36' r='16' fill='#f5c518'/><line x1='32' y1='10' x2='32' y2='16' stroke='#f5c518' stroke-width='3' stroke-linecap='round'/><line x1='14' y1='20' x2='18' y2='24' stroke='#f5c518' stroke-width='3' stroke-linecap='round'/><line x1='50' y1='20' x2='46' y2='24' stroke='#f5c518' stroke-width='3' stroke-linecap='round'/></svg>"},{"id":"night_owl","name":"Night Owl","description":"Open Nova after midnight.","category":"general","rarity":"common","xp":20,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#0f3460'/><path d='M38 14 Q28 18 26 30 Q24 44 36 50 Q22 52 16 40 Q10 26 20 16 Q28 8 38 14Z' fill='#f5c518'/></svg>"},{"id":"weekend_warrior","name":"Weekend Warrior","description":"Visit Nova on both Saturday and Sunday in the same weekend.","category":"streaks","rarity":"common","xp":35,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><rect x='6' y='18' width='24' height='30' rx='4' fill='#e94560'/><rect x='34' y='18' width='24' height='30' rx='4' fill='#533483'/><text x='18' y='38' text-anchor='middle' font-size='10' font-weight='bold' fill='white' font-family='Arial'>SAT</text><text x='46' y='38' text-anchor='middle' font-size='10' font-weight='bold' fill='white' font-family='Arial'>SUN</text></svg>"},{"id":"session_30min","name":"Half Hour Hero","description":"Spend 30 minutes in a single Nova session.","category":"time","rarity":"common","xp":30,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><circle cx='32' cy='34' r='20' fill='none' stroke='#4ecca3' stroke-width='3'/><line x1='32' y1='34' x2='32' y2='20' stroke='#f5c518' stroke-width='3' stroke-linecap='round'/><line x1='32' y1='34' x2='44' y2='34' stroke='#e94560' stroke-width='2' stroke-linecap='round'/><rect x='26' y='8' width='12' height='6' rx='3' fill='#4ecca3'/></svg>"},{"id":"session_1hr","name":"Time Sink","description":"Spend 1 hour in a single Nova session.","category":"time","rarity":"uncommon","xp":60,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><circle cx='32' cy='34' r='20' fill='none' stroke='#f5c518' stroke-width='3'/><line x1='32' y1='34' x2='32' y2='20' stroke='#f5c518' stroke-width='3' stroke-linecap='round'/><line x1='32' y1='34' x2='26' y2='42' stroke='#e94560' stroke-width='2' stroke-linecap='round'/><rect x='26' y='8' width='12' height='6' rx='3' fill='#f5c518'/></svg>"},{"id":"dark_mode_toggle","name":"Going Dark","description":"Toggle the Nova theme to dark mode.","category":"customization","rarity":"common","xp":15,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><path d='M36 14 Q26 18 24 30 Q22 44 34 50 Q20 52 14 40 Q8 26 18 16 Q26 8 36 14Z' fill='#f5c518'/></svg>"},{"id":"settings_visited","name":"Tinker","description":"Visit the Nova settings page.","category":"customization","rarity":"common","xp":10,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><circle cx='32' cy='32' r='10' fill='none' stroke='#4ecca3' stroke-width='3'/><path d='M32 8 L34 16 L30 16 Z' fill='#4ecca3'/><path d='M32 56 L34 48 L30 48 Z' fill='#4ecca3'/><path d='M8 32 L16 34 L16 30 Z' fill='#4ecca3'/><path d='M56 32 L48 34 L48 30 Z' fill='#4ecca3'/></svg>"},{"id":"whats_new","name":"Changelog Reader","description":"View the What's New section on Nova.","category":"general","rarity":"common","xp":10,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#0f3460'/><rect x='12' y='10' width='40' height='50' rx='4' fill='#1a1a2e'/><rect x='18' y='18' width='28' height='4' rx='2' fill='#4ecca3'/><rect x='18' y='26' width='20' height='3' rx='2' fill='#533483'/><rect x='18' y='33' width='24' height='3' rx='2' fill='#533483'/><circle cx='48' cy='12' r='8' fill='#e94560'/><text x='48' y='16' text-anchor='middle' font-size='10' font-weight='bold' fill='white' font-family='Arial'>!</text></svg>"},{"id":"tab_cloaker","name":"Undercover","description":"Use the tab cloaking / disguise feature.","category":"customization","rarity":"uncommon","xp":30,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><ellipse cx='32' cy='32' rx='22' ry='14' fill='#0f3460' stroke='#4ecca3' stroke-width='2'/><circle cx='32' cy='32' r='6' fill='#4ecca3'/><circle cx='32' cy='32' r='3' fill='#1a1a2e'/><line x1='10' y1='10' x2='54' y2='54' stroke='#e94560' stroke-width='3' stroke-linecap='round'/></svg>"},{"id":"search_nova","name":"Search Party","description":"Use the Nova search bar to find an app or game.","category":"general","rarity":"common","xp":10,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><circle cx='28' cy='28' r='14' fill='none' stroke='#4ecca3' stroke-width='3'/><line x1='38' y1='38' x2='54' y2='54' stroke='#4ecca3' stroke-width='4' stroke-linecap='round'/></svg>"},{"id":"app_pin","name":"Pinned It","description":"Pin an app to your Nova home screen.","category":"customization","rarity":"common","xp":15,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><path d='M32 8 L38 20 L52 22 L42 32 L44 46 L32 40 L20 46 L22 32 L12 22 L26 20 Z' fill='#f5c518' stroke='#f5c518'/><line x1='32' y1='46' x2='32' y2='58' stroke='#e94560' stroke-width='3' stroke-linecap='round'/></svg>"},{"id":"app_favorite","name":"All-Time Fave","description":"Mark an app as a favorite.","category":"customization","rarity":"common","xp":10,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><path d='M32 14 Q38 8 46 12 Q56 16 54 28 Q52 38 32 54 Q12 38 10 28 Q8 16 18 12 Q26 8 32 14Z' fill='#e94560'/></svg>"},{"id":"mobile_visit","name":"Mobile Maverick","description":"Visit Nova on a mobile device.","category":"general","rarity":"common","xp":20,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><rect x='18' y='8' width='28' height='48' rx='6' fill='#0f3460'/><rect x='22' y='14' width='20' height='32' rx='3' fill='#4ecca3' opacity='0.3'/><circle cx='32' cy='50' r='3' fill='#4ecca3'/></svg>"},{"id":"full_screen","name":"Big Picture","description":"Go fullscreen while using a Nova app or game.","category":"general","rarity":"common","xp":10,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><rect x='10' y='10' width='44' height='44' rx='4' fill='#0f3460'/><path d='M10 22 L10 10 L22 10' fill='none' stroke='#4ecca3' stroke-width='3' stroke-linecap='round'/><path d='M54 22 L54 10 L42 10' fill='none' stroke='#4ecca3' stroke-width='3' stroke-linecap='round'/><path d='M10 42 L10 54 L22 54' fill='none' stroke='#4ecca3' stroke-width='3' stroke-linecap='round'/><path d='M54 42 L54 54 L42 54' fill='none' stroke='#4ecca3' stroke-width='3' stroke-linecap='round'/></svg>"},{"id":"theme_change","name":"Makeover","description":"Change the Nova theme or color scheme.","category":"customization","rarity":"common","xp":15,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><circle cx='20' cy='32' r='10' fill='#e94560'/><circle cx='44' cy='32' r='10' fill='#4ecca3'/><circle cx='32' cy='20' r='10' fill='#f5c518'/><circle cx='32' cy='44' r='10' fill='#533483'/><circle cx='32' cy='32' r='6' fill='white'/></svg>"},{"id":"background_change","name":"New Wallpaper","description":"Set a custom background on Nova.","category":"customization","rarity":"common","xp":10,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#533483'/><rect x='8' y='8' width='48' height='48' rx='6' fill='#1a1a2e'/><path d='M8 42 L22 26 L34 36 L44 24 L56 42 Z' fill='#4ecca3' opacity='0.5'/><circle cx='20' cy='20' r='6' fill='#f5c518'/></svg>"},{"id":"first_week","name":"One Week In","description":"Have an account on Nova for 7 days.","category":"milestones","rarity":"common","xp":50,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><rect x='8' y='14' width='48' height='40' rx='4' fill='#0f3460'/><rect x='8' y='14' width='48' height='10' rx='4' fill='#533483'/><text x='32' y='42' text-anchor='middle' font-size='14' font-weight='bold' fill='#f5c518' font-family='Arial'>7</text><text x='32' y='52' text-anchor='middle' font-size='7' fill='#4ecca3' font-family='Arial'>DAYS OLD</text></svg>"},{"id":"first_month","name":"One Month Strong","description":"Have an account on Nova for 30 days.","category":"milestones","rarity":"uncommon","xp":100,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><rect x='8' y='14' width='48' height='40' rx='4' fill='#0f3460'/><rect x='8' y='14' width='48' height='10' rx='4' fill='#e94560'/><text x='32' y='40' text-anchor='middle' font-size='12' font-weight='bold' fill='#f5c518' font-family='Arial'>30</text></svg>"},{"id":"xp_100","name":"Orbs Starter","description":"Earn 100 total Orbs.","category":"xp","rarity":"common","xp":0,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><text x='32' y='28' text-anchor='middle' font-size='10' fill='#4ecca3' font-family='Arial'>100</text><text x='32' y='42' text-anchor='middle' font-size='12' font-weight='bold' fill='#4ecca3' font-family='Arial'>XP</text></svg>"},{"id":"xp_500","name":"Orbs Grinder","description":"Earn 500 total Orbs.","category":"xp","rarity":"uncommon","xp":0,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><polygon points='32,8 36,24 52,24 39,34 44,50 32,40 20,50 25,34 12,24 28,24' fill='#f5c518'/><text x='32' y='38' text-anchor='middle' font-size='8' font-weight='bold' fill='#1a1a2e' font-family='Arial'>500XP</text></svg>"},{"id":"xp_1000","name":"Orbs Champion","description":"Earn 1,000 total Orbs.","category":"xp","rarity":"rare","xp":0,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><polygon points='32,6 37,22 54,22 40,33 46,50 32,40 18,50 24,33 10,22 27,22' fill='url(#xpg)'/><defs><linearGradient id='xpg' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='#f5c518'/><stop offset='100%' stop-color='#e94560'/></linearGradient></defs><text x='32' y='35' text-anchor='middle' font-size='7' font-weight='bold' fill='#1a1a2e' font-family='Arial'>1000XP</text></svg>"},{"id":"no_sleep","name":"All Nighter","description":"Use Nova continuously from 11 PM past 2 AM.","category":"time","rarity":"rare","xp":75,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#0f3460'/><circle cx='32' cy='30' r='16' fill='none' stroke='#533483' stroke-width='3'/><line x1='32' y1='30' x2='32' y2='18' stroke='#f5c518' stroke-width='3' stroke-linecap='round'/><line x1='32' y1='30' x2='42' y2='36' stroke='#e94560' stroke-width='2' stroke-linecap='round'/><text x='32' y='54' text-anchor='middle' font-size='8' fill='#4ecca3' font-family='Arial'>ALL NIGHTER</text></svg>"},{"id":"comeback","name":"I'm Back","description":"Return to Nova after not visiting for 7+ days.","category":"streaks","rarity":"common","xp":20,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><path d='M12 32 Q12 14 32 14 Q50 14 52 30' fill='none' stroke='#4ecca3' stroke-width='3'/><polygon points='52,20 52,34 40,27' fill='#4ecca3'/></svg>"},{"id":"login_monday","name":"Monday Motivation","description":"Open Nova on a Monday.","category":"general","rarity":"common","xp":10,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><rect x='8' y='14' width='48' height='40' rx='4' fill='#0f3460'/><rect x='8' y='14' width='48' height='12' rx='4' fill='#e94560'/><text x='32' y='44' text-anchor='middle' font-size='12' font-weight='bold' fill='#4ecca3' font-family='Arial'>MON</text></svg>"},{"id":"login_friday","name":"TGIF","description":"Open Nova on a Friday.","category":"general","rarity":"common","xp":10,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><rect x='8' y='14' width='48' height='40' rx='4' fill='#0f3460'/><rect x='8' y='14' width='48' height='12' rx='4' fill='#f5c518'/><text x='32' y='44' text-anchor='middle' font-size='12' font-weight='bold' fill='#f5c518' font-family='Arial'>FRI</text></svg>"},{"id":"3am_club","name":"3 AM Club","description":"Use Nova at exactly 3 AM.","category":"time","rarity":"rare","xp":75,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#0a0a1a'/><circle cx='32' cy='30' r='18' fill='none' stroke='#533483' stroke-width='2'/><line x1='32' y1='30' x2='32' y2='16' stroke='#4ecca3' stroke-width='3' stroke-linecap='round'/><line x1='32' y1='30' x2='40' y2='30' stroke='#e94560' stroke-width='2' stroke-linecap='round'/><text x='32' y='56' text-anchor='middle' font-size='9' fill='#4ecca3' font-family='Arial'>3 AM CLUB</text></svg>"},{"id":"newbie_complete","name":"Nova Graduate","description":"Earn 10 other badges.","category":"milestones","rarity":"uncommon","xp":100,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><polygon points='32,8 52,20 52,42 32,56 12,42 12,20' fill='#533483'/><polygon points='32,14 48,24 48,40 32,50 16,40 16,24' fill='none' stroke='#f5c518' stroke-width='2'/><text x='32' y='37' text-anchor='middle' font-size='14' font-weight='bold' fill='#f5c518' font-family='Arial'>10</text></svg>"},{"id":"early_adopter","name":"OG Nova User","description":"Be one of the first 100 users on Nova.","category":"milestones","rarity":"legendary","xp":1000,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#0f3460'/><circle cx='32' cy='24' r='16' fill='#f5c518'/><text x='32' y='30' text-anchor='middle' font-size='12' font-weight='bold' fill='#0f3460' font-family='Arial'>OG</text><text x='32' y='50' text-anchor='middle' font-size='8' fill='#f5c518' font-family='Arial'>ORIGINAL USER</text></svg>"},{"id":"explore_all_pages","name":"Tourist","description":"Visit the Home, Games, Apps, and Settings pages in one session.","category":"general","rarity":"common","xp":30,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><circle cx='32' cy='32' r='22' fill='none' stroke='#4ecca3' stroke-width='2'/><line x1='10' y1='32' x2='54' y2='32' stroke='#4ecca3' stroke-width='1'/><circle cx='32' cy='32' r='4' fill='#e94560'/></svg>"},{"id":"hotkey_user","name":"Shortcut King","description":"Use a Nova keyboard shortcut.","category":"general","rarity":"uncommon","xp":20,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><rect x='8' y='20' width='48' height='28' rx='6' fill='#0f3460'/><rect x='14' y='26' width='10' height='8' rx='2' fill='#4ecca3'/><rect x='28' y='26' width='10' height='8' rx='2' fill='#4ecca3'/><rect x='42' y='26' width='10' height='8' rx='2' fill='#e94560'/><rect x='18' y='38' width='28' height='6' rx='2' fill='#533483'/></svg>"},{"id":"app_switch_fast","name":"Tab Master","description":"Switch between 3 different apps within 1 minute.","category":"general","rarity":"uncommon","xp":40,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><rect x='6' y='10' width='32' height='20' rx='4' fill='#e94560' opacity='0.8'/><rect x='14' y='18' width='32' height='20' rx='4' fill='#533483' opacity='0.8'/><rect x='22' y='26' width='32' height='20' rx='4' fill='#4ecca3' opacity='0.8'/></svg>"},{"id":"custom_name","name":"That's My Name","description":"Set a custom display name on Nova.","category":"customization","rarity":"common","xp":15,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><rect x='10' y='22' width='44' height='20' rx='6' fill='#0f3460'/><rect x='14' y='26' width='24' height='4' rx='2' fill='#4ecca3'/><rect x='14' y='34' width='14' height='4' rx='2' fill='#533483'/></svg>"},{"id":"halloween","name":"Spooky Season","description":"Visit Nova on Halloween (October 31st).","category":"general","rarity":"rare","xp":60,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a0a00'/><path d='M14 40 Q12 24 24 18 Q28 12 32 16 Q36 12 40 18 Q52 24 50 40 Q44 52 32 52 Q20 52 14 40Z' fill='#f7941d'/></svg>"},{"id":"christmas","name":"Merry Novas","description":"Visit Nova on Christmas Day (December 25th).","category":"general","rarity":"rare","xp":60,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#0d2b10'/><polygon points='32,6 46,30 18,30' fill='#2e7d32'/><polygon points='32,16 50,46 14,46' fill='#388e3c'/><rect x='26' y='46' width='12' height='10' rx='2' fill='#795548'/><circle cx='32' cy='26' r='3' fill='#f5c518'/></svg>"},{"id":"new_year","name":"Happy New Year","description":"Visit Nova on January 1st.","category":"general","rarity":"rare","xp":60,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#0f3460'/><circle cx='32' cy='32' r='6' fill='#f5c518'/><line x1='32' y1='6' x2='32' y2='14' stroke='#f5c518' stroke-width='2'/><line x1='32' y1='50' x2='32' y2='58' stroke='#f5c518' stroke-width='2'/></svg>"},{"id":"daily_visit","name":"Daily Driver","description":"Visit Nova on 10 separate days (not necessarily consecutive).","category":"streaks","rarity":"common","xp":40,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><rect x='8' y='14' width='48' height='40' rx='4' fill='#0f3460'/><rect x='8' y='14' width='48' height='12' rx='4' fill='#e94560'/><circle cx='22' cy='36' r='3' fill='#4ecca3'/><circle cx='32' cy='36' r='3' fill='#4ecca3'/><circle cx='42' cy='36' r='3' fill='#4ecca3'/></svg>"},{"id":"total_time_10hr","name":"Invested","description":"Accumulate 10 total hours on Nova.","category":"time","rarity":"uncommon","xp":100,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#0f3460'/><path d='M32 10 L32 32 L46 32' fill='none' stroke='#4ecca3' stroke-width='3' stroke-linecap='round'/><circle cx='32' cy='32' r='22' fill='none' stroke='#4ecca3' stroke-width='3'/><text x='32' y='56' text-anchor='middle' font-size='8' fill='#4ecca3' font-family='Arial'>10 HRS</text></svg>"},{"id":"orbit_3","name":"Orbit Ignition","description":"Maintain a 3-day Nova Orbit streak.","category":"streaks","rarity":"common","xp":20,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a0800'/><text x='32' y='38' text-anchor='middle' font-size='28'>🔥</text><text x='32' y='56' text-anchor='middle' font-size='9' fill='#ef5032' font-family='Arial'>3 DAY</text></svg>"},{"id":"orbit_7","name":"Orbit Week","description":"Maintain a 7-day Nova Orbit streak.","category":"streaks","rarity":"uncommon","xp":50,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a0800'/><circle cx='32' cy='28' r='16' fill='none' stroke='#ef5032' stroke-width='2'/><text x='32' y='34' text-anchor='middle' font-size='14' font-weight='bold' fill='#ef5032' font-family='Arial'>7</text><text x='32' y='56' text-anchor='middle' font-size='8' fill='#f5c518' font-family='Arial'>ORBIT WEEK</text></svg>"},{"id":"orbit_30","name":"Orbit Master","description":"Maintain a 30-day Nova Orbit streak.","category":"streaks","rarity":"rare","xp":150,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a0800'/><polygon points='32,6 37,22 54,22 40,33 46,50 32,40 18,50 24,33 10,22 27,22' fill='#ef5032'/><text x='32' y='37' text-anchor='middle' font-size='9' font-weight='bold' fill='#fff' font-family='Arial'>30</text></svg>"},{"id":"orbit_100","name":"Orbit Legend","description":"Maintain a 100-day Nova Orbit streak.","category":"streaks","rarity":"legendary","xp":500,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#0a0000'/><circle cx='32' cy='32' r='26' fill='none' stroke='#ef5032' stroke-width='2' stroke-dasharray='3 1'/><text x='32' y='28' text-anchor='middle' font-size='10' fill='#ef5032' font-family='Arial'>LEGEND</text><text x='32' y='44' text-anchor='middle' font-size='16' font-weight='bold' fill='#ef5032' font-family='Arial'>100</text></svg>"},{"id":"browser_first","name":"Web Wanderer","description":"Use the Nova browser for the first time.","category":"browser","rarity":"common","xp":15,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#0f3460'/><circle cx='32' cy='32' r='20' fill='none' stroke='#4ecca3' stroke-width='2'/><line x1='32' y1='12' x2='32' y2='52' stroke='#4ecca3' stroke-width='1.5'/><ellipse cx='32' cy='32' rx='10' ry='20' fill='none' stroke='#4ecca3' stroke-width='1.5'/><line x1='12' y1='32' x2='52' y2='32' stroke='#4ecca3' stroke-width='1.5'/></svg>"},{"id":"browser_tabs_5","name":"Tab Hoarder","description":"Have 5 or more browser tabs open at once.","category":"browser","rarity":"common","xp":20,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#0f3460'/><rect x='6' y='14' width='52' height='36' rx='4' fill='#1a1a2e'/><rect x='6' y='14' width='10' height='8' rx='2' fill='#4ecca3'/><rect x='18' y='14' width='10' height='8' rx='2' fill='#533483'/><rect x='30' y='14' width='10' height='8' rx='2' fill='#533483'/><rect x='42' y='14' width='10' height='8' rx='2' fill='#533483'/><rect x='54' y='14' width='6' height='8' rx='2' fill='#e94560'/></svg>"},{"id":"browser_bookmark","name":"Bookmarked","description":"Save a bookmark in the Nova browser.","category":"browser","rarity":"common","xp":10,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#0f3460'/><path d='M18 10 L46 10 L46 54 L32 42 L18 54 Z' fill='#f5c518' stroke='#f5c518' stroke-linejoin='round'/></svg>"},{"id":"social_first_friend","name":"First Contact","description":"Add your first friend on Nova.","category":"social","rarity":"common","xp":25,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><circle cx='24' cy='24' r='10' fill='#533483'/><path d='M8 52 Q8 40 24 40 Q40 40 40 52' fill='#533483'/><circle cx='48' cy='32' r='6' fill='#4ecca3'/><line x1='48' y1='26' x2='48' y2='38' stroke='#4ecca3' stroke-width='2'/><line x1='42' y1='32' x2='54' y2='32' stroke='#4ecca3' stroke-width='2'/></svg>"},{"id":"social_first_message","name":"Hello World","description":"Send your first chat message on Nova.","category":"social","rarity":"common","xp":15,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><rect x='8' y='16' width='48' height='32' rx='8' fill='#533483'/><path d='M16 48 L12 56 L28 48' fill='#533483'/><text x='32' y='35' text-anchor='middle' font-size='10' fill='white' font-family='Arial'>Hi!</text></svg>"},{"id":"social_5_friends","name":"Social Butterfly","description":"Have 5 friends on Nova.","category":"social","rarity":"uncommon","xp":60,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><circle cx='32' cy='20' r='8' fill='#4ecca3'/><circle cx='12' cy='40' r='6' fill='#533483'/><circle cx='52' cy='40' r='6' fill='#533483'/><circle cx='20' cy='52' r='5' fill='#e94560'/><circle cx='44' cy='52' r='5' fill='#e94560'/><line x1='32' y1='28' x2='12' y2='34' stroke='#4ecca3' stroke-width='1' opacity='.5'/><line x1='32' y1='28' x2='52' y2='34' stroke='#4ecca3' stroke-width='1' opacity='.5'/></svg>"},{"id":"game_50","name":"Game Collector","description":"Play 50 different games.","category":"games","rarity":"rare","xp":200,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><rect x='6' y='18' width='52' height='30' rx='8' fill='#0f3460'/><circle cx='18' cy='33' r='4' fill='none' stroke='#4ecca3' stroke-width='2'/><circle cx='46' cy='33' r='6' fill='#e94560'/><rect x='15' y='30' width='6' height='2' fill='#4ecca3'/><rect x='16' y='29' width='2' height='6' fill='#4ecca3'/><text x='32' y='58' text-anchor='middle' font-size='8' fill='#f5c518' font-family='Arial'>50 GAMES</text></svg>"},{"id":"speed_demon","name":"Speed Demon","description":"Open Nova and play a game within 10 seconds.","category":"general","rarity":"uncommon","xp":35,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><path d='M10 40 L28 20 L22 36 L36 18 L30 38 L54 24' fill='none' stroke='#f5c518' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/></svg>"},{"id":"night_session","name":"Midnight Session","description":"Use Nova between midnight and 4 AM.","category":"time","rarity":"uncommon","xp":40,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#04040a'/><path d='M40 14 Q30 18 28 30 Q26 44 38 50 Q24 52 18 40 Q12 26 22 16 Q30 8 40 14Z' fill='#533483'/><circle cx='44' cy='18' r='3' fill='#f5c518'/><circle cx='50' cy='28' r='2' fill='#f5c518'/><circle cx='46' cy='38' r='2' fill='#f5c518'/></svg>"},{"id":"xp_2500","name":"Orbs Veteran","description":"Earn 2,500 total Orbs.","category":"xp","rarity":"rare","xp":0,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><polygon points='32,6 37,22 54,22 40,33 46,50 32,40 18,50 24,33 10,22 27,22' fill='url(#xpg2)'/><defs><linearGradient id='xpg2' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='#4ecca3'/><stop offset='100%' stop-color='#8b8fff'/></linearGradient></defs><text x='32' y='35' text-anchor='middle' font-size='6' font-weight='bold' fill='#0a0a14' font-family='Arial'>2500XP</text></svg>"},{"id":"xp_5000","name":"Orbs Elite","description":"Earn 5,000 total Orbs.","category":"xp","rarity":"epic","xp":0,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#12001a'/><polygon points='32,4 38,22 57,22 42,34 48,52 32,41 16,52 22,34 7,22 26,22' fill='url(#xpg3)'/><defs><linearGradient id='xpg3' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='#c060ff'/><stop offset='100%' stop-color='#f5c518'/></linearGradient></defs><text x='32' y='35' text-anchor='middle' font-size='6' font-weight='bold' fill='#fff' font-family='Arial'>5000XP</text></svg>"},{"id":"panic_pressed","name":"Close Call","description":"Use the Panic button to disguise Nova.","category":"general","rarity":"uncommon","xp":25,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a0000'/><circle cx='32' cy='32' r='20' fill='#e94560'/><text x='32' y='38' text-anchor='middle' font-size='20' font-weight='bold' fill='white' font-family='Arial'>!</text></svg>"},{"id":"login_streak_60","name":"Two Month Titan","description":"Log in to Nova 60 days in a row.","category":"streaks","rarity":"epic","xp":400,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#12001a'/><path d='M32 8 L56 20 L56 44 L32 56 L8 44 L8 20 Z' fill='url(#titan)'/><defs><linearGradient id='titan' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='#c060ff'/><stop offset='100%' stop-color='#8b8fff'/></linearGradient></defs><text x='32' y='36' text-anchor='middle' font-size='13' font-weight='bold' fill='#fff' font-family='Arial'>60</text></svg>"},{"id":"first_search_browser","name":"Address Book","description":"Type a URL or search in the Nova browser.","category":"browser","rarity":"common","xp":10,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#0f3460'/><rect x='8' y='22' width='48' height='8' rx='4' fill='rgba(139,143,255,.3)'/><rect x='10' y='24' width='20' height='4' rx='2' fill='#4ecca3'/><rect x='8' y='36' width='48' height='20' rx='4' fill='rgba(255,255,255,.05)'/><line x1='16' y1='42' x2='48' y2='42' stroke='rgba(255,255,255,.2)' stroke-width='1'/><line x1='16' y1='48' x2='38' y2='48' stroke='rgba(255,255,255,.15)' stroke-width='1'/></svg>"},{"id":"theme_preset","name":"Theme Collector","description":"Apply a theme preset from Nova settings.","category":"customization","rarity":"common","xp":15,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><rect x='8' y='8' width='22' height='22' rx='5' fill='#533483'/><rect x='34' y='8' width='22' height='22' rx='5' fill='#e94560'/><rect x='8' y='34' width='22' height='22' rx='5' fill='#4ecca3'/><rect x='34' y='34' width='22' height='22' rx='5' fill='#f5c518'/></svg>"},{"id":"daily_100","name":"Century Visitor","description":"Visit Nova on 100 separate days.","category":"milestones","rarity":"epic","xp":300,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#12001a'/><rect x='8' y='14' width='48' height='36' rx='4' fill='#533483'/><rect x='8' y='14' width='48' height='10' rx='4' fill='#c060ff'/><text x='32' y='40' text-anchor='middle' font-size='16' font-weight='bold' fill='#fff' font-family='Arial'>100</text></svg>"},{"id":"app_100","name":"App Overlord","description":"Open 100 different apps.","category":"apps","rarity":"epic","xp":250,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#0f3460'/><circle cx='32' cy='32' r='22' fill='none' stroke='#c060ff' stroke-width='2'/><text x='32' y='28' text-anchor='middle' font-size='9' fill='#c060ff' font-family='Arial'>APP</text><text x='32' y='44' text-anchor='middle' font-size='16' font-weight='bold' fill='#c060ff' font-family='Arial'>100</text></svg>"},{"id":"support_ticket","name":"Help Seeker","description":"Visit the Nova support page.","category":"general","rarity":"common","xp":10,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><circle cx='32' cy='28' r='14' fill='none' stroke='#4ecca3' stroke-width='2'/><text x='32' y='34' text-anchor='middle' font-size='16' font-weight='bold' fill='#4ecca3' font-family='Arial'>?</text><rect x='30' y='46' width='4' height='4' rx='1' fill='#4ecca3'/></svg>"},{"id":"total_time_1hr","name":"Settling In","description":"Accumulate 1 hour of total time on Nova.","category":"time","rarity":"common","xp":30,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#0f3460'/><circle cx='32' cy='32' r='18' fill='none' stroke='#4ecca3' stroke-width='2'/><line x1='32' y1='32' x2='32' y2='18' stroke='#4ecca3' stroke-width='2' stroke-linecap='round'/><line x1='32' y1='32' x2='42' y2='32' stroke='#e94560' stroke-width='2' stroke-linecap='round'/><text x='32' y='56' text-anchor='middle' font-size='8' fill='#4ecca3' font-family='Arial'>1 HOUR</text></svg>"},{"id":"total_time_50hr","name":"Nova Resident","description":"Accumulate 50 total hours on Nova.","category":"time","rarity":"epic","xp":300,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#0f3460'/><path d='M32 10 L32 32 L46 32' fill='none' stroke='#c060ff' stroke-width='3' stroke-linecap='round'/><circle cx='32' cy='32' r='22' fill='none' stroke='#c060ff' stroke-width='3'/><text x='32' y='56' text-anchor='middle' font-size='8' fill='#c060ff' font-family='Arial'>50 HRS</text></svg>"},{"id":"new_star_power","name":"Nova Devotee","description":"Earn 30 badges.","category":"milestones","rarity":"rare","xp":150,"icon":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a1a2e'/><polygon points='32,6 37,22 54,22 40,33 46,50 32,40 18,50 24,33 10,22 27,22' fill='url(#devg)'/><defs><linearGradient id='devg' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='#f5c518'/><stop offset='100%' stop-color='#4ecca3'/></linearGradient></defs><text x='32' y='38' text-anchor='middle' font-size='8' font-weight='bold' fill='#0a0a14' font-family='Arial'>30</text></svg>"}];

/* ─────────────────────────────────────────
   STORAGE KEYS
───────────────────────────────────────── */
var KEYS = {
  earned:        'nova_badges_earned',       // {badgeId: timestamp}
  xp:            'nova_badges_xp',           // number
  firstVisit:    'nova_badges_first_visit',  // timestamp
  visitDays:     'nova_badges_visit_days',   // array of YYYY-MM-DD strings
  loginStreak:   'nova_badges_login_streak', // {count, lastDay}
  sessionStart:  'nova_badges_session_start',// timestamp (current session)
  totalTime:     'nova_badges_total_time',   // seconds
  uniqueApps:    'nova_badges_unique_apps',  // Set → array
  uniqueGames:   'nova_badges_unique_games', // Set → array
  pagesVisited:  'nova_badges_pages_visited',// Set → array
  recentApps:    'nova_badges_recent_apps',  // [{app, time}] for tab-switch speed
  newBadges:     'nova_badges_new',          // array of badge IDs not yet seen
  accountAge:    'nova_badges_account_created', // timestamp of first ever visit (account age proxy)
};

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
function get(key, def) {
  try { var v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : def; } catch(e) { return def; }
}
function set(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
}
function todayStr() {
  var d = new Date();
  var m = d.getMonth()+1; var day = d.getDate();
  return d.getFullYear()+'-'+(m<10?'0':'')+m+'-'+(day<10?'0':'')+day;
}
function nowH() { return new Date().getHours(); }

function earnedMap() { return get(KEYS.earned, {}); }
function hasEarned(id) { return !!earnedMap()[id]; }
function awardBadge(id) {
  if (hasEarned(id)) return false;
  var badge = BADGES.find(function(b){ return b.id === id; });
  if (!badge) return false;
  var m = earnedMap();
  m[id] = Date.now();
  set(KEYS.earned, m);
  // add XP
  var xp = get(KEYS.xp, 0) + badge.xp;
  set(KEYS.xp, xp);
  // add to new queue
  var nq = get(KEYS.newBadges, []);
  nq.push(id);
  set(KEYS.newBadges, nq);
  showBadgeToast(badge);
  updateRewardsUI();
  checkXpBadges();
  checkCountBadges();
  return true;
}

function totalXP() { return get(KEYS.xp, 0); }
function earnedCount() { return Object.keys(earnedMap()).length; }

/* XP → Level */
function xpToLevel(xp) {
  var thresholds = [0,100,250,500,1000,2000,3500,5000,7500,10000];
  for (var i = thresholds.length - 1; i >= 0; i--) {
    if (xp >= thresholds[i]) return { level: i+1, current: xp - thresholds[i], next: i+1 < thresholds.length ? thresholds[i+1] - thresholds[i] : null, threshold: thresholds[i], nextThreshold: thresholds[i+1] || null };
  }
  return { level:1, current:0, next:100, threshold:0, nextThreshold:100 };
}

/* Rarity colours */
var RARITY_COLORS = { common:'#a0a0a0', uncommon:'#4ecca3', rare:'#8b8fff', epic:'#c060ff', legendary:'#f5c518' };
var RARITY_ORDER  = ['common','uncommon','rare','epic','legendary'];

/* ─────────────────────────────────────────
   TOAST
───────────────────────────────────────── */
function showBadgeToast(badge) {
  var toast = document.getElementById('badge-toast');
  var icoEl = document.getElementById('badge-toast-icon');
  var nameEl = document.getElementById('badge-toast-name');
  var xpEl  = document.getElementById('badge-toast-xp');
  if (!toast) return;
  icoEl.innerHTML = badge.icon;
  var svg = icoEl.querySelector('svg');
  if (svg) { svg.setAttribute('width','40'); svg.setAttribute('height','40'); }
  nameEl.textContent = badge.name;
  xpEl.textContent  = badge.xp > 0 ? fmtOrbs(badge.xp, { plus: true }) : 'Earned!';
  toast.style.display = 'block';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(function(){ toast.style.display='none'; }, 4000);
}

/* ─────────────────────────────────────────
   RENDER REWARDS PAGE
───────────────────────────────────────── */
var _filter = 'all';
var _rarity = 'all';

function updateRewardsUI() {
  var xpBarFill = document.getElementById('rewards-xp-fill');
  var xpLabel   = document.getElementById('rewards-xp-label');
  var lvlBadge  = document.getElementById('rewards-level-badge');
  var nextLvl   = document.getElementById('rewards-next-level');
  var cntLbl    = document.getElementById('rewards-badge-count');
  var totXpLbl  = document.getElementById('rewards-total-xp-label');
  if (!xpBarFill) return;

  var xp = totalXP();
  var lvl = xpToLevel(xp);
  xpLabel.textContent  = fmtOrbs(xp);
  lvlBadge.textContent = 'LVL ' + lvl.level;
  if (lvl.next !== null) {
    var pct = Math.min(100, Math.round(lvl.current / lvl.next * 100));
    xpBarFill.style.width = pct + '%';
    nextLvl.textContent = 'Next level: ' + fmtOrbs(lvl.nextThreshold - xp) + ' away';
  } else {
    xpBarFill.style.width = '100%';
    nextLvl.textContent = 'MAX LEVEL';
  }
  var customDefs = window.__novaCustomBadges || [];
  var totalBadgeCount = BADGES.length + customDefs.length;
  cntLbl.textContent  = earnedCount() + ' / ' + totalBadgeCount + ' badges earned';
  totXpLbl.textContent = 'Total Orbs: ' + xp.toLocaleString();

  renderGrid();

  // NEW badge indicator on nav
  var nq = get(KEYS.newBadges, []);
  var nb = document.getElementById('rewards-new-badge');
  if (nb) nb.style.display = nq.length ? 'inline' : 'none';
}

function renderGrid() {
  var grid = document.getElementById('rewards-grid');
  if (!grid) return;
  var earned = earnedMap();

  // Merge custom badges (admin-granted) into the display list.
  // Custom badge defs are stored in window.__novaCustomBadges by
  // nova-badges-admin-grants.js after it loads them from KV.
  var customDefs = window.__novaCustomBadges || [];
  var allBadges = BADGES.concat(customDefs.filter(function(cb) {
    // Only show custom badges the user has actually earned, OR show all if filter is 'all'/'locked'.
    // We always include them in the pool and let the filter below decide.
    return !BADGES.some(function(b){ return b.id === cb.id; }); // dedupe against built-ins
  }));

  var filtered = allBadges.filter(function(b) {
    if (_filter === 'earned' && !earned[b.id]) return false;
    if (_filter === 'locked' && earned[b.id]) return false;
    if (_rarity !== 'all' && b.rarity !== _rarity) return false;
    return true;
  });
  // sort: earned first, then by rarity desc
  filtered.sort(function(a, b) {
    var ae = !!earned[a.id], be = !!earned[b.id];
    if (ae !== be) return ae ? -1 : 1;
    return RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity);
  });

  grid.innerHTML = '';
  filtered.forEach(function(badge) {
    var isEarned = !!earned[badge.id];
    var col = RARITY_COLORS[badge.rarity] || '#a0a0a0';
    var card = document.createElement('div');
    card.style.cssText = 'background:color-mix(in srgb,#0a0a12 94%,var(--accent) 6%);border:1px solid '+(isEarned?col+'55':'color-mix(in srgb,var(--accent) 14%,transparent)')+';border-radius:12px;padding:.65rem .5rem;display:flex;flex-direction:column;align-items:center;gap:.4rem;cursor:pointer;transition:all .15s;position:relative;opacity:'+(isEarned?'1':'.45')+';';
    card.onmouseenter = function(){ this.style.transform='translateY(-2px)'; this.style.borderColor=col+(isEarned?'99':'44'); };
    card.onmouseleave = function(){ this.style.transform=''; this.style.borderColor=isEarned?col+'55':'color-mix(in srgb,var(--accent) 14%,transparent)' ; };
    // rarity dot
    var dot = document.createElement('div');
    dot.style.cssText = 'position:absolute;top:.4rem;right:.4rem;width:6px;height:6px;border-radius:50%;background:'+col+';opacity:'+(isEarned?'1':'.4')+';';
    card.appendChild(dot);
    // icon
    var icoWrap = document.createElement('div');
    icoWrap.style.cssText = 'width:48px;height:48px;'+(isEarned?'':'filter:grayscale(1);');
    icoWrap.innerHTML = badge.icon;
    var svg = icoWrap.querySelector('svg');
    if (svg){ svg.setAttribute('width','48'); svg.setAttribute('height','48'); }
    card.appendChild(icoWrap);
    // name
    var nm = document.createElement('div');
    nm.style.cssText = 'font-family:\'Space Mono\',monospace;font-size:.35rem;color:'+(isEarned?'var(--white)':'var(--muted)')+';text-align:center;line-height:1.3;letter-spacing:.03em;';
    nm.textContent = badge.name;
    card.appendChild(nm);
    // xp label
    if (badge.xp > 0 && isEarned) {
      var xpLbl = document.createElement('div');
      xpLbl.style.cssText = 'font-family:\'Space Mono\',monospace;font-size:.3rem;color:var(--accent);letter-spacing:.06em;';
      xpLbl.textContent = fmtOrbs(badge.xp, { plus: true });
      card.appendChild(xpLbl);
    }
    card.addEventListener('click', function(){ openModal(badge); });
    grid.appendChild(card);
  });

  if (!filtered.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;font-family:\'Space Mono\',monospace;font-size:.45rem;color:var(--muted);padding:2rem;opacity:.5;">No badges match this filter</div>';
  }
}

function openModal(badge) {
  var modal  = document.getElementById('rewards-modal');
  var icoEl  = document.getElementById('rewards-modal-icon');
  var nameEl = document.getElementById('rewards-modal-name');
  var rarEl  = document.getElementById('rewards-modal-rarity');
  var descEl = document.getElementById('rewards-modal-desc');
  var xpEl   = document.getElementById('rewards-modal-xp');
  var stEl   = document.getElementById('rewards-modal-status');
  var atEl   = document.getElementById('rewards-modal-earned-at');
  if (!modal) return;

  var col = RARITY_COLORS[badge.rarity] || '#a0a0a0';
  var earned = earnedMap();
  var isEarned = !!earned[badge.id];

  icoEl.innerHTML = badge.icon;
  var svg = icoEl.querySelector('svg'); if(svg){svg.setAttribute('width','72');svg.setAttribute('height','72');}
  nameEl.textContent = badge.name;
  rarEl.textContent  = badge.rarity.toUpperCase();
  rarEl.style.color  = col;
  descEl.textContent = badge.description;
  xpEl.textContent   = badge.xp > 0 ? fmtOrbs(badge.xp, { plus: true }) : 'No Orbs (milestone)';

  if (isEarned) {
    stEl.textContent = '✓ EARNED';
    stEl.style.cssText = 'background:rgba(78,204,163,.15);border:1px solid rgba(78,204,163,.3);color:#4ecca3;font-family:\'Space Mono\',monospace;font-size:.4rem;padding:.3rem .9rem;border-radius:100px;';
    var d = new Date(earned[badge.id]);
    atEl.textContent = 'Earned ' + d.toLocaleDateString();
  } else {
    stEl.textContent = '🔒 LOCKED';
    stEl.style.cssText = 'background:rgba(139,143,255,.1);border:1px solid rgba(139,143,255,.2);color:var(--muted);font-family:\'Space Mono\',monospace;font-size:.4rem;padding:.3rem .9rem;border-radius:100px;';
    atEl.textContent = '';
  }

  modal.style.display = 'flex';
}

/* ─────────────────────────────────────────
   FILTER BUTTONS
───────────────────────────────────────── */
document.addEventListener('click', function(e) {
  var fb = e.target.closest('.rewards-filter-btn');
  if (fb) {
    document.querySelectorAll('.rewards-filter-btn').forEach(function(b){ b.classList.remove('active'); b.style.color='var(--muted)'; b.style.background='rgba(139,143,255,.04)'; });
    fb.classList.add('active');
    fb.style.color = 'var(--white)';
    fb.style.background = 'rgba(139,143,255,.15)';
    _filter = fb.dataset.filter;
    renderGrid();
  }
  var rb = e.target.closest('.rewards-rarity-btn');
  if (rb) {
    document.querySelectorAll('.rewards-rarity-btn').forEach(function(b){ b.classList.remove('active'); b.style.color='var(--muted)'; });
    rb.classList.add('active');
    rb.style.color = 'var(--white)';
    _rarity = rb.dataset.rarity;
    renderGrid();
  }
  if (e.target.id === 'rewards-modal' || e.target.id === 'rewards-modal-close') {
    document.getElementById('rewards-modal').style.display = 'none';
  }
});

/* ─────────────────────────────────────────
   TRACKING: visit Nova
───────────────────────────────────────── */
function trackVisit() {
  var today = todayStr();
  var now = Date.now();
  var h = nowH();

  // First-ever visit
  if (!get(KEYS.firstVisit, null)) {
    set(KEYS.firstVisit, now);
    set(KEYS.accountAge, now);
    setTimeout(function(){ awardBadge('first_launch'); }, 1200);
  }

  // Account age badge proxy (first_week, first_month)
  var created = get(KEYS.accountAge, now);
  var daysSince = Math.floor((now - created) / 86400000);
  if (daysSince >= 7)  awardBadge('first_week');
  if (daysSince >= 30) awardBadge('first_month');

  // session start for time tracking
  if (!get(KEYS.sessionStart, null)) {
    set(KEYS.sessionStart, now);
    set('nova_badges_last_tick', now);
  }

  // Visit days set
  var vdays = get(KEYS.visitDays, []);
  if (vdays.indexOf(today) === -1) {
    vdays.push(today);
    set(KEYS.visitDays, vdays);
  }
  if (vdays.length >= 10)  awardBadge('daily_visit');
  if (vdays.length >= 100) awardBadge('daily_100');

  // Login streak
  var streak = get(KEYS.loginStreak, { count:0, lastDay:'' });
  if (streak.lastDay !== today) {
    var yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
    var ym = yesterday.getMonth()+1, yd = yesterday.getDate();
    var yesterdayStr = yesterday.getFullYear()+'-'+(ym<10?'0':'')+ym+'-'+(yd<10?'0':'')+yd;
    if (streak.lastDay === yesterdayStr) { streak.count++; }
    else if (streak.lastDay && streak.lastDay !== today) {
      // check if they were gone 7+ days for comeback badge
      var last = new Date(streak.lastDay.replace(/-/g,'/'));
      var diffDays = Math.floor((now - last.getTime()) / 86400000);
      if (diffDays >= 7) awardBadge('comeback');
      streak.count = 1;
    } else { streak.count = 1; }
    streak.lastDay = today;
    set(KEYS.loginStreak, streak);
  }
  if (streak.count >= 3)  awardBadge('login_streak_3');
  if (streak.count >= 7)  awardBadge('login_streak_7');
  if (streak.count >= 14) awardBadge('login_streak_14');
  if (streak.count >= 30) awardBadge('login_streak_30');
  if (streak.count >= 60) awardBadge('login_streak_60');

  // Weekend warrior
  var dow = new Date().getDay();
  var wkend = get('nova_badges_wkend', { sat:false, sun:false, week:'' });
  var weekKey = Math.floor(now / (7*86400000));
  if (wkend.week !== String(weekKey)) { wkend = { sat:false, sun:false, week:String(weekKey) }; }
  if (dow === 6) wkend.sat = true;
  if (dow === 0) wkend.sun = true;
  set('nova_badges_wkend', wkend);
  if (wkend.sat && wkend.sun) awardBadge('weekend_warrior');

  // Early bird / night owl
  if (h < 8) awardBadge('morning_user');
  if (h === 0 || h === 1 || h === 2) awardBadge('night_owl');
  if (h === 3) awardBadge('3am_club');

  // Day of week
  if (dow === 1) awardBadge('login_monday');
  if (dow === 5) awardBadge('login_friday');

  // Holiday
  var m = new Date().getMonth(), day = new Date().getDate();
  if (m === 9 && day === 31)  awardBadge('halloween');
  if (m === 11 && day === 25) awardBadge('christmas');
  if (m === 0 && day === 1)   awardBadge('new_year');

  // Mobile
  if (/Mobi|Android/i.test(navigator.userAgent)) awardBadge('mobile_visit');

  // Star power (first badge)
  if (Object.keys(earnedMap()).length >= 1) awardBadge('star_power');
}

/* ─────────────────────────────────────────
   TRACKING: time in session
───────────────────────────────────────── */
function trackTime() {
  var start = get(KEYS.sessionStart, Date.now());
  var elapsed = (Date.now() - start) / 1000; // seconds since session start
  // Accumulate delta into total time
  var lastTick = get('nova_badges_last_tick', start);
  var delta = (Date.now() - lastTick) / 1000;
  set('nova_badges_last_tick', Date.now());
  var totalSec = get(KEYS.totalTime, 0) + Math.max(0, delta);
  set(KEYS.totalTime, totalSec);

  // Session badges use elapsed since session start (not just the delta)
  var sessionMins = elapsed / 60;
  if (sessionMins >= 30) awardBadge('session_30min');
  if (sessionMins >= 60) awardBadge('session_1hr');
  if (totalSec / 3600 >= 10) awardBadge('total_time_10hr');

  // All nighter: check if session spans 11pm-2am
  var h = nowH();
  var allN = get('nova_badges_allnighter', { started11:false });
  if (h >= 23) allN.started11 = true;
  if (allN.started11 && (h >= 2)) { awardBadge('no_sleep'); allN.started11 = false; }
  set('nova_badges_allnighter', allN);
}
setInterval(trackTime, 60000); // check every minute

/* ─────────────────────────────────────────
   TRACKING: page navigation
───────────────────────────────────────── */
var _sessionPages = new Set();
document.addEventListener('nova:page-change', function(e) {
  var page = e.detail && e.detail.page;
  if (!page) return;
  if (page === 'settings') awardBadge('settings_visited');
  _sessionPages.add(page);
  var pages = get(KEYS.pagesVisited, []);
  pages.forEach(function(p){ _sessionPages.add(p); });
  var pArr = []; _sessionPages.forEach(function(p){ pArr.push(p); });
  set(KEYS.pagesVisited, pArr);

  // Tourist: visited home, games, apps, settings
  if (['home','games','apps','settings'].every(function(p){ return _sessionPages.has(p); })) {
    awardBadge('explore_all_pages');
  }

  // Clear new-badge indicator when visiting rewards
  if (page === 'rewards') {
    set(KEYS.newBadges, []);
    var nb = document.getElementById('rewards-new-badge');
    if (nb) nb.style.display = 'none';
    updateRewardsUI();
  }
});

/* ─────────────────────────────────────────
   TRACKING: apps/games opened
───────────────────────────────────────── */
function trackAppOpen(appName, isGame) {
  if (isGame) {
    var games = get(KEYS.uniqueGames, []);
    if (games.indexOf(appName) === -1) {
      games.push(appName);
      set(KEYS.uniqueGames, games);
    }
    // Check thresholds every call (awardBadge deduplicates); use >= 1 for first_game
    if (games.length >= 1)  awardBadge('first_game');
    if (games.length >= 5)  awardBadge('game_5');
    if (games.length >= 10) awardBadge('game_10');
    if (games.length >= 25) awardBadge('game_25');
  } else {
    var apps = get(KEYS.uniqueApps, []);
    if (apps.indexOf(appName) === -1) {
      apps.push(appName);
      set(KEYS.uniqueApps, apps);
    }
    // Check thresholds every call (awardBadge deduplicates); use >= 1 for first_app
    if (apps.length >= 1)  awardBadge('first_app');
    if (apps.length >= 5)  awardBadge('app_5');
    if (apps.length >= 10) awardBadge('app_10');
    if (apps.length >= 25) awardBadge('app_25');
    if (apps.length >= 50) awardBadge('app_50');
  }

  // Tab master: 3 different apps within 1 minute
  var recent = get(KEYS.recentApps, []);
  var cutoff = Date.now() - 60000;
  recent = recent.filter(function(r){ return r.t > cutoff; });
  recent.push({ name: appName, t: Date.now() });
  set(KEYS.recentApps, recent);
  var uniqueRecent = [];
  recent.forEach(function(r){ if (uniqueRecent.indexOf(r.name) === -1) uniqueRecent.push(r.name); });
  if (uniqueRecent.length >= 3) awardBadge('app_switch_fast');
}
window.novaBadgeTrackApp = trackAppOpen;

/* ─────────────────────────────────────────
   TRACKING: settings changes
───────────────────────────────────────── */
function trackSettingChange(type) {
  if (type === 'theme') { awardBadge('dark_mode_toggle'); awardBadge('theme_change'); }
  if (type === 'background') awardBadge('background_change');
  if (type === 'tab-cloak') awardBadge('tab_cloaker');
  if (type === 'name') awardBadge('custom_name');
  if (type === 'pin') awardBadge('app_pin');
  if (type === 'favorite') awardBadge('app_favorite');
  if (type === 'whats-new') awardBadge('whats_new');
  if (type === 'fullscreen') awardBadge('full_screen');
  if (type === 'hotkey') awardBadge('hotkey_user');
  if (type === 'search') awardBadge('search_nova');
}
window.novaBadgeTrackSetting = trackSettingChange;

/* ─────────────────────────────────────────
   XP badge checks
───────────────────────────────────────── */
function checkXpBadges() {
  var xp = totalXP();
  if (xp >= 100)  awardBadge('xp_100');
  if (xp >= 500)  awardBadge('xp_500');
  if (xp >= 1000) awardBadge('xp_1000');
  if (xp >= 2500) awardBadge('xp_2500');
  if (xp >= 5000) awardBadge('xp_5000');
}
function checkCountBadges() {
  var cnt = earnedCount();
  if (cnt >= 1)  awardBadge('star_power');
  if (cnt >= 10) awardBadge('newbie_complete');
  if (cnt >= 30) awardBadge('new_star_power');

  // App milestones
  var apps = get(KEYS.uniqueApps, []);
  if (apps.length >= 100) awardBadge('app_100');

  // Game milestones
  var games = get(KEYS.uniqueGames, []);
  if (games.length >= 50) awardBadge('game_50');

  // Time milestones
  var totalSec = get(KEYS.totalTime, 0);
  if (totalSec >= 3600)   awardBadge('total_time_1hr');
  if (totalSec >= 180000) awardBadge('total_time_50hr');

  // Nova Orbit streak badges (cross-system)
  try {
    var orbitState = JSON.parse(localStorage.getItem('nova_orbit_streak') || '{}');
    var oc = orbitState.count || 0;
    if (oc >= 3)   awardBadge('orbit_3');
    if (oc >= 7)   awardBadge('orbit_7');
    if (oc >= 30)  awardBadge('orbit_30');
    if (oc >= 100) awardBadge('orbit_100');
  } catch(e) {}

  // Midnight session badge
  var h = nowH();
  if (h >= 0 && h < 4) awardBadge('night_session');
}

/* ─────────────────────────────────────────
   INTERCEPT PANIC BUTTON
───────────────────────────────────────── */
document.addEventListener('click', function(e) {
  if (e.target.closest('#panic-btn')) awardBadge('panic_pressed');
});

/* ─────────────────────────────────────────
   INTERCEPT BROWSER PAGE
───────────────────────────────────────── */
document.addEventListener('click', function(e) {
  var tab = e.target.closest('[data-page="browser"]');
  if (tab) {
    awardBadge('browser_first');
    awardBadge('first_search_browser');
  }
});

/* ─────────────────────────────────────────
   INTERCEPT SUPPORT PAGE
───────────────────────────────────────── */
document.addEventListener('click', function(e) {
  var tab = e.target.closest('[data-page="support"]');
  if (tab) awardBadge('support_ticket');
});

/* ─────────────────────────────────────────
   INTERCEPT BROWSER BOOKMARK SAVE
───────────────────────────────────────── */
document.addEventListener('click', function(e) {
  if (e.target.closest('.browser-bookmark-btn')) awardBadge('browser_bookmark');
});

/* ─────────────────────────────────────────
   INTERCEPT THEME PRESET
───────────────────────────────────────── */
document.addEventListener('click', function(e) {
  if (e.target.closest('.theme-preset-btn')) awardBadge('theme_preset');
});

/* ─────────────────────────────────────────
   INTERCEPT WHATS-NEW open
───────────────────────────────────────── */
document.addEventListener('click', function(e) {
  var btn = e.target.closest('[id*="whats-new"], [class*="whats-new"]');
  if (btn) trackSettingChange('whats-new');
});

/* ─────────────────────────────────────────
   INTERCEPT FULLSCREEN
───────────────────────────────────────── */
document.addEventListener('fullscreenchange', function(){
  if (document.fullscreenElement) trackSettingChange('fullscreen');
});

/* ─────────────────────────────────────────
   INTERCEPT THEME TOGGLES
───────────────────────────────────────── */
document.addEventListener('click', function(e) {
  var tt = e.target.closest('.theme-opt');
  if (tt) trackSettingChange('theme');
  var tp = e.target.closest('[id*="theme"]');
  if (tp && tp.tagName !== 'DIV') trackSettingChange('theme');
});

/* ─────────────────────────────────────────
   INTERCEPT TAB-CLOAK TOGGLE
───────────────────────────────────────── */
document.addEventListener('change', function(e) {
  if (e.target.id === 'tab-cloak-toggle' && e.target.checked) trackSettingChange('tab-cloak');
});

/* ─────────────────────────────────────────
   INTERCEPT SEARCH BAR
───────────────────────────────────────── */
var _searchTracked = false;
document.addEventListener('keydown', function(e) {
  if (!_searchTracked && (e.target.id === 'search-input' || e.target.id === 'nt-search')) {
    _searchTracked = true;
    trackSettingChange('search');
  }
});

/* ─────────────────────────────────────────
   HOOK APP/GAME GRID CLICKS
   (delegated from document so works for dynamically rendered cards)
───────────────────────────────────────── */
document.addEventListener('click', function(e) {
  // game card
  var gc = e.target.closest('.game-card, [data-game-id], [class*="game-item"]');
  if (gc) {
    var nm = gc.dataset.gameId || gc.querySelector('.game-card-title, .game-title, .card-title')?.textContent?.trim() || ('game-' + (gc.dataset.src || gc.href || Math.random().toString(36).slice(2)));
    trackAppOpen(nm, true);
  }
  // app card
  var ac = e.target.closest('.app-card, [data-app-id], [class*="app-item"]');
  if (ac && !gc) {
    var an = ac.dataset.appId || ac.querySelector('.app-title, .app-name, .card-title')?.textContent?.trim() || ('app-' + (ac.dataset.src || ac.href || Math.random().toString(36).slice(2)));
    trackAppOpen(an, false);
  }
});

/* ─────────────────────────────────────────
   LIVE UPDATE: react to admin grants being applied
   (fired by nova-badges-admin-grants.js after it writes to localStorage)
   This means users no longer need to hard-refresh to see granted custom
   badges, XP changes, or any other reward updates from the admin panel.
───────────────────────────────────────── */
document.addEventListener('nova:admin-rewards-applied', function() {
  // Re-cache custom badge definitions in case new ones were just granted
  window.__novaCustomBadges = null; // bust the cache so loadCustomBadges() refetches
  if (window.__novaDB) {
    window.__novaDB.get('nova:admin:custom_badges').then(function(raw) {
      if (!raw) return;
      try {
        var arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
        window.__novaCustomBadges = Array.isArray(arr) ? arr : [];
      } catch(e) {
        window.__novaCustomBadges = [];
      }
      updateRewardsUI();
    }).catch(function() {
      updateRewardsUI();
    });
  } else {
    updateRewardsUI();
  }
});


document.addEventListener('DOMContentLoaded', function(){
  // nova.js handles page switching; we just listen for rewards tab click
  var rewardsTab = document.querySelector('.nav-tab[data-page="rewards"]');
  if (rewardsTab) {
    rewardsTab.addEventListener('click', function(){
      // show the page
      document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
      var rp = document.getElementById('page-rewards');
      if (rp) rp.classList.add('active');
      // update nav active
      document.querySelectorAll('.nav-tab').forEach(function(t){ t.classList.remove('active'); });
      rewardsTab.classList.add('active');
      // clear new badges indicator
      set(KEYS.newBadges, []);
      var nb = document.getElementById('rewards-new-badge');
      if (nb) nb.style.display='none';
      updateRewardsUI();
    });
  }

  // Init on load
  trackVisit();
  updateRewardsUI();
  checkXpBadges();
  checkCountBadges();

  // Watch browser tab count for Tab Hoarder badge
  var tabsList = document.getElementById('browser-tabs-list') || document.querySelector('.browser-tabs-list');
  if (tabsList) {
    var tabObs = new MutationObserver(function() {
      var tabCount = tabsList.querySelectorAll('.browser-tab-item').length;
      if (tabCount >= 5) awardBadge('browser_tabs_5');
    });
    tabObs.observe(tabsList, { childList: true });
  }
});

/* expose for external use */
window.NovaBadges = {
  award: awardBadge,
  has: hasEarned,
  trackApp: trackAppOpen,
  trackSetting: trackSettingChange,
  totalXP: totalXP,
  earnedCount: earnedCount,
  refresh: updateRewardsUI,
};

})();
/* ═══════════════════════════════════════════════════════════
   NOVA ORBIT — Daily Streak Tracker Widget
   Shows fire icon + streak count in the nav, turns red on
   active streak (≥2 days). Grants XP rewards per streak day.
═══════════════════════════════════════════════════════════ */
(function() {
'use strict';

var ORBIT_KEY        = 'nova_orbit_streak';     // {count, lastDay, totalStreakXp}
var ORBIT_VISIT_KEY  = 'nova_orbit_visit_days'; // string[] of YYYY-MM-DD

/* XP granted per consecutive day (day index, caps at 75) */
function orbitDayXP(dayCount) {
  var table = [0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 75];
  return dayCount >= table.length ? table[table.length - 1] : table[Math.max(0,dayCount)];
}

/* Streak milestones */
var ORBIT_MILESTONES = [3, 7, 14, 30, 60, 100];

function orbitGet(key, def) {
  try { var v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : def; } catch(e) { return def; }
}
function orbitSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
}
function orbitToday() {
  var d = new Date(), m = d.getMonth()+1, day = d.getDate();
  return d.getFullYear()+'-'+(m<10?'0':'')+m+'-'+(day<10?'0':'')+day;
}
function orbitYesterday() {
  var d = new Date(); d.setDate(d.getDate()-1);
  var m = d.getMonth()+1, day = d.getDate();
  return d.getFullYear()+'-'+(m<10?'0':'')+m+'-'+(day<10?'0':'')+day;
}

function orbitTick() {
  var today     = orbitToday();
  var yesterday = orbitYesterday();
  var state     = orbitGet(ORBIT_KEY, { count:0, lastDay:'', totalStreakXp:0 });

  if (state.lastDay !== today) {
    if (state.lastDay === yesterday) {
      state.count++;
    } else if (state.lastDay === '') {
      state.count = 1;
    } else {
      state.count = 1;
    }
    var xpGranted = orbitDayXP(state.count);
    state.totalStreakXp = (state.totalStreakXp || 0) + xpGranted;
    state.lastDay = today;
    orbitSet(ORBIT_KEY, state);

    if (xpGranted > 0) {
      try {
        var rawXP = parseInt(localStorage.getItem('nova_badges_xp') || '0', 10);
        localStorage.setItem('nova_badges_xp', JSON.stringify(rawXP + xpGranted));
        if (window.NovaBadges && window.NovaBadges.refresh) window.NovaBadges.refresh();
      } catch(e) {}
    }
  }

  var vdays = orbitGet(ORBIT_VISIT_KEY, []);
  if (vdays.indexOf(today) === -1) { vdays.push(today); orbitSet(ORBIT_VISIT_KEY, vdays); }

  return state;
}

function orbitUpdateNav(state) {
  var btn   = document.getElementById('nova-orbit-btn');
  var fire  = document.getElementById('nova-orbit-fire');
  var count = document.getElementById('nova-orbit-count');
  if (!btn) return;
  var isStreak = state.count >= 2 && state.lastDay === orbitToday();
  count.textContent = state.count || 0;
  if (isStreak) {
    btn.style.background  = 'rgba(239,80,50,.18)';
    btn.style.borderColor = 'rgba(239,80,50,.5)';
    btn.style.color       = '#ef5032';
    fire.style.filter     = 'drop-shadow(0 0 5px #ef5032)';
  } else {
    btn.style.background  = 'rgba(139,143,255,.08)';
    btn.style.borderColor = 'rgba(139,143,255,.18)';
    btn.style.color       = 'var(--muted)';
    fire.style.filter     = 'none';
  }
}

function orbitUpdatePanel(state) {
  var today    = orbitToday();
  var isActive = state.count >= 2 && state.lastDay === today;

  var bigCount = document.getElementById('nova-orbit-big-count');
  if (bigCount) bigCount.textContent = state.count || 0;

  var hero = document.getElementById('nova-orbit-hero');
  if (hero) {
    hero.style.background  = isActive ? 'rgba(239,80,50,.12)' : 'rgba(139,143,255,.06)';
    hero.style.borderColor = isActive ? 'rgba(239,80,50,.3)'  : 'rgba(139,143,255,.12)';
  }

  var pfire = document.getElementById('nova-orbit-panel-fire');
  if (pfire) pfire.style.filter = isActive ? 'drop-shadow(0 0 6px #ef5032)' : 'none';

  var xpEl = document.getElementById('nova-orbit-xp-earned');
  if (xpEl) xpEl.textContent = fmtOrbs(state.totalStreakXp || 0, { plus: true });

  var nextEl = document.getElementById('nova-orbit-next-label');
  if (nextEl) {
    var cur  = state.count || 0;
    var next = null;
    for (var mi = 0; mi < ORBIT_MILESTONES.length; mi++) {
      if (ORBIT_MILESTONES[mi] > cur) { next = ORBIT_MILESTONES[mi]; break; }
    }
    nextEl.textContent = next ? (next + ' days (' + (next - cur) + ' to go)') : '100+ days — legend!';
  }

  var dotsEl = document.getElementById('nova-orbit-dots');
  if (dotsEl) {
    dotsEl.innerHTML = '';
    var vdays = orbitGet(ORBIT_VISIT_KEY, []);
    for (var i = 6; i >= 0; i--) {
      var dd = new Date(); dd.setDate(dd.getDate() - i);
      var dm = dd.getMonth()+1, dday = dd.getDate();
      var ds = dd.getFullYear()+'-'+(dm<10?'0':'')+dm+'-'+(dday<10?'0':'')+dday;
      var visited = vdays.indexOf(ds) !== -1;
      var isToday = (i === 0);
      var dot = document.createElement('div');
      dot.title = ds;
      var dotColor   = visited ? (isToday && isActive ? '#ef5032' : '#4ecca3') : 'rgba(139,143,255,.25)';
      var dotBg      = visited ? (isToday && isActive ? 'rgba(239,80,50,.25)' : 'rgba(78,204,163,.18)') : 'transparent';
      dot.style.cssText = 'width:22px;height:22px;border-radius:50%;flex-shrink:0;border:2px solid '+dotColor+';background:'+dotBg+';display:flex;align-items:center;justify-content:center;font-size:.38rem;color:'+dotColor+';';
      dot.textContent = visited ? '\u2713' : '';
      dotsEl.appendChild(dot);
    }
  }

  var statusEl = document.getElementById('nova-orbit-status');
  if (statusEl) {
    if (state.lastDay !== today) {
      statusEl.textContent = 'Visit today to keep your streak!';
      statusEl.style.color = '#f5c518';
    } else if (isActive) {
      statusEl.textContent = '\uD83D\uDD25 Streak active! Come back tomorrow.';
      statusEl.style.color = '#ef5032';
    } else {
      statusEl.textContent = 'Day 1 started — come back tomorrow!';
      statusEl.style.color = 'var(--muted)';
    }
  }
}

window.novaOrbitOpenPanel = function() {
  var panel = document.getElementById('nova-orbit-panel');
  if (!panel) return;
  orbitUpdatePanel(orbitGet(ORBIT_KEY, { count:0, lastDay:'', totalStreakXp:0 }));
  panel.style.display = 'block';
  setTimeout(function() { document.addEventListener('click', orbitOutsideClose); }, 10);
};

window.novaOrbitClosePanel = function() {
  var panel = document.getElementById('nova-orbit-panel');
  if (panel) panel.style.display = 'none';
  document.removeEventListener('click', orbitOutsideClose);
};

function orbitOutsideClose(e) {
  var panel = document.getElementById('nova-orbit-panel');
  var btn   = document.getElementById('nova-orbit-btn');
  if (panel && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
    window.novaOrbitClosePanel();
  }
}

function orbitBoot() {
  var state = orbitTick();
  orbitUpdateNav(state);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', orbitBoot);
} else {
  orbitBoot();
}

})();