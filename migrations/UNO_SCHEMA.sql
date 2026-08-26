PRAGMA foreign_keys = ON;
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
CREATE INDEX IF NOT EXISTS uno_lobbies_code_idx ON uno_lobbies(code, updated_at DESC);
CREATE TABLE IF NOT EXISTS uno_lobby_members (
  lobby_id TEXT NOT NULL REFERENCES uno_lobbies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seat INTEGER NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY(lobby_id,user_id),
  UNIQUE(lobby_id,seat)
);
CREATE TABLE IF NOT EXISTS uno_lobby_invites (
  lobby_id TEXT NOT NULL REFERENCES uno_lobbies(id) ON DELETE CASCADE,
  invited_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(lobby_id,invited_user_id)
);
CREATE INDEX IF NOT EXISTS uno_invites_user_idx ON uno_lobby_invites(invited_user_id,created_at DESC);

CREATE INDEX IF NOT EXISTS uno_lobbies_updated_idx ON uno_lobbies(updated_at);
