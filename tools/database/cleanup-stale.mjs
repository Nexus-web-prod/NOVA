import { TursoClient } from './turso-client.mjs';
const apply = process.argv.includes('--apply');
const dryRun = process.argv.includes('--dry-run') || !apply;
const db = new TursoClient();
const now = Date.now();
const rules = [
  ['expired_sessions', 'auth_sessions', 'expires_at<? OR revoked_at IS NOT NULL', [now], 5000],
  ['expired_rate_limits', 'auth_rate_limits', 'blocked_until<? AND updated_at<?', [now, now-86400000], 10000],
  ['expired_typing', 'social_typing', 'updated_at<?', [now-15000], 10000],
  ['expired_voice_events', 'voice_room_events', 'expires_at<?', [now], 10000],
  ['expired_proxy_logs', 'proxy_navigation_logs', 'expires_at<?', [now], 25000],
  ['expired_voice_v2_signals', 'voice_v2_signals', 'expires_at<?', [now], 25000],
  ['expired_uno_invites', 'uno_lobby_invites', 'created_at<?', [now-24*60*60*1000], 5000]
];
const candidates = [];
for (const [name, table, where, args, max] of rules) {
  try {
    const count = Number((await db.first(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`, args))?.count || 0);
    if (count > max) throw new Error(`${name}: ${count} candidates exceeds safety limit ${max}`);
    candidates.push({ name, table, where, args, count, max });
  } catch (e) { if (/no such table/i.test(e.message)) candidates.push({name, skipped:e.message}); else throw e; }
}
console.log(JSON.stringify({ mode: dryRun ? 'dry-run' : 'apply', candidates: candidates.map(({args,where,...x})=>x) }, null, 2));
if (dryRun) { console.log('No changes made. Re-run with --apply after reviewing counts.'); process.exit(0); }
const statements = candidates.filter(x=>!x.skipped && x.count).map(x=>({sql:`DELETE FROM ${x.table} WHERE ${x.where}`, args:x.args}));
await db.transaction(statements);
console.log(`Cleanup applied: ${candidates.reduce((n,x)=>n+(x.count||0),0)} rows targeted.`);
