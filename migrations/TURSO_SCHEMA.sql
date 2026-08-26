-- Nova Turso performance indexes. The Worker also creates these with
-- CREATE INDEX IF NOT EXISTS on first startup so manual application is optional.
CREATE INDEX IF NOT EXISTS social_members_user_channel_idx ON social_channel_members(user_id,channel_id,last_read_message_id);
CREATE INDEX IF NOT EXISTS social_messages_live_channel_idx ON social_messages(channel_id,deleted_at,id DESC);
CREATE INDEX IF NOT EXISTS social_messages_channel_created_idx ON social_messages(channel_id,created_at,id);
CREATE INDEX IF NOT EXISTS social_reactions_user_message_idx ON social_message_reactions(user_id,message_id);
CREATE INDEX IF NOT EXISTS social_group_invites_user_idx ON social_group_invites(invited_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS social_typing_channel_updated_idx ON social_typing(channel_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS user_presence_seen_idx ON user_presence(last_seen_at DESC,user_id);
CREATE INDEX IF NOT EXISTS uno_members_user_lobby_idx ON uno_lobby_members(user_id,lobby_id);
CREATE INDEX IF NOT EXISTS uno_lobbies_status_updated_idx ON uno_lobbies(status,updated_at DESC);

CREATE TABLE IF NOT EXISTS supernova_device_trials (
  device_id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  claimed_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS supernova_referrals (
  id TEXT PRIMARY KEY,
  inviter_id TEXT NOT NULL,
  invited_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  responded_at INTEGER,
  expires_at INTEGER,
  UNIQUE(inviter_id, invited_user_id)
);

CREATE INDEX IF NOT EXISTS supernova_referrals_inviter_idx ON supernova_referrals(inviter_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS supernova_referrals_invited_idx ON supernova_referrals(invited_user_id,status,created_at DESC);

CREATE INDEX IF NOT EXISTS uno_lobbies_updated_idx ON uno_lobbies(updated_at);
CREATE INDEX IF NOT EXISTS checkers_updated_idx ON checkers_matches(updated_at);
CREATE INDEX IF NOT EXISTS chess_updated_idx ON chess_matches(updated_at);
CREATE INDEX IF NOT EXISTS connect4_updated_idx ON connect4_matches(updated_at);
