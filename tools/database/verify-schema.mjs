import { TursoClient } from './turso-client.mjs';
const db = new TursoClient();
const required = [
  'users','user_profiles','user_settings','auth_sessions','auth_rate_limits',
  'social_channels','social_channel_members','social_messages','social_message_reactions','social_typing','user_presence',
  'uno_lobbies','uno_lobby_members','uno_lobby_invites','checkers_matches','chess_matches','connect4_matches',
  'voice_rooms','voice_room_members','voice_room_events','voice_v2_signals','voice_v2_messages','voice_sfu_tracks',
  'admin_tasks','schema_migrations'
];
const tables = await db.query("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'");
const set = new Set(tables.map(x=>x.name));
const missing = required.filter(x=>!set.has(x));
const fk = await db.query('PRAGMA foreign_key_check');
const integrity = await db.query('PRAGMA integrity_check');
const meta = await db.first('SELECT version,applied_at FROM nova_schema_meta WHERE id=1').catch(()=>null);
const migrations = await db.query('SELECT version,name,applied_at FROM schema_migrations ORDER BY version').catch(()=>[]);
console.log(JSON.stringify({ table_count: tables.length, imported_schema: meta, migrations, missing_required_tables: missing, foreign_key_violations: fk.length, integrity }, null, 2));
if (missing.length || fk.length || !integrity.some(x => String(Object.values(x)[0]).toLowerCase() === 'ok')) process.exitCode = 1;
