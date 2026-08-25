-- Nova schema migration 718
-- Moves schema ownership out of request handlers and into the migration system.
-- Safe to apply to the imported schema-717 database because every DDL statement
-- is idempotent.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_tasks(
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'task',
  task_type TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open',
  created_by TEXT NOT NULL,
  assigned_to TEXT,
  assigned_role TEXT,
  target_type TEXT,
  target_id TEXT,
  target_username TEXT,
  action_json TEXT NOT NULL DEFAULT '{}',
  resolution TEXT NOT NULL DEFAULT '',
  due_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  completed_by TEXT
);
CREATE INDEX IF NOT EXISTS admin_tasks_status_updated_idx ON admin_tasks(status,updated_at DESC);
CREATE INDEX IF NOT EXISTS admin_tasks_assignee_idx ON admin_tasks(assigned_to,assigned_role,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS voice_staff_presence(
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  vanished INTEGER NOT NULL DEFAULT 0,
  joined_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(room_id,user_id)
);

CREATE TABLE IF NOT EXISTS supernova_device_trials(
  device_id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  claimed_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS supernova_referrals(
  id TEXT PRIMARY KEY,
  inviter_id TEXT NOT NULL,
  invited_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  responded_at INTEGER,
  expires_at INTEGER,
  UNIQUE(inviter_id,invited_user_id)
);
CREATE INDEX IF NOT EXISTS supernova_referrals_inviter_idx ON supernova_referrals(inviter_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS supernova_referrals_invited_idx ON supernova_referrals(invited_user_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS uno_lobbies (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'lobby' CHECK(status IN ('lobby','playing','finished')),
  state_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS uno_lobbies_code_idx ON uno_lobbies(code,updated_at DESC);
CREATE INDEX IF NOT EXISTS uno_lobbies_status_updated_idx ON uno_lobbies(status,updated_at DESC);

CREATE TABLE IF NOT EXISTS uno_lobby_members (
  lobby_id TEXT NOT NULL REFERENCES uno_lobbies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seat INTEGER NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY(lobby_id,user_id),
  UNIQUE(lobby_id,seat)
);
CREATE INDEX IF NOT EXISTS uno_members_user_lobby_idx ON uno_lobby_members(user_id,lobby_id);

CREATE TABLE IF NOT EXISTS uno_lobby_invites (
  lobby_id TEXT NOT NULL REFERENCES uno_lobbies(id) ON DELETE CASCADE,
  invited_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(lobby_id,invited_user_id)
);
CREATE INDEX IF NOT EXISTS uno_invites_user_idx ON uno_lobby_invites(invited_user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS checkers_matches (
  id TEXT PRIMARY KEY,
  red_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  black_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'playing' CHECK(status IN ('playing','finished')),
  winner_id TEXT,
  state_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS checkers_red_updated_idx ON checkers_matches(red_user_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS checkers_black_updated_idx ON checkers_matches(black_user_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS chess_matches (
  id TEXT PRIMARY KEY,
  white_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  black_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'playing' CHECK(status IN ('playing','finished')),
  winner_id TEXT,
  state_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS chess_white_updated_idx ON chess_matches(white_user_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS chess_black_updated_idx ON chess_matches(black_user_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS connect4_matches (
  id TEXT PRIMARY KEY,
  red_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  yellow_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'playing' CHECK(status IN ('playing','finished')),
  winner_id TEXT,
  state_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS connect4_red_updated_idx ON connect4_matches(red_user_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS connect4_yellow_updated_idx ON connect4_matches(yellow_user_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS voice_v2_signals(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_voice_v2_signals_target ON voice_v2_signals(room_id,to_user_id,id);

CREATE TABLE IF NOT EXISTS voice_v2_messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  message TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'text',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_voice_v2_messages_room ON voice_v2_messages(room_id,id);

CREATE TABLE IF NOT EXISTS voice_sfu_tracks (
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  track_name TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(room_id,user_id),
  FOREIGN KEY(room_id) REFERENCES voice_rooms(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS social_members_user_channel_idx ON social_channel_members(user_id,channel_id,last_read_message_id);
CREATE INDEX IF NOT EXISTS social_messages_live_channel_idx ON social_messages(channel_id,deleted_at,id DESC);
CREATE INDEX IF NOT EXISTS social_messages_channel_created_idx ON social_messages(channel_id,created_at,id);
CREATE INDEX IF NOT EXISTS social_reactions_user_message_idx ON social_message_reactions(user_id,message_id);
CREATE INDEX IF NOT EXISTS social_group_invites_user_idx ON social_group_invites(invited_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS social_typing_channel_updated_idx ON social_typing(channel_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS user_presence_seen_idx ON user_presence(last_seen_at DESC,user_id);

INSERT OR IGNORE INTO schema_migrations(version,name,applied_at)
VALUES(718,'runtime_schema_ownership',unixepoch('now') * 1000);
