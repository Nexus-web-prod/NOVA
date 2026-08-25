import { TursoClient } from './turso-client.mjs';
const db = new TursoClient();
const now = Date.now();
const checks = [
  ['expired_sessions', 'SELECT COUNT(*) AS count FROM auth_sessions WHERE expires_at<? OR revoked_at IS NOT NULL', [now]],
  ['expired_rate_limits', 'SELECT COUNT(*) AS count FROM auth_rate_limits WHERE blocked_until<? AND updated_at<?', [now, now-86400000]],
  ['expired_typing', 'SELECT COUNT(*) AS count FROM social_typing WHERE updated_at<?', [now-15000]],
  ['expired_voice_events', 'SELECT COUNT(*) AS count FROM voice_room_events WHERE expires_at<?', [now]],
  ['expired_proxy_logs', 'SELECT COUNT(*) AS count FROM proxy_navigation_logs WHERE expires_at<?', [now]],
  ['expired_uno_invites', 'SELECT COUNT(*) AS count FROM uno_lobby_invites WHERE created_at<?', [now-24*60*60*1000]],
  ['abandoned_uno_lobbies', "SELECT COUNT(*) AS count FROM uno_lobbies WHERE status='lobby' AND updated_at<?", [now-24*60*60*1000]],
  ['finished_uno_lobbies_old', "SELECT COUNT(*) AS count FROM uno_lobbies WHERE status='finished' AND updated_at<?", [now-24*60*60*1000]],
  ['stale_voice_v2_signals', 'SELECT COUNT(*) AS count FROM voice_v2_signals WHERE expires_at<?', [now]]
];
const report = {};
for (const [name, sql, args] of checks) {
  try { report[name] = Number((await db.first(sql,args))?.count || 0); }
  catch (e) { report[name] = { error: e.message }; }
}
console.log(JSON.stringify({ audited_at: new Date(now).toISOString(), ...report }, null, 2));
