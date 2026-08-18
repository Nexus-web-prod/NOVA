-- Nova 7 Cloudflare D1 schema
-- Apply with: npx wrangler d1 execute nova-db --remote --file=D1_SCHEMA.sql
-- This migration is additive. Legacy Nova 6 tables are retained only so existing
-- accounts can be upgraded on first login; new features use the normalized tables.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS nova_schema_meta (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  version INTEGER NOT NULL,
  applied_at INTEGER NOT NULL
);
INSERT INTO nova_schema_meta(id, version, applied_at)
VALUES (1, 716, unixepoch() * 1000)
ON CONFLICT(id) DO UPDATE SET version = excluded.version, applied_at = excluded.applied_at;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL DEFAULT '',
  password_salt TEXT NOT NULL DEFAULT '',
  legacy_hash TEXT NOT NULL DEFAULT '',
  account_status TEXT NOT NULL DEFAULT 'active' CHECK(account_status IN ('active','suspended','banned','deleted')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS users_status_idx ON users(account_status);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  status_text TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  banner_url TEXT NOT NULL DEFAULT '',
  pronouns TEXT NOT NULL DEFAULT '',
  location_text TEXT NOT NULL DEFAULT '',
  website_url TEXT NOT NULL DEFAULT '',
  online_visibility TEXT NOT NULL DEFAULT 'everyone' CHECK(online_visibility IN ('everyone','friends','hidden')),
  activity_visibility TEXT NOT NULL DEFAULT 'friends' CHECK(activity_visibility IN ('everyone','friends','hidden')),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  settings_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS user_stats (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  streak INTEGER NOT NULL DEFAULT 0,
  play_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','developer','admin','owner')),
  granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  expires_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY(user_id, role)
);
CREATE INDEX IF NOT EXISTS user_roles_role_idx ON user_roles(role);

CREATE TABLE IF NOT EXISTS user_plans (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK(plan IN ('free','supernova')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  note TEXT NOT NULL DEFAULT '',
  granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  granted_at INTEGER,
  expires_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS user_plans_active_idx ON user_plans(plan, status, expires_at);

CREATE TABLE IF NOT EXISTS game_stats (
  slug TEXT PRIMARY KEY,
  views INTEGER NOT NULL DEFAULT 0 CHECK(views >= 0),
  rating_sum REAL NOT NULL DEFAULT 0 CHECK(rating_sum >= 0),
  rating_count INTEGER NOT NULL DEFAULT 0 CHECK(rating_count >= 0),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS game_stats_rating_idx ON game_stats(rating_count, rating_sum);
CREATE INDEX IF NOT EXISTS game_stats_views_idx ON game_stats(views);

CREATE TABLE IF NOT EXISTS game_ratings (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY(user_id, slug)
);
CREATE INDEX IF NOT EXISTS game_ratings_slug_idx ON game_ratings(slug, updated_at DESC);

-- Supernova Hub state is private to its owner and deliberately separate from
-- normal settings.  Each section is independently validated by the Worker;
-- images and arbitrary CSS are never stored here.
CREATE TABLE IF NOT EXISTS supernova_state (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preferences_json TEXT NOT NULL DEFAULT '{}',
  themes_json TEXT NOT NULL DEFAULT '[]',
  workspaces_json TEXT NOT NULL DEFAULT '[]',
  ai_chats_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id_hash TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id, expires_at);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  scope_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at INTEGER NOT NULL,
  blocked_until INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_rate_limits_expiry_idx ON auth_rate_limits(blocked_until, updated_at);

-- Schema 712 separates normal browser limits from a higher-capacity IP
-- backstop. Remove the old shared-IP buckets so one school network cannot
-- inherit a lockout created before this migration.
DELETE FROM auth_rate_limits
WHERE scope_key GLOB 'login:*'
  AND scope_key NOT GLOB 'login:device:*'
  AND scope_key NOT GLOB 'login:ip:*';
DELETE FROM auth_rate_limits
WHERE scope_key GLOB 'register:*'
  AND scope_key NOT GLOB 'register:device:*'
  AND scope_key NOT GLOB 'register:ip:*';

-- Email verification was retired in schema 708 because school inboxes filtered
-- the delivery path. Accounts now receive Social access immediately.
DROP TABLE IF EXISTS email_verifications;

CREATE TABLE IF NOT EXISTS friendships (
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','blocked')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  CHECK(requester_id <> addressee_id),
  PRIMARY KEY(requester_id, addressee_id)
);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON friendships(addressee_id, status);
CREATE INDEX IF NOT EXISTS friendships_requester_idx ON friendships(requester_id, status);

CREATE TABLE IF NOT EXISTS social_blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  CHECK(blocker_id <> blocked_id),
  PRIMARY KEY(blocker_id, blocked_id)
);
CREATE INDEX IF NOT EXISTS social_blocks_blocked_idx ON social_blocks(blocked_id, created_at DESC);

CREATE TABLE IF NOT EXISTS social_channels (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('everyone','dm','group')),
  name TEXT NOT NULL DEFAULT '',
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS social_channel_members (
  channel_id TEXT NOT NULL REFERENCES social_channels(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  last_read_message_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS social_group_invites (
  channel_id TEXT NOT NULL REFERENCES social_channels(id) ON DELETE CASCADE,
  invited_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY(channel_id, invited_user_id)
);

CREATE TABLE IF NOT EXISTS social_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL REFERENCES social_channels(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  message_type TEXT NOT NULL DEFAULT 'text' CHECK(message_type IN ('text','image','system')),
  reply_to_id INTEGER REFERENCES social_messages(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS social_messages_channel_idx ON social_messages(channel_id, id DESC);
CREATE INDEX IF NOT EXISTS social_messages_sender_channel_idx ON social_messages(sender_id, channel_id, id DESC);

CREATE TABLE IF NOT EXISTS social_message_reactions (
  message_id INTEGER NOT NULL REFERENCES social_messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY(message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS social_message_reactions_message_idx ON social_message_reactions(message_id);

CREATE TABLE IF NOT EXISTS social_typing (
  channel_id TEXT NOT NULL REFERENCES social_channels(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(channel_id, user_id)
);
CREATE INDEX IF NOT EXISTS social_typing_updated_idx ON social_typing(updated_at);

-- Supernova voice rooms. Durable Objects coordinate live WebSocket state;
-- D1 remains authoritative for admission, sponsorship, safety, and auditing.
-- Audio and live dictation content are never stored in these tables.
CREATE TABLE IF NOT EXISTS voice_rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'friends' CHECK(scope_type IN ('friends','group','invite')),
  scope_id TEXT REFERENCES social_channels(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  host_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','ended')),
  locked INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0, 1)),
  dictation_enabled INTEGER NOT NULL DEFAULT 1 CHECK(dictation_enabled IN (0, 1)),
  max_members INTEGER NOT NULL DEFAULT 4 CHECK(max_members BETWEEN 2 AND 4),
  sponsor_deadline_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  ended_at INTEGER
);
CREATE INDEX IF NOT EXISTS voice_rooms_active_idx ON voice_rooms(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS voice_rooms_scope_idx ON voice_rooms(scope_type, scope_id, status);

CREATE TABLE IF NOT EXISTS voice_room_members (
  room_id TEXT NOT NULL REFERENCES voice_rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('host','supernova','member')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('invited','pending','admitted','connected','left','removed','denied')),
  admitted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  dictation_enabled INTEGER NOT NULL DEFAULT 1 CHECK(dictation_enabled IN (0, 1)),
  muted_by_host INTEGER NOT NULL DEFAULT 0 CHECK(muted_by_host IN (0, 1)),
  requested_at INTEGER,
  admitted_at INTEGER,
  connected_at INTEGER,
  joined_at INTEGER,
  last_seen_at INTEGER,
  left_at INTEGER,
  PRIMARY KEY(room_id, user_id)
);
CREATE INDEX IF NOT EXISTS voice_room_members_status_idx ON voice_room_members(room_id, status, connected_at);
CREATE INDEX IF NOT EXISTS voice_room_members_user_idx ON voice_room_members(user_id, status, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS voice_room_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL REFERENCES voice_rooms(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS voice_room_events_room_idx ON voice_room_events(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS voice_room_events_expiry_idx ON voice_room_events(expires_at);

CREATE TABLE IF NOT EXISTS voice_reports (
  id TEXT PRIMARY KEY,
  room_id TEXT REFERENCES voice_rooms(id) ON DELETE SET NULL,
  reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  transcript_excerpt TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','assigned','resolved','dismissed')),
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS voice_reports_status_idx ON voice_reports(status, created_at DESC);

CREATE TABLE IF NOT EXISTS voice_restrictions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  issued_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  expires_at INTEGER,
  revoked_at INTEGER,
  revoked_by TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS voice_restrictions_active_idx ON voice_restrictions(revoked_at, expires_at, created_at DESC);

CREATE TABLE IF NOT EXISTS chat_restrictions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'all' CHECK(scope IN ('all','everyone')),
  action TEXT NOT NULL DEFAULT 'ban' CHECK(action IN ('ban')),
  reason TEXT NOT NULL,
  issued_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  expires_at INTEGER,
  revoked_at INTEGER,
  revoked_by TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS chat_restrictions_active_idx ON chat_restrictions(user_id, revoked_at, expires_at, created_at DESC);

CREATE TABLE IF NOT EXISTS chat_moderation_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  channel_id TEXT,
  rule_code TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_moderation_events_user_idx ON chat_moderation_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_moderation_events_expiry_idx ON chat_moderation_events(expires_at);

CREATE TABLE IF NOT EXISTS user_presence (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'offline' CHECK(state IN ('online','idle','dnd','offline')),
  activity_type TEXT NOT NULL DEFAULT '',
  activity_label TEXT NOT NULL DEFAULT '',
  last_seen_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS user_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK(content_type IN ('game','app','movie','page')),
  content_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  artwork_url TEXT NOT NULL DEFAULT '',
  progress REAL NOT NULL DEFAULT 0,
  last_opened_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  UNIQUE(user_id, content_type, content_id)
);
CREATE INDEX IF NOT EXISTS user_activity_recent_idx ON user_activity(user_id, last_opened_at DESC);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  report_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','assigned','resolved','dismissed','appealed')),
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status, created_at DESC);

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'everyone',
  starts_at INTEGER,
  expires_at INTEGER,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS feature_flags (
  flag_key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  rollout_percent INTEGER NOT NULL DEFAULT 0 CHECK(rollout_percent BETWEEN 0 AND 100),
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS site_maintenance (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0, 1)),
  message TEXT NOT NULL DEFAULT '',
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
INSERT OR IGNORE INTO site_maintenance(id, enabled, message) VALUES (1, 0, '');

CREATE TABLE IF NOT EXISTS site_banners (
  id TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT 'info' CHECK(tone IN ('info','warn','danger','success')),
  dismissible INTEGER NOT NULL DEFAULT 1 CHECK(dismissible IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  starts_at INTEGER,
  expires_at INTEGER,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS site_banners_active_idx ON site_banners(is_active, starts_at, expires_at);

CREATE TABLE IF NOT EXISTS proxy_navigation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  device_id_hash TEXT NOT NULL,
  sanitized_url TEXT NOT NULL,
  domain TEXT NOT NULL,
  result TEXT NOT NULL DEFAULT 'opened' CHECK(result IN ('opened','failed','blocked')),
  reason TEXT NOT NULL DEFAULT '',
  incident_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS proxy_logs_expiry_idx ON proxy_navigation_logs(expires_at);
CREATE INDEX IF NOT EXISTS proxy_logs_device_idx ON proxy_navigation_logs(device_id_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS proxy_logs_domain_idx ON proxy_navigation_logs(domain, created_at DESC);

CREATE TABLE IF NOT EXISTS device_bans (
  device_id_hash TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  banned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  expires_at INTEGER
);
CREATE INDEX IF NOT EXISTS device_bans_expiry_idx ON device_bans(expires_at);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_audit_actor_idx ON admin_audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_expiry_idx ON admin_audit_logs(expires_at);

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK(category IN ('bug','feature','account','safety','other')),
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','waiting_user','resolved','closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  closed_at INTEGER
);
CREATE INDEX IF NOT EXISTS support_tickets_user_idx ON support_tickets(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_queue_idx ON support_tickets(status, priority, updated_at DESC);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  is_staff INTEGER NOT NULL DEFAULT 0 CHECK(is_staff IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_idx ON support_ticket_messages(ticket_id, id);

INSERT OR IGNORE INTO social_channels(id, kind, name) VALUES ('everyone', 'everyone', 'Everyone');

-- Version 714 caps new and currently active voice rooms at four people.
UPDATE voice_rooms SET max_members = 4 WHERE status = 'active' AND max_members > 4;

INSERT OR IGNORE INTO user_settings(user_id) SELECT id FROM users;
INSERT OR IGNORE INTO user_stats(user_id) SELECT id FROM users;
INSERT OR IGNORE INTO user_roles(user_id, role)
SELECT id, 'user' FROM users;

-- Browser-era hashes and key/value authority are permanently retired. Nova 7
-- accepts only PBKDF2 account credentials stored in the normalized tables.
UPDATE users SET legacy_hash = '' WHERE legacy_hash <> '';
DROP TABLE IF EXISTS nova_users;
DROP TABLE IF EXISTS nova_kv;
