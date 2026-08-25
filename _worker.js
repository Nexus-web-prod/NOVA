const SESSION_COOKIE = "__Host-nova_session";
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
const PRESENCE_FRESH_MS = 150 * 1000;
const PROXY_LOG_MS = 14 * 24 * 60 * 60 * 1000;
const INCIDENT_LOG_MS = 90 * 24 * 60 * 60 * 1000;
const AUDIT_LOG_MS = 365 * 24 * 60 * 60 * 1000;
const CHAT_MODERATION_LOG_MS = 30 * 24 * 60 * 60 * 1000;
const VOICE_EVENT_LOG_MS = 90 * 24 * 60 * 60 * 1000;
const VOICE_ROOM_MAX_MS = 2 * 60 * 60 * 1000;
const VOICE_MEMBER_STALE_MS = 3 * 60 * 1000;
const VOICE_EMPTY_ROOM_GRACE_MS = 3 * 60 * 1000;
const VOICE_SPONSOR_GRACE_MS = 60 * 1000;
const VOICE_MAX_MEMBERS = 4;
const SUPERNOVA_DEVICE_TRIAL_MS = 3 * 24 * 60 * 60 * 1000;
const SUPERNOVA_REFERRAL_MS = 7 * 24 * 60 * 60 * 1000;
const SUPERNOVA_REFERRAL_LIMIT = 5;
const OPEN_RELAY_HOST = "staticauth.openrelay.metered.ca";
const OPEN_RELAY_STATIC_SECRET = "openrelayprojectsecret";
const OPEN_RELAY_TTL_SECONDS = 2 * 60 * 60;
const EVERYONE_CHAT_COOLDOWN_MS = 5 * 1000;
const MAINTENANCE_CACHE_MS = 2 * 1000;
const MAX_JSON_BODY_BYTES = 256 * 1024;
const AI_MAX_JSON_BODY_BYTES = 6 * 1024 * 1024;
const GEMINI_MODEL_PREFERENCES = [
  "gemini-3.5-flash",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash"
];
const GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1/interactions";
const GEMINI_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000";
const GEMINI_MODEL_CACHE_MS = 30 * 60 * 1000;
// The iteration count is embedded in every digest so old accounts can be
// upgraded transparently after a successful login.
const PASSWORD_ITERATIONS = 100000;
const PASSWORD_MAX_ITERATIONS = 100000;
const LEGACY_PASSWORD_ITERATIONS = 100000;
const STAFF_ROLES = new Set(["developer", "admin", "owner"]);
// Nova hierarchy: user < admin < developer < owner.
const ADMIN_ROLES = new Set(["admin", "developer", "owner"]);
const DEVELOPER_ROLES = new Set(["developer", "owner"]);
const MAINTENANCE_API_PATHS = new Set([
  "/api/health",
  "/api/device-status",
  "/api/site-state",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/me"
]);
const PRIVATE_DEPLOYMENT_FILES = new Set([
  "/_worker.js",
  "/turso_schema.sql",
  
  "/wrangler.toml",
  "/scripts/deploy/deploy-pages-turso.sh",
  "/scripts/maintenance/fix-cloud-placeholders.sh",
  "/scripts/maintenance/make-deploy-clean.sh",
  
  "/grant-owner.sh",
  "/scripts/maintenance/configure-google-ai.sh",
  "/turso_migration_readme.md",
  "/nova_7_release_audit_2026-07-15.md",
  "/nova_7_release_stabilization_2026-07-16.md",
  "/tools/prototypes/nova-full-prototype.html",
  "/tools/prototypes/nova-island-prototype.html",
  "/nova-redesign-prototype.html",
  "/playground.html",
  "/playground.js",
  "/website/js/nova-admin.js",
  "/website/js/nova-admin-rewards.js",
  "/website/js/admin.js"
]);
let lastCleanupAt = 0;
let maintenanceCache = { checkedAt: 0, state: null };
const deviceBanCache = new Map();
const sessionUserCache = new Map();
let tursoSchemaReady = null;
let unoSchemaReady = null;
let checkersSchemaReady = null;
let chessSchemaReady = null;
let connect4SchemaReady = null;
const requestUserCache = new WeakMap();
const geminiModelCache = new Map();


// -----------------------------------------------------------------------------
// Turso/libSQL database adapter
// Nova database adapter. All persistent application data is stored in Turso/libSQL.
// The prepared-statement surface keeps the route code small while the transport
// uses Turso's SQL-over-HTTP endpoint, which works in Cloudflare Pages Workers.
// -----------------------------------------------------------------------------
const tursoDbCache = new WeakMap();

function hasDatabaseConfig(env) {
  return !!(env && env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN);
}

function tursoHttpUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("Missing TURSO_DATABASE_URL");
  const base = raw.replace(/^libsql:\/\//i, "https://").replace(/\/$/, "");
  return base + "/v2/pipeline";
}

function tursoArg(value) {
  if (value === null || value === undefined) return { type: "null" };
  if (typeof value === "bigint") return { type: "integer", value: String(value) };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { type: "null" };
    return Number.isInteger(value)
      ? { type: "integer", value: String(value) }
      : { type: "float", value: String(value) };
  }
  if (typeof value === "boolean") return { type: "integer", value: value ? "1" : "0" };
  if (value instanceof Uint8Array) {
    let binary = "";
    for (let i = 0; i < value.length; i += 1) binary += String.fromCharCode(value[i]);
    return { type: "blob", base64: btoa(binary) };
  }
  if (value instanceof ArrayBuffer) return tursoArg(new Uint8Array(value));
  return { type: "text", value: String(value) };
}

function tursoValue(cell) {
  if (!cell || cell.type === "null") return null;
  if (cell.type === "integer") {
    const n = Number(cell.value);
    return Number.isSafeInteger(n) ? n : String(cell.value);
  }
  if (cell.type === "float") return Number(cell.value);
  if (cell.type === "blob") {
    const binary = atob(cell.base64 || "");
    return Uint8Array.from(binary, ch => ch.charCodeAt(0));
  }
  return cell.value == null ? null : String(cell.value);
}

function tursoRows(result) {
  const cols = Array.isArray(result?.cols) ? result.cols.map(col => col.name) : [];
  return (Array.isArray(result?.rows) ? result.rows : []).map(row => {
    const out = {};
    cols.forEach((name, index) => { out[name] = tursoValue(row[index]); });
    return out;
  });
}

class TursoPreparedStatement {
  constructor(db, sql, args) {
    this.db = db;
    this.sql = String(sql || "");
    this.args = Array.isArray(args) ? args : [];
  }
  bind(...args) { return new TursoPreparedStatement(this.db, this.sql, args); }
  async first(column) {
    const result = await this.db._execute(this.sql, this.args);
    const row = tursoRows(result)[0] || null;
    return row && column ? row[column] : row;
  }
  async all() {
    const result = await this.db._execute(this.sql, this.args);
    return {
      success: true,
      results: tursoRows(result),
      meta: this.db._meta(result)
    };
  }
  async run() {
    const result = await this.db._execute(this.sql, this.args);
    return {
      success: true,
      results: tursoRows(result),
      meta: this.db._meta(result)
    };
  }
}

class TursoDatabase {
  constructor(env) {
    this.url = tursoHttpUrl(env.TURSO_DATABASE_URL);
    this.token = String(env.TURSO_AUTH_TOKEN || "");
    if (!this.token) throw new Error("Missing TURSO_AUTH_TOKEN");
  }
  prepare(sql) { return new TursoPreparedStatement(this, sql, []); }
  _stmt(sql, args) {
    return { type: "execute", stmt: { sql: String(sql || ""), args: (args || []).map(tursoArg) } };
  }
  _meta(result) {
    return {
      changes: Number(result?.affected_row_count || 0),
      last_row_id: result?.last_insert_rowid == null ? 0 : Number(result.last_insert_rowid),
      rows_read: Number(result?.rows_read || 0),
      rows_written: Number(result?.rows_written || 0),
      duration: Number(result?.query_duration_ms || 0)
    };
  }
  async _send(requests, baton = null, endpoint = this.url) {
    const body = { requests };
    if (baton) body.baton = baton;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (!response.ok) {
      const detail = payload?.message || payload?.error || `HTTP ${response.status}`;
      throw new Error(`Turso request failed: ${detail}`);
    }
    return payload || {};
  }
  _executeResults(payload, expected) {
    const entries = Array.isArray(payload?.results) ? payload.results.slice(0, expected) : [];
    if (entries.length < expected) throw new Error("Turso SQL error: incomplete pipeline response");
    return entries.map((entry, index) => {
      if (!entry || entry.type !== "ok" || entry.response?.type !== "execute") {
        const detail = entry?.error?.message || entry?.error || `statement ${index + 1} failed`;
        const error = new Error(`Turso SQL error: ${detail}`);
        error.tursoStatementIndex = index;
        throw error;
      }
      return entry.response.result || {};
    });
  }
  async _pipeline(statements) {
    const payload = await this._send([...statements, { type: "close" }]);
    return this._executeResults(payload, statements.length);
  }
  async _execute(sql, args) {
    return (await this._pipeline([this._stmt(sql, args)]))[0];
  }
  async batch(statements) {
    const prepared = (statements || []).map(stmt => {
      if (!(stmt instanceof TursoPreparedStatement)) throw new Error("Turso batch expects prepared statements");
      return this._stmt(stmt.sql, stmt.args);
    });
    if (!prepared.length) return [];

    // Read-only batches do not need a transaction and stay to one HTTP request.
    const readOnly = (statements || []).every(stmt => /^\s*(SELECT|PRAGMA|WITH\b[^;]*SELECT)/i.test(stmt.sql));
    if (readOnly) {
      const results = await this._pipeline(prepared);
      return results.map(result => ({ success: true, results: tursoRows(result), meta: this._meta(result) }));
    }

    // Write batches use a real Turso transaction. We open the transaction and
    // execute the statements in one round trip, then commit only after every
    // statement reports success. Any error is rolled back before it escapes.
    const opening = await this._send([this._stmt("BEGIN IMMEDIATE", []), ...prepared]);
    const baton = opening.baton || null;
    try {
      const all = this._executeResults(opening, prepared.length + 1);
      if (!baton) throw new Error("Turso transaction did not return a baton");
      await this._send([this._stmt("COMMIT", []), { type: "close" }], baton);
      return all.slice(1).map(result => ({ success: true, results: tursoRows(result), meta: this._meta(result) }));
    } catch (error) {
      if (baton) {
        try { await this._send([this._stmt("ROLLBACK", []), { type: "close" }], baton); } catch {}
      }
      throw error;
    }
  }
}

function getDb(env) {
  if (!hasDatabaseConfig(env)) return null;
  let db = tursoDbCache.get(env);
  if (!db) { db = new TursoDatabase(env); tursoDbCache.set(env, db); }
  return db;
}

async function ensureTursoSchema(db) {
  if (!db) throw new Error("Turso database is not configured");
  if (!tursoSchemaReady) {
    tursoSchemaReady = (async () => {
      // These indexes match Nova's high-frequency polling paths. They are
      // intentionally narrow so a 3-second message/typing/reaction check uses
      // indexed lookups instead of rescanning large social tables.
      await db.batch([
        db.prepare("CREATE INDEX IF NOT EXISTS social_members_user_channel_idx ON social_channel_members(user_id,channel_id,last_read_message_id)"),
        db.prepare("CREATE INDEX IF NOT EXISTS social_messages_live_channel_idx ON social_messages(channel_id,deleted_at,id DESC)"),
        db.prepare("CREATE INDEX IF NOT EXISTS social_messages_channel_created_idx ON social_messages(channel_id,created_at,id)"),
        db.prepare("CREATE INDEX IF NOT EXISTS social_reactions_user_message_idx ON social_message_reactions(user_id,message_id)"),
        db.prepare("CREATE INDEX IF NOT EXISTS social_group_invites_user_idx ON social_group_invites(invited_user_id,created_at DESC)"),
        db.prepare("CREATE INDEX IF NOT EXISTS social_typing_channel_updated_idx ON social_typing(channel_id,updated_at DESC)"),
        db.prepare("CREATE INDEX IF NOT EXISTS user_presence_seen_idx ON user_presence(last_seen_at DESC,user_id)"),
        db.prepare("CREATE INDEX IF NOT EXISTS uno_members_user_lobby_idx ON uno_lobby_members(user_id,lobby_id)"),
        db.prepare("CREATE INDEX IF NOT EXISTS uno_lobbies_status_updated_idx ON uno_lobbies(status,updated_at DESC)"),
        db.prepare(`CREATE TABLE IF NOT EXISTS admin_tasks(
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
        )`),
        db.prepare("CREATE INDEX IF NOT EXISTS admin_tasks_status_updated_idx ON admin_tasks(status,updated_at DESC)"),
        db.prepare("CREATE INDEX IF NOT EXISTS admin_tasks_assignee_idx ON admin_tasks(assigned_to,assigned_role,status,updated_at DESC)"),
        db.prepare(`CREATE TABLE IF NOT EXISTS voice_staff_presence(
          room_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          vanished INTEGER NOT NULL DEFAULT 0,
          joined_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY(room_id,user_id)
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS supernova_device_trials(
          device_id_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL UNIQUE,
          claimed_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS supernova_referrals(
          id TEXT PRIMARY KEY,
          inviter_id TEXT NOT NULL,
          invited_user_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at INTEGER NOT NULL,
          responded_at INTEGER,
          expires_at INTEGER,
          UNIQUE(inviter_id,invited_user_id)
        )`),
        db.prepare("CREATE INDEX IF NOT EXISTS supernova_referrals_inviter_idx ON supernova_referrals(inviter_id,status,created_at DESC)"),
        db.prepare("CREATE INDEX IF NOT EXISTS supernova_referrals_invited_idx ON supernova_referrals(invited_user_id,status,created_at DESC)")
      ]);
      return true;
    })().catch(error => { tursoSchemaReady = null; throw error; });
  }
  return tursoSchemaReady;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") return apiJson(null, 204);
      if (!hasDatabaseConfig(env)) return apiError("DATABASE_UNAVAILABLE", "Missing Turso database configuration", 503);
      try {
        await ensureTursoSchema(getDb(env));
        await maybeCleanup(getDb(env));
        if (!["/api/health", "/api/device-status"].includes(url.pathname)) {
          const ban = await activeDeviceBan(request, getDb(env));
          if (ban) return apiError("DEVICE_BANNED", ban.reason || "This device is banned from Nova", 403);
        }
        if (!isMaintenanceApiPath(url.pathname)) {
          const maintenance = await maintenanceState(getDb(env));
          if (maintenance.enabled && !(await hasStaffSession(request, getDb(env)))) {
            return maintenanceApiResponse(maintenance);
          }
        }
        return await routeApi(request, env, url);
      } catch (error) {
        if (error instanceof ApiFailure) return apiError(error.code, error.message, error.status);
        console.error("Nova API error", error);
        return internalApiError(error);
      }
    }

    if (url.pathname.startsWith("/rest/v1/")) {
      return apiError("LEGACY_API_REMOVED", "This browser-controlled database endpoint was removed in Nova 7", 410);
    }

    // Scramjet proxy routes are service-worker-only. If one reaches Pages,
    // the browser is not yet controlled by the current proxy worker. Return a
    // clean transient error instead of involving Nova APIs/maintenance reads
    // or allowing any host-side fallback to claim the route.
    if (url.pathname.startsWith("/~/sj/")) {
      return new Response("Nova's Scramjet proxy is still starting. Please retry the navigation.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
      });
    }

    // Vortex routes are normally intercepted by the service worker. If one
    // reaches Pages, never serve Nova's SPA inside its own game iframe.
    if (url.pathname.startsWith("/vortex/")) {
      return new Response("Nova's proxy is still starting. Please try the game again.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
      });
    }

    if (isPrivateDeploymentPath(url.pathname)) return privateAssetNotFound();

    if (isDocumentRequest(request, url)) {
      if (!hasDatabaseConfig(env)) return maintenanceDocument({ message: "Nova is temporarily unavailable." });
      try {
        const maintenance = await maintenanceState(getDb(env));
        if (maintenance.enabled && !(await hasStaffSession(request, getDb(env)))) {
          return maintenanceDocument(maintenance);
        }
      } catch (error) {
        console.error("Nova maintenance check failed", error);
        return maintenanceDocument({ message: "Nova is temporarily unavailable." });
      }
    }

    if (url.hostname === "games.nova-7.pages.dev" && (url.pathname === "/" || url.pathname === "/index.html")) {
      // Serve the standalone Nova Games landing page on the games subdomain.
      // Keep the query string so invite links such as ?lobby=ABC123 still work.
      const gamesUrl = new URL(url);
      gamesUrl.pathname = "/website/html/nova-games.html";
      return env.ASSETS.fetch(new Request(gamesUrl, request));
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const websiteUrl = new URL(url);
      websiteUrl.pathname = "/website/html/index.html";
      return env.ASSETS.fetch(new Request(websiteUrl, request));
    }
    return env.ASSETS.fetch(request);
  }
};

async function routeApi(request, env, url) {
  const { pathname } = url;
  const method = request.method.toUpperCase();

  if (pathname.startsWith("/api/boardgames/uno/")) await ensureUnoSchema(getDb(env));
  if (pathname.startsWith("/api/boardgames/checkers/")) await ensureCheckersSchema(getDb(env));
  if (pathname.startsWith("/api/boardgames/chess/")) await ensureChessSchema(getDb(env));
  if (pathname.startsWith("/api/boardgames/connect4/")) await ensureConnect4Schema(getDb(env));

  if (pathname === "/api/health" && method === "GET") return health(env);
  if (pathname === "/api/device-status" && method === "GET") return deviceStatus(request, getDb(env));
  if (pathname === "/api/site-state" && method === "GET") return siteState(getDb(env));
  if (pathname === "/api/auth/register" && method === "POST") return register(request, env);
  if (pathname === "/api/auth/login" && method === "POST") return login(request, env);
  if (pathname === "/api/auth/logout" && method === "POST") return logout(request, getDb(env));
  if (pathname === "/api/auth/change-password" && method === "POST") return changePassword(request, getDb(env));
  if (pathname === "/api/me" && method === "GET") return me(request, env);
  if (pathname === "/api/profile" && method === "GET") return myProfile(request, getDb(env));
  if (pathname === "/api/profile" && method === "PATCH") return updateProfile(request, getDb(env));
  if (pathname === "/api/settings" && method === "GET") return getSettings(request, getDb(env));
  if (pathname === "/api/settings" && method === "PATCH") return updateSettings(request, getDb(env));
  if (pathname === "/api/profiles" && method === "GET") return publicProfiles(url, getDb(env));
  if (pathname.startsWith("/api/profiles/") && method === "GET") {
    return publicProfile(decodeURIComponent(pathname.slice("/api/profiles/".length)), getDb(env));
  }
  if (pathname === "/api/activity" && method === "GET") return getActivity(request, getDb(env));
  if (pathname === "/api/activity" && method === "POST") return saveActivity(request, getDb(env));
  if (pathname === "/api/games/stats" && method === "GET") return getGameStats(request, url, getDb(env));
  if (pathname === "/api/games/rating" && method === "POST") return rateGame(request, getDb(env));
  if (pathname === "/api/games/view" && method === "POST") return recordGameView(request, getDb(env));
  if (pathname === "/api/boardgames/uno/lobbies" && method === "GET") return getUnoLobby(request, url, getDb(env));
  if (pathname === "/api/boardgames/uno/lobbies" && method === "POST") return createUnoLobby(request, getDb(env));
  if (pathname === "/api/boardgames/uno/join" && method === "POST") return joinUnoLobby(request, getDb(env));
  if (pathname === "/api/boardgames/uno/leave" && method === "POST") return leaveUnoLobby(request, getDb(env));
  if (pathname === "/api/boardgames/uno/action" && method === "POST") return unoAction(request, getDb(env));
  if (pathname === "/api/boardgames/uno/invite" && method === "POST") return inviteUnoFriend(request, getDb(env));
  if (pathname === "/api/boardgames/uno/invites" && method === "GET") return getUnoInvites(request, getDb(env));
  if (pathname === "/api/boardgames/uno/social-invite" && method === "POST") return createUnoSocialInvite(request, getDb(env));
  if (pathname === "/api/boardgames/uno/call" && method === "POST") return joinUnoCall(request, env);
  if (pathname === "/api/boardgames/checkers/matches" && method === "GET") return getCheckersMatch(request, url, getDb(env));
  if (pathname === "/api/boardgames/checkers/social-invite" && method === "POST") return createCheckersSocialInvite(request, getDb(env));
  if (pathname === "/api/boardgames/checkers/action" && method === "POST") return checkersAction(request, getDb(env));
  if (pathname === "/api/boardgames/chess/matches" && method === "GET") return getChessMatch(request, url, getDb(env));
  if (pathname === "/api/boardgames/chess/social-invite" && method === "POST") return createChessSocialInvite(request, getDb(env));
  if (pathname === "/api/boardgames/chess/action" && method === "POST") return chessAction(request, getDb(env));
  if (pathname === "/api/boardgames/connect4/matches" && method === "GET") return getConnect4Match(request, url, getDb(env));
  if (pathname === "/api/boardgames/connect4/social-invite" && method === "POST") return createConnect4SocialInvite(request, getDb(env));
  if (pathname === "/api/boardgames/connect4/action" && method === "POST") return connect4Action(request, getDb(env));
  if (pathname === "/api/presence" && method === "POST") return setPresence(request, getDb(env));
  if (pathname === "/api/social" && method === "GET") return socialOverview(request, getDb(env));
  if (pathname === "/api/social/presence" && method === "GET") return socialPresence(request, getDb(env));
  if (pathname === "/api/social/requests" && method === "GET") return socialRequests(request, getDb(env));
  if (pathname === "/api/social/friend-request" && method === "POST") return sendFriendRequest(request, getDb(env));
  if (pathname === "/api/social/friend-request/respond" && method === "POST") return respondFriendRequest(request, getDb(env));
  if (pathname === "/api/social/friend" && method === "DELETE") return removeFriend(request, getDb(env));
  if (pathname === "/api/social/blocks" && method === "GET") return getSocialBlocks(request, getDb(env));
  if (pathname === "/api/social/blocks" && method === "POST") return blockSocialUser(request, env);
  if (pathname === "/api/social/blocks" && method === "DELETE") return unblockSocialUser(request, getDb(env));
  if (pathname === "/api/social/messages" && method === "GET") return getMessages(request, url, getDb(env));
  if (pathname === "/api/social/messages" && method === "POST") return sendMessage(request, getDb(env));
  if (pathname === "/api/social/reactions" && method === "GET") return getMessageReactions(request, url, getDb(env));
  if (pathname === "/api/social/reactions" && method === "POST") return toggleMessageReaction(request, getDb(env));
  if (pathname === "/api/social/typing" && method === "GET") return getTyping(request, url, getDb(env));
  if (pathname === "/api/social/typing" && method === "POST") return setTyping(request, getDb(env));
  if (pathname === "/api/message-island/recent" && method === "GET") return getMessageIslandRecent(request, url, getDb(env));
  if (pathname === "/api/social/groups" && method === "POST") return createGroup(request, getDb(env));
  if (pathname === "/api/social/groups/invite" && method === "POST") return inviteGroupMember(request, getDb(env));
  if (pathname === "/api/social/groups/respond" && method === "POST") return respondGroupInvite(request, getDb(env));
  if (pathname === "/api/social/groups/member" && method === "DELETE") return leaveGroup(request, getDb(env));
  // Voice Rooms V2 — self-contained room state, chat, admission, heartbeat,
  // and WebRTC signaling. Does not depend on the legacy Durable Object or SFU.
  if (pathname === "/api/voice/v2/rooms" && method === "GET") return voiceV2Rooms(request, env);
  if (pathname === "/api/voice/v2/rooms" && method === "POST") return voiceV2Create(request, env);
  if (pathname === "/api/voice/v2/state" && method === "GET") return voiceV2State(request, url, env);
  if (pathname === "/api/voice/v2/join" && method === "POST") return voiceV2Join(request, env);
  if (pathname === "/api/voice/v2/admit" && method === "POST") return voiceV2Admit(request, env);
  if (pathname === "/api/voice/v2/leave" && method === "POST") return voiceV2Leave(request, env);
  if (pathname === "/api/voice/v2/action" && method === "POST") return voiceV2Action(request, env);
  if (pathname === "/api/voice/v2/chat" && method === "GET") return voiceV2ChatGet(request, url, env);
  if (pathname === "/api/voice/v2/chat" && method === "POST") return voiceV2ChatPost(request, env);
  if (pathname === "/api/voice/v2/signals" && method === "GET") return voiceV2SignalsGet(request, url, env);
  if (pathname === "/api/voice/v2/signals" && method === "POST") return voiceV2SignalsPost(request, env);
  if (pathname === "/api/voice/v2/ice" && method === "GET") return voiceV2Ice(request, url, env);
  if (pathname === "/api/voice/rooms" && method === "GET") return getVoiceRooms(request, env);
  if (pathname === "/api/voice/rooms" && method === "POST") return createVoiceRoom(request, env);
  if (pathname === "/api/voice/room" && method === "GET") return getVoiceRoom(request, url, env);
  if (pathname === "/api/voice/request" && method === "POST") return requestVoiceRoomJoin(request, env);
  if (pathname === "/api/voice/admit" && method === "POST") return admitVoiceRoomMember(request, env);
  if (pathname === "/api/voice/leave" && method === "POST") return leaveVoiceRoom(request, env);
  if (pathname === "/api/voice/action" && method === "POST") return voiceRoomAction(request, env);
  if (pathname === "/api/voice/transcribe" && method === "POST") return transcribeVoiceAudio(request, env);
  if (pathname === "/api/voice/transcript" && method === "POST") return publishVoiceTranscript(request, env);
  if (pathname === "/api/voice/report" && method === "POST") return reportVoiceParticipant(request, env);
  if (pathname === "/api/voice/ice" && method === "GET") return voiceIceServers(request, env);
  if (pathname === "/api/voice/sfu/tracks" && method === "GET") return voiceSfuTracks(request, url, env);
  if (pathname === "/api/voice/sfu" && method === "POST") return voiceSfuAction(request, env);
  if (pathname === "/api/voice/ws" && method === "GET") return voiceRoomWebSocket(request, url, env);
  if (pathname === "/api/reports" && method === "POST") return createReport(request, getDb(env));
  if (pathname === "/api/support/tickets" && method === "GET") return supportTickets(request, url, getDb(env));
  if (pathname === "/api/support/tickets" && method === "POST") return createSupportTicket(request, getDb(env));
  if (pathname === "/api/support/tickets/messages" && method === "POST") return replySupportTicket(request, getDb(env));
  if (pathname === "/api/support/tickets/status" && method === "POST") return setSupportTicketStatus(request, getDb(env));
  if (pathname === "/api/supernova/state" && method === "GET") return getSupernovaState(request, getDb(env));
  if (pathname === "/api/supernova/state" && method === "PUT") return updateSupernovaState(request, getDb(env));
  if (pathname === "/api/supernova/access" && method === "GET") return getSupernovaAccess(request, getDb(env));
  if (pathname === "/api/supernova/trial" && method === "POST") return claimSupernovaTrial(request, getDb(env));
  if (pathname === "/api/supernova/referrals" && method === "POST") return createSupernovaReferral(request, getDb(env));
  if (pathname === "/api/supernova/referrals/respond" && method === "POST") return respondSupernovaReferral(request, getDb(env));
  if (pathname === "/api/ai/chat" && method === "POST") return supernovaAI(request, env);
  if (pathname === "/api/proxy/navigation" && method === "POST") return logProxyNavigation(request, getDb(env));
  if (pathname === "/api/browser-download" && method === "POST") return browserDownload(request, getDb(env));
  if (pathname === "/api/announcements" && method === "GET") return activeAnnouncements(getDb(env));
  if (pathname === "/api/admin/overview" && method === "GET") return adminOverview(request, getDb(env));
  if (pathname === "/api/admin/tasks" && method === "GET") return adminTasks(request, url, getDb(env));
  if (pathname === "/api/admin/tasks" && method === "POST") return adminCreateTask(request, getDb(env));
  if (pathname === "/api/admin/tasks" && method === "PATCH") return adminUpdateTask(request, getDb(env));
  if (pathname === "/api/admin/users" && method === "GET") return adminUsers(request, url, getDb(env));
  if (pathname === "/api/admin/staff" && method === "GET") return adminStaff(request, getDb(env));
  if (pathname === "/api/admin/users/status" && method === "POST") return adminSetUserStatus(request, getDb(env));
  if (pathname === "/api/admin/users/password" && method === "POST") return adminResetUserPassword(request, getDb(env));
  if (pathname === "/api/admin/chat/messages" && method === "GET") return adminChatMessages(request, url, getDb(env));
  if (pathname === "/api/admin/chat/restrictions" && method === "GET") return adminChatRestrictions(request, url, getDb(env));
  if (pathname === "/api/admin/chat/restrictions" && method === "POST") return adminCreateChatRestriction(request, getDb(env));
  if (pathname === "/api/admin/chat/restrictions" && method === "DELETE") return adminRevokeChatRestriction(request, getDb(env));
  if (pathname === "/api/admin/chat/everyone/clear" && method === "DELETE") return adminClearEveryoneChat(request, getDb(env));
  if (pathname === "/api/admin/reports" && method === "GET") return adminReports(request, url, getDb(env));
  if (pathname === "/api/admin/reports/action" && method === "POST") return adminReportAction(request, getDb(env));
  if (pathname === "/api/admin/tickets" && method === "GET") return adminTickets(request, url, getDb(env));
  if (pathname === "/api/admin/tickets/action" && method === "POST") return adminTicketAction(request, getDb(env));
  if (pathname === "/api/admin/proxy-logs" && method === "GET") return adminProxyLogs(request, url, getDb(env));
  if (pathname === "/api/admin/device-bans" && method === "GET") return adminDeviceBans(request, getDb(env));
  if (pathname === "/api/admin/device-bans" && method === "POST") return adminBanDevice(request, getDb(env));
  if (pathname === "/api/admin/device-bans" && method === "DELETE") return adminUnbanDevice(request, getDb(env));
  if (pathname === "/api/admin/site" && method === "GET") return adminSite(request, getDb(env));
  if (pathname === "/api/admin/maintenance" && method === "PATCH") return adminSetMaintenance(request, getDb(env));
  if (pathname === "/api/admin/banners" && method === "POST") return adminCreateBanner(request, getDb(env));
  if (pathname === "/api/admin/banners" && method === "PATCH") return adminUpdateBanner(request, getDb(env));
  if (pathname === "/api/admin/banners" && method === "DELETE") return adminDeleteBanner(request, getDb(env));
  if (pathname === "/api/admin/supernova" && method === "GET") return adminSupernova(request, getDb(env));
  if (pathname === "/api/admin/supernova" && method === "POST") return adminSupernovaAction(request, getDb(env));
  if (pathname === "/api/admin/voice" && method === "GET") return adminVoice(request, env);
  if (pathname === "/api/admin/voice/action" && method === "POST") return adminVoiceAction(request, env);
  if (pathname === "/api/admin/roles" && method === "POST") return adminSetRole(request, getDb(env));
  if (pathname === "/api/admin/audit" && method === "GET") return adminAudit(request, url, getDb(env));

  return apiError("NOT_FOUND", "API route not found", 404);
}

async function browserDownload(request, db) {
  requireSameOrigin(request);
  await requireUser(request, db);
  const body = await readJson(request);
  let target;
  try { target = new URL(String(body.url || "")); }
  catch { throw new ApiFailure("INVALID_URL", "The download address is invalid", 400); }
  const validateTarget = value => {
    if (!["http:", "https:"].includes(value.protocol) || value.username || value.password) throw new ApiFailure("INVALID_URL", "Only public web downloads are allowed", 400);
    const host = value.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const blocked = host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host === "0.0.0.0" || host === "::" || host === "::1" || /^(?:127|10)\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^169\.254\./.test(host) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) || /^(?:fc|fd|fe8|fe9|fea|feb)/i.test(host);
    if (blocked) throw new ApiFailure("PRIVATE_ADDRESS", "Private network downloads are blocked", 403);
  };
  validateTarget(target);
  let upstream;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    upstream = await fetch(target.href, { method: "GET", redirect: "manual", headers: { "Accept": "*/*", "User-Agent": "Nova Browser/7.0" } });
    if (![301, 302, 303, 307, 308].includes(upstream.status)) break;
    const location = upstream.headers.get("location");
    if (!location || redirects === 5) throw new ApiFailure("TOO_MANY_REDIRECTS", "The download redirected too many times", 502);
    target = new URL(location, target); validateTarget(target);
  }
  if (!upstream.ok) throw new ApiFailure("DOWNLOAD_FAILED", `The website returned ${upstream.status} ${upstream.statusText}`, upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502);
  const headers = new Headers();
  for (const name of ["content-type", "content-length", "content-disposition", "etag", "last-modified"]) {
    const value = upstream.headers.get(name); if (value) headers.set(name, value);
  }
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(upstream.body, { status: 200, headers });
}

async function health(env) {
  const db = getDb(env);
  const [schemaResult, columnResult] = await db.batch([
    db.prepare("SELECT version, applied_at FROM nova_schema_meta WHERE id = 1"),
    db.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('users') WHERE name IN ('id','username','password_hash','password_salt','account_status')")
  ]);
  const schema = schemaResult.results?.[0] || null;
  const userColumns = Number(columnResult.results?.[0]?.count || 0);
  if (!schema || Number(schema.version) < 717 || userColumns !== 5) {
    return apiError("DATABASE_SCHEMA_MISMATCH", "Nova's database needs the clean Nova 7 schema", 503);
  }
  return apiJson({
    ok: true,
    backend: "turso-libsql",
    dbBound: true,
    voiceBound: !!env.VOICE_ROOMS,
    voiceRelayBound: true,
    voiceRelayProvider: "open-relay",
    schema: "nova-7",
    schemaVersion: Number(schema.version)
  });
}

async function deviceStatus(request, db) {
  const ban = await activeDeviceBan(request, db);
  return apiJson({
    banned: !!ban,
    reason: ban?.reason || "",
    expiresAt: ban?.expires_at || null
  });
}

async function register(request, env) {
  requireSameOrigin(request);
  await enforceAuthRateLimit(request, getDb(env), "register", 5, 60 * 60 * 1000, 60 * 60 * 1000);
  const body = await readJson(request);
  const username = normalizeUsername(body.username);
  const password = String(body.password || "");
  if (!username) return apiError("INVALID_USERNAME", "Use 3-20 letters, numbers, or underscores", 400);
  if (weakPassword(password, username)) return apiError("WEAK_PASSWORD", "Use at least 8 characters and avoid common passwords", 400);

  const existing = await getDb(env).prepare("SELECT username FROM users WHERE username = ? COLLATE NOCASE LIMIT 1").bind(username).first();
  if (existing) return apiError("USERNAME_TAKEN", "That username is already in use", 409);

  const id = randomId();
  const salt = randomToken(16);
  let passwordHash;
  try {
    passwordHash = await derivePassword(password, salt);
  } catch (error) {
    console.error("Nova password hash error", error);
    throw new ApiFailure("AUTH_CRYPTO_ERROR", "Nova could not secure that password", 503);
  }
  const now = Date.now();
  try {
    await getDb(env).batch([
      getDb(env).prepare("INSERT INTO users(id, username, password_hash, password_salt, created_at, updated_at) VALUES(?,?,?,?,?,?)").bind(id, username, passwordHash, salt, now, now),
      getDb(env).prepare("INSERT INTO user_profiles(user_id, display_name, updated_at) VALUES(?,?,?)").bind(id, username, now),
      getDb(env).prepare("INSERT INTO user_settings(user_id, updated_at) VALUES(?,?)").bind(id, now),
      getDb(env).prepare("INSERT INTO user_stats(user_id, updated_at) VALUES(?,?)").bind(id, now),
      getDb(env).prepare("INSERT INTO user_roles(user_id, role) VALUES(?, 'user')").bind(id)
    ]);
  } catch (error) {
    console.error("Nova account insert error", error);
    throw new ApiFailure("ACCOUNT_CREATE_FAILED", "Nova could not create that account", 503);
  }

  const session = await createSession(getDb(env), id, deviceIdFrom(request));
  const user = await loadUser(getDb(env), id);
  return apiJson({ user: exposeMe(user) }, 201, { "Set-Cookie": sessionCookie(session.token) });
}

async function login(request, env) {
  requireSameOrigin(request);
  const rateLimitKey = await enforceAuthRateLimit(request, getDb(env), "login", 10, 10 * 60 * 1000, 15 * 60 * 1000);
  const body = await readJson(request);
  const username = normalizeUsername(body.username);
  const password = String(body.password || "");
  if (!username || !password) return apiError("INVALID_CREDENTIALS", "Invalid username or password", 401);

  const row = await getDb(env).prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE LIMIT 1").bind(username).first();
  if (!row || row.account_status !== "active") return apiError("INVALID_CREDENTIALS", "Invalid username or password", 401);

  const storedIterations = passwordIterations(row.password_hash);
  if (storedIterations > PASSWORD_MAX_ITERATIONS) {
    await clearAuthRateLimit(getDb(env), rateLimitKey);
    return apiError("PASSWORD_RESET_REQUIRED", "This account needs a one-time password reset after Nova's security upgrade. Use a device where you are still signed in or ask a Nova owner for help.", 409);
  }

  let valid = false;
  try {
    valid = !!(row.password_hash && row.password_salt && await verifyPassword(password, row.password_salt, row.password_hash));
  } catch (error) {
    console.error("Nova password verification error", error);
    throw new ApiFailure("AUTH_CRYPTO_ERROR", "Nova could not verify that password right now", 503);
  }
  if (!valid) return apiError("INVALID_CREDENTIALS", "Invalid username or password", 401);

  if (!row.password_hash || passwordIterations(row.password_hash) < PASSWORD_ITERATIONS) {
    const salt = randomToken(16);
    const hash = await derivePassword(password, salt);
    await getDb(env).prepare("UPDATE users SET password_hash = ?, password_salt = ?, legacy_hash = '', updated_at = ? WHERE id = ?").bind(hash, salt, Date.now(), row.id).run();
  }

  const session = await createSession(getDb(env), row.id, deviceIdFrom(request));
  await clearAuthRateLimit(getDb(env), rateLimitKey);
  const user = await loadUser(getDb(env), row.id);
  return apiJson({ user: exposeMe(user) }, 200, { "Set-Cookie": sessionCookie(session.token) });
}

async function logout(request, db) {
  requireSameOrigin(request);
  const token = cookieValue(request, SESSION_COOKIE);
  if (token) await db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ?").bind(Date.now(), await sha256(token)).run();
  return apiJson({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
}

async function changePassword(request, db) {
  requireSameOrigin(request);
  const auth = await requireUser(request, db);
  await enforceUserRateLimit(db, auth.id, "password-change", 5, 60 * 60 * 1000, 60 * 60 * 1000);
  const body = await readJson(request);
  const current = String(body.currentPassword || "");
  const next = String(body.newPassword || "");
  if (weakPassword(next, auth.username)) return apiError("WEAK_PASSWORD", "Use at least 8 characters and avoid common passwords", 400);
  const row = await db.prepare("SELECT password_hash, password_salt FROM users WHERE id = ?").bind(auth.id).first();
  if (!row) return apiError("INVALID_CREDENTIALS", "Current password is incorrect", 403);
  const storedIterations = passwordIterations(row.password_hash);
  if (storedIterations > PASSWORD_MAX_ITERATIONS) {
    const legacyProof = cleanText(body.legacyProof, 128);
    if (!legacyProof) {
      return apiError("PASSWORD_MIGRATION_PROOF_REQUIRED", "Nova needs to verify your current password on this device once.", 409, {
        salt: row.password_salt,
        iterations: storedIterations
      });
    }
    if (!constantTimeEqual(legacyProof, passwordDigest(row.password_hash))) {
      return apiError("INVALID_CREDENTIALS", "Current password is incorrect", 403);
    }
  } else if (!(await verifyPassword(current, row.password_salt, row.password_hash))) {
    return apiError("INVALID_CREDENTIALS", "Current password is incorrect", 403);
  }
  const salt = randomToken(16);
  const hash = await derivePassword(next, salt);
  const now = Date.now();
  await db.batch([
    db.prepare("UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?").bind(hash, salt, now, auth.id),
    db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ?").bind(now, auth.id)
  ]);
  const session = await createSession(db, auth.id, deviceIdFrom(request));
  return apiJson({ ok: true }, 200, { "Set-Cookie": sessionCookie(session.token) });
}

async function me(request, env) {
  const auth = await optionalUser(request, getDb(env));
  if (!auth) return apiJson({ user: null });
  const user = await loadUser(getDb(env), auth.id);
  return apiJson({ user: exposeMe(user) });
}

async function myProfile(request, db) {
  const auth = await requireUser(request, db);
  const user = await loadUser(db, auth.id);
  return apiJson({ profile: exposeProfile(user, true) });
}

async function updateProfile(request, db) {
  requireSameOrigin(request);
  const auth = await requireUser(request, db);
  await enforceUserRateLimit(db, auth.id, "profile-update", 20, 10 * 60 * 1000, 10 * 60 * 1000);
  const body = await readJson(request);
  const profile = {
    displayName: cleanText(body.displayName, 40),
    bio: cleanText(body.bio, 280),
    statusText: cleanText(body.statusText, 80),
    avatarUrl: cleanImageUrl(body.avatarUrl, 125000),
    bannerUrl: cleanUrl(body.bannerUrl, 2048),
    pronouns: cleanText(body.pronouns, 32),
    locationText: cleanText(body.locationText, 64),
    websiteUrl: cleanUrl(body.websiteUrl, 512),
    onlineVisibility: enumValue(body.onlineVisibility, ["everyone", "friends", "hidden"], "everyone"),
    activityVisibility: enumValue(body.activityVisibility, ["everyone", "friends", "hidden"], "friends")
  };
  const now = Date.now();
  await db.prepare(`INSERT INTO user_profiles(user_id, display_name, bio, status_text, avatar_url, banner_url, pronouns, location_text, website_url, online_visibility, activity_visibility, updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,bio=excluded.bio,status_text=excluded.status_text,avatar_url=excluded.avatar_url,banner_url=excluded.banner_url,pronouns=excluded.pronouns,location_text=excluded.location_text,website_url=excluded.website_url,online_visibility=excluded.online_visibility,activity_visibility=excluded.activity_visibility,updated_at=excluded.updated_at`)
    .bind(auth.id, profile.displayName, profile.bio, profile.statusText, profile.avatarUrl, profile.bannerUrl, profile.pronouns, profile.locationText, profile.websiteUrl, profile.onlineVisibility, profile.activityVisibility, now).run();
  const user = await loadUser(db, auth.id);
  return apiJson({ profile: exposeProfile(user, true) });
}

async function getSettings(request, db) {
  const auth = await requireUser(request, db);
  const row = await db.prepare("SELECT settings_json FROM user_settings WHERE user_id = ?").bind(auth.id).first();
  const stored = sanitizeSettings(parseJson(row?.settings_json, {}));
  return apiJson({ settings: stored && !Array.isArray(stored) ? stored : {} });
}

async function updateSettings(request, db) {
  requireSameOrigin(request);
  const auth = await requireUser(request, db);
  await enforceUserRateLimit(db, auth.id, "settings-update", 30, 10 * 60 * 1000, 10 * 60 * 1000);
  const body = await readJson(request);
  const sanitized = sanitizeSettings(body.settings);
  const settings = sanitized && !Array.isArray(sanitized) ? sanitized : {};
  const encoded = JSON.stringify(settings);
  if (encoded.length > 30000) return apiError("SETTINGS_TOO_LARGE", "Settings payload is too large", 413);
  await db.prepare("INSERT INTO user_settings(user_id, settings_json, updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET settings_json=excluded.settings_json,updated_at=excluded.updated_at").bind(auth.id, encoded, Date.now()).run();
  return apiJson({ settings });
}

function normalizeGameSlug(value) {
  const slug = String(value || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug.length >= 1 && slug.length <= 96 ? slug : "";
}

function exposeGameStats(row, myRating) {
  const count = Math.max(0, Number(row?.rating_count || 0));
  const sum = Math.max(0, Number(row?.rating_sum || 0));
  return {
    views: Math.max(0, Number(row?.views || 0)),
    avg: count ? Math.round((sum / count) * 100) / 100 : 0,
    count,
    myRating: Math.max(0, Math.min(5, Number(myRating || 0)))
  };
}

async function getGameStats(request, url, db) {
  const slugs = [...new Set(String(url.searchParams.get("slugs") || "").split(",").map(normalizeGameSlug).filter(Boolean))].slice(0, 50);
  if (!slugs.length) return apiJson({ stats: {} });
  const placeholders = slugs.map(() => "?").join(",");
  const rows = await db.prepare(`SELECT slug, views, rating_sum, rating_count FROM game_stats WHERE slug IN (${placeholders})`).bind(...slugs).all();
  const rowMap = new Map((rows.results || []).map(row => [row.slug, row]));
  const auth = await optionalUser(request, db);
  let ratingMap = new Map();
  if (auth) {
    const ratings = await db.prepare(`SELECT slug, rating FROM game_ratings WHERE user_id = ? AND slug IN (${placeholders})`).bind(auth.id, ...slugs).all();
    ratingMap = new Map((ratings.results || []).map(row => [row.slug, row.rating]));
  } else {
    const deviceId = deviceIdFrom(request);
    if (deviceId) {
      const ratings = await db.prepare(`SELECT slug, rating FROM game_guest_ratings WHERE device_id_hash = ? AND slug IN (${placeholders})`).bind(await sha256(deviceId), ...slugs).all();
      ratingMap = new Map((ratings.results || []).map(row => [row.slug, row.rating]));
    }
  }
  const stats = {};
  slugs.forEach(slug => { stats[slug] = exposeGameStats(rowMap.get(slug), ratingMap.get(slug)); });
  return apiJson({ stats });
}

async function rateGame(request, db) {
  requireSameOrigin(request);
  const auth = await optionalUser(request, db);
  const deviceId = deviceIdFrom(request);
  if (!auth && !deviceId) return apiError("DEVICE_REQUIRED", "Nova could not identify this device", 400);
  if (auth) await enforceUserRateLimit(db, auth.id, "game-rating", 80, 10 * 60 * 1000, 10 * 60 * 1000);
  else await enforceAuthRateLimit(request, db, "game-rating", 40, 10 * 60 * 1000, 10 * 60 * 1000);
  const body = await readJson(request);
  const slug = normalizeGameSlug(body.slug);
  const rating = Number(body.rating);
  if (!slug || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return apiError("INVALID_RATING", "Choose a rating from 1 to 5", 400);
  }
  const deviceHash = auth ? "" : await sha256(deviceId);
  const existing = auth
    ? await db.prepare("SELECT rating FROM game_ratings WHERE user_id = ? AND slug = ?").bind(auth.id, slug).first()
    : await db.prepare("SELECT rating FROM game_guest_ratings WHERE device_id_hash = ? AND slug = ?").bind(deviceHash, slug).first();
  const now = Date.now();
  const saveRating = auth
    ? (existing
      ? db.prepare("UPDATE game_ratings SET rating = ?, updated_at = ? WHERE user_id = ? AND slug = ?").bind(rating, now, auth.id, slug)
      : db.prepare("INSERT INTO game_ratings(user_id, slug, rating, updated_at) VALUES(?,?,?,?)").bind(auth.id, slug, rating, now))
    : (existing
      ? db.prepare("UPDATE game_guest_ratings SET rating = ?, updated_at = ? WHERE device_id_hash = ? AND slug = ?").bind(rating, now, deviceHash, slug)
      : db.prepare("INSERT INTO game_guest_ratings(device_id_hash, slug, rating, updated_at) VALUES(?,?,?,?)").bind(deviceHash, slug, rating, now));
  if (existing) {
    const delta = rating - Number(existing.rating || 0);
    await db.batch([
      saveRating,
      db.prepare(`INSERT INTO game_stats(slug, rating_sum, rating_count, updated_at) VALUES(?,?,1,?)
        ON CONFLICT(slug) DO UPDATE SET rating_sum = MAX(0, game_stats.rating_sum + ?), updated_at = excluded.updated_at`)
        .bind(slug, rating, now, delta)
    ]);
  } else {
    await db.batch([
      saveRating,
      db.prepare(`INSERT INTO game_stats(slug, rating_sum, rating_count, updated_at) VALUES(?,?,1,?)
        ON CONFLICT(slug) DO UPDATE SET rating_sum = game_stats.rating_sum + excluded.rating_sum, rating_count = game_stats.rating_count + 1, updated_at = excluded.updated_at`)
        .bind(slug, rating, now)
    ]);
  }
  const row = await db.prepare("SELECT views, rating_sum, rating_count FROM game_stats WHERE slug = ?").bind(slug).first();
  return apiJson({ slug, stats: exposeGameStats(row, rating) });
}

async function recordGameView(request, db) {
  requireSameOrigin(request);
  await enforceAuthRateLimit(request, db, "game-view", 120, 10 * 60 * 1000, 60 * 1000);
  const body = await readJson(request);
  const slug = normalizeGameSlug(body.slug);
  if (!slug) return apiError("INVALID_GAME", "Game identifier is invalid", 400);
  const now = Date.now();
  await db.prepare(`INSERT INTO game_stats(slug, views, updated_at) VALUES(?,1,?)
    ON CONFLICT(slug) DO UPDATE SET views = game_stats.views + 1, updated_at = excluded.updated_at`).bind(slug, now).run();
  const row = await db.prepare("SELECT views, rating_sum, rating_count FROM game_stats WHERE slug = ?").bind(slug).first();
  return apiJson({ slug, stats: exposeGameStats(row, 0) });
}

async function publicProfile(username, db) {
  const user = await loadUserByUsername(db, normalizeUsername(username));
  if (!user || user.account_status !== "active") return apiError("PROFILE_NOT_FOUND", "Profile not found", 404);
  if (user.online_visibility === "everyone") {
    const presence = await db.prepare("SELECT state,last_seen_at FROM user_presence WHERE user_id=?").bind(user.id).first();
    user.presence_state = presence && Date.now() - Number(presence.last_seen_at) < PRESENCE_FRESH_MS ? presence.state : "offline";
  } else user.presence_state = "hidden";
  return apiJson({ profile: exposeProfile(user, false) });
}

async function publicProfiles(url, db) {
  const usernames = (url.searchParams.get("usernames") || "").split(",").map(normalizeUsername).filter(Boolean).slice(0, 50);
  if (!usernames.length) return apiJson({ profiles: [] });
  const marks = usernames.map(() => "?").join(",");
  const result = await db.prepare(`${profileQuery()} WHERE lower(u.username) IN (${marks}) AND u.account_status = 'active'`).bind(...usernames).all();
  return apiJson({ profiles: (result.results || []).map(row => exposeProfile(row, false)) });
}

async function getActivity(request, db) {
  const auth = await requireUser(request, db);
  const result = await db.prepare("SELECT content_type AS contentType, content_id AS contentId, title, artwork_url AS artworkUrl, progress, last_opened_at AS lastOpenedAt FROM user_activity WHERE user_id = ? ORDER BY last_opened_at DESC LIMIT 24").bind(auth.id).all();
  return apiJson({ activity: result.results || [] });
}

async function saveActivity(request, db) {
  requireSameOrigin(request);
  const auth = await requireUser(request, db);
  await enforceUserRateLimit(db, auth.id, "activity", 120, 10 * 60 * 1000, 5 * 60 * 1000);
  const body = await readJson(request);
  const type = enumValue(body.contentType, ["game", "app", "movie", "page"], "page");
  const contentId = cleanText(body.contentId, 120);
  if (!contentId) return apiError("INVALID_ACTIVITY", "Content id is required", 400);
  await db.prepare(`INSERT INTO user_activity(user_id,content_type,content_id,title,artwork_url,progress,last_opened_at) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(user_id,content_type,content_id) DO UPDATE SET title=excluded.title,artwork_url=excluded.artwork_url,progress=excluded.progress,last_opened_at=excluded.last_opened_at`)
    .bind(auth.id, type, contentId, cleanText(body.title, 120), cleanUrl(body.artworkUrl, 2048), clampNumber(body.progress, 0, 1), Date.now()).run();
  return apiJson({ ok: true });
}

function unoCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("");
}

async function ensureUnoSchema(db) {
  if (!unoSchemaReady) unoSchemaReady = db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS uno_lobbies (id TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE,owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'lobby' CHECK(status IN ('lobby','playing','finished')),state_json TEXT NOT NULL DEFAULT '{}',version INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS uno_lobbies_code_idx ON uno_lobbies(code,updated_at DESC)"),
    db.prepare("CREATE TABLE IF NOT EXISTS uno_lobby_members (lobby_id TEXT NOT NULL REFERENCES uno_lobbies(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,seat INTEGER NOT NULL,joined_at INTEGER NOT NULL,PRIMARY KEY(lobby_id,user_id),UNIQUE(lobby_id,seat))"),
    db.prepare("CREATE TABLE IF NOT EXISTS uno_lobby_invites (lobby_id TEXT NOT NULL REFERENCES uno_lobbies(id) ON DELETE CASCADE,invited_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at INTEGER NOT NULL,PRIMARY KEY(lobby_id,invited_user_id))"),
    db.prepare("CREATE INDEX IF NOT EXISTS uno_invites_user_idx ON uno_lobby_invites(invited_user_id,created_at DESC)")
  ]).catch(error => { unoSchemaReady = null; throw error; });
  return unoSchemaReady;
}

async function ensureCheckersSchema(db) {
  if (!checkersSchemaReady) checkersSchemaReady = db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS checkers_matches (id TEXT PRIMARY KEY,red_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,black_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'playing' CHECK(status IN ('playing','finished')),winner_id TEXT,state_json TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS checkers_red_updated_idx ON checkers_matches(red_user_id,updated_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS checkers_black_updated_idx ON checkers_matches(black_user_id,updated_at DESC)")
  ]).catch(error => { checkersSchemaReady = null; throw error; });
  return checkersSchemaReady;
}

function checkersBoard() {
  const board = Array(64).fill("");
  for (let row = 0; row < 3; row++) for (let col = 0; col < 8; col++) if ((row + col) % 2) board[row * 8 + col] = "b";
  for (let row = 5; row < 8; row++) for (let col = 0; col < 8; col++) if ((row + col) % 2) board[row * 8 + col] = "r";
  return board;
}

function checkersColor(piece) { const value = String(piece || "").toLowerCase(); return value === "r" ? "red" : value === "b" ? "black" : ""; }
function checkersDirections(piece) { return piece === piece.toUpperCase() ? [-1, 1] : (checkersColor(piece) === "red" ? [-1] : [1]); }
function checkersMoves(board, from, capturesOnly) {
  const piece = board[from]; if (!piece) return [];
  const row = Math.floor(from / 8), col = from % 8, moves = [];
  for (const dr of checkersDirections(piece)) for (const dc of [-1, 1]) {
    const nearRow = row + dr, nearCol = col + dc;
    if (nearRow < 0 || nearRow > 7 || nearCol < 0 || nearCol > 7) continue;
    const near = nearRow * 8 + nearCol;
    if (!board[near] && !capturesOnly) moves.push({ from, to: near, capture: -1 });
    else if (board[near] && checkersColor(board[near]) !== checkersColor(piece)) {
      const farRow = row + dr * 2, farCol = col + dc * 2;
      if (farRow >= 0 && farRow < 8 && farCol >= 0 && farCol < 8 && !board[farRow * 8 + farCol]) moves.push({ from, to: farRow * 8 + farCol, capture: near });
    }
  }
  return capturesOnly ? moves.filter(move => move.capture >= 0) : moves;
}

function checkersAllMoves(board, color) {
  const captures = [], normal = [];
  board.forEach((piece, from) => { if (checkersColor(piece) !== color) return; const moves = checkersMoves(board, from, false); moves.forEach(move => (move.capture >= 0 ? captures : normal).push(move)); });
  return captures.length ? captures : normal;
}

function checkersRow(db, id) {
  return db.prepare("SELECT c.*,ru.username AS red_username,COALESCE(rp.display_name,ru.username) AS red_display_name,COALESCE(rp.avatar_url,'') AS red_avatar_url,bu.username AS black_username,COALESCE(bp.display_name,bu.username) AS black_display_name,COALESCE(bp.avatar_url,'') AS black_avatar_url FROM checkers_matches c JOIN users ru ON ru.id=c.red_user_id JOIN users bu ON bu.id=c.black_user_id LEFT JOIN user_profiles rp ON rp.user_id=ru.id LEFT JOIN user_profiles bp ON bp.user_id=bu.id WHERE c.id=? LIMIT 1").bind(id).first();
}

function exposeCheckersMatch(row, userId) {
  const players = [{ userId: row.red_user_id, username: row.red_username, displayName: row.red_display_name, avatarUrl: row.red_avatar_url, color: "red" },{ userId: row.black_user_id, username: row.black_username, displayName: row.black_display_name, avatarUrl: row.black_avatar_url, color: "black" }];
  const state = parseJson(row.state_json, {});
  return { id: row.id, status: row.status, version: Number(row.version), winnerId: row.winner_id || "", redUserId: row.red_user_id, blackUserId: row.black_user_id, currentUserId: state.turn === "red" ? row.red_user_id : row.black_user_id, turn: state.turn || "red", forcedFrom: Number.isInteger(state.forcedFrom) ? state.forcedFrom : -1, board: Array.isArray(state.board) ? state.board : checkersBoard(), lastMove: state.lastMove || null, players, viewerId: userId, updatedAt: Number(row.updated_at) };
}

async function createCheckersSocialInvite(request, db) {
  requireSameOrigin(request);
  const auth = await requireSocialUser(request, db);
  await enforceUserRateLimit(db, auth.id, "checkers-create", 20, 10 * 60 * 1000, 10 * 60 * 1000);
  const body = await readJson(request), username = normalizeUsername(body.username);
  const target = await loadUserByUsername(db, username);
  if (!target || target.id === auth.id) return apiError("USER_NOT_FOUND", "Choose a Nova friend to play", 404);
  const friend = await db.prepare("SELECT 1 FROM friendships WHERE status='accepted' AND ((requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)) LIMIT 1").bind(auth.id,target.id,target.id,auth.id).first();
  if (!friend || await isBlockedBetween(db, auth.id, target.id)) return apiError("FRIENDS_ONLY", "Checkers can only be started with an accepted friend", 403);
  const id = "chk_" + randomId(), now = Date.now(), state = { board: checkersBoard(), turn: "red", forcedFrom: -1, lastMove: null };
  await db.prepare("INSERT INTO checkers_matches(id,red_user_id,black_user_id,status,winner_id,state_json,version,created_at,updated_at) VALUES(?,?,?,'playing',NULL,?,1,?,?)").bind(id,auth.id,target.id,JSON.stringify(state),now,now).run();
  const row = await checkersRow(db, id);
  return apiJson({ match: exposeCheckersMatch(row, auth.id) }, 201);
}

async function getCheckersMatch(request, url, db) {
  const auth = await requireSocialUser(request, db), id = cleanText(url.searchParams.get("id"), 80);
  const row = await checkersRow(db, id);
  if (!row) return apiError("MATCH_NOT_FOUND", "That Checkers match is no longer available", 404);
  if (![row.red_user_id,row.black_user_id].includes(auth.id)) return apiError("MATCH_ACCESS", "This is a private Checkers match", 403);
  return apiJson({ match: exposeCheckersMatch(row, auth.id) });
}

async function checkersAction(request, db) {
  requireSameOrigin(request);
  const auth = await requireSocialUser(request, db), body = await readJson(request), matchId = cleanText(body.matchId, 80);
  const action = enumValue(body.action, ["move","resign","replay"], "move");
  const row = await checkersRow(db, matchId);
  if (!row) return apiError("MATCH_NOT_FOUND", "That Checkers match no longer exists", 404);
  if (![row.red_user_id,row.black_user_id].includes(auth.id)) return apiError("MATCH_ACCESS", "This is a private Checkers match", 403);
  let state = parseJson(row.state_json, {}), status = row.status, winnerId = row.winner_id || null;
  if (action === "replay") {
    if (row.status !== "finished") return apiError("MATCH_ACTIVE", "Finish this match first", 409);
    state = { board: checkersBoard(), turn: row.winner_id === row.red_user_id ? "black" : "red", forcedFrom: -1, lastMove: null }; status = "playing"; winnerId = null;
  } else if (action === "resign") {
    if (row.status !== "playing") return apiError("MATCH_FINISHED", "This match is already finished", 409);
    winnerId = auth.id === row.red_user_id ? row.black_user_id : row.red_user_id; status = "finished"; state.forcedFrom = -1;
  } else {
    if (row.status !== "playing") return apiError("MATCH_FINISHED", "This match is already finished", 409);
    const color = auth.id === row.red_user_id ? "red" : "black";
    if (state.turn !== color) return apiError("NOT_YOUR_TURN", "Wait for your friend to move", 409);
    const board = Array.isArray(state.board) ? state.board.slice(0,64) : checkersBoard(), from = Number(body.from), to = Number(body.to);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > 63 || to < 0 || to > 63 || checkersColor(board[from]) !== color) return apiError("INVALID_MOVE", "Choose one of your pieces", 409);
    const legal = Number.isInteger(state.forcedFrom) && state.forcedFrom >= 0 ? checkersMoves(board, state.forcedFrom, true) : checkersAllMoves(board, color);
    const move = legal.find(candidate => candidate.from === from && candidate.to === to);
    if (!move) return apiError("INVALID_MOVE", legal.some(candidate => candidate.capture >= 0) ? "A capture is available and must be taken" : "That piece cannot move there", 409);
    let piece = board[from]; board[from] = ""; if (move.capture >= 0) board[move.capture] = "";
    const destinationRow = Math.floor(to / 8), promoted = piece === piece.toLowerCase() && ((color === "red" && destinationRow === 0) || (color === "black" && destinationRow === 7));
    if (promoted) piece = piece.toUpperCase(); board[to] = piece;
    const moreCaptures = move.capture >= 0 && !promoted ? checkersMoves(board, to, true) : [];
    state.board = board; state.forcedFrom = moreCaptures.length ? to : -1; state.lastMove = { from, to, capture: move.capture, promoted };
    if (!moreCaptures.length) state.turn = color === "red" ? "black" : "red";
    const opponent = color === "red" ? "black" : "red", opponentId = color === "red" ? row.black_user_id : row.red_user_id;
    if (!board.some(item => checkersColor(item) === opponent) || !checkersAllMoves(board, opponent).length) { status = "finished"; winnerId = auth.id; state.forcedFrom = -1; }
    else if (moreCaptures.length) winnerId = null;
    else winnerId = null;
    if (status === "finished" && !winnerId) winnerId = opponentId;
  }
  const result = await db.prepare("UPDATE checkers_matches SET status=?,winner_id=?,state_json=?,version=version+1,updated_at=? WHERE id=? AND version=?").bind(status,winnerId,JSON.stringify(state),Date.now(),matchId,row.version).run();
  if (!result.meta?.changes) return apiError("GAME_CHANGED", "The board changed—try again", 409);
  const updated = await checkersRow(db, matchId);
  return apiJson({ match: exposeCheckersMatch(updated, auth.id) });
}

async function ensureChessSchema(db) {
  if (!chessSchemaReady) chessSchemaReady = db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS chess_matches (id TEXT PRIMARY KEY,white_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,black_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'playing' CHECK(status IN ('playing','finished')),winner_id TEXT,state_json TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS chess_white_updated_idx ON chess_matches(white_user_id,updated_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS chess_black_updated_idx ON chess_matches(black_user_id,updated_at DESC)")
  ]).catch(error => { chessSchemaReady = null; throw error; });
  return chessSchemaReady;
}

function chessInitialState() {
  const board = "rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR".split("");
  return { board, turn: "white", castling: "KQkq", enPassant: -1, halfmove: 0, lastMove: null, result: "", positions: {} };
}
function chessColor(piece) { if (!piece || piece === ".") return ""; return piece === piece.toUpperCase() ? "white" : "black"; }
function chessEnemy(color) { return color === "white" ? "black" : "white"; }
function chessInside(row,col) { return row >= 0 && row < 8 && col >= 0 && col < 8; }
function chessAttacked(board, square, byColor) {
  const row = Math.floor(square / 8), col = square % 8, pawnRow = row + (byColor === "white" ? 1 : -1), pawn = byColor === "white" ? "P" : "p";
  for (const dc of [-1,1]) if (chessInside(pawnRow,col+dc) && board[pawnRow*8+col+dc] === pawn) return true;
  const knight = byColor === "white" ? "N" : "n";
  for (const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) if (chessInside(row+dr,col+dc) && board[(row+dr)*8+col+dc] === knight) return true;
  const king = byColor === "white" ? "K" : "k";
  for (const dr of [-1,0,1]) for (const dc of [-1,0,1]) if ((dr || dc) && chessInside(row+dr,col+dc) && board[(row+dr)*8+col+dc] === king) return true;
  for (const [dr,dc,types] of [[-1,0,"rq"],[1,0,"rq"],[0,-1,"rq"],[0,1,"rq"],[-1,-1,"bq"],[-1,1,"bq"],[1,-1,"bq"],[1,1,"bq"]]) {
    let r = row + dr, c = col + dc;
    while (chessInside(r,c)) {
      const piece = board[r*8+c];
      if (piece !== ".") {
        if (chessColor(piece) === byColor && types.includes(piece.toLowerCase())) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }
  return false;
}
function chessInCheck(board,color) { const king = color === "white" ? "K" : "k", square = board.indexOf(king); return square < 0 || chessAttacked(board,square,chessEnemy(color)); }
function chessPseudo(state,from) {
  const board=state.board,piece=board[from],color=chessColor(piece); if (!color) return [];
  const row=Math.floor(from/8),col=from%8,type=piece.toLowerCase(),moves=[];
  const add=(to,special="")=>{ if (to<0||to>63) return; const target=board[to]; if (target === "." || chessColor(target) !== color) moves.push({from,to,special}); };
  if (type === "p") {
    const dr=color === "white"?-1:1,one=(row+dr)*8+col,start=color === "white"?6:1;
    if (chessInside(row+dr,col) && board[one] === ".") { add(one); const two=(row+dr*2)*8+col; if (row===start && board[two] === ".") add(two,"double"); }
    for (const dc of [-1,1]) if (chessInside(row+dr,col+dc)) { const to=(row+dr)*8+col+dc;if ((board[to]!=="."&&chessColor(board[to])!==color)||to===state.enPassant)add(to,to===state.enPassant?"en-passant":""); }
  } else if (type === "n") {
    for (const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) if (chessInside(row+dr,col+dc)) add((row+dr)*8+col+dc);
  }
  else if (["b","r","q"].includes(type)) {
    const directions = type === "b" ? [[-1,-1],[-1,1],[1,-1],[1,1]] : type === "r" ? [[-1,0],[1,0],[0,-1],[0,1]] : [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
    for (const [dr,dc] of directions) { let r=row+dr,c=col+dc;while(chessInside(r,c)){const to=r*8+c;if(board[to]===".")moves.push({from,to,special:""});else{if(chessColor(board[to])!==color)moves.push({from,to,special:""});break}r+=dr;c+=dc;} }
  } else if (type === "k") {
    for (const dr of [-1,0,1]) for (const dc of [-1,0,1]) if ((dr||dc)&&chessInside(row+dr,col+dc)) add((row+dr)*8+col+dc);
    const home=color==="white"?60:4,enemy=chessEnemy(color),rights=state.castling||"";
    if (from===home&&!chessInCheck(board,color)) {
      const kingRight=color==="white"?"K":"k",queenRight=color==="white"?"Q":"q";
      if(rights.includes(kingRight)&&board[home+1]==="."&&board[home+2]==="."&&!chessAttacked(board,home+1,enemy)&&!chessAttacked(board,home+2,enemy))moves.push({from,to:home+2,special:"castle-k"});
      if(rights.includes(queenRight)&&board[home-1]==="."&&board[home-2]==="."&&board[home-3]==="."&&!chessAttacked(board,home-1,enemy)&&!chessAttacked(board,home-2,enemy))moves.push({from,to:home-2,special:"castle-q"});
    }
  }
  return moves;
}
function chessApply(state,move,promotion) {
  const next={...state,board:state.board.slice(),positions:{...(state.positions||{})}},piece=next.board[move.from],color=chessColor(piece),captured=next.board[move.to];
  next.board[move.from]=".";next.board[move.to]=piece;
  if(move.special==="en-passant")next.board[move.to+(color==="white"?8:-8)]=".";
  if(move.special==="castle-k"){next.board[move.to-1]=next.board[move.to+1];next.board[move.to+1]="."}
  if(move.special==="castle-q"){next.board[move.to+1]=next.board[move.to-2];next.board[move.to-2]="."}
  const endRow=Math.floor(move.to/8);if(piece.toLowerCase()==="p"&&(endRow===0||endRow===7)){const chosen=["q","r","b","n"].includes(promotion)?promotion:"q";next.board[move.to]=color==="white"?chosen.toUpperCase():chosen;}
  let rights=String(next.castling||"");if(piece==="K")rights=rights.replace(/[KQ]/g,"");if(piece==="k")rights=rights.replace(/[kq]/g,"");
  [[63,"K"],[56,"Q"],[7,"k"],[0,"q"]].forEach(([square,right])=>{if(move.from===square||move.to===square)rights=rights.replace(right,"")});next.castling=rights;
  next.enPassant=move.special==="double"?(move.from+move.to)/2:-1;next.halfmove=piece.toLowerCase()==="p"||captured!=="."||move.special==="en-passant"?0:Number(next.halfmove||0)+1;next.lastMove={from:move.from,to:move.to};next.turn=chessEnemy(color);return next;
}
function chessLegalMoves(state,color) { const moves=[];state.board.forEach((piece,from)=>{if(chessColor(piece)!==color)return;chessPseudo(state,from).forEach(move=>{const next=chessApply(state,move,"q");if(!chessInCheck(next.board,color))moves.push(move)})});return moves; }
function chessPositionKey(state){return state.board.join("")+"|"+state.turn+"|"+(state.castling||"")+"|"+state.enPassant;}
function chessInsufficient(board){const material=[];board.forEach((piece,square)=>{if(piece!=="."&&piece.toLowerCase()!=="k")material.push({type:piece.toLowerCase(),square})});if(material.some(item=>["p","q","r"].includes(item.type)))return false;if(material.length<=1)return true;return material.every(item=>item.type==="b")&&new Set(material.map(item=>(Math.floor(item.square/8)+item.square%8)%2)).size===1;}
function chessRow(db,id){return db.prepare("SELECT c.*,wu.username AS white_username,COALESCE(wp.display_name,wu.username) AS white_display_name,COALESCE(wp.avatar_url,'') AS white_avatar_url,bu.username AS black_username,COALESCE(bp.display_name,bu.username) AS black_display_name,COALESCE(bp.avatar_url,'') AS black_avatar_url FROM chess_matches c JOIN users wu ON wu.id=c.white_user_id JOIN users bu ON bu.id=c.black_user_id LEFT JOIN user_profiles wp ON wp.user_id=wu.id LEFT JOIN user_profiles bp ON bp.user_id=bu.id WHERE c.id=? LIMIT 1").bind(id).first();}
function exposeChessMatch(row,userId){const state=parseJson(row.state_json,{}),players=[{userId:row.white_user_id,username:row.white_username,displayName:row.white_display_name,avatarUrl:row.white_avatar_url,color:"white"},{userId:row.black_user_id,username:row.black_username,displayName:row.black_display_name,avatarUrl:row.black_avatar_url,color:"black"}];return{id:row.id,status:row.status,version:Number(row.version),winnerId:row.winner_id||"",whiteUserId:row.white_user_id,blackUserId:row.black_user_id,currentUserId:state.turn==="white"?row.white_user_id:row.black_user_id,turn:state.turn||"white",board:Array.isArray(state.board)?state.board:chessInitialState().board,castling:state.castling||"",enPassant:Number.isInteger(state.enPassant)?state.enPassant:-1,lastMove:state.lastMove||null,result:state.result||"",inCheck:chessInCheck(Array.isArray(state.board)?state.board:chessInitialState().board,state.turn||"white"),players,viewerId:userId,updatedAt:Number(row.updated_at)}}
async function createChessSocialInvite(request,db){requireSameOrigin(request);const auth=await requireSocialUser(request,db);await enforceUserRateLimit(db,auth.id,"chess-create",20,10*60*1000,10*60*1000);const body=await readJson(request),target=await loadUserByUsername(db,normalizeUsername(body.username));if(!target||target.id===auth.id)return apiError("USER_NOT_FOUND","Choose a Nova friend to play",404);const friend=await db.prepare("SELECT 1 FROM friendships WHERE status='accepted' AND ((requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)) LIMIT 1").bind(auth.id,target.id,target.id,auth.id).first();if(!friend||await isBlockedBetween(db,auth.id,target.id))return apiError("FRIENDS_ONLY","Chess can only be started with an accepted friend",403);const id="chs_"+randomId(),now=Date.now(),state=chessInitialState(),key=chessPositionKey(state);state.positions[key]=1;await db.prepare("INSERT INTO chess_matches(id,white_user_id,black_user_id,status,winner_id,state_json,version,created_at,updated_at) VALUES(?,?,?,'playing',NULL,?,1,?,?)").bind(id,auth.id,target.id,JSON.stringify(state),now,now).run();const row=await chessRow(db,id);return apiJson({match:exposeChessMatch(row,auth.id)},201)}
async function getChessMatch(request,url,db){const auth=await requireSocialUser(request,db),id=cleanText(url.searchParams.get("id"),80),row=await chessRow(db,id);if(!row)return apiError("MATCH_NOT_FOUND","That Chess match is no longer available",404);if(![row.white_user_id,row.black_user_id].includes(auth.id))return apiError("MATCH_ACCESS","This is a private Chess match",403);return apiJson({match:exposeChessMatch(row,auth.id)})}
async function chessAction(request,db){requireSameOrigin(request);const auth=await requireSocialUser(request,db),body=await readJson(request),matchId=cleanText(body.matchId,80),action=enumValue(body.action,["move","resign","replay"],"move"),row=await chessRow(db,matchId);if(!row)return apiError("MATCH_NOT_FOUND","That Chess match no longer exists",404);if(![row.white_user_id,row.black_user_id].includes(auth.id))return apiError("MATCH_ACCESS","This is a private Chess match",403);let state=parseJson(row.state_json,{}),status=row.status,winnerId=row.winner_id||null;
  if(action==="replay"){if(status!=="finished")return apiError("MATCH_ACTIVE","Finish this match first",409);state=chessInitialState();state.positions[chessPositionKey(state)]=1;status="playing";winnerId=null;}
  else if(action==="resign"){if(status!=="playing")return apiError("MATCH_FINISHED","This match is already finished",409);winnerId=auth.id===row.white_user_id?row.black_user_id:row.white_user_id;status="finished";state.result="resignation";}
  else{if(status!=="playing")return apiError("MATCH_FINISHED","This match is already finished",409);const color=auth.id===row.white_user_id?"white":"black";if(state.turn!==color)return apiError("NOT_YOUR_TURN","Wait for your friend to move",409);const from=Number(body.from),to=Number(body.to),legal=chessLegalMoves(state,color),move=legal.find(item=>item.from===from&&item.to===to);if(!move)return apiError("INVALID_MOVE","That piece cannot move there",409);state=chessApply(state,move,enumValue(body.promotion,["q","r","b","n"],"q"));const key=chessPositionKey(state);state.positions[key]=Number(state.positions[key]||0)+1;const replies=chessLegalMoves(state,state.turn);if(!replies.length){status="finished";if(chessInCheck(state.board,state.turn)){winnerId=auth.id;state.result="checkmate"}else{winnerId=null;state.result="stalemate"}}else if(state.halfmove>=100){status="finished";winnerId=null;state.result="fifty-move"}else if(state.positions[key]>=3){status="finished";winnerId=null;state.result="repetition"}else if(chessInsufficient(state.board)){status="finished";winnerId=null;state.result="insufficient-material"}}
  const result=await db.prepare("UPDATE chess_matches SET status=?,winner_id=?,state_json=?,version=version+1,updated_at=? WHERE id=? AND version=?").bind(status,winnerId,JSON.stringify(state),Date.now(),matchId,row.version).run();if(!result.meta?.changes)return apiError("GAME_CHANGED","The board changed—try again",409);const updated=await chessRow(db,matchId);return apiJson({match:exposeChessMatch(updated,auth.id)})}

async function ensureConnect4Schema(db) {
  if (!connect4SchemaReady) connect4SchemaReady = db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS connect4_matches (id TEXT PRIMARY KEY,red_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,yellow_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'playing' CHECK(status IN ('playing','finished')),winner_id TEXT,state_json TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS connect4_red_updated_idx ON connect4_matches(red_user_id,updated_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS connect4_yellow_updated_idx ON connect4_matches(yellow_user_id,updated_at DESC)")
  ]).catch(error => { connect4SchemaReady = null; throw error; });
  return connect4SchemaReady;
}

function connect4InitialState() { return { board: Array(42).fill(""), turn: "red", lastMove: null, winning: [], result: "" }; }
function connect4Win(board, index, color) {
  const row = Math.floor(index / 7), col = index % 7;
  for (const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]) {
    const line = [index];
    for (const sign of [-1,1]) { let r=row+dr*sign,c=col+dc*sign;while(r>=0&&r<6&&c>=0&&c<7&&board[r*7+c]===color){line.push(r*7+c);r+=dr*sign;c+=dc*sign;} }
    if (line.length >= 4) return line.sort((a,b)=>a-b);
  }
  return [];
}
function connect4Row(db,id){return db.prepare("SELECT c.*,ru.username AS red_username,COALESCE(rp.display_name,ru.username) AS red_display_name,COALESCE(rp.avatar_url,'') AS red_avatar_url,yu.username AS yellow_username,COALESCE(yp.display_name,yu.username) AS yellow_display_name,COALESCE(yp.avatar_url,'') AS yellow_avatar_url FROM connect4_matches c JOIN users ru ON ru.id=c.red_user_id JOIN users yu ON yu.id=c.yellow_user_id LEFT JOIN user_profiles rp ON rp.user_id=ru.id LEFT JOIN user_profiles yp ON yp.user_id=yu.id WHERE c.id=? LIMIT 1").bind(id).first();}
function exposeConnect4Match(row,userId){const state=parseJson(row.state_json,{}),players=[{userId:row.red_user_id,username:row.red_username,displayName:row.red_display_name,avatarUrl:row.red_avatar_url,color:"red"},{userId:row.yellow_user_id,username:row.yellow_username,displayName:row.yellow_display_name,avatarUrl:row.yellow_avatar_url,color:"yellow"}];return{id:row.id,status:row.status,version:Number(row.version),winnerId:row.winner_id||"",redUserId:row.red_user_id,yellowUserId:row.yellow_user_id,currentUserId:state.turn==="red"?row.red_user_id:row.yellow_user_id,turn:state.turn||"red",board:Array.isArray(state.board)?state.board:connect4InitialState().board,lastMove:state.lastMove||null,winning:Array.isArray(state.winning)?state.winning:[],result:state.result||"",players,viewerId:userId,updatedAt:Number(row.updated_at)}}
async function createConnect4SocialInvite(request,db){requireSameOrigin(request);const auth=await requireSocialUser(request,db);await enforceUserRateLimit(db,auth.id,"connect4-create",20,10*60*1000,10*60*1000);const body=await readJson(request),target=await loadUserByUsername(db,normalizeUsername(body.username));if(!target||target.id===auth.id)return apiError("USER_NOT_FOUND","Choose a Nova friend to play",404);const friend=await db.prepare("SELECT 1 FROM friendships WHERE status='accepted' AND ((requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)) LIMIT 1").bind(auth.id,target.id,target.id,auth.id).first();if(!friend||await isBlockedBetween(db,auth.id,target.id))return apiError("FRIENDS_ONLY","Connect Four can only be started with an accepted friend",403);const id="c4_"+randomId(),now=Date.now(),state=connect4InitialState();await db.prepare("INSERT INTO connect4_matches(id,red_user_id,yellow_user_id,status,winner_id,state_json,version,created_at,updated_at) VALUES(?,?,?,'playing',NULL,?,1,?,?)").bind(id,auth.id,target.id,JSON.stringify(state),now,now).run();const row=await connect4Row(db,id);return apiJson({match:exposeConnect4Match(row,auth.id)},201)}
async function getConnect4Match(request,url,db){const auth=await requireSocialUser(request,db),id=cleanText(url.searchParams.get("id"),80),row=await connect4Row(db,id);if(!row)return apiError("MATCH_NOT_FOUND","That Connect Four match is no longer available",404);if(![row.red_user_id,row.yellow_user_id].includes(auth.id))return apiError("MATCH_ACCESS","This is a private Connect Four match",403);return apiJson({match:exposeConnect4Match(row,auth.id)})}
async function connect4Action(request,db){requireSameOrigin(request);const auth=await requireSocialUser(request,db),body=await readJson(request),matchId=cleanText(body.matchId,80),action=enumValue(body.action,["drop","resign","replay"],"drop"),row=await connect4Row(db,matchId);if(!row)return apiError("MATCH_NOT_FOUND","That Connect Four match no longer exists",404);if(![row.red_user_id,row.yellow_user_id].includes(auth.id))return apiError("MATCH_ACCESS","This is a private Connect Four match",403);let state=parseJson(row.state_json,{}),status=row.status,winnerId=row.winner_id||null;
  if(action==="replay"){if(status!=="finished")return apiError("MATCH_ACTIVE","Finish this match first",409);state=connect4InitialState();state.turn=row.winner_id===row.red_user_id?"yellow":"red";status="playing";winnerId=null;}
  else if(action==="resign"){if(status!=="playing")return apiError("MATCH_FINISHED","This match is already finished",409);winnerId=auth.id===row.red_user_id?row.yellow_user_id:row.red_user_id;status="finished";state.result="resignation";}
  else{if(status!=="playing")return apiError("MATCH_FINISHED","This match is already finished",409);const color=auth.id===row.red_user_id?"red":"yellow";if(state.turn!==color)return apiError("NOT_YOUR_TURN","Wait for your friend to move",409);const column=Number(body.column);if(!Number.isInteger(column)||column<0||column>6)return apiError("INVALID_COLUMN","Choose a column",409);const board=Array.isArray(state.board)?state.board.slice(0,42):connect4InitialState().board;let index=-1;for(let rowIndex=5;rowIndex>=0;rowIndex--){const candidate=rowIndex*7+column;if(!board[candidate]){index=candidate;break}}if(index<0)return apiError("COLUMN_FULL","That column is full",409);board[index]=color;state.board=board;state.lastMove={column,index};state.winning=connect4Win(board,index,color);if(state.winning.length){status="finished";winnerId=auth.id;state.result="connect-four"}else if(board.every(Boolean)){status="finished";winnerId=null;state.result="draw"}else state.turn=color==="red"?"yellow":"red";}
  const result=await db.prepare("UPDATE connect4_matches SET status=?,winner_id=?,state_json=?,version=version+1,updated_at=? WHERE id=? AND version=?").bind(status,winnerId,JSON.stringify(state),Date.now(),matchId,row.version).run();if(!result.meta?.changes)return apiError("GAME_CHANGED","The board changed—try again",409);const updated=await connect4Row(db,matchId);return apiJson({match:exposeConnect4Match(updated,auth.id)})}

function unoDeck() {
  const deck = [];
  for (const color of ["red", "yellow", "green", "blue"]) {
    deck.push({ color, value: "0" });
    for (const value of ["1","2","3","4","5","6","7","8","9","skip","reverse","draw2"]) {
      deck.push({ color, value }, { color, value });
    }
  }
  for (let index = 0; index < 4; index++) deck.push({ color: "wild", value: "wild" }, { color: "wild", value: "wild4" });
  for (let index = deck.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[other]] = [deck[other], deck[index]];
  }
  return deck;
}

function unoNext(state, steps) {
  const length = state.order.length;
  state.turn = (state.turn + state.direction * (steps || 1) + length * 4) % length;
}

function unoCanPlay(card, state) {
  const top = state.discard[state.discard.length - 1];
  if (Number(state.pendingDraw || 0) > 0) {
    return top.value === "wild4" ? card.value === "wild4" : ["draw2", "wild4"].includes(card.value);
  }
  return card.color === "wild" || card.color === state.color || card.value === top.value;
}

async function unoMembers(db, lobbyId) {
  const result = await db.prepare(`SELECT m.user_id AS userId,m.seat,u.username,COALESCE(NULLIF(p.display_name,''),u.username) AS displayName,
    COALESCE(p.avatar_url,'') AS avatarUrl FROM uno_lobby_members m JOIN users u ON u.id=m.user_id
    LEFT JOIN user_profiles p ON p.user_id=u.id WHERE m.lobby_id=? ORDER BY m.seat`).bind(lobbyId).all();
  return result.results || [];
}

async function exposeUnoLobby(db, row, userId, knownMembers) {
  const state = parseJson(row.state_json, {});
  const members = knownMembers || await unoMembers(db, row.id);
  const hand = state.hands?.[userId] || [];
  return {
    id: row.id, code: row.code, ownerId: row.owner_id, status: row.status, version: row.version,
    members: members.map(member => ({ ...member, cardCount: (state.hands?.[member.userId] || []).length })),
    hand,
    topCard: state.discard?.[state.discard.length - 1] || null,
    activeColor: state.color || "",
    currentUserId: state.order?.[state.turn] || "",
    direction: state.direction || 1,
    winnerId: state.winnerId || "",
    pendingDraw: Number(state.pendingDraw || 0),
    unoPendingUserId: state.unoPendingUserId || "",
    unoCalledUserId: state.unoCalledUserId || "",
    unoEvent: state.unoEvent || "",
    unoEventType: state.unoEventType || "",
    unoEventUserId: state.unoEventUserId || ""
  };
}

async function getUnoLobby(request, url, db) {
  const auth = await requireSocialUser(request, db);
  const id = cleanText(url.searchParams.get("id"), 80);
  const code = cleanText(url.searchParams.get("code"), 6).toUpperCase();
  const knownVersion = Number(url.searchParams.get("version"));
  const row = id
    ? await db.prepare("SELECT l.*,EXISTS(SELECT 1 FROM uno_lobby_members mine WHERE mine.lobby_id=l.id AND mine.user_id=?) AS is_member FROM uno_lobbies l WHERE l.id=?").bind(auth.id,id).first()
    : await db.prepare("SELECT l.*,EXISTS(SELECT 1 FROM uno_lobby_members mine WHERE mine.lobby_id=l.id AND mine.user_id=?) AS is_member FROM uno_lobbies l WHERE l.code=?").bind(auth.id,code).first();
  if (!row) return apiError("LOBBY_NOT_FOUND", "That lobby could not be found", 404);
  if (!row.is_member) return apiError("LOBBY_ACCESS", "Join this lobby before viewing it", 403);
  if (Number.isFinite(knownVersion) && knownVersion === Number(row.version)) return apiJson({ unchanged: true, version: Number(row.version) });
  return apiJson({ lobby: await exposeUnoLobby(db, row, auth.id) });
}

async function createUnoLobby(request, db) {
  requireSameOrigin(request);
  const auth = await requireSocialUser(request, db);
  await enforceUserRateLimit(db, auth.id, "uno-create", 12, 10 * 60 * 1000, 10 * 60 * 1000);
  const id = "uno_" + randomId();
  let code = unoCode();
  for (let attempt = 0; attempt < 4; attempt++) {
    if (!(await db.prepare("SELECT 1 FROM uno_lobbies WHERE code=?").bind(code).first())) break;
    code = unoCode();
  }
  const now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO uno_lobbies(id,code,owner_id,status,state_json,version,created_at,updated_at) VALUES(?,?,?,'lobby','{}',1,?,?)").bind(id, code, auth.id, now, now),
    db.prepare("INSERT INTO uno_lobby_members(lobby_id,user_id,seat,joined_at) VALUES(?,?,0,?)").bind(id, auth.id, now)
  ]);
  const row = await db.prepare("SELECT * FROM uno_lobbies WHERE id=?").bind(id).first();
  return apiJson({ lobby: await exposeUnoLobby(db, row, auth.id) }, 201);
}

async function createUnoLobbyRecord(db, ownerId) {
  const id = "uno_" + randomId();
  let code = unoCode();
  for (let attempt = 0; attempt < 4; attempt++) {
    if (!(await db.prepare("SELECT 1 FROM uno_lobbies WHERE code=?").bind(code).first())) break;
    code = unoCode();
  }
  const now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO uno_lobbies(id,code,owner_id,status,state_json,version,created_at,updated_at) VALUES(?,?,?,'lobby','{}',1,?,?)").bind(id, code, ownerId, now, now),
    db.prepare("INSERT INTO uno_lobby_members(lobby_id,user_id,seat,joined_at) VALUES(?,?,0,?)").bind(id, ownerId, now)
  ]);
  return db.prepare("SELECT * FROM uno_lobbies WHERE id=?").bind(id).first();
}

async function createUnoSocialInvite(request, db) {
  requireSameOrigin(request);
  const auth = await requireSocialUser(request, db);
  await enforceUserRateLimit(db, auth.id, "uno-social-create", 12, 10 * 60 * 1000, 10 * 60 * 1000);
  const body = await readJson(request);
  const kind = cleanText(body.kind, 12);
  let invitees = [];
  if (kind === "dm") {
    const username = normalizeUsername(body.username);
    const target = await db.prepare("SELECT id,username FROM users WHERE username=? COLLATE NOCASE AND account_status='active'").bind(username).first();
    if (!target) return apiError("USER_NOT_FOUND", "That friend could not be found", 404);
    const friend = await db.prepare("SELECT 1 FROM friendships WHERE status='accepted' AND ((requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?))").bind(auth.id,target.id,target.id,auth.id).first();
    if (!friend || await isBlockedBetween(db, auth.id, target.id)) return apiError("FRIENDS_ONLY", "UNO can only be started with an accepted friend", 403);
    invitees = [target];
  } else if (kind === "group") {
    const groupId = cleanText(body.groupId, 80);
    const membership = await db.prepare("SELECT 1 FROM social_channel_members m JOIN social_channels c ON c.id=m.channel_id WHERE m.channel_id=? AND m.user_id=? AND c.kind='group'").bind(groupId, auth.id).first();
    if (!membership) return apiError("GROUP_ACCESS", "You are not a member of this group", 403);
    const rows = await db.prepare("SELECT u.id,u.username FROM social_channel_members m JOIN users u ON u.id=m.user_id WHERE m.channel_id=? AND m.user_id<>? AND u.account_status='active' ORDER BY lower(u.username)").bind(groupId, auth.id).all();
    invitees = rows.results || [];
    if (!invitees.length) return apiError("GROUP_EMPTY", "Add another friend before starting UNO", 409);
    if (invitees.length > 3) return apiError("UNO_GROUP_SIZE", "UNO supports up to four players. Use a smaller group chat.", 409);
  } else return apiError("INVALID_INVITE", "Choose a friend or group chat", 400);
  const lobby = await createUnoLobbyRecord(db, auth.id);
  const now = Date.now();
  await db.batch(invitees.map(target => db.prepare("INSERT INTO uno_lobby_invites(lobby_id,invited_user_id,invited_by,created_at) VALUES(?,?,?,?) ON CONFLICT(lobby_id,invited_user_id) DO UPDATE SET created_at=excluded.created_at,invited_by=excluded.invited_by").bind(lobby.id,target.id,auth.id,now)));
  return apiJson({ lobby: await exposeUnoLobby(db, lobby, auth.id), invitees: invitees.map(item => item.username), launchUrl: "/website/html/nova-games.html?lobby=" + encodeURIComponent(lobby.id) }, 201);
}

async function joinUnoLobby(request, db) {
  requireSameOrigin(request);
  const auth = await requireSocialUser(request, db);
  const body = await readJson(request);
  const code = cleanText(body.code, 6).toUpperCase();
  const lobbyId = cleanText(body.lobbyId, 80);
  const row = lobbyId ? await db.prepare("SELECT * FROM uno_lobbies WHERE id=?").bind(lobbyId).first() : await db.prepare("SELECT * FROM uno_lobbies WHERE code=?").bind(code).first();
  if (!row) return apiError("LOBBY_NOT_FOUND", lobbyId ? "That UNO invite is no longer available" : "Check the six-character lobby code", 404);
  if (row.status !== "lobby") return apiError("GAME_STARTED", "This game has already started", 409);
  const current = await db.prepare("SELECT seat FROM uno_lobby_members WHERE lobby_id=? AND user_id=?").bind(row.id, auth.id).first();
  if (!current) {
    if (lobbyId) {
      const invite = await db.prepare("SELECT 1 FROM uno_lobby_invites WHERE lobby_id=? AND invited_user_id=?").bind(row.id, auth.id).first();
      if (!invite) return apiError("INVITE_REQUIRED", "This private UNO table is for invited players", 403);
    }
    const members = await unoMembers(db, row.id);
    if (members.length >= 4) return apiError("LOBBY_FULL", "This lobby is full", 409);
    const seats = new Set(members.map(member => Number(member.seat)));
    let seat = 0; while (seats.has(seat)) seat++;
    await db.prepare("INSERT INTO uno_lobby_members(lobby_id,user_id,seat,joined_at) VALUES(?,?,?,?)").bind(row.id, auth.id, seat, Date.now()).run();
    await db.prepare("UPDATE uno_lobbies SET version=version+1,updated_at=? WHERE id=?").bind(Date.now(), row.id).run();
  }
  await db.prepare("DELETE FROM uno_lobby_invites WHERE lobby_id=? AND invited_user_id=?").bind(row.id, auth.id).run();
  const updated = await db.prepare("SELECT * FROM uno_lobbies WHERE id=?").bind(row.id).first();
  return apiJson({ lobby: await exposeUnoLobby(db, updated, auth.id) });
}

async function leaveUnoLobby(request, db) {
  requireSameOrigin(request);
  const auth = await requireSocialUser(request, db);
  const body = await readJson(request);
  const lobbyId = cleanText(body.lobbyId, 80);
  const lobby = await db.prepare("SELECT * FROM uno_lobbies WHERE id=?").bind(lobbyId).first();
  if (!lobby) return apiJson({ ok: true });
  const member = await db.prepare("SELECT 1 FROM uno_lobby_members WHERE lobby_id=? AND user_id=?").bind(lobbyId, auth.id).first();
  if (!member) return apiJson({ ok: true });
  if (lobby.status !== "lobby") return apiError("GAME_ACTIVE", "Finish the current game before leaving", 409);
  await db.prepare("DELETE FROM uno_lobby_members WHERE lobby_id=? AND user_id=?").bind(lobbyId, auth.id).run();
  const remaining = await unoMembers(db, lobbyId);
  if (!remaining.length) {
    await db.prepare("DELETE FROM uno_lobbies WHERE id=?").bind(lobbyId).run();
  } else {
    const nextOwner = lobby.owner_id === auth.id ? remaining[0].userId : lobby.owner_id;
    await db.prepare("UPDATE uno_lobbies SET owner_id=?,version=version+1,updated_at=? WHERE id=?").bind(nextOwner, Date.now(), lobbyId).run();
  }
  return apiJson({ ok: true });
}

async function inviteUnoFriend(request, db) {
  requireSameOrigin(request);
  const auth = await requireSocialUser(request, db);
  const body = await readJson(request);
  const lobbyId = cleanText(body.lobbyId, 80);
  const username = normalizeUsername(body.username);
  const lobby = await db.prepare("SELECT * FROM uno_lobbies WHERE id=?").bind(lobbyId).first();
  if (!lobby || lobby.owner_id !== auth.id || lobby.status !== "lobby") return apiError("LOBBY_ACCESS", "Only the lobby host can invite friends", 403);
  const target = await db.prepare("SELECT id FROM users WHERE username=? COLLATE NOCASE AND account_status='active'").bind(username).first();
  if (!target) return apiError("USER_NOT_FOUND", "That account was not found", 404);
  const friend = await db.prepare("SELECT 1 FROM friendships WHERE status='accepted' AND ((requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?))").bind(auth.id,target.id,target.id,auth.id).first();
  if (!friend) return apiError("FRIENDS_ONLY", "You can only invite Nova friends", 403);
  await db.prepare("INSERT INTO uno_lobby_invites(lobby_id,invited_user_id,invited_by,created_at) VALUES(?,?,?,?) ON CONFLICT(lobby_id,invited_user_id) DO UPDATE SET created_at=excluded.created_at,invited_by=excluded.invited_by").bind(lobbyId,target.id,auth.id,Date.now()).run();
  return apiJson({ ok: true });
}

async function getUnoInvites(request, db) {
  const auth = await requireSocialUser(request, db);
  const rows = await db.prepare(`SELECT l.id AS lobbyId,l.code,u.username AS fromUsername,i.created_at AS createdAt
    FROM uno_lobby_invites i JOIN uno_lobbies l ON l.id=i.lobby_id JOIN users u ON u.id=i.invited_by
    WHERE i.invited_user_id=? AND l.status='lobby' ORDER BY i.created_at DESC LIMIT 12`).bind(auth.id).all();
  return apiJson({ invites: rows.results || [] });
}

async function joinUnoCall(request, env) {
  requireSameOrigin(request);
  const auth = await requireSocialUser(request, getDb(env));
  await cleanupVoiceState(env, Date.now());
  const body = await readJson(request);
  const lobbyId = cleanText(body.lobbyId, 80);
  const lobby = await getDb(env).prepare("SELECT * FROM uno_lobbies WHERE id=?").bind(lobbyId).first();
  if (!lobby) return apiError("LOBBY_NOT_FOUND", "That lobby no longer exists", 404);
  const membership = await getDb(env).prepare("SELECT 1 FROM uno_lobby_members WHERE lobby_id=? AND user_id=?").bind(lobbyId, auth.id).first();
  if (!membership) return apiError("LOBBY_ACCESS", "Only lobby players can join its call", 403);
  const restriction = await activeVoiceRestriction(getDb(env), auth.id);
  if (restriction) return voiceRestrictionError(restriction);
  const roomId = "uvc_" + lobbyId;
  const now = Date.now();
  let room = await loadVoiceRoom(getDb(env), roomId);
  if (!room || room.status !== "active") {
    await getDb(env).batch([
      getDb(env).prepare("INSERT INTO voice_rooms(id,name,scope_type,scope_id,created_by,host_id,status,locked,dictation_enabled,max_members,created_at,updated_at) VALUES(?,?,'invite',NULL,?,?,'active',0,0,4,?,?) ON CONFLICT(id) DO UPDATE SET status='active',host_id=excluded.host_id,updated_at=excluded.updated_at,ended_at=NULL").bind(roomId, "UNO · " + lobby.code, lobby.owner_id, lobby.owner_id, now, now),
      getDb(env).prepare("INSERT INTO voice_room_members(room_id,user_id,role,status,admitted_by,dictation_enabled,requested_at,admitted_at,joined_at,last_seen_at) VALUES(?,?,?,'admitted',?,0,?,?,?,?) ON CONFLICT(room_id,user_id) DO UPDATE SET status='admitted',left_at=NULL,last_seen_at=excluded.last_seen_at").bind(roomId, auth.id, auth.id === lobby.owner_id ? "host" : "member", lobby.owner_id, now, now, now, now)
    ]);
  } else {
    await getDb(env).prepare("INSERT INTO voice_room_members(room_id,user_id,role,status,admitted_by,dictation_enabled,requested_at,admitted_at,joined_at,last_seen_at) VALUES(?,?,?,'admitted',?,0,?,?,?,?) ON CONFLICT(room_id,user_id) DO UPDATE SET status='admitted',left_at=NULL,last_seen_at=excluded.last_seen_at").bind(roomId, auth.id, auth.id === lobby.owner_id ? "host" : "member", lobby.owner_id, now, now, now, now).run();
  }
  room = await loadVoiceRoom(getDb(env), roomId);
  return apiJson({ room: await exposeVoiceRoom(getDb(env), auth, room, true) });
}

async function unoAction(request, db) {
  requireSameOrigin(request);
  const auth = await requireSocialUser(request, db);
  const body = await readJson(request);
  const lobbyId = cleanText(body.lobbyId, 80);
  const action = enumValue(body.action, ["start","play","draw","uno","replay"], "draw");
  const row = await db.prepare("SELECT * FROM uno_lobbies WHERE id=?").bind(lobbyId).first();
  if (!row) return apiError("LOBBY_NOT_FOUND", "That lobby no longer exists", 404);
  const members = await unoMembers(db, lobbyId);
  if (!members.some(member => member.userId === auth.id)) return apiError("LOBBY_ACCESS", "You are not in this lobby", 403);
  let state = parseJson(row.state_json, {});
  let status = row.status;
  if (action === "start" || action === "replay") {
    if (row.owner_id !== auth.id) return apiError("HOST_ONLY", "Only the host can start a round", 403);
    if (action === "start" && row.status !== "lobby") return apiError("ALREADY_STARTED", "The game has already started", 409);
    if (action === "replay" && row.status !== "finished") return apiError("ROUND_ACTIVE", "Finish the current round first", 409);
    if (members.length < 2) return apiError("MORE_PLAYERS", "Invite at least one friend first", 409);
    const deck = unoDeck(), hands = {}, order = members.map(member => member.userId);
    order.forEach(userId => { hands[userId] = deck.splice(0, 7); });
    let first = deck.pop();
    while (first.color === "wild" || ["skip","reverse","draw2"].includes(first.value)) { deck.unshift(first); first = deck.pop(); }
    state = { deck, hands, order, discard: [first], color: first.color, turn: 0, direction: 1, winnerId: "", pendingDraw: 0, unoPendingUserId: "", unoCalledUserId: "", unoEvent: "", unoEventType: "", unoEventUserId: "" };
    status = "playing";
  } else if (action === "uno") {
    if (row.status !== "playing") return apiError("NOT_PLAYING", "There is no active round", 409);
    const hand = state.hands?.[auth.id] || [];
    if (hand.length === 1 && state.unoPendingUserId === auth.id) {
      state.unoCalledUserId = auth.id;
      state.unoPendingUserId = "";
      state.unoEventType = "called";
      state.unoEventUserId = auth.id;
      state.unoEvent = "called:" + auth.id + ":" + Date.now();
    } else if (state.unoPendingUserId && state.unoPendingUserId !== auth.id) {
      const caughtId = state.unoPendingUserId;
      const caughtHand = state.hands?.[caughtId] || [];
      if (caughtHand.length !== 1) {
        state.unoPendingUserId = "";
        return apiError("UNO_NOT_READY", "Nobody can be caught for missing UNO right now", 409);
      }
      for (let count = 0; count < 2; count++) {
        if (!state.deck.length) state.deck = state.discard.splice(0, state.discard.length - 1).sort(() => Math.random() - .5);
        if (state.deck.length) caughtHand.push(state.deck.pop());
      }
      state.unoCalledUserId = "";
      state.unoPendingUserId = "";
      state.unoEventType = "caught";
      state.unoEventUserId = caughtId;
      state.unoEvent = "caught:" + caughtId + ":" + Date.now();
    } else {
      return apiError("UNO_NOT_READY", "Nobody needs to call UNO right now", 409);
    }
  } else {
    if (row.status !== "playing") return apiError("NOT_PLAYING", "Start the game first", 409);
    if (state.order[state.turn] !== auth.id) return apiError("NOT_YOUR_TURN", "Wait for your turn", 409);
    const hand = state.hands[auth.id] || [];
    if (action === "draw") {
      if (state.unoPendingUserId && state.unoPendingUserId !== auth.id) state.unoPendingUserId = "";
      const drawCount = Math.max(1, Number(state.pendingDraw || 0));
      for (let count = 0; count < drawCount; count++) {
        if (!state.deck.length) state.deck = state.discard.splice(0, state.discard.length - 1).sort(() => Math.random() - .5);
        if (state.deck.length) hand.push(state.deck.pop());
      }
      state.pendingDraw = 0;
      unoNext(state, 1);
    } else {
      const index = Number(body.cardIndex);
      const card = hand[index];
      if (!card || !unoCanPlay(card, state)) return apiError("INVALID_CARD", "That card cannot be played now", 409);
      if (state.unoPendingUserId && state.unoPendingUserId !== auth.id) state.unoPendingUserId = "";
      hand.splice(index, 1); state.discard.push(card);
      state.color = card.color === "wild" ? enumValue(body.color, ["red","yellow","green","blue"], "red") : card.color;
      if (hand.length === 1) {
        state.unoPendingUserId = auth.id;
        state.unoCalledUserId = "";
      } else if (state.unoPendingUserId === auth.id) {
        state.unoPendingUserId = "";
        state.unoCalledUserId = "";
      }
      if (!hand.length) { state.winnerId = auth.id; state.unoPendingUserId = ""; status = "finished"; }
      else {
        if (card.value === "reverse") state.direction *= -1;
        const steps = card.value === "skip" ? 2 : 1;
        unoNext(state, steps);
        const drawCount = card.value === "draw2" ? 2 : card.value === "wild4" ? 4 : 0;
        if (drawCount) state.pendingDraw = Number(state.pendingDraw || 0) + drawCount;
      }
    }
  }
  const updatedAt = Date.now(),stateJson = JSON.stringify(state);
  const result = await db.prepare("UPDATE uno_lobbies SET status=?,state_json=?,version=version+1,updated_at=? WHERE id=? AND version=?").bind(status,stateJson,updatedAt,lobbyId,row.version).run();
  if (!result.meta?.changes) return apiError("GAME_CHANGED", "The table changed—try again", 409);
  const updated = { ...row, status, state_json: stateJson, version: Number(row.version) + 1, updated_at: updatedAt };
  return apiJson({ lobby: await exposeUnoLobby(db, updated, auth.id, members) });
}

async function setPresence(request, db) {
  requireSameOrigin(request);
  const auth = await requireUser(request, db);
  await enforceUserRateLimit(db, auth.id, "presence", 120, 10 * 60 * 1000, 60 * 1000);
  const body = await readJson(request);
  const state = enumValue(body.state, ["online", "idle", "dnd", "offline"], "online");
  await db.prepare("INSERT INTO user_presence(user_id,state,activity_type,activity_label,last_seen_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET state=excluded.state,activity_type=excluded.activity_type,activity_label=excluded.activity_label,last_seen_at=excluded.last_seen_at")
    .bind(auth.id, state, cleanText(body.activityType, 24), cleanText(body.activityLabel, 100), Date.now()).run();
  return apiJson({ ok: true });
}

async function socialOverview(request, db) {
  const auth = await requireUser(request, db);
  const friends = await db.prepare(`${profileSelect()}, pstate.state AS presence_state, pstate.activity_type, pstate.activity_label, pstate.last_seen_at AS presence_last_seen_at
    FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
    LEFT JOIN user_profiles p ON p.user_id = u.id LEFT JOIN user_stats s ON s.user_id = u.id
    LEFT JOIN user_presence pstate ON pstate.user_id = u.id
    WHERE f.status = 'accepted' AND u.account_status = 'active' AND (f.requester_id = ? OR f.addressee_id = ?)
    AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE (b.blocker_id=? AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=?))
    ORDER BY CASE COALESCE(pstate.state,'offline') WHEN 'online' THEN 0 WHEN 'idle' THEN 1 ELSE 2 END, lower(u.username)`)
    .bind(auth.id, auth.id, auth.id, auth.id, auth.id).all();
  const incoming = await db.prepare(`${profileSelect()} FROM friendships f JOIN users u ON u.id=f.requester_id LEFT JOIN user_profiles p ON p.user_id=u.id LEFT JOIN user_stats s ON s.user_id=u.id WHERE f.addressee_id=? AND f.status='pending' AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE (b.blocker_id=? AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=?)) ORDER BY f.created_at DESC`).bind(auth.id, auth.id, auth.id).all();
  const groups = await db.prepare("SELECT c.id,c.name,c.owner_id AS ownerId,COUNT(m2.user_id) AS memberCount FROM social_channel_members mine JOIN social_channels c ON c.id=mine.channel_id AND c.kind='group' LEFT JOIN social_channel_members m2 ON m2.channel_id=c.id WHERE mine.user_id=? GROUP BY c.id ORDER BY lower(c.name)").bind(auth.id).all();
  const invites = await db.prepare("SELECT i.channel_id AS id,c.name,u.username AS fromUsername,i.created_at AS createdAt FROM social_group_invites i JOIN social_channels c ON c.id=i.channel_id JOIN users u ON u.id=i.invited_by WHERE i.invited_user_id=? AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE (b.blocker_id=? AND b.blocked_id=i.invited_by) OR (b.blocker_id=i.invited_by AND b.blocked_id=?)) ORDER BY i.created_at DESC").bind(auth.id, auth.id, auth.id).all();
  const blocked = await loadBlockedProfiles(db, auth.id);
  return apiJson({ friends: (friends.results || []).map(exposeFriendPresence), incoming: (incoming.results || []).map(r => exposeProfile(r, false)), blocked, groups: groups.results || [], groupInvites: invites.results || [] });
}

async function socialPresence(request, db) {
  const auth = await requireUser(request, db);
  const friends = await db.prepare(`SELECT u.username,COALESCE(p.online_visibility,'everyone') AS online_visibility,
    COALESCE(p.activity_visibility,'friends') AS activity_visibility,pstate.state AS presence_state,
    pstate.activity_type,pstate.activity_label,pstate.last_seen_at AS presence_last_seen_at
    FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
    LEFT JOIN user_profiles p ON p.user_id = u.id
    LEFT JOIN user_presence pstate ON pstate.user_id = u.id
    WHERE f.status = 'accepted' AND u.account_status = 'active' AND (f.requester_id = ? OR f.addressee_id = ?)
    AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE (b.blocker_id=? AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=?))
    ORDER BY lower(u.username)`).bind(auth.id, auth.id, auth.id, auth.id, auth.id).all();
  return apiJson({ friends: (friends.results || []).map(exposeFriendPresence) });
}

async function socialRequests(request, db) {
  const auth = await requireUser(request, db);
  const incoming = await db.prepare(`${profileSelect()} FROM friendships f JOIN users u ON u.id=f.requester_id LEFT JOIN user_profiles p ON p.user_id=u.id LEFT JOIN user_stats s ON s.user_id=u.id WHERE f.addressee_id=? AND f.status='pending' AND u.account_status='active' AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE (b.blocker_id=? AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=?)) ORDER BY f.created_at DESC`).bind(auth.id, auth.id, auth.id).all();
  const invites = await db.prepare("SELECT i.channel_id AS id,c.name,u.username AS fromUsername,i.created_at AS createdAt FROM social_group_invites i JOIN social_channels c ON c.id=i.channel_id JOIN users u ON u.id=i.invited_by WHERE i.invited_user_id=? AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE (b.blocker_id=? AND b.blocked_id=i.invited_by) OR (b.blocker_id=i.invited_by AND b.blocked_id=?)) ORDER BY i.created_at DESC").bind(auth.id, auth.id, auth.id).all();
  return apiJson({ incoming: (incoming.results || []).map(r => exposeProfile(r, false)), groupInvites: invites.results || [] });
}

function exposeFriendPresence(row) {
  const visible = row.online_visibility !== "hidden";
  const fresh = Date.now() - Number(row.presence_last_seen_at || 0) < PRESENCE_FRESH_MS;
  const presenceState = visible && fresh ? (row.presence_state || "offline") : (visible ? "offline" : "hidden");
  const showActivity = row.activity_visibility !== "hidden" && presenceState !== "offline" && presenceState !== "hidden";
  return {
    ...exposeProfile(row, false),
    username: row.username,
    presenceState,
    activityType: showActivity ? (row.activity_type || "") : "",
    activityLabel: showActivity ? (row.activity_label || "") : ""
  };
}

async function createGroup(request, db) {
  requireSameOrigin(request);
  const auth = await requireSocialUser(request, db);
  const restrictionError = await chatRestrictionError(db, auth.id, "group");
  if (restrictionError) return restrictionError;
  await enforceUserRateLimit(db, auth.id, "group-create", 5, 10 * 60 * 1000, 10 * 60 * 1000);
  const body = await readJson(request);
  const name = cleanText(body.name, 48);
  if (name.length < 2) return apiError("INVALID_GROUP_NAME", "Group name is too short", 400);
  const id = "grp_" + randomId();
  await db.batch([
    db.prepare("INSERT INTO social_channels(id,kind,name,owner_id,created_at) VALUES(?,'group',?,?,?)").bind(id, name, auth.id, Date.now()),
    db.prepare("INSERT INTO social_channel_members(channel_id,user_id) VALUES(?,?)").bind(id, auth.id)
  ]);
  const usernames = Array.isArray(body.usernames) ? body.usernames.slice(0, 20) : [];
  for (const username of usernames) await addGroupInvite(db, id, auth.id, normalizeUsername(username));
  return apiJson({ group: { id, name, ownerId: auth.id, memberCount: 1 } }, 201);
}

async function inviteGroupMember(request, db) {
  requireSameOrigin(request);
  const auth = await requireSocialUser(request, db);
  const restrictionError = await chatRestrictionError(db, auth.id, "group");
  if (restrictionError) return restrictionError;
  await enforceUserRateLimit(db, auth.id, "group-invite", 20, 10 * 60 * 1000, 10 * 60 * 1000);
  const body = await readJson(request);
  const group = await db.prepare("SELECT id FROM social_channels WHERE id=? AND kind='group' AND owner_id=?").bind(cleanText(body.groupId, 80), auth.id).first();
  if (!group) return apiError("FORBIDDEN", "Only the group owner can invite members", 403);
  const invited = await addGroupInvite(db, group.id, auth.id, normalizeUsername(body.username));
  if (!invited) return apiError("USER_NOT_FOUND", "User not found", 404);
  return apiJson({ ok: true });
}

async function addGroupInvite(db, groupId, inviterId, username) {
  const user = await loadUserByUsername(db, username);
  if (!user || user.id === inviterId) return false;
  if (await isBlockedBetween(db, inviterId, user.id)) return false;
  await db.prepare("INSERT OR IGNORE INTO social_group_invites(channel_id,invited_user_id,invited_by,created_at) VALUES(?,?,?,?)").bind(groupId, user.id, inviterId, Date.now()).run();
  return true;
}

async function respondGroupInvite(request, db) {
  requireSameOrigin(request);
  const auth = await requireSocialUser(request, db);
  await enforceUserRateLimit(db, auth.id, "group-respond", 30, 10 * 60 * 1000, 5 * 60 * 1000);
  const body = await readJson(request);
  const id = cleanText(body.groupId, 80);
  const invite = await db.prepare("SELECT channel_id FROM social_group_invites WHERE channel_id=? AND invited_user_id=?").bind(id, auth.id).first();
  if (!invite) return apiError("INVITE_NOT_FOUND", "Group invite not found", 404);
  if (body.action === "accept") await db.prepare("INSERT OR IGNORE INTO social_channel_members(channel_id,user_id) VALUES(?,?)").bind(id, auth.id).run();
  await db.prepare("DELETE FROM social_group_invites WHERE channel_id=? AND invited_user_id=?").bind(id, auth.id).run();
  return apiJson({ ok: true });
}

async function leaveGroup(request, db) {
  requireSameOrigin(request);
  const auth = await requireUser(request, db);
  await enforceUserRateLimit(db, auth.id, "group-leave", 20, 10 * 60 * 1000, 5 * 60 * 1000);
  const body = await readJson(request);
  const id = cleanText(body.groupId, 80);
  const group = await db.prepare("SELECT owner_id FROM social_channels WHERE id=? AND kind='group'").bind(id).first();
  if (!group) return apiError("GROUP_NOT_FOUND", "Group not found", 404);
  if (group.owner_id === auth.id) return apiError("OWNER_CANNOT_LEAVE", "Transfer or remove the group before leaving", 409);
  await db.prepare("DELETE FROM social_channel_members WHERE channel_id=? AND user_id=?").bind(id, auth.id).run();
  return apiJson({ ok: true });
}

async function sendFriendRequest(request, db) {
  requireSameOrigin(request);
  const auth = await requireSocialUser(request, db);
  await enforceUserRateLimit(db, auth.id, "friend-request", 10, 10 * 60 * 1000, 10 * 60 * 1000);
  const body = await readJson(request);
  const target = await loadUserByUsername(db, normalizeUsername(body.username));
  if (!target || target.id === auth.id) return apiError("USER_NOT_FOUND", "User not found", 404);
  if (await isBlockedBetween(db, auth.id, target.id)) return apiError("REQUEST_NOT_ALLOWED", "Friend request is not allowed", 403);
  const targetSettingsRow = await db.prepare("SELECT settings_json FROM user_settings WHERE user_id=?").bind(target.id).first();
  const targetSettings = parseJson(targetSettingsRow?.settings_json, {});
  const requestPolicy = enumValue(targetSettings.friendRequests, ["everyone", "friends", "none"], "everyone");
  if (requestPolicy === "none") return apiError("REQUESTS_DISABLED", "This person is not accepting friend requests", 403);
  if (requestPolicy === "friends") {
    const mine = await db.prepare("SELECT requester_id,addressee_id FROM friendships WHERE status='accepted' AND (requester_id=? OR addressee_id=?)").bind(auth.id, auth.id).all();
    const theirs = await db.prepare("SELECT requester_id,addressee_id FROM friendships WHERE status='accepted' AND (requester_id=? OR addressee_id=?)").bind(target.id, target.id).all();
    const mineIds = new Set((mine.results || []).map(row => String(row.requester_id) === String(auth.id) ? String(row.addressee_id) : String(row.requester_id)));
    const hasMutual = (theirs.results || []).some(row => mineIds.has(String(row.requester_id) === String(target.id) ? String(row.addressee_id) : String(row.requester_id)));
    if (!hasMutual) return apiError("MUTUAL_REQUIRED", "This person only accepts requests from friends of friends", 403);
  }
  const existing = await db.prepare("SELECT requester_id,addressee_id,status FROM friendships WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?) ORDER BY CASE status WHEN 'accepted' THEN 1 WHEN 'blocked' THEN 2 WHEN 'pending' THEN 3 ELSE 4 END LIMIT 1").bind(auth.id, target.id, target.id, auth.id).first();
  if (existing?.status === "accepted") return apiError("ALREADY_FRIENDS", "You are already friends", 409);
  if (existing?.status === "blocked") return apiError("REQUEST_NOT_ALLOWED", "Friend request is not allowed", 403);
  if (existing?.status === "pending") {
    if (String(existing.requester_id) === String(target.id)) {
      await db.prepare("UPDATE friendships SET status='accepted',updated_at=? WHERE requester_id=? AND addressee_id=?").bind(Date.now(), target.id, auth.id).run();
      return apiJson({ ok: true, accepted: true });
    }
    return apiError("REQUEST_PENDING", "Friend request is already pending", 409);
  }
  await db.prepare("DELETE FROM friendships WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)").bind(auth.id, target.id, target.id, auth.id).run();
  await db.prepare("INSERT INTO friendships(requester_id,addressee_id,status,created_at,updated_at) VALUES(?,?,'pending',?,?) ON CONFLICT(requester_id,addressee_id) DO UPDATE SET status='pending',updated_at=excluded.updated_at").bind(auth.id, target.id, Date.now(), Date.now()).run();
  return apiJson({ ok: true });
}

async function respondFriendRequest(request, db) {
  requireSameOrigin(request);
  const auth = await requireSocialUser(request, db);
  await enforceUserRateLimit(db, auth.id, "friend-respond", 30, 10 * 60 * 1000, 5 * 60 * 1000);
  const body = await readJson(request);
  const requester = await loadUserByUsername(db, normalizeUsername(body.username));
  const action = enumValue(body.action, ["accept", "decline"], "decline");
  if (!requester) return apiError("USER_NOT_FOUND", "User not found", 404);
  const result = await db.prepare("UPDATE friendships SET status=?,updated_at=? WHERE requester_id=? AND addressee_id=? AND status='pending'").bind(action === "accept" ? "accepted" : "declined", Date.now(), requester.id, auth.id).run();
  if (!result.meta?.changes) return apiError("REQUEST_NOT_FOUND", "Friend request not found", 404);
  return apiJson({ ok: true });
}

async function removeFriend(request, db) {
  requireSameOrigin(request);
  const auth = await requireUser(request, db);
  await enforceUserRateLimit(db, auth.id, "friend-remove", 30, 10 * 60 * 1000, 5 * 60 * 1000);
  const body = await readJson(request);
  const other = await loadUserByUsername(db, normalizeUsername(body.username));
  if (!other) return apiError("USER_NOT_FOUND", "User not found", 404);
  await db.prepare("DELETE FROM friendships WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)").bind(auth.id, other.id, other.id, auth.id).run();
  return apiJson({ ok: true });
}

async function loadBlockedProfiles(db, userId) {
  const result = await db.prepare(`${profileSelect()},b.created_at AS blocked_at
    FROM social_blocks b JOIN users u ON u.id=b.blocked_id
    LEFT JOIN user_profiles p ON p.user_id=u.id LEFT JOIN user_stats s ON s.user_id=u.id
    WHERE b.blocker_id=? ORDER BY b.created_at DESC`).bind(userId).all();
  return (result.results || []).map(row => ({ ...exposeProfile(row, false), blockedAt: Number(row.blocked_at || 0) }));
}

async function getSocialBlocks(request, db) {
  const auth = await requireUser(request, db);
  return apiJson({ blocked: await loadBlockedProfiles(db, auth.id) });
}

async function blockSocialUser(request, env) {
  const db = getDb(env);
  requireSameOrigin(request);
  const auth = await requireUser(request, db);
  await enforceUserRateLimit(db, auth.id, "social-block", 20, 10 * 60 * 1000, 5 * 60 * 1000);
  const body = await readJson(request);
  const target = await loadUserByUsername(db, normalizeUsername(body.username));
  if (!target || target.id === auth.id) return apiError("USER_NOT_FOUND", "User not found", 404);
  const now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO social_blocks(blocker_id,blocked_id,reason,created_at) VALUES(?,?,?,?) ON CONFLICT(blocker_id,blocked_id) DO UPDATE SET reason=excluded.reason,created_at=excluded.created_at").bind(auth.id, target.id, cleanText(body.reason, 160), now),
    db.prepare("DELETE FROM friendships WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)").bind(auth.id, target.id, target.id, auth.id),
    db.prepare("DELETE FROM social_group_invites WHERE (invited_user_id=? AND invited_by=?) OR (invited_user_id=? AND invited_by=?)").bind(auth.id, target.id, target.id, auth.id)
  ]);
  const sharedVoiceRooms = await db.prepare(`SELECT mine.room_id AS roomId FROM voice_room_members mine
    JOIN voice_room_members other ON other.room_id=mine.room_id AND other.user_id=? AND other.status IN ('admitted','connected')
    JOIN voice_rooms vr ON vr.id=mine.room_id AND vr.status='active'
    WHERE mine.user_id=? AND mine.status IN ('admitted','connected')`).bind(target.id, auth.id).all();
  for (const room of sharedVoiceRooms.results || []) {
    await db.prepare("UPDATE voice_room_members SET status='left',connected_at=NULL,left_at=? WHERE room_id=? AND user_id=?").bind(now, room.roomId, auth.id).run();
    await commandVoiceRoom(env, room.roomId, { action: "close-user", targetUserId: auth.id, reason: "You left because this user was blocked" });
  }
  return apiJson({ ok: true, blocked: target.username });
}

async function unblockSocialUser(request, db) {
  requireSameOrigin(request);
  const auth = await requireUser(request, db);
  await enforceUserRateLimit(db, auth.id, "social-unblock", 20, 10 * 60 * 1000, 5 * 60 * 1000);
  const body = await readJson(request);
  const target = await loadUserByUsername(db, normalizeUsername(body.username));
  if (!target) return apiError("USER_NOT_FOUND", "User not found", 404);
  const result = await db.prepare("DELETE FROM social_blocks WHERE blocker_id=? AND blocked_id=?").bind(auth.id, target.id).run();
  if (!result.meta?.changes) return apiError("BLOCK_NOT_FOUND", "That account is not blocked", 404);
  return apiJson({ ok: true, unblocked: target.username });
}


// ── Voice Rooms V2 ───────────────────────────────────────────────────────────
// A deliberately simpler implementation than the original voice stack.
// Persistent room/membership state lives in Turso; ephemeral WebRTC offers,
// answers and ICE candidates use a short-lived signaling table. This removes
// the old dependency on a separate Durable Object coordinator and Cloudflare
// Realtime session state.

const VOICE_V2_STALE_MS = 35000;
const VOICE_V2_SIGNAL_TTL_MS = 45000;
const VOICE_V2_CHAT_LIMIT = 140;

async function ensureVoiceV2Schema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS voice_v2_signals(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      from_user_id TEXT NOT NULL,
      to_user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_voice_v2_signals_target
      ON voice_v2_signals(room_id,to_user_id,id)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS voice_v2_messages(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      message TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'text',
      created_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_voice_v2_messages_room
      ON voice_v2_messages(room_id,id)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS voice_staff_presence(
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      vanished INTEGER NOT NULL DEFAULT 0,
      joined_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(room_id,user_id)
    )`)
  ]);
}

async function voiceV2Cleanup(env, now = Date.now()) {
  const db = getDb(env);
  await ensureVoiceV2Schema(db);
  await db.batch([
    db.prepare("DELETE FROM voice_v2_signals WHERE expires_at<?").bind(now),
    db.prepare(`UPDATE voice_room_members
      SET status='left',connected_at=NULL,left_at=?,last_seen_at=?
      WHERE status='connected' AND COALESCE(last_seen_at,connected_at,0)<?`)
      .bind(now, now, now - VOICE_V2_STALE_MS),
    db.prepare(`DELETE FROM voice_staff_presence WHERE NOT EXISTS(
      SELECT 1 FROM voice_room_members vm WHERE vm.room_id=voice_staff_presence.room_id
      AND vm.user_id=voice_staff_presence.user_id AND vm.status IN ('admitted','connected'))`)
  ]);

  // If a host disappears, end their room instead of leaving zombie rooms open.
  const staleHosts = await db.prepare(`SELECT vr.id
    FROM voice_rooms vr
    LEFT JOIN voice_room_members vm ON vm.room_id=vr.id AND vm.user_id=vr.host_id
    WHERE vr.status='active'
      AND (vm.user_id IS NULL OR vm.status NOT IN ('admitted','connected')
        OR COALESCE(vm.last_seen_at,vm.connected_at,vm.admitted_at,0)<?)
    LIMIT 25`).bind(now - VOICE_V2_STALE_MS).all();

  for (const row of staleHosts.results || []) {
    await db.batch([
      db.prepare("UPDATE voice_rooms SET status='ended',updated_at=?,ended_at=? WHERE id=? AND status='active'").bind(now, now, row.id),
      db.prepare("UPDATE voice_room_members SET status='left',connected_at=NULL,left_at=COALESCE(left_at,?),last_seen_at=? WHERE room_id=? AND status IN ('pending','invited','admitted','connected')").bind(now, now, row.id),
      db.prepare("DELETE FROM voice_v2_signals WHERE room_id=?").bind(row.id)
    ]);
  }
}

async function voiceV2AuthRoom(request, env, roomId, allowedStatuses = ['admitted','connected']) {
  const db = getDb(env);
  const auth = await requireSocialUser(request, db);
  const room = await loadVoiceRoom(db, cleanText(roomId, 80));
  if (!room || room.status !== 'active') throw new ApiFailure("VOICE_ROOM_NOT_FOUND", "Voice room not found", 404);
  await ensureVoiceHostMembership(env, auth, room);
  const membership = await db.prepare("SELECT role,status,muted_by_host AS mutedByHost FROM voice_room_members WHERE room_id=? AND user_id=?")
    .bind(room.id, auth.id).first();
  if (!membership || !allowedStatuses.includes(membership.status)) {
    throw new ApiFailure("VOICE_NOT_ADMITTED", "You are not admitted to this voice room", 403);
  }
  return { db, auth, room, membership };
}

async function exposeVoiceV2Room(db, auth, room, includeMembers = true) {
  const own = await db.prepare("SELECT role,status,muted_by_host AS mutedByHost FROM voice_room_members WHERE room_id=? AND user_id=?")
    .bind(room.id, auth.id).first();
  const staffObserver = isDeveloperOrOwner(auth);
  const visibleCounts = await db.prepare(`SELECT
      SUM(CASE WHEN vm.status IN ('admitted','connected') AND COALESCE(sp.vanished,0)=0 THEN 1 ELSE 0 END) AS memberCount,
      SUM(CASE WHEN vm.status='connected' AND COALESCE(sp.vanished,0)=0 THEN 1 ELSE 0 END) AS connectedCount
    FROM voice_room_members vm LEFT JOIN voice_staff_presence sp ON sp.room_id=vm.room_id AND sp.user_id=vm.user_id
    WHERE vm.room_id=?`).bind(room.id).first();
  const exposed = {
    ...exposeVoiceRoomSummary(room),
    memberCount: Number(visibleCounts?.memberCount || 0),
    connectedCount: Number(visibleCounts?.connectedCount || 0),
    yourStatus: own?.status || 'none',
    yourRole: own?.role || 'none',
    mutedByHost: !!own?.mutedByHost,
    canManage: room.hostId === auth.id,
    isHost: room.hostId === auth.id,
    developerBypass: isDeveloperOrOwner(auth),
    me: voiceIdentity(auth)
  };
  if (!includeMembers) return exposed;
  const rows = await db.prepare(`SELECT vm.user_id AS userId,u.username,
      COALESCE(p.display_name,u.username) AS displayName,
      COALESCE(p.avatar_url,'') AS avatarUrl,
      vm.role,vm.status,vm.muted_by_host AS mutedByHost,
      vm.requested_at AS requestedAt,vm.connected_at AS connectedAt,vm.last_seen_at AS lastSeenAt,
      COALESCE(sp.vanished,0) AS vanished
    FROM voice_room_members vm
    JOIN users u ON u.id=vm.user_id
    LEFT JOIN user_profiles p ON p.user_id=u.id
    LEFT JOIN voice_staff_presence sp ON sp.room_id=vm.room_id AND sp.user_id=vm.user_id
    WHERE vm.room_id=? AND vm.status IN ('pending','invited','admitted','connected')
    ORDER BY CASE WHEN vm.role='host' THEN 0 WHEN sp.user_id IS NOT NULL THEN 1 ELSE 2 END,
      COALESCE(vm.connected_at,vm.admitted_at,vm.requested_at)`)
    .bind(room.id).all();
  const allMembers = (rows.results || []).map(row => ({ ...row, mutedByHost: !!row.mutedByHost, vanished: !!row.vanished }));
  // Peers contains only the IDs WebRTC needs. Vanished developers stay absent
  // from the visible member list while audio can still connect normally.
  exposed.peers = allMembers.filter(row => row.status === 'connected').map(row => ({ userId: row.userId, status: row.status }));
  exposed.members = allMembers.filter(row => !row.vanished || staffObserver || row.userId === auth.id);
  exposed.vanished = !!allMembers.find(row => row.userId === auth.id && row.vanished);
  return exposed;
}

async function voiceV2Rooms(request, env) {
  const db = getDb(env);
  const auth = await requireSocialUser(request, db);
  const now = Date.now();
  await voiceV2Cleanup(env, now);
  const rows = await db.prepare(`${voiceRoomSelect()} WHERE vr.status='active' ORDER BY vr.updated_at DESC LIMIT 30`).all();
  const rooms = [];
  for (const room of rows.results || []) {
    if (isDeveloperOrOwner(auth) || await canViewVoiceRoom(db, auth.id, room)) rooms.push(await exposeVoiceV2Room(db, auth, room, false));
  }
  return apiJson({ rooms, canCreate: await hasVoiceSponsorAccess(db, auth), maxMembers: VOICE_MAX_MEMBERS });
}

async function voiceV2Create(request, env) {
  requireSameOrigin(request);
  const db = getDb(env);
  const auth = await requireSocialUser(request, db);
  await voiceV2Cleanup(env);
  if (!(await hasVoiceSponsorAccess(db, auth))) return apiError("SUPERNOVA_REQUIRED", "Supernova is required to host a voice room", 403);
  const restriction = await activeVoiceRestriction(db, auth.id);
  if (restriction) return voiceRestrictionError(restriction);

  // Cleanly close any older room owned by this host before creating a new one.
  const old = await db.prepare("SELECT id FROM voice_rooms WHERE status='active' AND (created_by=? OR host_id=?)").bind(auth.id, auth.id).all();
  const now = Date.now();
  for (const row of old.results || []) {
    await db.batch([
      db.prepare("UPDATE voice_rooms SET status='ended',updated_at=?,ended_at=? WHERE id=?").bind(now, now, row.id),
      db.prepare("UPDATE voice_room_members SET status='left',connected_at=NULL,left_at=?,last_seen_at=? WHERE room_id=? AND status IN ('pending','invited','admitted','connected')").bind(now, now, row.id)
    ]);
  }

  const body = await readJson(request);
  const name = cleanText(body.name || `${auth.display_name || auth.username}'s room`, 48) || "Nova Voice";
  const id = `v2_${crypto.randomUUID()}`;
  await db.batch([
    db.prepare(`INSERT INTO voice_rooms(
      id,name,scope_type,scope_id,created_by,host_id,status,locked,dictation_enabled,max_members,created_at,updated_at
    ) VALUES(?,?,'friends','everyone',?,?,'active',0,0,?,?,?)`)
      .bind(id, name, auth.id, auth.id, VOICE_MAX_MEMBERS, now, now),
    db.prepare(`INSERT INTO voice_room_members(
      room_id,user_id,role,status,admitted_by,dictation_enabled,requested_at,admitted_at,joined_at,connected_at,last_seen_at,left_at
    ) VALUES(?,?,'host','connected',?,0,?,?,?,?,?,NULL)
    ON CONFLICT(room_id,user_id) DO UPDATE SET role='host',status='connected',admitted_by=excluded.admitted_by,
      admitted_at=excluded.admitted_at,joined_at=excluded.joined_at,connected_at=excluded.connected_at,last_seen_at=excluded.last_seen_at,left_at=NULL`)
      .bind(id, auth.id, auth.id, now, now, now, now, now),
    voiceEventStatement(db, id, auth.id, auth.id, "v2_created", {}, now)
  ]);
  const room = await loadVoiceRoom(db, id);
  return apiJson({ room: await exposeVoiceV2Room(db, auth, room, true) }, 201);
}

async function voiceV2Join(request, env) {
  requireSameOrigin(request);
  const db = getDb(env);
  const auth = await requireSocialUser(request, db);
  await voiceV2Cleanup(env);
  const restriction = await activeVoiceRestriction(db, auth.id);
  if (restriction) return voiceRestrictionError(restriction);
  const body = await readJson(request);
  const room = await loadVoiceRoom(db, cleanText(body.roomId, 80));
  const devBypass = isDeveloperOrOwner(auth);
  const vanish = devBypass && !!body.vanish;
  if (!room || room.status !== 'active' || (!devBypass && !(await canViewVoiceRoom(db, auth.id, room)))) return apiError("VOICE_ROOM_NOT_FOUND", "Voice room not found", 404);
  if (room.hostId === auth.id) {
    await ensureVoiceHostMembership(env, auth, room);
    await db.prepare("UPDATE voice_room_members SET status='connected',connected_at=COALESCE(connected_at,?),last_seen_at=?,left_at=NULL WHERE room_id=? AND user_id=?")
      .bind(Date.now(), Date.now(), room.id, auth.id).run();
    await db.prepare("DELETE FROM voice_staff_presence WHERE room_id=? AND user_id=?").bind(room.id, auth.id).run();
    return apiJson({ status: "connected", admitted: true, bypassed: devBypass, vanished: false });
  }

  // Developer/Owner voice access is role-native: no admission, lock, scope,
  // capacity or block gate is allowed to stop a staff moderation join.
  if (devBypass) {
    const now = Date.now();
    await db.batch([
      // Keep voice_room_members.role inside the legacy schema's supported values.
      // Staff identity/vanish state lives in voice_staff_presence and auth roles.
      // Using a new literal like 'staff' can violate older Turso CHECK constraints
      // and turns an otherwise valid Developer join into a 503.
      db.prepare(`INSERT INTO voice_room_members(room_id,user_id,role,status,admitted_by,dictation_enabled,requested_at,admitted_at,joined_at,connected_at,last_seen_at,left_at)
        VALUES(?,?,'member','connected',?,0,?,?,?,?,?,NULL)
        ON CONFLICT(room_id,user_id) DO UPDATE SET role='member',status='connected',admitted_by=excluded.admitted_by,
          admitted_at=COALESCE(voice_room_members.admitted_at,excluded.admitted_at),joined_at=COALESCE(voice_room_members.joined_at,excluded.joined_at),
          connected_at=COALESCE(voice_room_members.connected_at,excluded.connected_at),last_seen_at=excluded.last_seen_at,left_at=NULL`)
        .bind(room.id, auth.id, auth.id, now, now, now, now, now),
      db.prepare(`INSERT INTO voice_staff_presence(room_id,user_id,vanished,joined_at,updated_at) VALUES(?,?,?,?,?)
        ON CONFLICT(room_id,user_id) DO UPDATE SET vanished=excluded.vanished,updated_at=excluded.updated_at`)
        .bind(room.id, auth.id, vanish ? 1 : 0, now, now),
      voiceEventStatement(db, room.id, auth.id, auth.id, vanish ? "staff_vanish_join" : "staff_force_join", { vanished: vanish }, now)
    ]);
    return apiJson({ status: "connected", admitted: true, bypassed: true, vanished: vanish });
  }

  if (room.locked) return apiError("VOICE_ROOM_LOCKED", "This room is locked", 423);
  if (await voiceBlockConflict(db, room.id, auth.id)) return apiError("VOICE_BLOCK_CONFLICT", "A block prevents this voice connection", 403);
  const existing = await db.prepare("SELECT status FROM voice_room_members WHERE room_id=? AND user_id=?").bind(room.id, auth.id).first();
  if (existing && ['admitted','connected'].includes(existing.status)) {
    await db.prepare("UPDATE voice_room_members SET status='connected',connected_at=COALESCE(connected_at,?),last_seen_at=?,left_at=NULL WHERE room_id=? AND user_id=?")
      .bind(Date.now(), Date.now(), room.id, auth.id).run();
    return apiJson({ status: "connected", admitted: true });
  }
  if (existing && existing.status === 'pending') {
    await db.prepare("UPDATE voice_room_members SET last_seen_at=?,left_at=NULL WHERE room_id=? AND user_id=?")
      .bind(Date.now(), room.id, auth.id).run();
    return apiJson({ status: "pending", admitted: false });
  }
  const count = await db.prepare("SELECT COUNT(*) AS count FROM voice_room_members WHERE room_id=? AND status IN ('admitted','connected')").bind(room.id).first();
  if (Number(count?.count || 0) >= Math.min(VOICE_MAX_MEMBERS, Number(room.maxMembers || VOICE_MAX_MEMBERS))) return apiError("VOICE_ROOM_FULL", "This room is full", 409);
  const now = Date.now();
  await db.prepare(`INSERT INTO voice_room_members(room_id,user_id,role,status,dictation_enabled,requested_at,last_seen_at,left_at)
    VALUES(?,?,'member','pending',0,?,?,NULL)
    ON CONFLICT(room_id,user_id) DO UPDATE SET
      status=CASE WHEN voice_room_members.status IN ('admitted','connected') THEN voice_room_members.status ELSE 'pending' END,
      requested_at=CASE WHEN voice_room_members.status IN ('admitted','connected') THEN voice_room_members.requested_at ELSE excluded.requested_at END,
      last_seen_at=excluded.last_seen_at,left_at=NULL`)
    .bind(room.id, auth.id, now, now).run();
  return apiJson({ status: "pending", admitted: false });
}

async function voiceV2Admit(request, env) {
  requireSameOrigin(request);
  const db = getDb(env);
  const auth = await requireSocialUser(request, db);
  const body = await readJson(request);
  const room = await loadVoiceRoom(db, cleanText(body.roomId, 80));
  if (!room || room.status !== 'active') return apiError("VOICE_ROOM_NOT_FOUND", "Voice room not found", 404);
  if (room.hostId !== auth.id) return apiError("VOICE_HOST_ONLY", "Only the host can admit people", 403);
  const target = await loadUserByUsername(db, normalizeUsername(body.username));
  if (!target) return apiError("USER_NOT_FOUND", "User not found", 404);
  const action = cleanText(body.action, 12);
  const now = Date.now();
  if (action === 'approve') {
    const count = await db.prepare("SELECT COUNT(*) AS count FROM voice_room_members WHERE room_id=? AND status IN ('admitted','connected')").bind(room.id).first();
    if (Number(count?.count || 0) >= Math.min(VOICE_MAX_MEMBERS, Number(room.maxMembers || VOICE_MAX_MEMBERS))) return apiError("VOICE_ROOM_FULL", "This room is full", 409);
    await db.prepare("UPDATE voice_room_members SET status='connected',admitted_by=?,admitted_at=?,joined_at=COALESCE(joined_at,?),connected_at=COALESCE(connected_at,?),last_seen_at=?,left_at=NULL WHERE room_id=? AND user_id=?")
      .bind(auth.id, now, now, now, now, room.id, target.id).run();
  } else {
    await db.prepare("UPDATE voice_room_members SET status='denied',left_at=?,last_seen_at=? WHERE room_id=? AND user_id=?")
      .bind(now, now, room.id, target.id).run();
  }
  return apiJson({ ok: true });
}

async function voiceV2State(request, url, env) {
  const db = getDb(env);
  const auth = await requireSocialUser(request, db);
  const roomId = cleanText(url.searchParams.get("room"), 80);
  await voiceV2Cleanup(env);
  const room = await loadVoiceRoom(db, roomId);
  if (!room || room.status !== 'active') return apiError("VOICE_ROOM_NOT_FOUND", "Voice room not found", 404);
  await ensureVoiceHostMembership(env, auth, room);
  let member = await db.prepare("SELECT status FROM voice_room_members WHERE room_id=? AND user_id=?").bind(room.id, auth.id).first();
  if (!member) return apiError("VOICE_NOT_JOINED", "Join this room first", 403);
  if (member.status === 'admitted') {
    await db.prepare("UPDATE voice_room_members SET status='connected',connected_at=COALESCE(connected_at,?),last_seen_at=?,left_at=NULL WHERE room_id=? AND user_id=?")
      .bind(Date.now(), Date.now(), room.id, auth.id).run();
    member = { status: 'connected' };
  } else if (member.status === 'connected') {
    await db.prepare("UPDATE voice_room_members SET last_seen_at=? WHERE room_id=? AND user_id=?").bind(Date.now(), room.id, auth.id).run();
  } else if (member.status === 'pending' || member.status === 'invited') {
    await db.prepare("UPDATE voice_room_members SET last_seen_at=? WHERE room_id=? AND user_id=?").bind(Date.now(), room.id, auth.id).run();
  }
  const fresh = await loadVoiceRoom(db, room.id);
  return apiJson({ room: await exposeVoiceV2Room(db, auth, fresh, true) });
}

async function voiceV2Leave(request, env) {
  requireSameOrigin(request);
  const db = getDb(env);
  const auth = await requireSocialUser(request, db);
  const body = await readJson(request);
  const room = await loadVoiceRoom(db, cleanText(body.roomId, 80));
  if (!room) return apiJson({ ok: true });
  const now = Date.now();
  if (room.hostId === auth.id) {
    await db.batch([
      db.prepare("UPDATE voice_rooms SET status='ended',updated_at=?,ended_at=? WHERE id=?").bind(now, now, room.id),
      db.prepare("UPDATE voice_room_members SET status='left',connected_at=NULL,left_at=?,last_seen_at=? WHERE room_id=? AND status IN ('pending','invited','admitted','connected')").bind(now, now, room.id),
      db.prepare("DELETE FROM voice_v2_signals WHERE room_id=?").bind(room.id),
      db.prepare("DELETE FROM voice_staff_presence WHERE room_id=?").bind(room.id)
    ]);
  } else {
    await db.batch([
      db.prepare("UPDATE voice_room_members SET status='left',connected_at=NULL,left_at=?,last_seen_at=? WHERE room_id=? AND user_id=?").bind(now, now, room.id, auth.id),
      db.prepare("DELETE FROM voice_v2_signals WHERE room_id=? AND (from_user_id=? OR to_user_id=?)").bind(room.id, auth.id, auth.id),
      db.prepare("DELETE FROM voice_staff_presence WHERE room_id=? AND user_id=?").bind(room.id, auth.id)
    ]);
  }
  return apiJson({ ok: true });
}

async function voiceV2Action(request, env) {
  requireSameOrigin(request);
  const body = await readJson(request);
  const { db, auth, room } = await voiceV2AuthRoom(request, env, body.roomId);
  const action = cleanText(body.action, 24);
  const now = Date.now();
  if (action === 'lock') {
    if (room.hostId !== auth.id) return apiError("VOICE_HOST_ONLY", "Only the host can lock the room", 403);
    await db.prepare("UPDATE voice_rooms SET locked=?,updated_at=? WHERE id=?").bind(body.enabled ? 1 : 0, now, room.id).run();
    return apiJson({ ok: true });
  }
  if (action === 'mute-user') {
    if (room.hostId !== auth.id) return apiError("VOICE_HOST_ONLY", "Only the host can mute members", 403);
    const target = await loadUserByUsername(db, normalizeUsername(body.username));
    if (!target) return apiError("USER_NOT_FOUND", "User not found", 404);
    if (roleRank(highestRole(auth.roles || ["user"])) <= roleRank(highestRole(target.roles || ["user"])) && highestRole(target.roles || ["user"]) !== "user") return apiError("PROTECTED_ACCOUNT", "This staff member cannot be muted by a lower role", 403);
    await db.prepare("UPDATE voice_room_members SET muted_by_host=? WHERE room_id=? AND user_id=?").bind(body.muted ? 1 : 0, room.id, target.id).run();
    return apiJson({ ok: true });
  }
  if (action === 'remove-user') {
    if (room.hostId !== auth.id) return apiError("VOICE_HOST_ONLY", "Only the host can remove members", 403);
    const target = await loadUserByUsername(db, normalizeUsername(body.username));
    if (!target || target.id === auth.id) return apiError("INVALID_TARGET", "Choose another member", 400);
    if (roleRank(highestRole(auth.roles || ["user"])) <= roleRank(highestRole(target.roles || ["user"])) && highestRole(target.roles || ["user"]) !== "user") return apiError("PROTECTED_ACCOUNT", "This staff member cannot be removed by a lower role", 403);
    await db.prepare("UPDATE voice_room_members SET status='removed',connected_at=NULL,left_at=?,last_seen_at=? WHERE room_id=? AND user_id=?")
      .bind(now, now, room.id, target.id).run();
    await db.prepare("DELETE FROM voice_v2_signals WHERE room_id=? AND (from_user_id=? OR to_user_id=?)").bind(room.id, target.id, target.id).run();
    return apiJson({ ok: true });
  }
  return apiError("INVALID_ACTION", "Unknown voice action", 400);
}

async function voiceV2ChatGet(request, url, env) {
  const roomId = cleanText(url.searchParams.get("room"), 80);
  const after = Math.max(0, Number(url.searchParams.get("after") || 0));
  const { db } = await voiceV2AuthRoom(request, env, roomId, ['admitted','connected']);
  const rows = await db.prepare(`SELECT m.id,m.user_id AS userId,u.username,
      COALESCE(p.display_name,u.username) AS displayName,COALESCE(p.avatar_url,'') AS avatarUrl,
      m.message,m.kind,m.created_at AS createdAt
    FROM voice_v2_messages m
    JOIN users u ON u.id=m.user_id
    LEFT JOIN user_profiles p ON p.user_id=u.id
    WHERE m.room_id=? AND m.id>? ORDER BY m.id ASC LIMIT ?`)
    .bind(roomId, after, VOICE_V2_CHAT_LIMIT).all();
  return apiJson({ messages: rows.results || [] });
}

async function voiceV2ChatPost(request, env) {
  requireSameOrigin(request);
  const body = await readJson(request);
  const { db, auth, room } = await voiceV2AuthRoom(request, env, body.roomId, ['admitted','connected']);
  await enforceUserRateLimit(db, auth.id, "voice-v2-chat", 50, 60 * 1000, 60 * 1000);
  const kind = body.kind === 'emoji' ? 'emoji' : 'text';
  const max = kind === 'emoji' ? 16 : 500;
  const message = cleanText(body.message, max);
  if (!message) return apiError("MESSAGE_REQUIRED", "Write a message first", 400);
  const result = await db.prepare("INSERT INTO voice_v2_messages(room_id,user_id,message,kind,created_at) VALUES(?,?,?,?,?)")
    .bind(room.id, auth.id, message, kind, Date.now()).run();
  return apiJson({ ok: true, id: Number(result.meta?.last_row_id || 0) }, 201);
}

async function voiceV2SignalsGet(request, url, env) {
  const roomId = cleanText(url.searchParams.get("room"), 80);
  const after = Math.max(0, Number(url.searchParams.get("after") || 0));
  const { db, auth } = await voiceV2AuthRoom(request, env, roomId, ['admitted','connected']);
  const rows = await db.prepare(`SELECT id,from_user_id AS fromUserId,kind,payload_json AS payloadJson,created_at AS createdAt
    FROM voice_v2_signals
    WHERE room_id=? AND to_user_id=? AND id>? AND expires_at>?
    ORDER BY id ASC LIMIT 100`).bind(roomId, auth.id, after, Date.now()).all();
  return apiJson({ signals: (rows.results || []).map(row => ({
    id: Number(row.id), fromUserId: row.fromUserId, kind: row.kind,
    payload: (() => { try { return JSON.parse(row.payloadJson || '{}'); } catch { return {}; } })(),
    createdAt: Number(row.createdAt || 0)
  })) });
}

async function voiceV2SignalsPost(request, env) {
  requireSameOrigin(request);
  const body = await readJson(request);
  const { db, auth, room } = await voiceV2AuthRoom(request, env, body.roomId, ['admitted','connected']);
  const toUserId = cleanText(body.toUserId, 100);
  const kind = cleanText(body.kind, 16);
  if (!['offer','answer','ice'].includes(kind)) return apiError("INVALID_SIGNAL", "Invalid voice signal", 400);
  const target = await db.prepare("SELECT 1 FROM voice_room_members WHERE room_id=? AND user_id=? AND status='connected'").bind(room.id, toUserId).first();
  if (!target) return apiError("VOICE_PEER_GONE", "That member is no longer connected", 409);
  const payload = JSON.stringify(body.payload || {});
  if (payload.length > 24000) return apiError("SIGNAL_TOO_LARGE", "Voice signal is too large", 413);
  const now = Date.now();
  await db.prepare("INSERT INTO voice_v2_signals(room_id,from_user_id,to_user_id,kind,payload_json,created_at,expires_at) VALUES(?,?,?,?,?,?,?)")
    .bind(room.id, auth.id, toUserId, kind, payload, now, now + VOICE_V2_SIGNAL_TTL_MS).run();
  return apiJson({ ok: true }, 201);
}



async function voiceV2Ice(request, url, env) {
  const roomId = cleanText(url.searchParams.get("room"), 80);
  const { auth } = await voiceV2AuthRoom(request, env, roomId, ['admitted','connected']);

  // Keep multiple STUN choices so a single provider outage does not stall a call.
  const fallback = [
    { urls: ["stun:stun.cloudflare.com:3478"] },
    { urls: ["stun:stun.l.google.com:19302"] }
  ];

  try {
    const expiresAt = Math.floor(Date.now() / 1000) + OPEN_RELAY_TTL_SECONDS;
    const username = `${expiresAt}:${auth.id}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(OPEN_RELAY_STATIC_SECRET),
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"]
    );
    const signed = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(username)));
    let binary = "";
    signed.forEach(byte => { binary += String.fromCharCode(byte); });
    const credential = btoa(binary);

    return apiJson({
      iceServers: [
        ...fallback,
        {
          urls: [
            `turn:${OPEN_RELAY_HOST}:80?transport=udp`,
            `turn:${OPEN_RELAY_HOST}:80?transport=tcp`,
            `turn:${OPEN_RELAY_HOST}:443?transport=tcp`,
            `turns:${OPEN_RELAY_HOST}:443?transport=tcp`
          ],
          username,
          credential
        }
      ],
      relayAvailable: true,
      expiresAt: expiresAt * 1000
    });
  } catch (error) {
    return apiJson({ iceServers: fallback, relayAvailable: false });
  }
}

// ── Supernova voice rooms ───────────────────────────────────────────────────

async function getVoiceRooms(request, env) {
  const auth = await requireSocialUser(request, getDb(env));
  const now = Date.now();
  await cleanupVoiceState(env, now);
  await expireStaleVoiceRooms(env, now);
  const result = await getDb(env).prepare(`${voiceRoomSelect()}
    WHERE vr.status='active' ORDER BY vr.updated_at DESC LIMIT 40`).all();
  const rooms = [];
  for (const row of result.results || []) {
    if (await canViewVoiceRoom(getDb(env), auth.id, row)) rooms.push(await exposeVoiceRoom(getDb(env), auth, row, false));
  }
  return apiJson({
    rooms,
    canCreate: await hasVoiceSponsorAccess(getDb(env), auth),
    relayConfigured: true,
    relayProvider: "open-relay",
    maxMembers: VOICE_MAX_MEMBERS,
    sponsorGraceMs: VOICE_SPONSOR_GRACE_MS
  });
}

async function getVoiceRoom(request, url, env) {
  const auth = await requireSocialUser(request, getDb(env));
  await cleanupVoiceState(env, Date.now());
  const room = await loadVoiceRoom(getDb(env), cleanText(url.searchParams.get("room"), 80));
  if (!room || room.status !== "active" || !(await canViewVoiceRoom(getDb(env), auth.id, room))) return apiError("VOICE_ROOM_NOT_FOUND", "Voice room not found", 404);
  return apiJson({ room: await exposeVoiceRoom(getDb(env), auth, room, true), canCreate: await hasVoiceSponsorAccess(getDb(env), auth) });
}

async function createVoiceRoom(request, env) {
  requireSameOrigin(request);
  const auth = await requireSocialUser(request, getDb(env));
  await cleanupVoiceState(env, Date.now());
  if (!(await hasVoiceSponsorAccess(getDb(env), auth))) return apiError("SUPERNOVA_REQUIRED", "Supernova is required to start a voice room", 403);
  const restriction = await activeVoiceRestriction(getDb(env), auth.id);
  if (restriction) return voiceRestrictionError(restriction);
  const existing = await getDb(env).prepare(`SELECT vr.id FROM voice_rooms vr LEFT JOIN voice_room_members vm ON vm.room_id=vr.id AND vm.user_id=?
    WHERE vr.status='active' AND (vr.created_by=? OR vr.host_id=? OR vm.status IN ('admitted','connected')) LIMIT 1`).bind(auth.id, auth.id, auth.id).first();
  if (existing) return apiError("VOICE_ROOM_ACTIVE", "Leave or end your current voice room first", 409, { roomId: existing.id });
  const body = await readJson(request);
  const name = cleanText(body.name, 48);
  if (name.length < 2) return apiError("INVALID_ROOM_NAME", "Use a voice room name with at least 2 characters", 400);
  let scopeType = "friends";
  // Public is the product default. Explicit friends, invite, and group values
  // remain available, but missing scope values from cached clients no longer
  // create a room that is invisible to most Nova users.
  let scopeId = "everyone";
  const scope = cleanText(body.scope, 100);
  if (scope === "friends") scopeId = null;
  else if (scope === "invite") { scopeType = "invite"; scopeId = null; }
  else if (scope.startsWith("group:")) {
    scopeId = cleanText(scope.slice(6), 80);
    const membership = await getDb(env).prepare("SELECT 1 FROM social_channel_members m JOIN social_channels c ON c.id=m.channel_id WHERE m.user_id=? AND m.channel_id=? AND c.kind='group'").bind(auth.id, scopeId).first();
    if (!membership) return apiError("GROUP_NOT_FOUND", "Choose a Social group you belong to", 404);
    scopeType = "group";
  }
  const requestedInvites = (Array.isArray(body.invites) ? body.invites : String(body.invites || "").split(","))
    .map(normalizeUsername).filter(Boolean).filter((username, index, all) => all.indexOf(username) === index && username !== auth.username).slice(0, VOICE_MAX_MEMBERS - 1);
  if (scopeType === "invite" && !requestedInvites.length) return apiError("VOICE_INVITES_REQUIRED", "Add at least one friend to an invite-only room", 400);
  const invitedUsers = [];
  for (const username of requestedInvites) {
    const invited = await loadUserByUsername(getDb(env), username);
    if (!invited) return apiError("USER_NOT_FOUND", `@${username} was not found`, 404);
    const friend = await getDb(env).prepare("SELECT 1 FROM friendships WHERE status='accepted' AND ((requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)) LIMIT 1")
      .bind(auth.id, invited.id, invited.id, auth.id).first();
    if (!friend || await isBlockedBetween(getDb(env), auth.id, invited.id)) return apiError("VOICE_INVITE_NOT_FRIEND", `@${username} must be an accepted friend`, 403);
    invitedUsers.push(invited);
  }
  // Count only valid room creations. The former 5-per-day limiter ran before
  // validation and could lock users out for an hour during connection retries.
  await enforceUserRateLimit(getDb(env), auth.id, "voice-create-v2", 20, 10 * 60 * 1000, 2 * 60 * 1000);
  const id = `vc_${crypto.randomUUID()}`;
  const now = Date.now();
  const statements = [
    getDb(env).prepare("INSERT INTO voice_rooms(id,name,scope_type,scope_id,created_by,host_id,status,locked,dictation_enabled,max_members,created_at,updated_at) VALUES(?,?,?,?,?,?,'active',0,1,?,?,?)")
      .bind(id, name, scopeType, scopeId, auth.id, auth.id, VOICE_MAX_MEMBERS, now, now),
    getDb(env).prepare("INSERT INTO voice_room_members(room_id,user_id,role,status,admitted_by,dictation_enabled,requested_at,admitted_at,joined_at,last_seen_at) VALUES(?,?,'host','admitted',?,1,?,?,?,?)")
      .bind(id, auth.id, auth.id, now, now, now, now),
    voiceEventStatement(getDb(env), id, auth.id, auth.id, "created", { scopeType, scopeId }, now)
  ];
  for (const invited of invitedUsers) {
    statements.push(getDb(env).prepare("INSERT INTO voice_room_members(room_id,user_id,role,status,dictation_enabled,requested_at,last_seen_at) VALUES(?,?,'member','invited',1,?,?)")
      .bind(id, invited.id, now, now));
    statements.push(voiceEventStatement(getDb(env), id, auth.id, invited.id, "invited", {}, now));
  }
  await getDb(env).batch(statements);
  const room = await loadVoiceRoom(getDb(env), id);
  return apiJson({ room: await exposeVoiceRoom(getDb(env), auth, room, true) }, 201);
}


async function ensureVoiceHostMembership(env, auth, room) {
  if (!room || !auth || (room.hostId !== auth.id && room.createdById !== auth.id)) return;
  const now = Date.now();
  await getDb(env).prepare(`INSERT INTO voice_room_members(
      room_id,user_id,role,status,admitted_by,dictation_enabled,requested_at,admitted_at,joined_at,last_seen_at,left_at
    ) VALUES(?,?,'host','admitted',?,1,?,?,?,?,NULL)
    ON CONFLICT(room_id,user_id) DO UPDATE SET
      role='host',
      status=CASE WHEN voice_room_members.status='connected' THEN 'connected' ELSE 'admitted' END,
      admitted_by=excluded.admitted_by,
      admitted_at=COALESCE(voice_room_members.admitted_at,excluded.admitted_at),
      joined_at=COALESCE(voice_room_members.joined_at,excluded.joined_at),
      last_seen_at=excluded.last_seen_at,
      left_at=NULL`)
    .bind(room.id, auth.id, auth.id, now, now, now, now).run();
}

async function requestVoiceRoomJoin(request, env) {
  requireSameOrigin(request);
  const auth = await requireSocialUser(request, getDb(env));
  await cleanupVoiceState(env, Date.now());
  await enforceUserRateLimit(getDb(env), auth.id, "voice-join", 20, 10 * 60 * 1000, 10 * 60 * 1000);
  const restriction = await activeVoiceRestriction(getDb(env), auth.id);
  if (restriction) return voiceRestrictionError(restriction);
  const body = await readJson(request);
  const room = await loadVoiceRoom(getDb(env), cleanText(body.roomId, 80));
  if (room && room.status === "active") await ensureVoiceHostMembership(env, auth, room);
  if (!room || room.status !== "active" || !(await canViewVoiceRoom(getDb(env), auth.id, room))) return apiError("VOICE_ROOM_NOT_FOUND", "Voice room not found", 404);
  const otherRoom = await getDb(env).prepare(`SELECT vr.id FROM voice_rooms vr JOIN voice_room_members vm ON vm.room_id=vr.id
    WHERE vr.status='active' AND vr.id<>? AND vm.user_id=? AND vm.status IN ('admitted','connected') LIMIT 1`).bind(room.id, auth.id).first();
  if (otherRoom) return apiError("VOICE_ROOM_ACTIVE", "Leave your current voice room first", 409, { roomId: otherRoom.id });
  if (room.locked) return apiError("VOICE_ROOM_LOCKED", "This voice room is locked", 423);
  if (await voiceBlockConflict(getDb(env), room.id, auth.id)) return apiError("VOICE_BLOCK_CONFLICT", "A block prevents you from sharing this voice room", 403);
  const member = await getDb(env).prepare("SELECT status FROM voice_room_members WHERE room_id=? AND user_id=?").bind(room.id, auth.id).first();
  if (member && ["admitted", "connected"].includes(member.status)) return apiJson({ status: member.status, admitted: true, roomId: room.id });
  const count = await getDb(env).prepare("SELECT COUNT(*) AS count FROM voice_room_members WHERE room_id=? AND status IN ('admitted','connected')").bind(room.id).first();
  if (Number(count?.count || 0) >= Math.min(VOICE_MAX_MEMBERS, Number(room.maxMembers || VOICE_MAX_MEMBERS))) return apiError("VOICE_ROOM_FULL", "This voice room is full", 409);
  const now = Date.now();
  await getDb(env).batch([
    getDb(env).prepare(`INSERT INTO voice_room_members(room_id,user_id,role,status,dictation_enabled,requested_at,last_seen_at)
      VALUES(?,?,'member','pending',1,?,?) ON CONFLICT(room_id,user_id) DO UPDATE SET status='pending',role='member',requested_at=excluded.requested_at,left_at=NULL,last_seen_at=excluded.last_seen_at`)
      .bind(room.id, auth.id, now, now),
    voiceEventStatement(getDb(env), room.id, auth.id, auth.id, "join_requested", {}, now)
  ]);
  await notifyVoiceRoom(env, room.id, { type: "join-request", audience: "admitters", roomId: room.id, user: voiceIdentity(auth), createdAt: now }, true, "join-request");
  return apiJson({ status: "pending", admitted: false, roomId: room.id }, 202);
}

async function admitVoiceRoomMember(request, env) {
  requireSameOrigin(request);
  const auth = await requireSocialUser(request, getDb(env));
  await enforceUserRateLimit(getDb(env), auth.id, "voice-admit", 60, 10 * 60 * 1000, 10 * 60 * 1000);
  const body = await readJson(request);
  const room = await loadVoiceRoom(getDb(env), cleanText(body.roomId, 80));
  if (!room || room.status !== "active") return apiError("VOICE_ROOM_NOT_FOUND", "Voice room not found", 404);
  if (!(await canAdmitVoiceRoom(getDb(env), auth, room))) return apiError("VOICE_ADMISSION_FORBIDDEN", "Only the connected host or a connected Supernova member can admit people", 403);
  const target = await loadUserByUsername(getDb(env), normalizeUsername(body.username));
  if (!target) return apiError("USER_NOT_FOUND", "User not found", 404);
  const pending = await getDb(env).prepare("SELECT status FROM voice_room_members WHERE room_id=? AND user_id=?").bind(room.id, target.id).first();
  if (!pending || pending.status !== "pending") return apiError("VOICE_REQUEST_NOT_FOUND", "That join request is no longer pending", 404);
  const action = cleanText(body.action, 12);
  if (!['approve','deny'].includes(action)) return apiError("INVALID_ACTION", "Choose approve or deny", 400);
  const now = Date.now();
  if (action === "approve") {
    const count = await getDb(env).prepare("SELECT COUNT(*) AS count FROM voice_room_members WHERE room_id=? AND status IN ('admitted','connected')").bind(room.id).first();
    if (Number(count?.count || 0) >= Math.min(VOICE_MAX_MEMBERS, Number(room.maxMembers || VOICE_MAX_MEMBERS))) return apiError("VOICE_ROOM_FULL", "This voice room is full", 409);
    if (await voiceBlockConflict(getDb(env), room.id, target.id)) return apiError("VOICE_BLOCK_CONFLICT", "A block prevents that user from sharing this room", 403);
    const sponsor = await hasVoiceSponsorAccess(getDb(env), target);
    await getDb(env).prepare("UPDATE voice_room_members SET status='admitted',role=?,admitted_by=?,admitted_at=?,left_at=NULL WHERE room_id=? AND user_id=?")
      .bind(sponsor ? "supernova" : "member", auth.id, now, room.id, target.id).run();
  } else {
    await getDb(env).prepare("UPDATE voice_room_members SET status='denied',admitted_by=?,left_at=? WHERE room_id=? AND user_id=?").bind(auth.id, now, room.id, target.id).run();
  }
  await voiceEvent(getDb(env), room.id, auth.id, target.id, action === "approve" ? "admitted" : "denied", {});
  await notifyVoiceRoom(env, room.id, { type: action === "approve" ? "admission-approved" : "admission-denied", targetUserId: target.id, username: target.username }, true, `admission-${action}`);
  return apiJson({ ok: true, action, username: target.username });
}

async function leaveVoiceRoom(request, env) {
  requireSameOrigin(request);
  const auth = await requireSocialUser(request, getDb(env));
  const body = await readJson(request);
  const room = await loadVoiceRoom(getDb(env), cleanText(body.roomId, 80));
  if (!room) return apiError("VOICE_ROOM_NOT_FOUND", "Voice room not found", 404);
  const member = await getDb(env).prepare("SELECT status FROM voice_room_members WHERE room_id=? AND user_id=?").bind(room.id, auth.id).first();
  if (!member) return apiJson({ ok: true });
  const now = Date.now();
  await getDb(env).prepare("UPDATE voice_room_members SET status='left',connected_at=NULL,last_seen_at=?,left_at=? WHERE room_id=? AND user_id=?").bind(now, now, room.id, auth.id).run();
  await voiceEvent(getDb(env), room.id, auth.id, auth.id, "left", {});
  await commandVoiceRoom(env, room.id, { action: "close-user", targetUserId: auth.id, reason: "You left the voice room" });
  await endVoiceRoomIfEmpty(env, room.id, now);
  return apiJson({ ok: true });
}

async function voiceRoomAction(request, env) {
  requireSameOrigin(request);
  const auth = await requireSocialUser(request, getDb(env));
  await enforceUserRateLimit(getDb(env), auth.id, "voice-action", 90, 10 * 60 * 1000, 10 * 60 * 1000);
  const body = await readJson(request);
  const room = await loadVoiceRoom(getDb(env), cleanText(body.roomId, 80));
  if (!room || room.status !== "active") return apiError("VOICE_ROOM_NOT_FOUND", "Voice room not found", 404);
  const action = cleanText(body.action, 24);
  const selfMember = await getDb(env).prepare("SELECT status FROM voice_room_members WHERE room_id=? AND user_id=?").bind(room.id, auth.id).first();
  if (!selfMember || !["admitted", "connected"].includes(selfMember.status)) return apiError("VOICE_NOT_MEMBER", "Join the room first", 403);
  if (action === "member-dictation") {
    const enabled = !!body.enabled;
    await getDb(env).prepare("UPDATE voice_room_members SET dictation_enabled=? WHERE room_id=? AND user_id=?").bind(enabled ? 1 : 0, room.id, auth.id).run();
    await notifyVoiceRoom(env, room.id, null, true, "member-dictation");
    return apiJson({ ok: true, enabled });
  }
  if (room.hostId !== auth.id) return apiError("VOICE_HOST_REQUIRED", "Only the room host can do that", 403);
  const now = Date.now();
  if (action === "lock" || action === "dictation") {
    const enabled = !!body.enabled;
    if (action === "lock") await getDb(env).prepare("UPDATE voice_rooms SET locked=?,updated_at=? WHERE id=?").bind(enabled ? 1 : 0, now, room.id).run();
    else await getDb(env).prepare("UPDATE voice_rooms SET dictation_enabled=?,updated_at=? WHERE id=?").bind(enabled ? 1 : 0, now, room.id).run();
    await voiceEvent(getDb(env), room.id, auth.id, null, action, { enabled });
    await notifyVoiceRoom(env, room.id, null, true, action);
    return apiJson({ ok: true, enabled });
  }
  if (action === "end") {
    await commandVoiceRoom(env, room.id, { action: "end", actorId: auth.id, reason: "The host ended the room" });
    return apiJson({ ok: true });
  }
  const target = await loadUserByUsername(getDb(env), normalizeUsername(body.username));
  if (!target) return apiError("USER_NOT_FOUND", "User not found", 404);
  const targetMember = await getDb(env).prepare("SELECT status FROM voice_room_members WHERE room_id=? AND user_id=?").bind(room.id, target.id).first();
  if (!targetMember || !["admitted", "connected"].includes(targetMember.status)) return apiError("VOICE_MEMBER_NOT_FOUND", "That user is not in this room", 404);
  if (action === "kick") {
    if (target.id === auth.id) return apiError("INVALID_TARGET", "Use Leave to exit your own room", 400);
    await getDb(env).prepare("UPDATE voice_room_members SET status='removed',connected_at=NULL,left_at=? WHERE room_id=? AND user_id=?").bind(now, room.id, target.id).run();
    await voiceEvent(getDb(env), room.id, auth.id, target.id, "removed", {});
    await commandVoiceRoom(env, room.id, { action: "close-user", targetUserId: target.id, reason: "The host removed you" });
    return apiJson({ ok: true });
  }
  if (action === "mute") {
    const muted = !!body.muted;
    await getDb(env).prepare("UPDATE voice_room_members SET muted_by_host=? WHERE room_id=? AND user_id=?").bind(muted ? 1 : 0, room.id, target.id).run();
    await voiceEvent(getDb(env), room.id, auth.id, target.id, "host_mute", { muted });
    await commandVoiceRoom(env, room.id, { action: "force-mute", targetUserId: target.id, muted });
    return apiJson({ ok: true, muted });
  }
  if (action === "transfer") {
    if (!(await hasVoiceSponsorAccess(getDb(env), target)) || targetMember.status !== "connected") return apiError("VOICE_SPONSOR_REQUIRED", "Host can only transfer to a connected Supernova member", 409);
    await getDb(env).batch([
      getDb(env).prepare("UPDATE voice_rooms SET host_id=?,updated_at=? WHERE id=?").bind(target.id, now, room.id),
      getDb(env).prepare("UPDATE voice_room_members SET role=CASE WHEN user_id=? THEN 'host' WHEN role='host' THEN 'member' ELSE role END WHERE room_id=?").bind(target.id, room.id)
    ]);
    await voiceEvent(getDb(env), room.id, auth.id, target.id, "host_transferred", { automatic: false });
    await commandVoiceRoom(env, room.id, { action: "sync-host", targetUserId: target.id });
    await notifyVoiceRoom(env, room.id, { type: "host-transfer", fromUserId: auth.id, hostUserId: target.id }, true, "host-transfer");
    return apiJson({ ok: true, host: target.username });
  }
  return apiError("INVALID_ACTION", "Unknown voice room action", 400);
}

async function publishVoiceTranscript(request, env) {
  requireSameOrigin(request);
  const auth = await requireSocialUser(request, getDb(env));
  await enforceUserRateLimit(getDb(env), auth.id, "voice-dictation", 45, 60 * 1000, 60 * 1000);
  const body = await readJson(request);
  const room = await loadVoiceRoom(getDb(env), cleanText(body.roomId, 80));
  if (!room || room.status !== "active" || !room.dictationEnabled) return apiError("VOICE_DICTATION_OFF", "Dictation is disabled for this room", 409);
  const member = await getDb(env).prepare("SELECT status,dictation_enabled,muted_by_host FROM voice_room_members WHERE room_id=? AND user_id=?").bind(room.id, auth.id).first();
  if (!member || member.status !== "connected" || !member.dictation_enabled || member.muted_by_host) return apiError("VOICE_DICTATION_FORBIDDEN", "Dictation is not available for your microphone", 403);
  const text = cleanText(body.text, 500);
  if (!text) return apiError("EMPTY_DICTATION", "No dictated text was detected", 400);
  const moderation = moderateChatText(text, room.scopeType === "group" ? "group" : "dm");
  if (!moderation.allowed) {
    await recordChatModerationEvent(getDb(env), auth.id, `voice:${room.id}`, moderation.rule, text);
    await voiceEvent(getDb(env), room.id, auth.id, auth.id, "dictation_filtered", { rule: moderation.rule });
    return apiError("DICTATION_FILTERED", "That dictated segment was hidden by Nova safety", 422, { rule: moderation.rule });
  }
  const createdAt = Date.now();
  const line = { id: randomToken(10), userId: auth.id, username: auth.username, displayName: auth.display_name || auth.username, avatarUrl: auth.avatar_url || "", text, createdAt };
  await notifyVoiceRoom(env, room.id, { type: "transcript", line }, false);
  return apiJson({ line }, 201);
}

async function transcribeVoiceAudio(request, env) {
  requireSameOrigin(request);
  const auth = await requireSocialUser(request, getDb(env));
  await enforceUserRateLimit(getDb(env), auth.id, "voice-transcribe", 15, 60 * 1000, 60 * 1000);
  const roomId = cleanText(request.headers.get("X-Nova-Voice-Room"), 80);
  const room = await loadVoiceRoom(getDb(env), roomId);
  if (!room || room.status !== "active" || !room.dictationEnabled) return apiError("VOICE_DICTATION_OFF", "Dictation is disabled for this room", 409);
  const member = await getDb(env).prepare("SELECT status,dictation_enabled,muted_by_host FROM voice_room_members WHERE room_id=? AND user_id=?").bind(room.id, auth.id).first();
  if (!member || member.status !== "connected" || !member.dictation_enabled || member.muted_by_host) return apiError("VOICE_DICTATION_FORBIDDEN", "Dictation is not available for your microphone", 403);
  if (!env.AI) return apiError("VOICE_TRANSCRIPTION_UNAVAILABLE", "Nova transcription is temporarily unavailable", 503);
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 1024 * 1024) return apiError("VOICE_AUDIO_TOO_LARGE", "Audio segment is too large", 413);
  const buffer = await request.arrayBuffer();
  if (!buffer.byteLength || buffer.byteLength > 1024 * 1024) return apiError("VOICE_AUDIO_INVALID", "Audio segment is empty or too large", 400);
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  try {
    const language = cleanText(request.headers.get("X-Nova-Language"), 12).split("-")[0].toLowerCase();
    const result = await env.AI.run("@cf/openai/whisper-large-v3-turbo", {
      audio: btoa(binary), task: "transcribe", ...(language ? { language } : {}), vad_filter: true,
      condition_on_previous_text: false, no_speech_threshold: 0.65
    });
    return apiJson({ text: cleanText(result?.text, 500), provider: "cloudflare-workers-ai" });
  } catch (error) {
    console.error("Nova voice transcription failed", { message: cleanText(error?.message, 120), bytes: buffer.byteLength });
    return apiError("VOICE_TRANSCRIPTION_FAILED", "Nova could not transcribe that audio segment", 502);
  }
}

async function reportVoiceParticipant(request, env) {
  requireSameOrigin(request);
  const auth = await requireSocialUser(request, getDb(env));
  await enforceUserRateLimit(getDb(env), auth.id, "voice-report", 8, 24 * 60 * 60 * 1000, 60 * 60 * 1000);
  const body = await readJson(request);
  const room = await loadVoiceRoom(getDb(env), cleanText(body.roomId, 80));
  if (!room) return apiError("VOICE_ROOM_NOT_FOUND", "Voice room not found", 404);
  const reporter = await getDb(env).prepare("SELECT 1 FROM voice_room_members WHERE room_id=? AND user_id=?").bind(room.id, auth.id).first();
  if (!reporter) return apiError("VOICE_NOT_MEMBER", "Only room participants can report a call", 403);
  const target = await loadUserByUsername(getDb(env), normalizeUsername(body.username));
  if (!target) return apiError("USER_NOT_FOUND", "User not found", 404);
  const targetMember = await getDb(env).prepare("SELECT 1 FROM voice_room_members WHERE room_id=? AND user_id=?").bind(room.id, target.id).first();
  if (!targetMember) return apiError("VOICE_MEMBER_NOT_FOUND", "That user was not in this room", 404);
  const reason = cleanText(body.reason, 500);
  if (reason.length < 5) return apiError("REASON_REQUIRED", "Add a brief reason for the report", 400);
  const excerpt = cleanText(body.transcriptExcerpt, 500);
  const id = `vr_${crypto.randomUUID()}`;
  const now = Date.now();
  await getDb(env).prepare("INSERT INTO voice_reports(id,room_id,reporter_id,target_user_id,reason,transcript_excerpt,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'open',?,?)")
    .bind(id, room.id, auth.id, target.id, reason, excerpt, now, now).run();
  await voiceEvent(getDb(env), room.id, auth.id, target.id, "reported", { reportId: id });
  return apiJson({ report: { id, status: "open" } }, 201);
}

async function voiceIceServers(request, env) {
  const auth = await requireSocialUser(request, getDb(env));
  const roomId = cleanText(new URL(request.url).searchParams.get("room"), 80);
  const iceRoom = roomId ? await loadVoiceRoom(getDb(env), roomId) : null;
  if (iceRoom && iceRoom.status === "active") await ensureVoiceHostMembership(env, auth, iceRoom);
  const member = roomId ? await getDb(env).prepare("SELECT 1 FROM voice_room_members WHERE room_id=? AND user_id=? AND status IN ('admitted','connected')").bind(roomId, auth.id).first() : null;
  if (!member) return apiError("VOICE_NOT_ADMITTED", "Voice admission required", 403);
  const fallback = [{ urls: ["stun:stun.cloudflare.com:3478"] }];
  try {
    const expiresAt = Math.floor(Date.now() / 1000) + OPEN_RELAY_TTL_SECONDS;
    const username = `${expiresAt}:${auth.id}`;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(OPEN_RELAY_STATIC_SECRET), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
    const signed = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(username)));
    let binary = "";
    signed.forEach(byte => { binary += String.fromCharCode(byte); });
    const credential = btoa(binary);
    const iceServers = [
      { urls: [`stun:${OPEN_RELAY_HOST}:80`, `stun:${OPEN_RELAY_HOST}:443`] },
      {
        urls: [
          `turn:${OPEN_RELAY_HOST}:80?transport=udp`,
          `turn:${OPEN_RELAY_HOST}:80?transport=tcp`,
          `turn:${OPEN_RELAY_HOST}:443?transport=udp`,
          `turn:${OPEN_RELAY_HOST}:443?transport=tcp`,
          `turns:${OPEN_RELAY_HOST}:443?transport=tcp`
        ],
        username,
        credential
      }
    ];
    return apiJson({ iceServers, relayAvailable: true, relayProvider: "open-relay", expiresAt: expiresAt * 1000 });
  } catch (error) {
    console.error("Nova Open Relay credential generation failed", { status: String(error?.message || "unavailable").slice(0, 80) });
    return apiJson({ iceServers: fallback, relayAvailable: false, relayProvider: "direct" });
  }
}

async function ensureVoiceSfuSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS voice_sfu_tracks (
    room_id TEXT NOT NULL,user_id TEXT NOT NULL,session_id TEXT NOT NULL,track_name TEXT NOT NULL DEFAULT '',updated_at INTEGER NOT NULL,
    PRIMARY KEY(room_id,user_id),FOREIGN KEY(room_id) REFERENCES voice_rooms(id) ON DELETE CASCADE
  )`).run();
}

async function requireVoiceSfuMember(request, env, roomId) {
  const auth = await requireSocialUser(request, getDb(env));
  const room = await loadVoiceRoom(getDb(env), roomId);
  if (!room || room.status !== "active") throw new ApiFailure("VOICE_ROOM_NOT_FOUND", "Voice room not found", 404);
  await ensureVoiceHostMembership(env, auth, room);
  const member = await getDb(env).prepare("SELECT status FROM voice_room_members WHERE room_id=? AND user_id=?").bind(roomId, auth.id).first();
  if (!member || !["admitted","connected"].includes(member.status)) throw new ApiFailure("VOICE_NOT_ADMITTED", "Voice admission required", 403);
  if (await voiceBlockConflict(getDb(env), roomId, auth.id)) throw new ApiFailure("VOICE_BLOCK_CONFLICT", "A block prevents this voice connection", 403);
  return { auth, room };
}

async function realtimeFetch(env, suffix, method, body) {
  if (!env.REALTIME_APP_ID || !env.REALTIME_APP_SECRET) throw new ApiFailure("VOICE_SFU_UNAVAILABLE", "Nova Realtime is not configured", 503);
  const headers = { Authorization: `Bearer ${env.REALTIME_APP_SECRET}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`https://rtc.live.cloudflare.com/apps/${env.REALTIME_APP_ID}${suffix}`, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const result = await response.json().catch(() => ({}));
  const trackError = Array.isArray(result.tracks) && result.tracks.find(track => track && track.errorCode);
  if (!response.ok || result.errorCode || trackError) throw new ApiFailure("VOICE_SFU_ERROR", cleanText(result.errorDescription || trackError?.errorDescription || result.message || "Realtime connection failed", 180), 502);
  return result;
}

async function voiceSfuTracks(request, url, env) {
  await ensureVoiceSfuSchema(getDb(env));
  const roomId = cleanText(url.searchParams.get("room"), 80);
  const { auth } = await requireVoiceSfuMember(request, env, roomId);
  const now = Date.now();
  await getDb(env).batch([
    getDb(env).prepare("UPDATE voice_sfu_tracks SET updated_at=? WHERE room_id=? AND user_id=?").bind(now, roomId, auth.id),
    getDb(env).prepare("UPDATE voice_room_members SET last_seen_at=? WHERE room_id=? AND user_id=? AND status='connected'").bind(now, roomId, auth.id)
  ]);
  const rows = await getDb(env).prepare("SELECT u.username,t.user_id AS userId,t.session_id AS sessionId,t.track_name AS trackName FROM voice_sfu_tracks t JOIN users u ON u.id=t.user_id JOIN voice_room_members m ON m.room_id=t.room_id AND m.user_id=t.user_id AND m.status='connected' WHERE t.room_id=? AND t.user_id<>? AND t.track_name<>'' AND t.updated_at>? ORDER BY lower(u.username)").bind(roomId, auth.id, now - 45000).all();
  return apiJson({ tracks: rows.results || [], provider: "cloudflare-realtime" });
}

async function voiceSfuAction(request, env) {
  requireSameOrigin(request);
  await ensureVoiceSfuSchema(getDb(env));
  const body = await readJson(request);
  const roomId = cleanText(body.roomId, 80);
  const action = cleanText(body.action, 24);
  const { auth } = await requireVoiceSfuMember(request, env, roomId);
  if (action === "new-session") {
    const result = await realtimeFetch(env, "/sessions/new", "POST");
    await getDb(env).prepare("INSERT INTO voice_sfu_tracks(room_id,user_id,session_id,track_name,updated_at) VALUES(?,?,?,'',?) ON CONFLICT(room_id,user_id) DO UPDATE SET session_id=excluded.session_id,track_name='',updated_at=excluded.updated_at").bind(roomId, auth.id, cleanText(result.sessionId, 120), Date.now()).run();
    await getDb(env).prepare("UPDATE voice_room_members SET status='connected',connected_at=COALESCE(connected_at,?),last_seen_at=? WHERE room_id=? AND user_id=?").bind(Date.now(), Date.now(), roomId, auth.id).run();
    await voiceEvent(getDb(env), roomId, auth.id, auth.id, "sfu_session", { provider: "cloudflare-realtime" });
    return apiJson(result);
  }
  const own = await getDb(env).prepare("SELECT session_id AS sessionId FROM voice_sfu_tracks WHERE room_id=? AND user_id=?").bind(roomId, auth.id).first();
  const sessionId = cleanText(body.sessionId, 120);
  if (!own || own.sessionId !== sessionId) return apiError("VOICE_SFU_SESSION", "That Realtime session is not yours", 403);
  if (action === "publish") {
    const trackName = cleanText(body.trackName, 120);
    const result = await realtimeFetch(env, `/sessions/${encodeURIComponent(sessionId)}/tracks/new`, "POST", { sessionDescription: body.sessionDescription, tracks: [{ location: "local", mid: cleanText(body.mid, 20), trackName }] });
    await voiceEvent(getDb(env), roomId, auth.id, auth.id, "sfu_publish_accepted", {});
    return apiJson(result);
  }
  if (action === "ready") {
    const trackName = cleanText(body.trackName, 120);
    if (!trackName) return apiError("VOICE_SFU_TRACK", "Audio track is missing", 400);
    await getDb(env).prepare("UPDATE voice_sfu_tracks SET track_name=?,updated_at=? WHERE room_id=? AND user_id=?").bind(trackName, Date.now(), roomId, auth.id).run();
    await voiceEvent(getDb(env), roomId, auth.id, auth.id, "sfu_published", {});
    return apiJson({ ok: true });
  }
  if (action === "subscribe") {
    const remoteSessionId = cleanText(body.remoteSessionId, 120), trackName = cleanText(body.trackName, 120);
    const allowed = await getDb(env).prepare("SELECT 1 FROM voice_sfu_tracks WHERE room_id=? AND session_id=? AND track_name=? AND user_id<>?").bind(roomId, remoteSessionId, trackName, auth.id).first();
    if (!allowed) return apiError("VOICE_SFU_TRACK", "That audio track is not in this room", 403);
    const result = await realtimeFetch(env, `/sessions/${encodeURIComponent(sessionId)}/tracks/new`, "POST", { tracks: [{ location: "remote", sessionId: remoteSessionId, trackName }] });
    await voiceEvent(getDb(env), roomId, auth.id, null, "sfu_subscribed", {});
    return apiJson(result);
  }
  if (action === "renegotiate") return apiJson(await realtimeFetch(env, `/sessions/${encodeURIComponent(sessionId)}/renegotiate`, "PUT", { sessionDescription: body.sessionDescription }));
  if (action === "leave") {
    const now = Date.now();
    await getDb(env).batch([
      getDb(env).prepare("DELETE FROM voice_sfu_tracks WHERE room_id=? AND user_id=?").bind(roomId, auth.id),
      getDb(env).prepare("UPDATE voice_room_members SET status='left',connected_at=NULL,last_seen_at=?,left_at=? WHERE room_id=? AND user_id=? AND status IN ('admitted','connected')").bind(now, now, roomId, auth.id)
    ]);
    await endVoiceRoomIfEmpty(env, roomId, now);
    return apiJson({ ok: true });
  }
  return apiError("INVALID_ACTION", "Unknown Realtime action", 400);
}

async function voiceRoomWebSocket(request, url, env) {
  requireVoiceSocketOrigin(request);
  await cleanupVoiceState(env, Date.now());
  if (!env.VOICE_ROOMS) return apiError("VOICE_COORDINATOR_UNAVAILABLE", "Voice rooms are not bound", 503);
  const auth = await requireSocialUser(request, getDb(env));
  const restriction = await activeVoiceRestriction(getDb(env), auth.id);
  if (restriction) return voiceRestrictionError(restriction);
  const room = await loadVoiceRoom(getDb(env), cleanText(url.searchParams.get("room"), 80));
  if (!room || room.status !== "active") return apiError("VOICE_ROOM_NOT_FOUND", "Voice room not found", 404);
  await ensureVoiceHostMembership(env, auth, room);
  let member = await getDb(env).prepare("SELECT status,muted_by_host FROM voice_room_members WHERE room_id=? AND user_id=?").bind(room.id, auth.id).first();
  const isHost = room.hostId === auth.id || room.createdById === auth.id;
  /* The room creator/host is authoritative and can never be placed in the
     admission lobby, even if a stale membership row survived a disconnect. */
  if (isHost && (!member || !["admitted", "connected"].includes(member.status))) {
    const now = Date.now();
    await getDb(env).prepare(`INSERT INTO voice_room_members(room_id,user_id,role,status,admitted_by,dictation_enabled,requested_at,admitted_at,joined_at,last_seen_at,left_at)
      VALUES(?,?,'host','admitted',?,1,?,?,?,?,NULL)
      ON CONFLICT(room_id,user_id) DO UPDATE SET role='host',status='admitted',admitted_by=excluded.admitted_by,admitted_at=COALESCE(voice_room_members.admitted_at,excluded.admitted_at),joined_at=COALESCE(voice_room_members.joined_at,excluded.joined_at),last_seen_at=excluded.last_seen_at,left_at=NULL`)
      .bind(room.id, auth.id, auth.id, now, now, now, now).run();
    member = { status: "admitted", muted_by_host: 0 };
  }
  if (!member || !["pending", "invited", "admitted", "connected"].includes(member.status)) return apiError("VOICE_ADMISSION_REQUIRED", "Request permission to join this voice room", 403);
  if (await voiceBlockConflict(getDb(env), room.id, auth.id)) return apiError("VOICE_BLOCK_CONFLICT", "A block prevents you from sharing this voice room", 403);
  // UNO calls are membership-gated by their game lobby and do not require a
  // Supernova sponsor to remain connected.
  const sponsor = room.id.startsWith("uvc_") || await hasVoiceSponsorAccess(getDb(env), auth);
  const lobby = isHost ? false : ["pending", "invited"].includes(member.status);
  const headers = new Headers(request.headers);
  headers.set("X-Nova-Voice-Room", room.id);
  headers.set("X-Nova-Voice-User", auth.id);
  headers.set("X-Nova-Voice-Username", auth.username);
  headers.set("X-Nova-Voice-Display", encodeURIComponent(auth.display_name || auth.username));
  headers.set("X-Nova-Voice-Avatar", encodeURIComponent(String(auth.avatar_url || "").slice(0, 1800)));
  headers.set("X-Nova-Voice-Lobby", lobby ? "1" : "0");
  headers.set("X-Nova-Voice-Supernova", sponsor ? "1" : "0");
  headers.set("X-Nova-Voice-Host", room.hostId === auth.id ? "1" : "0");
  headers.set("X-Nova-Voice-Muted", member.muted_by_host ? "1" : "0");
  const stub = env.VOICE_ROOMS.get(env.VOICE_ROOMS.idFromName(room.id));
  return stub.fetch(new Request("https://nova-voice.internal/connect", { method: "GET", headers }));
}

async function adminVoice(request, env) {
  const db = getDb(env);
  await requireRole(request, db, ADMIN_ROLES);
  const now = Date.now();
  const [rooms, reports, restrictions] = await db.batch([
    db.prepare(`${voiceRoomSelect()} ORDER BY vr.created_at DESC LIMIT 100`),
    db.prepare(`SELECT r.id,r.room_id AS roomId,r.reason,r.transcript_excerpt AS transcriptExcerpt,r.status,r.created_at AS createdAt,
      reporter.username AS reporter,target.username AS target FROM voice_reports r LEFT JOIN users reporter ON reporter.id=r.reporter_id
      LEFT JOIN users target ON target.id=r.target_user_id ORDER BY CASE r.status WHEN 'open' THEN 0 WHEN 'assigned' THEN 1 ELSE 2 END,r.created_at DESC LIMIT 150`),
    db.prepare(`SELECT vr.user_id AS userId,u.username,vr.reason,vr.created_at AS createdAt,vr.expires_at AS expiresAt
      FROM voice_restrictions vr JOIN users u ON u.id=vr.user_id WHERE vr.revoked_at IS NULL AND (vr.expires_at IS NULL OR vr.expires_at>?) ORDER BY vr.created_at DESC`).bind(now)
  ]);
  return apiJson({ rooms: (rooms.results || []).map(exposeVoiceRoomSummary), reports: reports.results || [], restrictions: restrictions.results || [] });
}

async function adminVoiceAction(request, env) {
  requireSameOrigin(request);
  const db = getDb(env);
  const auth = await requireRole(request, db, ADMIN_ROLES);
  const body = await readJson(request);
  const action = cleanText(body.action, 24);
  const reason = cleanText(body.reason, 500);
  if (!reason) return apiError("REASON_REQUIRED", "An audit reason is required", 400);
  const now = Date.now();
  if (action === "end") {
    const room = await loadVoiceRoom(getDb(env), cleanText(body.roomId, 80));
    if (!room || room.status !== "active") return apiError("VOICE_ROOM_NOT_FOUND", "Active voice room not found", 404);
    await commandVoiceRoom(env, room.id, { action: "end", actorId: auth.id, reason });
    await audit(getDb(env), auth.id, "voice.end", "voice_room", room.id, reason, {});
    return apiJson({ ok: true });
  }
  if (action === "resolve-report" || action === "dismiss-report") {
    const reportId = cleanText(body.reportId, 80);
    const status = action === "resolve-report" ? "resolved" : "dismissed";
    const report = await getDb(env).prepare("SELECT id FROM voice_reports WHERE id=?").bind(reportId).first();
    if (!report) return apiError("VOICE_REPORT_NOT_FOUND", "Voice report not found", 404);
    await getDb(env).prepare("UPDATE voice_reports SET status=?,assigned_to=?,updated_at=? WHERE id=?").bind(status, auth.id, now, reportId).run();
    await audit(getDb(env), auth.id, `voice.report.${status}`, "voice_report", reportId, reason, {});
    return apiJson({ ok: true, status });
  }
  const target = await loadUserByUsername(getDb(env), normalizeUsername(body.username));
  if (!target) return apiError("USER_NOT_FOUND", "User not found", 404);
  if (roleRank(highestRole(auth.roles || ["user"])) <= roleRank(highestRole(target.roles || ["user"]))) return apiError("PROTECTED_ACCOUNT", "You can only apply voice moderation to accounts below your staff level", 403);
  if (action === "restrict") {
    const expiresAt = body.expiresAt == null ? null : Number(body.expiresAt);
    if (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= now)) return apiError("INVALID_EXPIRY", "Restriction expiry must be in the future", 400);
    await getDb(env).prepare(`INSERT INTO voice_restrictions(user_id,reason,issued_by,created_at,expires_at,revoked_at,revoked_by)
      VALUES(?,?,?,?,?,NULL,NULL) ON CONFLICT(user_id) DO UPDATE SET reason=excluded.reason,issued_by=excluded.issued_by,created_at=excluded.created_at,expires_at=excluded.expires_at,revoked_at=NULL,revoked_by=NULL`)
      .bind(target.id, reason, auth.id, now, expiresAt).run();
    const rooms = await getDb(env).prepare("SELECT room_id AS roomId FROM voice_room_members WHERE user_id=? AND status IN ('admitted','connected')").bind(target.id).all();
    for (const row of rooms.results || []) await commandVoiceRoom(env, row.roomId, { action: "close-user", targetUserId: target.id, reason: "Voice access was restricted" });
    await audit(getDb(env), auth.id, "voice.restrict", "user", target.id, reason, { username: target.username, expiresAt });
    return apiJson({ ok: true });
  }
  if (action === "unrestrict") {
    const active = await activeVoiceRestriction(getDb(env), target.id);
    if (!active) return apiError("VOICE_RESTRICTION_NOT_FOUND", "That user has no active voice restriction", 404);
    await getDb(env).prepare("UPDATE voice_restrictions SET revoked_at=?,revoked_by=? WHERE user_id=?").bind(now, auth.id, target.id).run();
    await audit(getDb(env), auth.id, "voice.unrestrict", "user", target.id, reason, { username: target.username });
    return apiJson({ ok: true });
  }
  return apiError("INVALID_ACTION", "Unknown voice administration action", 400);
}

function voiceRoomSelect() {
  return `SELECT vr.id,vr.name,vr.scope_type AS scopeType,vr.scope_id AS scopeId,vr.created_by AS createdById,
    creator.username AS createdBy,vr.host_id AS hostId,host.username AS hostUsername,COALESCE(hp.display_name,host.username) AS hostDisplayName,
    vr.status,vr.locked,vr.dictation_enabled AS dictationEnabled,vr.max_members AS maxMembers,vr.sponsor_deadline_at AS sponsorDeadlineAt,
    vr.created_at AS createdAt,vr.updated_at AS updatedAt,vr.ended_at AS endedAt,
    (SELECT COUNT(*) FROM voice_room_members vm WHERE vm.room_id=vr.id AND vm.status IN ('admitted','connected')) AS memberCount,
    (SELECT COUNT(*) FROM voice_room_members vm WHERE vm.room_id=vr.id AND vm.status='connected') AS connectedCount,
    (SELECT COUNT(*) FROM voice_room_members vm WHERE vm.room_id=vr.id AND vm.status='pending') AS pendingCount
    FROM voice_rooms vr JOIN users creator ON creator.id=vr.created_by JOIN users host ON host.id=vr.host_id LEFT JOIN user_profiles hp ON hp.user_id=host.id`;
}

async function loadVoiceRoom(db, roomId) {
  if (!roomId) return null;
  return db.prepare(`${voiceRoomSelect()} WHERE vr.id=? LIMIT 1`).bind(roomId).first();
}

async function exposeVoiceRoom(db, auth, room, includeMembers) {
  if ((room.hostId === auth.id || room.createdById === auth.id)) {
    const now = Date.now();
    await db.prepare(`INSERT INTO voice_room_members(room_id,user_id,role,status,admitted_by,dictation_enabled,requested_at,admitted_at,joined_at,last_seen_at,left_at)
      VALUES(?,?,'host','admitted',?,1,?,?,?,?,NULL)
      ON CONFLICT(room_id,user_id) DO UPDATE SET role='host',status=CASE WHEN voice_room_members.status='connected' THEN 'connected' ELSE 'admitted' END,admitted_by=excluded.admitted_by,admitted_at=COALESCE(voice_room_members.admitted_at,excluded.admitted_at),joined_at=COALESCE(voice_room_members.joined_at,excluded.joined_at),last_seen_at=excluded.last_seen_at,left_at=NULL`)
      .bind(room.id, auth.id, auth.id, now, now, now, now).run();
  }
  const own = await db.prepare("SELECT role,status,dictation_enabled AS dictationEnabled,muted_by_host AS mutedByHost FROM voice_room_members WHERE room_id=? AND user_id=?").bind(room.id, auth.id).first();
  const sponsor = await hasVoiceSponsorAccess(db, auth);
  const canAdmit = room.hostId === auth.id || (sponsor && own?.status === "connected");
  const exposed = { ...exposeVoiceRoomSummary(room), yourStatus: own?.status || "none", yourRole: own?.role || "none", yourDictationEnabled: own ? !!own.dictationEnabled : true, mutedByHost: !!own?.mutedByHost, canAdmit, canManage: room.hostId === auth.id, isSponsor: sponsor };
  if (!includeMembers) return exposed;
  const statuses = canAdmit ? ["pending", "admitted", "connected"] : ["admitted", "connected"];
  const placeholders = statuses.map(() => "?").join(",");
  const members = await db.prepare(`SELECT vm.user_id AS userId,u.username,COALESCE(p.display_name,u.username) AS displayName,COALESCE(p.avatar_url,'') AS avatarUrl,
    vm.role,vm.status,vm.dictation_enabled AS dictationEnabled,vm.muted_by_host AS mutedByHost,vm.requested_at AS requestedAt,vm.connected_at AS connectedAt
    FROM voice_room_members vm JOIN users u ON u.id=vm.user_id LEFT JOIN user_profiles p ON p.user_id=u.id
    WHERE vm.room_id=? AND vm.status IN (${placeholders}) ORDER BY COALESCE(vm.connected_at,vm.requested_at,vm.admitted_at)`).bind(room.id, ...statuses).all();
  exposed.members = (members.results || []).map(member => ({ ...member, dictationEnabled: !!member.dictationEnabled, mutedByHost: !!member.mutedByHost }));
  return exposed;
}

function exposeVoiceRoomSummary(room) {
  return { id: room.id, name: room.name, scopeType: room.scopeType, scopeId: room.scopeId || null, createdBy: room.createdBy, hostId: room.hostId, hostUsername: room.hostUsername, hostDisplayName: room.hostDisplayName, status: room.status, locked: !!room.locked, dictationEnabled: !!room.dictationEnabled, maxMembers: Math.min(VOICE_MAX_MEMBERS, Number(room.maxMembers || VOICE_MAX_MEMBERS)), memberCount: Number(room.memberCount || 0), connectedCount: Number(room.connectedCount || 0), pendingCount: Number(room.pendingCount || 0), sponsorDeadlineAt: room.sponsorDeadlineAt ? Number(room.sponsorDeadlineAt) : null, createdAt: Number(room.createdAt || 0), updatedAt: Number(room.updatedAt || 0), endedAt: room.endedAt ? Number(room.endedAt) : null };
}

function voiceIdentity(user) {
  return { id: user.id, username: user.username, displayName: user.display_name || user.username, avatarUrl: user.avatar_url || "" };
}

async function canViewVoiceRoom(db, userId, room) {
  if (room.createdById === userId || room.hostId === userId) return true;
  const member = await db.prepare("SELECT 1 FROM voice_room_members WHERE room_id=? AND user_id=?").bind(room.id, userId).first();
  if (member) return true;
  if (room.scopeType === "friends" && room.scopeId === "everyone") return !(await isBlockedBetween(db, userId, room.createdById));
  if (room.scopeType === "invite") return false;
  if (room.scopeType === "group") return !!(await db.prepare("SELECT 1 FROM social_channel_members WHERE channel_id=? AND user_id=?").bind(room.scopeId, userId).first());
  const friend = await db.prepare("SELECT 1 FROM friendships WHERE status='accepted' AND ((requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)) LIMIT 1")
    .bind(userId, room.createdById, room.createdById, userId).first();
  return !!friend && !(await isBlockedBetween(db, userId, room.createdById));
}

async function hasVoiceSponsorAccess(db, user) {
  if (user?.roles?.some(role => STAFF_ROLES.has(role))) return true;
  return !!(await db.prepare("SELECT 1 FROM user_plans WHERE user_id=? AND plan='supernova' AND status='active' AND (expires_at IS NULL OR expires_at>?) LIMIT 1").bind(user.id, Date.now()).first());
}

async function canAdmitVoiceRoom(db, auth, room) {
  const member = await db.prepare("SELECT status FROM voice_room_members WHERE room_id=? AND user_id=?").bind(room.id, auth.id).first();
  if (member?.status !== "connected") return false;
  return room.hostId === auth.id || await hasVoiceSponsorAccess(db, auth);
}

async function activeVoiceRestriction(db, userId) {
  return db.prepare("SELECT reason,expires_at FROM voice_restrictions WHERE user_id=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?) LIMIT 1").bind(userId, Date.now()).first();
}

function voiceRestrictionError(restriction) {
  const expiry = restriction.expires_at ? ` until ${new Date(Number(restriction.expires_at)).toISOString()}` : "";
  return apiError("VOICE_RESTRICTED", `You cannot use voice chat${expiry}. ${restriction.reason}`.trim(), 403, { expiresAt: restriction.expires_at || null });
}

async function voiceBlockConflict(db, roomId, userId) {
  const row = await db.prepare(`SELECT 1 FROM voice_room_members vm JOIN social_blocks b
    ON ((b.blocker_id=? AND b.blocked_id=vm.user_id) OR (b.blocker_id=vm.user_id AND b.blocked_id=?))
    WHERE vm.room_id=? AND vm.status IN ('admitted','connected') AND vm.user_id<>? LIMIT 1`).bind(userId, userId, roomId, userId).first();
  return !!row;
}

function voiceEventStatement(db, roomId, actorId, targetId, type, metadata, now = Date.now()) {
  return db.prepare("INSERT INTO voice_room_events(room_id,actor_id,target_user_id,event_type,metadata_json,created_at,expires_at) VALUES(?,?,?,?,?,?,?)")
    .bind(roomId, actorId || null, targetId || null, type, JSON.stringify(metadata || {}), now, now + VOICE_EVENT_LOG_MS);
}

async function voiceEvent(db, roomId, actorId, targetId, type, metadata) {
  await voiceEventStatement(db, roomId, actorId, targetId, type, metadata).run();
}

async function notifyVoiceRoom(env, roomId, event, refreshState = false, reason = "updated") {
  if (!env.VOICE_ROOMS) return false;
  try {
    const stub = env.VOICE_ROOMS.get(env.VOICE_ROOMS.idFromName(roomId));
    await stub.fetch("https://nova-voice.internal/notify", { method: "POST", headers: { "Content-Type": "application/json", "X-Nova-Voice-Room": roomId }, body: JSON.stringify({ event, refreshState, reason }) });
    return true;
  } catch (error) {
    console.error("Voice coordinator notify failed", { roomId, message: String(error?.message || "failed").slice(0, 100) });
    return false;
  }
}

async function commandVoiceRoom(env, roomId, command) {
  if (!env.VOICE_ROOMS) return false;
  try {
    const stub = env.VOICE_ROOMS.get(env.VOICE_ROOMS.idFromName(roomId));
    await stub.fetch("https://nova-voice.internal/command", { method: "POST", headers: { "Content-Type": "application/json", "X-Nova-Voice-Room": roomId }, body: JSON.stringify(command || {}) });
    return true;
  } catch (error) {
    console.error("Voice coordinator command failed", { roomId, message: String(error?.message || "failed").slice(0, 100) });
    return false;
  }
}

async function cleanupVoiceState(env, now = Date.now()) {
  const db = getDb(env);
  const staleBefore = now - VOICE_MEMBER_STALE_MS;
  try {
    await ensureVoiceSfuSchema(db);
    await db.batch([
      db.prepare("UPDATE voice_room_members SET status='left',connected_at=NULL,left_at=?,last_seen_at=? WHERE status='connected' AND COALESCE(last_seen_at,connected_at,joined_at,admitted_at,requested_at,0)<?").bind(now, now, staleBefore),
      db.prepare("UPDATE voice_room_members SET status='left',connected_at=NULL,left_at=?,last_seen_at=? WHERE status='admitted' AND COALESCE(last_seen_at,admitted_at,requested_at,0)<?").bind(now, now, staleBefore),
      db.prepare("DELETE FROM voice_sfu_tracks WHERE updated_at<?").bind(staleBefore)
    ]);
  } catch (error) {
    console.warn("Voice stale-member cleanup failed", String(error?.message || error).slice(0, 120));
  }

  const empty = await db.prepare(`SELECT vr.id FROM voice_rooms vr
    WHERE vr.status='active' AND vr.created_at<?
    AND NOT EXISTS (SELECT 1 FROM voice_room_members vm WHERE vm.room_id=vr.id AND vm.status IN ('admitted','connected'))
    LIMIT 25`).bind(now - VOICE_EMPTY_ROOM_GRACE_MS).all();
  for (const row of empty.results || []) await endVoiceRoomIfEmpty(env, row.id, now);
}

async function endVoiceRoomIfEmpty(env, roomId, now = Date.now()) {
  const db = getDb(env);
  const live = await db.prepare("SELECT COUNT(*) AS count FROM voice_room_members WHERE room_id=? AND status IN ('admitted','connected')").bind(roomId).first();
  if (Number(live?.count || 0) > 0) return false;
  const room = await db.prepare("SELECT status FROM voice_rooms WHERE id=? LIMIT 1").bind(roomId).first();
  if (!room || room.status !== 'active') return false;
  await db.batch([
    db.prepare("UPDATE voice_rooms SET status='ended',updated_at=?,ended_at=? WHERE id=? AND status='active'").bind(now, now, roomId),
    db.prepare("UPDATE voice_room_members SET status='left',connected_at=NULL,left_at=COALESCE(left_at,?),last_seen_at=? WHERE room_id=? AND status IN ('pending','invited','admitted','connected')").bind(now, now, roomId),
    db.prepare("DELETE FROM voice_sfu_tracks WHERE room_id=?").bind(roomId)
  ]);
  await commandVoiceRoom(env, roomId, { action: "end", reason: "Voice room closed because nobody is connected" });
  return true;
}

async function expireStaleVoiceRooms(env, now = Date.now()) {
  const expired = await getDb(env).prepare("SELECT id FROM voice_rooms WHERE status='active' AND (created_at<? OR (sponsor_deadline_at IS NOT NULL AND sponsor_deadline_at<?)) LIMIT 25").bind(now - VOICE_ROOM_MAX_MS, now).all();
  for (const room of expired.results || []) await commandVoiceRoom(env, room.id, { action: "end", reason: "Voice room expired" });
}

function requireVoiceSocketOrigin(request) {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") throw new ApiFailure("UPGRADE_REQUIRED", "WebSocket upgrade required", 426);
  const origin = request.headers.get("Origin");
  try {
    if (!origin || new URL(origin).origin !== new URL(request.url).origin) throw new Error("mismatch");
  } catch {
    throw new ApiFailure("BAD_ORIGIN", "Cross-origin voice connection blocked", 403);
  }
}

async function getMessages(request, url, db) {
  const auth = await requireUser(request, db);
  const channel = await resolveChannel(db, auth.id, url.searchParams.get("channel") || "everyone", false);
  if (!channel) return apiError("CHANNEL_NOT_FOUND", "Chat not found", 404);
  const after = Math.max(0, Number(url.searchParams.get("after") || 0));
  const order = after ? "ASC" : "DESC";
  const result = await db.prepare(`${messageSelect()} WHERE m.channel_id=? AND m.id>? AND m.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE (b.blocker_id=? AND b.blocked_id=m.sender_id) OR (b.blocker_id=m.sender_id AND b.blocked_id=?))
    ORDER BY m.id ${order} LIMIT 200`).bind(channel.id, after, auth.id, auth.id).all();
  const reactions = await loadChannelReactions(db, channel.id, auth.id);
  const rows = result.results || [];
  if (!after) rows.reverse();
  return apiJson({ channel: channel.publicId, messages: rows.map(exposeMessage), reactions });
}

async function getMessageReactions(request, url, db) {
  const auth = await requireUser(request, db);
  const channel = await resolveChannel(db, auth.id, url.searchParams.get("channel") || "everyone", false);
  if (!channel) return apiError("CHANNEL_NOT_FOUND", "Chat not found", 404);
  const reactions = await loadChannelReactions(db, channel.id, auth.id);
  return apiJson({ channel: channel.publicId, reactions });
}

async function loadChannelReactions(db, channelId, userId) {
  const result = await db.prepare(`
    SELECT r.message_id,r.emoji,COUNT(*) AS reaction_count,
      MAX(CASE WHEN r.user_id=? THEN 1 ELSE 0 END) AS mine
    FROM social_message_reactions r
    WHERE r.message_id IN (
      SELECT id FROM social_messages
      WHERE channel_id=? AND deleted_at IS NULL
      ORDER BY id DESC LIMIT 200
    )
    AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE (b.blocker_id=? AND b.blocked_id=r.user_id) OR (b.blocker_id=r.user_id AND b.blocked_id=?))
    GROUP BY r.message_id,r.emoji
    ORDER BY MIN(r.created_at) ASC`).bind(userId, channelId, userId, userId).all();
  const reactions = {};
  for (const row of result.results || []) {
    const id = String(row.message_id);
    if (!reactions[id]) reactions[id] = [];
    reactions[id].push({ emoji: row.emoji, count: Number(row.reaction_count || 0), mine: !!row.mine });
  }
  return reactions;
}

async function toggleMessageReaction(request, db) {
  requireSameOrigin(request);
  const auth = await requireSocialUser(request, db);
  await enforceUserRateLimit(db, auth.id, "reaction", 60, 60 * 1000, 60 * 1000);
  const body = await readJson(request);
  const channel = await resolveChannel(db, auth.id, cleanText(body.channel, 80) || "everyone", false);
  if (!channel) return apiError("CHANNEL_NOT_FOUND", "Chat not found", 404);
  const restrictionError = await chatRestrictionError(db, auth.id, channel.kind);
  if (restrictionError) return restrictionError;
  const messageId = Math.max(0, Number(body.messageId || 0));
  const emoji = String(body.emoji || "");
  const allowed = new Set(["❤️", "👍", "😂", "😮", "😢", "🔥"]);
  if (!messageId || !allowed.has(emoji)) return apiError("INVALID_REACTION", "Choose a supported reaction", 400);
  const message = await db.prepare("SELECT id FROM social_messages WHERE id=? AND channel_id=? AND deleted_at IS NULL").bind(messageId, channel.id).first();
  if (!message) return apiError("MESSAGE_NOT_FOUND", "Message not found", 404);
  const existing = await db.prepare("SELECT 1 AS found FROM social_message_reactions WHERE message_id=? AND user_id=? AND emoji=?").bind(messageId, auth.id, emoji).first();
  if (existing) {
    await db.prepare("DELETE FROM social_message_reactions WHERE message_id=? AND user_id=? AND emoji=?").bind(messageId, auth.id, emoji).run();
  } else {
    await db.prepare("INSERT INTO social_message_reactions(message_id,user_id,emoji,created_at) VALUES(?,?,?,?)").bind(messageId, auth.id, emoji, Date.now()).run();
  }
  const reactions = await loadChannelReactions(db, channel.id, auth.id);
  return apiJson({ ok: true, messageId, reactions: reactions[String(messageId)] || [] });
}

async function getMessageIslandRecent(request, url, db) {
  const auth = await requireUser(request, db);
  const after = Math.max(0, Number(url.searchParams.get("after") || 0));
  const since = Math.max(0, Number(url.searchParams.get("since") || 0));
  const result = await db.prepare(`${messageSelect()}
    JOIN social_channels c ON c.id=m.channel_id AND c.kind='dm'
    JOIN social_channel_members mine ON mine.channel_id=m.channel_id AND mine.user_id=?
    WHERE m.sender_id<>? AND m.id>? AND m.created_at>=? AND m.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE (b.blocker_id=? AND b.blocked_id=m.sender_id) OR (b.blocker_id=m.sender_id AND b.blocked_id=?))
    ORDER BY m.id ASC LIMIT 50`)
    .bind(auth.id, auth.id, after, since, auth.id, auth.id).all();
  const messages = (result.results || []).map(row => ({
    id: String(row.id),
    peer: row.username,
    from: row.username,
    text: row.body || "",
    type: row.message_type || "text",
    createdAt: Number(row.created_at || 0)
  }));
  return apiJson({
    ok: true,
    latestId: messages.length ? messages[messages.length - 1].id : after,
    messages
  });
}

const CHAT_FILTER_WORDS = new Set([
  "fuck", "shit", "bitch", "cunt", "cock", "dick", "pussy", "asshole", "whore", "slut",
  "porn", "hentai", "nudes", "naked", "boobs", "tits", "vagina", "penis", "rape",
  "nigger", "nigga", "faggot", "chink", "spic", "kike", "tranny", "wetback", "kys",
  "pedo", "pedophile", "loli"
]);
const CHAT_FILTER_PREFIXES = ["masturbat", "blowjob", "handjob", "creampie", "gangbang"];
const CHAT_FILTER_THREATS = [
  "kill yourself", "kill urself", "kill ur self", "go kill yourself", "go kill urself",
  "hang yourself", "hang urself", "slit your", "go die", "i will kill", "im gonna kill",
  "i am going to kill", "shoot you", "stab you"
];

function normalizeChatText(value) {
  let text = String(value || "").toLowerCase();
  try { text = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, ""); } catch {}
  const lookalikes = { "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "у": "y", "і": "i", "ј": "j", "ѕ": "s" };
  text = text.replace(/[аеорсхуіјѕ]/g, character => lookalikes[character] || character);
  const substitutions = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s", "!": "i", "|": "i" };
  text = text.replace(/[0134578@$!|]/g, character => substitutions[character] || character);
  return text.replace(/([a-z])\1{2,}/g, "$1$1").replace(/[^a-z0-9]+/g, " ").trim();
}

function moderateChatText(value, channelKind) {
  const original = String(value || "");
  const normalized = normalizeChatText(original);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const singleLetterRuns = [];
  let singleLetterRun = "";
  for (const token of tokens) {
    if (token.length === 1) singleLetterRun += token;
    else { if (singleLetterRun.length >= 3) singleLetterRuns.push(singleLetterRun); singleLetterRun = ""; }
  }
  if (singleLetterRun.length >= 3) singleLetterRuns.push(singleLetterRun);
  if (CHAT_FILTER_THREATS.some(phrase => normalized.includes(phrase))) return { allowed: false, rule: "threat" };
  if (tokens.some(token => CHAT_FILTER_WORDS.has(token) || CHAT_FILTER_PREFIXES.some(prefix => token.startsWith(prefix)))) return { allowed: false, rule: "unsafe_language" };
  if (singleLetterRuns.some(run => [...CHAT_FILTER_WORDS].some(word => word.length >= 4 && run.includes(word)))) return { allowed: false, rule: "filter_evasion" };
  if (/(.)\1{14,}/iu.test(original)) return { allowed: false, rule: "character_spam" };
  if (tokens.length >= 10 && new Set(tokens).size <= 2) return { allowed: false, rule: "repeated_spam" };
  const links = original.match(/(?:https?:\/\/|www\.)\S+/gi) || [];
  if (links.length > (channelKind === "everyone" ? 1 : 3)) return { allowed: false, rule: "link_spam" };
  if (/\b(?:\d[ -]*?){9}\b/.test(original) && /\b(?:ssn|social security)\b/i.test(original)) return { allowed: false, rule: "sensitive_information" };
  return { allowed: true, rule: "" };
}

async function recordChatModerationEvent(db, userId, channelId, rule, excerpt) {
  const now = Date.now();
  await db.prepare("INSERT INTO chat_moderation_events(user_id,channel_id,rule_code,excerpt,created_at,expires_at) VALUES(?,?,?,?,?,?)")
    .bind(userId, channelId, rule, cleanText(excerpt, 240), now, now + CHAT_MODERATION_LOG_MS).run();
}

async function activeChatRestriction(db, userId, channelKind) {
  const now = Date.now();
  return db.prepare(`SELECT id,scope,action,reason,created_at,expires_at FROM chat_restrictions
    WHERE user_id=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?)
    AND (scope='all' OR (scope='everyone' AND ?='everyone'))
    ORDER BY CASE scope WHEN 'all' THEN 2 ELSE 1 END DESC,created_at DESC LIMIT 1`)
    .bind(userId, now, channelKind).first();
}

async function chatRestrictionError(db, userId, channelKind) {
  const restriction = await activeChatRestriction(db, userId, channelKind);
  if (!restriction) return null;
  const expiry = restriction.expires_at ? ` until ${new Date(Number(restriction.expires_at)).toISOString()}` : "";
  return apiError("CHAT_RESTRICTED", `You are timed out from Nova Social${expiry}. ${restriction.reason}`.trim(), 403, { restriction: { scope: restriction.scope, expiresAt: restriction.expires_at || null } });
}

async function sendMessage(request, db) {
  requireSameOrigin(request);
  const auth = await requireSocialUser(request, db);
  await enforceUserRateLimit(db, auth.id, "message", 30, 60 * 1000, 60 * 1000);
  const body = await readJson(request);
  const channel = await resolveChannel(db, auth.id, cleanText(body.channel, 80) || "everyone", true);
  if (!channel) return apiError("CHANNEL_NOT_FOUND", "Chat not found", 404);
  const restrictionError = await chatRestrictionError(db, auth.id, channel.kind);
  if (restrictionError) return restrictionError;
  const type = body.messageType === "image" ? "image" : "text";
  if (type === "image") {
    await enforceUserRateLimit(db, auth.id, "message-image", 10, 60 * 60 * 1000, 30 * 60 * 1000);
  }
  let text;
  if (type === "image") {
    text = String(body.body || "");
    if (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(text) || text.length > 125000) {
      return apiError("INVALID_IMAGE", "Image must be a compressed JPEG, PNG, or WebP under 90 KB", 400);
    }
  } else {
    text = cleanText(body.body, 2000);
    const moderation = moderateChatText(text, channel.kind);
    if (!moderation.allowed) {
      await recordChatModerationEvent(db, auth.id, channel.id, moderation.rule, text);
      return apiError("MESSAGE_FILTERED", "That message was blocked by Nova's safety filter", 422, { rule: moderation.rule });
    }
  }
  if (!text) return apiError("EMPTY_MESSAGE", "Message cannot be empty", 400);
  const now = Date.now();
  if (channel.kind === "everyone") {
    const previous = await db.prepare("SELECT body,created_at FROM social_messages WHERE sender_id=? AND channel_id='everyone' AND deleted_at IS NULL ORDER BY id DESC LIMIT 1").bind(auth.id).first();
    const remaining = previous ? EVERYONE_CHAT_COOLDOWN_MS - (now - Number(previous.created_at || 0)) : 0;
    if (remaining > 0) return apiError("EVERYONE_COOLDOWN", "Everyone chat is cooling down", 429, { retryAfterMs: remaining });
    if (type === "text" && previous && normalizeChatText(previous.body) === normalizeChatText(text) && now - Number(previous.created_at || 0) < 30000) {
      return apiError("DUPLICATE_MESSAGE", "Please do not repeat the same message", 429);
    }
  }
  let replyToId = Math.max(0, Number(body.replyToId || 0)) || null;
  if (replyToId) {
    const parent = await db.prepare("SELECT id FROM social_messages WHERE id=? AND channel_id=? AND deleted_at IS NULL").bind(replyToId, channel.id).first();
    if (!parent) replyToId = null;
  }
  const result = await db.prepare("INSERT INTO social_messages(channel_id,sender_id,body,message_type,reply_to_id,created_at) VALUES(?,?,?,?,?,?)")
    .bind(channel.id, auth.id, text, type, replyToId, now).run();
  const row = await db.prepare(`${messageSelect()} WHERE m.id=?`).bind(result.meta.last_row_id).first();
  return apiJson({ message: exposeMessage(row) }, 201);
}

async function getTyping(request, url, db) {
  const auth = await requireSocialUser(request, db);
  const requested = cleanText(url.searchParams.get("channel"), 80);
  if (!requested || requested === "everyone") return apiJson({ users: [] });
  const channel = await resolveChannel(db, auth.id, requested, false);
  if (!channel) return apiError("CHANNEL_NOT_FOUND", "Chat not found", 404);
  const cutoff = Date.now() - 7000;
  const result = await db.prepare("SELECT u.username FROM social_typing t JOIN users u ON u.id=t.user_id WHERE t.channel_id=? AND t.user_id<>? AND t.updated_at>=? AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE (b.blocker_id=? AND b.blocked_id=t.user_id) OR (b.blocker_id=t.user_id AND b.blocked_id=?)) ORDER BY t.updated_at DESC LIMIT 6")
    .bind(channel.id, auth.id, cutoff, auth.id, auth.id).all();
  return apiJson({ users: (result.results || []).map(row => row.username) });
}

async function setTyping(request, db) {
  requireSameOrigin(request);
  const auth = await requireSocialUser(request, db);
  await enforceUserRateLimit(db, auth.id, "typing", 30, 60 * 1000, 30 * 1000);
  const body = await readJson(request);
  const requested = cleanText(body.channel, 80);
  if (!requested || requested === "everyone") return apiJson({ ok: true });
  const channel = await resolveChannel(db, auth.id, requested, !!body.typing);
  if (!channel) return apiError("CHANNEL_NOT_FOUND", "Chat not found", 404);
  const restrictionError = await chatRestrictionError(db, auth.id, channel.kind);
  if (restrictionError) return restrictionError;
  if (body.typing) {
    await db.prepare("INSERT INTO social_typing(channel_id,user_id,updated_at) VALUES(?,?,?) ON CONFLICT(channel_id,user_id) DO UPDATE SET updated_at=excluded.updated_at")
      .bind(channel.id, auth.id, Date.now()).run();
  } else {
    await db.prepare("DELETE FROM social_typing WHERE channel_id=? AND user_id=?").bind(channel.id, auth.id).run();
  }
  return apiJson({ ok: true });
}

async function createReport(request, db) {
  requireSameOrigin(request);
  const auth = await requireUser(request, db);
  await enforceUserRateLimit(db, auth.id, "report", 5, 60 * 60 * 1000, 60 * 60 * 1000);
  const body = await readJson(request);
  const reportType = enumValue(cleanText(body.reportType, 40), ["user", "message", "safety", "bug", "plan_request"], "user");
  if (reportType === "plan_request") {
    const membership = await db.prepare("SELECT 1 FROM user_plans WHERE user_id=? AND plan='supernova' AND status='active' AND (expires_at IS NULL OR expires_at>?) LIMIT 1").bind(auth.id, Date.now()).first();
    if (membership) return apiError("ALREADY_SUPERNOVA", "Your account already has Supernova Pro", 409);
    const pending = await db.prepare("SELECT id FROM reports WHERE reporter_id=? AND report_type='plan_request' AND status IN ('open','assigned') LIMIT 1").bind(auth.id).first();
    if (pending) return apiError("REQUEST_PENDING", "You already have a pending upgrade request", 409);
  }
  const target = body.targetUsername ? await loadUserByUsername(db, normalizeUsername(body.targetUsername)) : null;
  if (reportType === "user" && !target) return apiError("USER_NOT_FOUND", "User not found", 404);
  if (target?.id === auth.id) return apiError("SELF_REPORT_FORBIDDEN", "You cannot report your own account", 400);
  const reason = cleanText(body.reason, 1000);
  if (reportType !== "plan_request" && reason.length < 5) return apiError("REASON_REQUIRED", "Add a brief reason for the report", 400);
  const id = randomId();
  await db.prepare("INSERT INTO reports(id,reporter_id,target_user_id,report_type,reason,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
    .bind(id, auth.id, target?.id || null, reportType, reason, Date.now(), Date.now()).run();
  return apiJson({ id }, 201);
}

async function supportTickets(request, url, db) {
  const auth = await requireUser(request, db);
  const ticketId = cleanText(url.searchParams.get("ticket"), 80);
  if (ticketId) {
    const ticket = await loadSupportTicket(db, ticketId);
    if (!ticket || ticket.user_id !== auth.id) return apiError("TICKET_NOT_FOUND", "Ticket not found", 404);
    return apiJson({ ticket: exposeSupportTicket(ticket), messages: await loadSupportTicketMessages(db, ticketId) });
  }
  const result = await db.prepare(`${supportTicketSelect()}
    WHERE t.user_id=? ORDER BY CASE WHEN t.status IN ('open','in_progress','waiting_user') THEN 0 ELSE 1 END,t.updated_at DESC LIMIT 100`)
    .bind(auth.id).all();
  return apiJson({ tickets: (result.results || []).map(exposeSupportTicket) });
}

async function createSupportTicket(request, db) {
  requireSameOrigin(request);
  const auth = await requireUser(request, db);
  await enforceUserRateLimit(db, auth.id, "support-ticket-create", 6, 60 * 60 * 1000, 15 * 60 * 1000);
  const body = await readJson(request);
  const category = enumValue(cleanText(body.category, 20).toLowerCase(), ["bug", "feature", "account", "safety", "other"], "other");
  const subject = cleanText(body.subject, 100);
  const message = cleanText(body.message, 4000);
  if (subject.length < 5) return apiError("INVALID_SUBJECT", "Add a subject with at least 5 characters", 400);
  if (message.length < 10) return apiError("INVALID_MESSAGE", "Describe what you need help with in at least 10 characters", 400);
  const active = await db.prepare("SELECT COUNT(*) AS count FROM support_tickets WHERE user_id=? AND status IN ('open','in_progress','waiting_user')").bind(auth.id).first();
  if (Number(active?.count || 0) >= 5) return apiError("TOO_MANY_OPEN_TICKETS", "Close an existing ticket before opening another one", 409);
  const id = `ticket_${randomId().slice(0, 12)}`;
  const now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO support_tickets(id,user_id,category,subject,status,priority,created_at,updated_at) VALUES(?,?,?,?,'open','normal',?,?)")
      .bind(id, auth.id, category, subject, now, now),
    db.prepare("INSERT INTO support_ticket_messages(ticket_id,author_id,body,is_staff,created_at) VALUES(?,?,?,0,?)")
      .bind(id, auth.id, message, now)
  ]);
  const ticket = await loadSupportTicket(db, id);
  return apiJson({ ticket: exposeSupportTicket(ticket), messages: await loadSupportTicketMessages(db, id) }, 201);
}

async function replySupportTicket(request, db) {
  requireSameOrigin(request);
  const auth = await requireUser(request, db);
  await enforceUserRateLimit(db, auth.id, "support-ticket-reply", 40, 60 * 60 * 1000, 5 * 60 * 1000);
  const body = await readJson(request);
  const ticketId = cleanText(body.ticketId, 80);
  const message = cleanText(body.message, 4000);
  if (!message) return apiError("INVALID_MESSAGE", "Reply cannot be empty", 400);
  const ticket = ticketId ? await loadSupportTicket(db, ticketId) : null;
  if (!ticket) return apiError("TICKET_NOT_FOUND", "Ticket not found", 404);
  const isStaff = auth.roles.some(role => STAFF_ROLES.has(role));
  if (ticket.user_id !== auth.id && !isStaff) return apiError("TICKET_NOT_FOUND", "Ticket not found", 404);
  if (ticket.status === "closed") return apiError("TICKET_CLOSED", "Reopen this ticket before replying", 409);
  const now = Date.now();
  const status = isStaff ? "waiting_user" : ticket.status === "waiting_user" || ticket.status === "resolved" ? "in_progress" : ticket.status;
  await db.batch([
    db.prepare("INSERT INTO support_ticket_messages(ticket_id,author_id,body,is_staff,created_at) VALUES(?,?,?,?,?)")
      .bind(ticketId, auth.id, message, isStaff ? 1 : 0, now),
    db.prepare("UPDATE support_tickets SET status=?,updated_at=?,closed_at=NULL WHERE id=?").bind(status, now, ticketId)
  ]);
  if (isStaff) await audit(db, auth.id, "ticket.reply", "support_ticket", ticketId, "Staff reply", { status });
  return apiJson({ ok: true, status }, 201);
}

async function setSupportTicketStatus(request, db) {
  requireSameOrigin(request);
  const auth = await requireUser(request, db);
  await enforceUserRateLimit(db, auth.id, "support-ticket-status", 20, 60 * 60 * 1000, 5 * 60 * 1000);
  const body = await readJson(request);
  const ticketId = cleanText(body.ticketId, 80);
  const action = cleanText(body.action, 20).toLowerCase();
  const ticket = ticketId ? await loadSupportTicket(db, ticketId) : null;
  if (!ticket || ticket.user_id !== auth.id) return apiError("TICKET_NOT_FOUND", "Ticket not found", 404);
  if (!['close', 'reopen'].includes(action)) return apiError("INVALID_ACTION", "Choose close or reopen", 400);
  const now = Date.now();
  const status = action === "close" ? "closed" : "open";
  await db.prepare("UPDATE support_tickets SET status=?,updated_at=?,closed_at=? WHERE id=?")
    .bind(status, now, action === "close" ? now : null, ticketId).run();
  return apiJson({ ok: true, status });
}

async function adminTickets(request, url, db) {
  await requireRole(request, db, STAFF_ROLES);
  const ticketId = cleanText(url.searchParams.get("ticket"), 80);
  if (ticketId) {
    const ticket = await loadSupportTicket(db, ticketId);
    if (!ticket) return apiError("TICKET_NOT_FOUND", "Ticket not found", 404);
    return apiJson({ ticket: exposeSupportTicket(ticket), messages: await loadSupportTicketMessages(db, ticketId) });
  }
  const rawStatus = cleanText(url.searchParams.get("status"), 20).toLowerCase();
  const status = ["open", "in_progress", "waiting_user", "resolved", "closed"].includes(rawStatus) ? rawStatus : "";
  const query = cleanText(url.searchParams.get("q"), 80).toLowerCase().replace(/[%_]/g, "");
  const like = `%${query}%`;
  const result = await db.prepare(`${supportTicketSelect()}
    WHERE (?='' OR t.status=?) AND (?='' OR lower(u.username) LIKE ? OR lower(t.subject) LIKE ? OR lower(t.id) LIKE ?)
    ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      CASE WHEN t.status IN ('open','in_progress','waiting_user') THEN 0 ELSE 1 END,t.updated_at DESC LIMIT 200`)
    .bind(status, status, query, like, like, like).all();
  return apiJson({ tickets: (result.results || []).map(exposeSupportTicket) });
}

async function adminTicketAction(request, db) {
  requireSameOrigin(request);
  const auth = await requireRole(request, db, STAFF_ROLES);
  const body = await readJson(request);
  const ticketId = cleanText(body.ticketId, 80);
  const action = cleanText(body.action, 20).toLowerCase();
  const ticket = ticketId ? await loadSupportTicket(db, ticketId) : null;
  if (!ticket) return apiError("TICKET_NOT_FOUND", "Ticket not found", 404);
  const now = Date.now();
  let metadata = {};
  if (action === "claim") {
    await db.prepare("UPDATE support_tickets SET assigned_to=?,status=CASE WHEN status='open' THEN 'in_progress' ELSE status END,updated_at=? WHERE id=?")
      .bind(auth.id, now, ticketId).run();
    metadata = { assignedTo: auth.username };
  } else if (action === "assign") {
    const username = normalizeUsername(body.username);
    const target = username ? await loadUserByUsername(db, username) : null;
    if (!target || !target.roles.some(role => STAFF_ROLES.has(role))) return apiError("STAFF_NOT_FOUND", "Choose a staff account", 404);
    await db.prepare("UPDATE support_tickets SET assigned_to=?,status=CASE WHEN status='open' THEN 'in_progress' ELSE status END,updated_at=? WHERE id=?")
      .bind(target.id, now, ticketId).run();
    metadata = { assignedTo: target.username };
  } else if (action === "unassign") {
    await db.prepare("UPDATE support_tickets SET assigned_to=NULL,updated_at=? WHERE id=?").bind(now, ticketId).run();
  } else if (action === "status") {
    const status = enumValue(cleanText(body.status, 20).toLowerCase(), ["open", "in_progress", "waiting_user", "resolved", "closed"], "");
    if (!status) return apiError("INVALID_STATUS", "Choose a valid ticket status", 400);
    await db.prepare("UPDATE support_tickets SET status=?,updated_at=?,closed_at=? WHERE id=?")
      .bind(status, now, status === "closed" ? now : null, ticketId).run();
    metadata = { status };
  } else if (action === "priority") {
    const priority = enumValue(cleanText(body.priority, 20).toLowerCase(), ["low", "normal", "high", "urgent"], "");
    if (!priority) return apiError("INVALID_PRIORITY", "Choose a valid ticket priority", 400);
    await db.prepare("UPDATE support_tickets SET priority=?,updated_at=? WHERE id=?").bind(priority, now, ticketId).run();
    metadata = { priority };
  } else {
    return apiError("INVALID_ACTION", "Invalid ticket action", 400);
  }
  await audit(db, auth.id, `ticket.${action}`, "support_ticket", ticketId, cleanText(body.reason, 240), metadata);
  return apiJson({ ok: true });
}

function supportTicketSelect() {
  return `SELECT t.id,t.user_id,t.category,t.subject,t.status,t.priority,t.created_at,t.updated_at,t.closed_at,
    u.username,COALESCE(p.display_name,u.username) AS display_name,COALESCE(p.avatar_url,'') AS avatar_url,
    assignee.username AS assigned_to,
    (SELECT COUNT(*) FROM support_ticket_messages tm WHERE tm.ticket_id=t.id) AS message_count,
    COALESCE((SELECT tm.body FROM support_ticket_messages tm WHERE tm.ticket_id=t.id ORDER BY tm.id DESC LIMIT 1),'') AS last_message
    FROM support_tickets t JOIN users u ON u.id=t.user_id LEFT JOIN user_profiles p ON p.user_id=u.id
    LEFT JOIN users assignee ON assignee.id=t.assigned_to`;
}

async function loadSupportTicket(db, ticketId) {
  return db.prepare(`${supportTicketSelect()} WHERE t.id=? LIMIT 1`).bind(ticketId).first();
}

async function loadSupportTicketMessages(db, ticketId) {
  const result = await db.prepare(`SELECT tm.id,tm.body,tm.is_staff AS isStaff,tm.created_at AS createdAt,
    COALESCE(u.username,'Nova staff') AS username,COALESCE(p.display_name,u.username,'Nova staff') AS displayName,
    COALESCE(p.avatar_url,'') AS avatarUrl FROM support_ticket_messages tm LEFT JOIN users u ON u.id=tm.author_id
    LEFT JOIN user_profiles p ON p.user_id=u.id WHERE tm.ticket_id=? ORDER BY tm.id ASC LIMIT 500`).bind(ticketId).all();
  return (result.results || []).map(row => ({ ...row, id: Number(row.id), isStaff: !!row.isStaff, createdAt: Number(row.createdAt || 0) }));
}

function exposeSupportTicket(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.username,
    avatarUrl: row.avatar_url || "",
    category: row.category,
    subject: row.subject,
    status: row.status,
    priority: row.priority,
    assignedTo: row.assigned_to || "",
    messageCount: Number(row.message_count || 0),
    lastMessage: row.last_message || "",
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
    closedAt: row.closed_at == null ? null : Number(row.closed_at)
  };
}

async function getSupernovaAccess(request, db) {
  const auth = await requireUser(request, db);
  const now = Date.now();
  const staffAccess = (auth.roles || []).some(role => STAFF_ROLES.has(role));
  const deviceId = deviceIdFrom(request);
  const deviceHash = deviceId ? await sha256(deviceId) : "";
  const [membership, userTrial, deviceTrial, outgoing, incoming] = await Promise.all([
    db.prepare("SELECT status,granted_at AS grantedAt,expires_at AS expiresAt,note FROM user_plans WHERE user_id=? AND plan='supernova' AND status='active' AND (expires_at IS NULL OR expires_at>?) LIMIT 1").bind(auth.id, now).first(),
    db.prepare("SELECT claimed_at AS claimedAt,expires_at AS expiresAt FROM supernova_device_trials WHERE user_id=? LIMIT 1").bind(auth.id).first(),
    deviceHash ? db.prepare("SELECT claimed_at AS claimedAt,expires_at AS expiresAt FROM supernova_device_trials WHERE device_id_hash=? LIMIT 1").bind(deviceHash).first() : Promise.resolve(null),
    db.prepare(`SELECT r.id,r.status,r.created_at AS createdAt,r.responded_at AS respondedAt,r.expires_at AS expiresAt,
      u.username,COALESCE(p.display_name,u.username) AS displayName
      FROM supernova_referrals r JOIN users u ON u.id=r.invited_user_id LEFT JOIN user_profiles p ON p.user_id=u.id
      WHERE r.inviter_id=? AND r.status!='declined' ORDER BY r.created_at DESC LIMIT 5`).bind(auth.id).all(),
    db.prepare(`SELECT r.id,r.status,r.created_at AS createdAt,u.username AS fromUsername,
      COALESCE(p.display_name,u.username) AS fromDisplayName
      FROM supernova_referrals r JOIN users u ON u.id=r.inviter_id LEFT JOIN user_profiles p ON p.user_id=u.id
      WHERE r.invited_user_id=? AND r.status='pending' ORDER BY r.created_at DESC LIMIT 5`).bind(auth.id).all()
  ]);
  const sent = (outgoing.results || []).map(row => ({ ...row, createdAt: Number(row.createdAt), respondedAt: row.respondedAt == null ? null : Number(row.respondedAt), expiresAt: row.expiresAt == null ? null : Number(row.expiresAt) }));
  const received = (incoming.results || []).map(row => ({ ...row, createdAt: Number(row.createdAt) }));
  const canRefer = staffAccess || !!membership && !["3-day device trial", "7-day Supernova referral"].includes(membership.note || "");
  return apiJson({
    active: !!membership || staffAccess,
    membership: membership ? { grantedAt: Number(membership.grantedAt || 0), expiresAt: membership.expiresAt == null ? null : Number(membership.expiresAt), note: membership.note || "" } : (staffAccess ? { grantedAt: 0, expiresAt: null, note: "Staff Supernova access" } : null),
    trial: { eligible: !!deviceId && !userTrial && !deviceTrial && !membership && !staffAccess, claimed: !!(userTrial || deviceTrial) },
    referrals: { canRefer, limit: SUPERNOVA_REFERRAL_LIMIT, used: sent.length, remaining: Math.max(0, SUPERNOVA_REFERRAL_LIMIT - sent.length), sent, received }
  });
}

async function claimSupernovaTrial(request, db) {
  requireSameOrigin(request);
  const auth = await requireUser(request, db);
  await enforceUserRateLimit(db, auth.id, "supernova-trial", 3, 60 * 60 * 1000, 60 * 60 * 1000);
  const deviceId = deviceIdFrom(request);
  if (!deviceId) return apiError("DEVICE_REQUIRED", "This device could not be verified. Refresh and try again.", 400);
  const now = Date.now();
  const active = await db.prepare("SELECT 1 FROM user_plans WHERE user_id=? AND plan='supernova' AND status='active' AND (expires_at IS NULL OR expires_at>?) LIMIT 1").bind(auth.id, now).first();
  const staffAccess = (auth.roles || []).some(role => STAFF_ROLES.has(role));
  if (active || staffAccess) return apiError("ALREADY_SUPERNOVA", "This account already has Supernova", 409);
  const deviceHash = await sha256(deviceId);
  const alreadyClaimed = await db.prepare("SELECT 1 FROM supernova_device_trials WHERE user_id=? OR device_id_hash=? LIMIT 1").bind(auth.id, deviceHash).first();
  if (alreadyClaimed) return apiError("TRIAL_ALREADY_USED", "The free trial has already been used by this account or device", 409);
  const expiresAt = now + SUPERNOVA_DEVICE_TRIAL_MS;
  try {
    await db.batch([
      db.prepare("INSERT INTO supernova_device_trials(device_id_hash,user_id,claimed_at,expires_at) VALUES(?,?,?,?)").bind(deviceHash, auth.id, now, expiresAt),
      supernovaGrantStatement(db, auth.id, null, "3-day device trial", expiresAt, now)
    ]);
  } catch (error) {
    return apiError("TRIAL_ALREADY_USED", "The free trial has already been used by this account or device", 409);
  }
  return apiJson({ ok: true, plan: "supernova", source: "device_trial", expiresAt }, 201);
}

async function createSupernovaReferral(request, db) {
  requireSameOrigin(request);
  const auth = await requireUser(request, db);
  await enforceUserRateLimit(db, auth.id, "supernova-referral", 10, 60 * 60 * 1000, 60 * 60 * 1000);
  const now = Date.now();
  const sponsor = await db.prepare("SELECT note FROM user_plans WHERE user_id=? AND plan='supernova' AND status='active' AND (expires_at IS NULL OR expires_at>?) LIMIT 1").bind(auth.id, now).first();
  const staffAccess = (auth.roles || []).some(role => STAFF_ROLES.has(role));
  if (!sponsor && !staffAccess) return apiError("SUPERNOVA_REQUIRED", "An active Supernova membership is required to send referrals", 403);
  if (!staffAccess && ["3-day device trial", "7-day Supernova referral"].includes(sponsor.note || "")) return apiError("FULL_SUPERNOVA_REQUIRED", "Temporary Supernova access cannot send referrals", 403);
  const body = await readJson(request);
  const target = await loadUserByUsername(db, normalizeUsername(body.username));
  if (!target) return apiError("USER_NOT_FOUND", "That Nova user was not found", 404);
  if (target.id === auth.id) return apiError("SELF_REFERRAL", "You cannot invite yourself", 400);
  const targetPlan = await db.prepare("SELECT 1 FROM user_plans WHERE user_id=? AND plan='supernova' AND status='active' AND (expires_at IS NULL OR expires_at>?) LIMIT 1").bind(target.id, now).first();
  const targetStaffAccess = (target.roles || []).some(role => STAFF_ROLES.has(role));
  if (targetPlan || targetStaffAccess) return apiError("ALREADY_SUPERNOVA", "That person already has Supernova", 409);
  const priorClaim = await db.prepare("SELECT 1 FROM supernova_referrals WHERE invited_user_id=? AND status='accepted' LIMIT 1").bind(target.id).first();
  if (priorClaim) return apiError("REFERRAL_ALREADY_USED", "That person has already used a Supernova referral", 409);
  const existingPending = await db.prepare("SELECT 1 FROM supernova_referrals WHERE invited_user_id=? AND status='pending' LIMIT 1").bind(target.id).first();
  if (existingPending) return apiError("REFERRAL_PENDING", "That person already has a pending Supernova invite", 409);
  // Older builds kept declined rows. They must not use a slot, and the old
  // unique inviter/recipient row must be cleared before this person is sent a
  // new invitation.
  await db.prepare("DELETE FROM supernova_referrals WHERE inviter_id=? AND invited_user_id=? AND status='declined'").bind(auth.id, target.id).run();
  const used = Number(await db.prepare("SELECT COUNT(*) AS total FROM supernova_referrals WHERE inviter_id=? AND status IN ('pending','accepted')").bind(auth.id).first("total") || 0);
  if (used >= SUPERNOVA_REFERRAL_LIMIT) return apiError("REFERRAL_LIMIT", "All five referral invites have been used", 409);
  const id = randomId();
  try {
    await db.prepare("INSERT INTO supernova_referrals(id,inviter_id,invited_user_id,status,created_at) VALUES(?,?,?,'pending',?)").bind(id, auth.id, target.id, now).run();
  } catch (error) {
    return apiError("REFERRAL_EXISTS", "You have already invited that person", 409);
  }
  return apiJson({ ok: true, referral: { id, username: target.username, displayName: target.display_name || target.username, status: "pending", createdAt: now } }, 201);
}

async function respondSupernovaReferral(request, db) {
  requireSameOrigin(request);
  const auth = await requireUser(request, db);
  await enforceUserRateLimit(db, auth.id, "supernova-referral-response", 10, 60 * 60 * 1000, 30 * 60 * 1000);
  const body = await readJson(request);
  const id = cleanText(body.referralId, 80);
  const action = enumValue(body.action, ["accept", "decline"], "");
  if (!id || !action) return apiError("INVALID_REFERRAL_ACTION", "Choose accept or decline", 400);
  const referral = await db.prepare("SELECT * FROM supernova_referrals WHERE id=? AND invited_user_id=? AND status='pending' LIMIT 1").bind(id, auth.id).first();
  if (!referral) return apiError("REFERRAL_NOT_FOUND", "That referral is no longer available", 404);
  const now = Date.now();
  if (action === "decline") {
    // A declined invite is not consumed. Removing it restores the sender's
    // referral slot and also clears the unique inviter/recipient pair so the
    // same person can be invited again later.
    await db.prepare("DELETE FROM supernova_referrals WHERE id=? AND invited_user_id=? AND status='pending'").bind(id, auth.id).run();
    return apiJson({ ok: true, status: "declined" });
  }
  const active = await db.prepare("SELECT 1 FROM user_plans WHERE user_id=? AND plan='supernova' AND status='active' AND (expires_at IS NULL OR expires_at>?) LIMIT 1").bind(auth.id, now).first();
  const staffAccess = (auth.roles || []).some(role => STAFF_ROLES.has(role));
  if (active || staffAccess) return apiError("ALREADY_SUPERNOVA", "Your account already has Supernova", 409);
  const prior = await db.prepare("SELECT 1 FROM supernova_referrals WHERE invited_user_id=? AND status='accepted' LIMIT 1").bind(auth.id).first();
  if (prior) return apiError("REFERRAL_ALREADY_USED", "This account has already used a referral", 409);
  const expiresAt = now + SUPERNOVA_REFERRAL_MS;
  await db.batch([
    db.prepare("UPDATE supernova_referrals SET status='accepted',responded_at=?,expires_at=? WHERE id=? AND status='pending'").bind(now, expiresAt, id),
    supernovaGrantStatement(db, auth.id, referral.inviter_id, "7-day Supernova referral", expiresAt, now)
  ]);
  return apiJson({ ok: true, plan: "supernova", source: "referral", expiresAt });
}

const SUPERNOVA_DEFAULT_PREFERENCES = Object.freeze({
  identity: { frame: "orbit", badge: "prism", bannerEffect: "aurora", nameGlow: true },
  island: { style: "glass", opacity: 88, density: "comfortable", animation: "fluid" },
  home: { atmosphere: "nebula", compactCards: false, greeting: true },
  labs: { commandPalette: true, focusMode: false, quickPeek: true },
  holiday: { mode: "automatic", selected: "christmas", style: "full", effects: "balanced" },
  appliedTheme: null
});

async function requireSupernovaAccess(request, db) {
  const auth = await requireUser(request, db);
  const membership = await db.prepare("SELECT 1 FROM user_plans WHERE user_id=? AND plan='supernova' AND status='active' AND (expires_at IS NULL OR expires_at>?) LIMIT 1").bind(auth.id, Date.now()).first();
  const staffAccess = auth.roles.some(role => ADMIN_ROLES.has(role));
  if (!membership && !staffAccess) throw new ApiFailure("SUPERNOVA_REQUIRED", "Supernova Pro is required to use the Supernova Hub", 403);
  return auth;
}

function sanitizeSupernovaThemeDraft(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return {
    hue: Math.round(clampNumber(value.hue, 0, 360)),
    sat: Math.round(clampNumber(value.sat, 20, 100)),
    light: Math.round(clampNumber(value.light, 35, 75)),
    hue2: Math.round(clampNumber(value.hue2, 0, 360)),
    bgDepth: Math.round(clampNumber(value.bgDepth, 2, 10))
  };
}

function sanitizeSupernovaPreferences(value) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const identity = input.identity && typeof input.identity === "object" ? input.identity : {};
  const island = input.island && typeof input.island === "object" ? input.island : {};
  const home = input.home && typeof input.home === "object" ? input.home : {};
  const labs = input.labs && typeof input.labs === "object" ? input.labs : {};
  const holiday = input.holiday && typeof input.holiday === "object" ? input.holiday : {};
  return {
    identity: {
      frame: enumValue(identity.frame, ["none", "orbit", "eclipse", "radiant"], SUPERNOVA_DEFAULT_PREFERENCES.identity.frame),
      badge: enumValue(identity.badge, ["classic", "prism", "minimal", "pulse"], SUPERNOVA_DEFAULT_PREFERENCES.identity.badge),
      bannerEffect: enumValue(identity.bannerEffect, ["none", "aurora", "stardust", "horizon"], SUPERNOVA_DEFAULT_PREFERENCES.identity.bannerEffect),
      nameGlow: identity.nameGlow !== false
    },
    island: {
      style: enumValue(island.style, ["glass", "solid", "outline"], SUPERNOVA_DEFAULT_PREFERENCES.island.style),
      opacity: Math.round(clampNumber(island.opacity == null ? SUPERNOVA_DEFAULT_PREFERENCES.island.opacity : island.opacity, 60, 100)),
      density: enumValue(island.density, ["compact", "comfortable", "spacious"], SUPERNOVA_DEFAULT_PREFERENCES.island.density),
      animation: enumValue(island.animation, ["quiet", "fluid", "expressive"], SUPERNOVA_DEFAULT_PREFERENCES.island.animation)
    },
    home: {
      atmosphere: enumValue(home.atmosphere, ["nebula", "stars", "quiet"], SUPERNOVA_DEFAULT_PREFERENCES.home.atmosphere),
      compactCards: !!home.compactCards,
      greeting: home.greeting !== false
    },
    labs: {
      commandPalette: labs.commandPalette !== false,
      focusMode: !!labs.focusMode,
      quickPeek: labs.quickPeek !== false
    },
    holiday: {
      mode: enumValue(holiday.mode, ["automatic", "manual", "off"], SUPERNOVA_DEFAULT_PREFERENCES.holiday.mode),
      selected: enumValue(holiday.selected, ["new-year", "valentines", "st-patricks", "easter", "halloween", "thanksgiving", "christmas"], SUPERNOVA_DEFAULT_PREFERENCES.holiday.selected),
      style: enumValue(holiday.style, ["full", "decorations"], SUPERNOVA_DEFAULT_PREFERENCES.holiday.style),
      effects: enumValue(holiday.effects, ["full", "balanced", "minimal"], SUPERNOVA_DEFAULT_PREFERENCES.holiday.effects)
    },
    appliedTheme: sanitizeSupernovaThemeDraft(input.appliedTheme)
  };
}

function sanitizeSupernovaThemes(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).map((theme, index) => {
    if (!theme || typeof theme !== "object") return null;
    const draft = sanitizeSupernovaThemeDraft(theme.draft);
    if (!draft) return null;
    return {
      name: cleanText(theme.name, 32) || `Theme ${index + 1}`,
      draft,
      ts: Math.round(clampNumber(theme.ts || Date.now(), 0, 9007199254740991))
    };
  });
}

function cleanWorkspaceUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    return url.href.slice(0, 2048);
  } catch { return ""; }
}

function sanitizeSupernovaWorkspaces(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((workspace, index) => {
    if (!workspace || typeof workspace !== "object") return null;
    const links = (Array.isArray(workspace.links) ? workspace.links : []).slice(0, 12).map((link, linkIndex) => {
      const url = cleanWorkspaceUrl(link && link.url);
      if (!url) throw new ApiFailure("INVALID_WORKSPACE_URL", `Workspace link ${linkIndex + 1} must use http or https`, 400);
      return { title: cleanText(link.title, 48) || new URL(url).hostname, url };
    });
    if (!links.length) return null;
    const rawId = cleanText(workspace.id, 64).replace(/[^a-zA-Z0-9_-]/g, "");
    return {
      id: rawId || `workspace_${index + 1}_${randomId().slice(0, 8)}`,
      name: cleanText(workspace.name, 40) || `Workspace ${index + 1}`,
      accent: enumValue(workspace.accent, ["violet", "gold", "cyan", "rose", "green"], "violet"),
      links
    };
  }).filter(Boolean);
}

function sanitizeSupernovaAIChats(value) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const chats = {};
  ["work", "game", "general"].forEach(mode => {
    chats[mode] = (Array.isArray(input[mode]) ? input[mode] : []).slice(-24).map(message => {
      if (!message || typeof message !== "object") return null;
      const role = message.role === "user" ? "user" : (message.role === "model" || message.role === "assistant" ? "model" : "");
      const text = cleanText(message.text, 4000);
      if (!role || !text) return null;
      return { role, text, ts: Math.round(clampNumber(message.ts || Date.now(), 0, 9007199254740991)) };
    }).filter(Boolean);
  });
  return chats;
}

function exposeSupernovaState(row) {
  return {
    preferences: sanitizeSupernovaPreferences(parseJson(row?.preferences_json, {})),
    themes: sanitizeSupernovaThemes(parseJson(row?.themes_json, [])),
    workspaces: sanitizeSupernovaWorkspaces(parseJson(row?.workspaces_json, [])),
    aiChats: sanitizeSupernovaAIChats(parseJson(row?.ai_chats_json, {})),
    updatedAt: Number(row?.updated_at || 0)
  };
}

async function getSupernovaState(request, db) {
  const auth = await requireSupernovaAccess(request, db);
  const row = await db.prepare("SELECT preferences_json,themes_json,workspaces_json,ai_chats_json,updated_at FROM supernova_state WHERE user_id=?").bind(auth.id).first();
  return apiJson({ state: exposeSupernovaState(row) });
}

async function updateSupernovaState(request, db) {
  requireSameOrigin(request);
  const auth = await requireSupernovaAccess(request, db);
  await enforceUserRateLimit(db, auth.id, "supernova-state", 60, 10 * 60 * 1000, 5 * 60 * 1000);
  const body = await readJson(request);
  const existing = await db.prepare("SELECT preferences_json,themes_json,workspaces_json,ai_chats_json,updated_at FROM supernova_state WHERE user_id=?").bind(auth.id).first();
  const current = exposeSupernovaState(existing);
  const next = {
    preferences: Object.prototype.hasOwnProperty.call(body, "preferences") ? sanitizeSupernovaPreferences(body.preferences) : current.preferences,
    themes: Object.prototype.hasOwnProperty.call(body, "themes") ? sanitizeSupernovaThemes(body.themes) : current.themes,
    workspaces: Object.prototype.hasOwnProperty.call(body, "workspaces") ? sanitizeSupernovaWorkspaces(body.workspaces) : current.workspaces,
    aiChats: Object.prototype.hasOwnProperty.call(body, "aiChats") ? sanitizeSupernovaAIChats(body.aiChats) : current.aiChats
  };
  const encoded = {
    preferences: JSON.stringify(next.preferences),
    themes: JSON.stringify(next.themes),
    workspaces: JSON.stringify(next.workspaces),
    aiChats: JSON.stringify(next.aiChats)
  };
  if (Object.values(encoded).reduce((sum, part) => sum + part.length, 0) > 220000) {
    return apiError("SUPERNOVA_STATE_TOO_LARGE", "Supernova state is too large", 413);
  }
  const now = Date.now();
  await db.prepare(`INSERT INTO supernova_state(user_id,preferences_json,themes_json,workspaces_json,ai_chats_json,updated_at)
    VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET preferences_json=excluded.preferences_json,themes_json=excluded.themes_json,
    workspaces_json=excluded.workspaces_json,ai_chats_json=excluded.ai_chats_json,updated_at=excluded.updated_at`)
    .bind(auth.id, encoded.preferences, encoded.themes, encoded.workspaces, encoded.aiChats, now).run();
  return apiJson({ state: { ...next, updatedAt: now } });
}

async function supernovaAI(request, env) {
  requireSameOrigin(request);
  const auth = await requireSupernovaAccess(request, getDb(env));
  await enforceUserRateLimit(getDb(env), auth.id, "supernova-ai", 12, 60 * 1000, 60 * 1000);
  const keys = geminiKeys(env);
  if (!keys.length) return apiError("AI_UNAVAILABLE", "Supernova AI does not have a Google API key configured", 503);

  const body = await readJson(request, AI_MAX_JSON_BODY_BYTES);
  const mode = enumValue(body.mode, ["work", "game", "general"], "general");
  const prompts = {
    work: "You are Supernova AI, a clear and encouraging work and study assistant built into Nova. Help with homework, writing, math, science, coding, and productivity. Explain difficult ideas step by step, stay accurate, and keep answers concise unless more detail is requested.",
    game: "You are Supernova AI, the gaming assistant built into Nova. Give accurate, practical tips and recommend only games listed in the supplied Nova catalog. Never invent mechanics from a title. If information is uncertain, say so and ask what the player sees.",
    general: "You are Supernova AI, a friendly general assistant built into Nova. Be warm, concise, useful, accurate, and appropriate for a broad audience."
  };
  const context = mode === "game" ? cleanText(body.context, 12000) : "";
  const contents = [];

  (Array.isArray(body.messages) ? body.messages : []).slice(-16).forEach(item => {
    if (!item || typeof item !== "object") return;
    const role = item.role === "assistant" || item.role === "model" ? "model" : "user";
    const text = cleanText(item.text, 4000);
    const parts = [];
    if (role === "user" && Array.isArray(item.images)) {
      const candidate = item.images[item.images.length - 1];
      if (candidate && ["image/jpeg", "image/png", "image/webp"].includes(candidate.mimeType)) {
        const data = String(candidate.data || "");
        if (data.length <= 5.5 * 1024 * 1024 && /^[a-z0-9+/=]+$/i.test(data)) {
          parts.push({ inlineData: { mimeType: candidate.mimeType, data } });
        }
      }
    }
    if (text) parts.push({ text });
    else if (parts.length) parts.push({ text: "Please analyze the attached image and help me with it." });
    if (parts.length) contents.push({ role, parts });
  });

  if (!contents.length) return apiError("EMPTY_PROMPT", "Enter a message for Supernova AI", 400);
  const startSlot = stableSlot(auth.id, keys.length);
  const systemInstruction = prompts[mode] + (context ? `\n\n${context}` : "");
  const interactionInput = buildGeminiInteractionInput(contents);
  let lastStatus = 0;
  let lastProviderCode = "";
  let lastProviderMessage = "";
  let lastProviderName = "";
  let lastModel = "";
  let timedOut = false;

  for (let offset = 0; offset < keys.length; offset++) {
    const slot = (startSlot + offset) % keys.length;
    const models = await discoverGeminiModels(keys[slot], slot);
    let keyUnavailable = false;
    for (const model of models) {
      const providers = geminiProviders(model, systemInstruction, interactionInput, contents, mode);
      let modelUnavailable = false;
      for (const provider of providers) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        try {
          const response = await fetch(provider.url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": keys[slot] },
            body: provider.body,
            signal: controller.signal
          });
          const result = await response.json().catch(() => ({}));
          if (response.ok) {
            const reply = provider.extractReply(result);
            if (!reply) throw new ApiFailure("AI_EMPTY_RESPONSE", "Supernova AI did not return an answer. Try rewording the message.", 502);
            cacheWorkingGeminiModel(slot, model);
            return apiJson({ reply, model, transport: provider.name });
          }

          lastStatus = response.status;
          lastProviderCode = cleanText(result?.error?.status, 80);
          lastProviderMessage = safeProviderMessage(result?.error?.message);
          lastProviderName = provider.name;
          lastModel = model;
          modelUnavailable = response.status === 404 || lastProviderCode === "NOT_FOUND";
          keyUnavailable = [401, 403, 429].includes(response.status)
            || ["UNAUTHENTICATED", "PERMISSION_DENIED", "RESOURCE_EXHAUSTED"].includes(lastProviderCode);
          console.error("Supernova AI provider rejected request", {
            transport: provider.name,
            model,
            status: response.status,
            providerCode: lastProviderCode,
            providerMessage: lastProviderMessage,
            keySlot: slot + 1
          });
          if (keyUnavailable || modelUnavailable) break;
          if ([400, 405, 422].includes(response.status) && provider.name === "interactions") continue;
          if ([400, 405, 422].includes(response.status)) break;
          if (![401, 403, 429, 500, 502, 503, 504].includes(response.status)) break;
        } catch (error) {
          if (error instanceof ApiFailure) throw error;
          timedOut = timedOut || error?.name === "AbortError";
          lastProviderName = provider.name;
          lastModel = model;
          console.error("Supernova AI provider request failed", {
            transport: provider.name,
            model,
            timeout: error?.name === "AbortError",
            keySlot: slot + 1
          });
        } finally {
          clearTimeout(timeoutId);
        }
      }
      if (keyUnavailable) break;
      if (modelUnavailable || [400, 405, 422].includes(lastStatus)) continue;
      break;
    }
  }

  if (lastStatus === 401 || lastStatus === 403 || ["UNAUTHENTICATED", "PERMISSION_DENIED"].includes(lastProviderCode)) {
    throw new ApiFailure("GOOGLE_KEY_REJECTED", "Google rejected the configured AI keys. Check their Gemini API access in Google AI Studio.", 502);
  }
  if (lastStatus === 429) {
    throw new ApiFailure("GOOGLE_RATE_LIMITED", "Supernova AI reached Google's current rate limit. Wait a moment and try again.", 429);
  }
  if (lastProviderCode === "FAILED_PRECONDITION") {
    throw new ApiFailure("GOOGLE_PROJECT_SETUP", "The Google AI project is not ready for Gemini API requests.", 502);
  }
  if (timedOut) {
    throw new ApiFailure("GOOGLE_TIMEOUT", "Google AI took too long to respond. Please try again.", 504);
  }
  if ([400, 405, 422].includes(lastStatus) || lastProviderCode === "INVALID_ARGUMENT") {
    throw new ApiFailure("GOOGLE_REQUEST_REJECTED", "Google rejected Nova's AI request format. The server logged the exact provider reason.", 502);
  }
  if (lastStatus === 404 || lastProviderCode === "NOT_FOUND") {
    throw new ApiFailure("GOOGLE_MODEL_UNAVAILABLE", "Nova's configured Google AI model is not available for this project.", 502);
  }
  console.error("Supernova AI exhausted all provider attempts", {
    transport: lastProviderName,
    model: lastModel,
    status: lastStatus,
    providerCode: lastProviderCode,
    providerMessage: lastProviderMessage
  });
  throw new ApiFailure("AI_PROVIDER_ERROR", "Google AI could not complete that request. Please try again in a moment.", 502);
}

function geminiProviders(model, systemInstruction, interactionInput, contents, mode) {
  return [
    {
      name: "interactions",
      url: GEMINI_INTERACTIONS_URL,
      body: JSON.stringify({
        model,
        system_instruction: systemInstruction,
        input: interactionInput,
        store: false
      }),
      extractReply: extractGeminiInteractionReply
    },
    {
      name: "generateContent",
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: { temperature: mode === "game" ? 0.45 : 0.7, maxOutputTokens: 4096 }
      }),
      extractReply: extractGeminiGenerateReply
    }
  ];
}

async function discoverGeminiModels(key, slot) {
  const cached = geminiModelCache.get(slot);
  if (cached && cached.expiresAt > Date.now()) return cached.models;
  try {
    const response = await fetch(GEMINI_MODELS_URL, {
      headers: { "x-goog-api-key": key },
      signal: AbortSignal.timeout(10000)
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok) {
      const available = (result.models || [])
        .filter(model => (model.supportedGenerationMethods || []).includes("generateContent"))
        .map(model => cleanText(model.baseModelId || String(model.name || "").replace(/^models\//, ""), 120))
        .filter(model => /^gemini-[a-z0-9.-]+$/i.test(model))
        .filter(model => /flash/i.test(model) && !/(image|live|tts|embedding)/i.test(model));
      const preferred = GEMINI_MODEL_PREFERENCES.filter(model => available.includes(model));
      const remaining = available.filter(model => !preferred.includes(model));
      const models = [...new Set([...preferred, ...remaining])].slice(0, 5);
      if (models.length) {
        geminiModelCache.set(slot, { models, expiresAt: Date.now() + GEMINI_MODEL_CACHE_MS });
        return models;
      }
    } else {
      console.error("Supernova AI model discovery failed", {
        status: response.status,
        providerCode: cleanText(result?.error?.status, 80),
        providerMessage: safeProviderMessage(result?.error?.message),
        keySlot: slot + 1
      });
    }
  } catch (error) {
    console.error("Supernova AI model discovery request failed", {
      timeout: error?.name === "TimeoutError" || error?.name === "AbortError",
      keySlot: slot + 1
    });
  }
  return GEMINI_MODEL_PREFERENCES;
}

function cacheWorkingGeminiModel(slot, model) {
  const cached = geminiModelCache.get(slot);
  const models = [model, ...((cached && cached.models) || GEMINI_MODEL_PREFERENCES).filter(candidate => candidate !== model)];
  geminiModelCache.set(slot, { models, expiresAt: Date.now() + GEMINI_MODEL_CACHE_MS });
}

function buildGeminiInteractionInput(contents) {
  const transcript = [];
  let latestImage = null;
  contents.forEach(content => {
    const role = content.role === "model" ? "Assistant" : "User";
    const text = (content.parts || []).map(part => part.text || "").filter(Boolean).join("\n");
    if (text) transcript.push(`${role}: ${text}`);
    if (content.role === "user") {
      const imagePart = [...(content.parts || [])].reverse().find(part => part.inlineData);
      latestImage = imagePart?.inlineData || null;
    }
  });
  const input = [];
  if (latestImage) {
    input.push({ type: "image", mime_type: latestImage.mimeType, data: latestImage.data });
  }
  input.push({
    type: "text",
    text: `${transcript.join("\n\n")}\n\nRespond to the latest user message. Do not repeat the transcript labels.`
  });
  return input;
}

function extractGeminiInteractionReply(result) {
  const direct = cleanText(result?.output_text || result?.outputText, 12000);
  if (direct) return direct;
  const steps = Array.isArray(result?.steps) ? result.steps : [];
  const output = [...steps].reverse().find(step => step?.type === "model_output");
  return cleanText((output?.content || []).map(item => item?.type === "text" ? item.text || "" : "").join(""), 12000);
}

function extractGeminiGenerateReply(result) {
  const parts = result?.candidates?.[0]?.content?.parts || [];
  return cleanText(parts.map(part => part.text || "").join(""), 12000);
}

function safeProviderMessage(value) {
  return cleanText(value, 400)
    .replace(/\bAQ\.[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(/\bAIza[A-Za-z0-9_-]+\b/g, "[redacted]");
}

function geminiKeys(env) {
  return [env.GEMINI_API_KEY, env.GEMINI_API_KEY_1, env.GEMINI_API_KEY_2, env.GEMINI_API_KEY_3, env.GEMINI_API_KEY_4]
    .map(value => String(value || "").trim())
    .filter((value, index, values) => value && values.indexOf(value) === index);
}

function stableSlot(value, length) {
  let hash = 0;
  for (const char of String(value || "")) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return length ? hash % length : 0;
}

async function logProxyNavigation(request, db) {
  requireSameOrigin(request);
  const auth = await optionalUser(request, db);
  await enforceAuthRateLimit(request, db, "proxy-log", 180, 10 * 60 * 1000, 10 * 60 * 1000);
  const body = await readJson(request);
  const cleaned = sanitizeNavigationUrl(body.url);
  if (!cleaned) return apiError("INVALID_URL", "Only HTTP and HTTPS destinations can be logged", 400);
  const device = deviceIdFrom(request) || cleanText(body.deviceId, 128);
  if (!device) return apiError("DEVICE_ID_REQUIRED", "Nova device id is required", 400);
  const incidentId = cleanText(body.incidentId, 80);
  const now = Date.now();
  await db.prepare("INSERT INTO proxy_navigation_logs(user_id,device_id_hash,sanitized_url,domain,result,reason,incident_id,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .bind(auth?.id || null, await sha256(device), cleaned.url, cleaned.domain, enumValue(body.result, ["opened", "failed", "blocked"], "opened"), cleanText(body.reason, 160), incidentId || null, now, now + (incidentId ? INCIDENT_LOG_MS : PROXY_LOG_MS)).run();
  return apiJson({ ok: true });
}

async function activeAnnouncements(db) {
  const now = Date.now();
  const result = await db.prepare("SELECT id,title,body,audience,starts_at AS startsAt,expires_at AS expiresAt FROM announcements WHERE is_active=1 AND (starts_at IS NULL OR starts_at<=?) AND (expires_at IS NULL OR expires_at>?) ORDER BY created_at DESC LIMIT 10").bind(now, now).all();
  return apiJson({ announcements: result.results || [] });
}

function isMaintenanceApiPath(pathname) {
  return MAINTENANCE_API_PATHS.has(pathname) || pathname.startsWith("/api/admin/");
}

function isDocumentRequest(request, url) {
  if (request.method !== "GET") return false;
  const destination = String(request.headers.get("Sec-Fetch-Dest") || "").toLowerCase();
  const mode = String(request.headers.get("Sec-Fetch-Mode") || "").toLowerCase();
  return destination === "document" || mode === "navigate" || url.pathname === "/" || url.pathname === "/index.html";
}

async function maintenanceState(db, force = false) {
  const now = Date.now();
  if (!force && maintenanceCache.state && now - maintenanceCache.checkedAt < MAINTENANCE_CACHE_MS) {
    return maintenanceCache.state;
  }
  const row = await db.prepare("SELECT enabled,message,updated_at AS updatedAt FROM site_maintenance WHERE id=1").first();
  const state = {
    enabled: !!row?.enabled,
    message: row?.message || "",
    updatedAt: Number(row?.updatedAt || 0)
  };
  maintenanceCache = { checkedAt: now, state };
  return state;
}

async function hasStaffSession(request, db) {
  const user = await optionalUser(request, db);
  return !!user?.roles?.some(role => STAFF_ROLES.has(role));
}

function maintenanceApiResponse(maintenance) {
  return apiJson({
    error: {
      code: "MAINTENANCE",
      message: maintenance.message || "Nova is currently under maintenance. Check back soon.",
      maintenance: true
    }
  }, 503, { "Retry-After": "60" });
}

function escapeMaintenanceHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function maintenanceDocument(maintenance) {
  const message = escapeMaintenanceHtml(maintenance.message || "Nova is currently under maintenance. Check back soon.");
  const stars = Array.from({ length: 224 }, (_, index) => {
    const row = Math.floor(index / 14);
    const column = index % 14;
    const x = (column * 160) + (row % 2 ? 80 : 0);
    const y = row * 80;
    return `<i class="motif motif-large" style="--x:${x}px;--y:${y}px">✦</i><i class="motif motif-medium" style="--x:${x + 40}px;--y:${y + 40}px">✦</i><i class="motif motif-small" style="--x:${x + 100}px;--y:${y + 20}px">✦</i>`;
  }).join("");
  const body = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Nova maintenance</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oxanium:wght@700;800&family=Space+Mono:wght@400;700&display=swap">
  <style>
    :root{color-scheme:dark;font-family:"Space Mono",monospace}
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;overflow:hidden;background:#02030b;color:#eeeef6}
    .star-field{position:fixed;inset:0;overflow:hidden;background:#04040c}
    .monogram-track{position:absolute;inset:-200px;animation:monogramDrift 24s linear infinite;will-change:transform}
    .motif{position:absolute;left:var(--x);top:var(--y);width:80px;height:80px;display:flex;align-items:center;justify-content:center;color:rgba(139,143,255,.12);font-style:normal;line-height:1}
    .motif-large{font-size:2.2rem;color:rgba(139,143,255,.22);filter:drop-shadow(0 0 6px rgba(139,143,255,.18))}
    .motif-medium{font-size:1rem;color:rgba(139,143,255,.12)}
    .motif-small{font-size:.7rem;color:rgba(139,143,255,.07)}
    .stage{position:relative;z-index:1;min-height:100vh;display:grid;place-items:center;padding:40px 24px}
    main{width:min(680px,calc(100vw - 48px));margin-top:-2vh;text-align:center;display:flex;flex-direction:column;align-items:center}
    .nova7-wordmark{--logo-size:clamp(68px,7.5vw,104px);display:inline-flex;align-items:center;justify-content:center;width:auto;gap:0;margin:0 0 52px;padding:0;color:#f8f5ff;font-family:"Oxanium",system-ui,sans-serif;font-size:var(--logo-size);font-weight:800;line-height:.82;letter-spacing:0;filter:drop-shadow(0 16px 26px rgba(0,0,0,.62));animation:logoPulse 3.5s ease-in-out infinite;transform-origin:center}
    .nova7-logo-n{position:relative;z-index:1;display:inline-grid;place-items:center;min-width:.64em;transform:scaleX(.95);text-shadow:0 0 1px #fff,0 0 18px rgba(142,84,255,.48),0 5px 0 rgba(108,68,190,.34)}
    .nova7-logo-star{position:relative;z-index:2;display:block;flex:0 0 auto;width:.92em;height:.92em;margin-left:-.09em;margin-right:-.05em;overflow:visible;fill:currentColor;filter:drop-shadow(0 0 14px rgba(163,103,255,.72)) drop-shadow(0 6px 0 rgba(100,54,160,.28))}
    .nova7-logo-va{position:relative;z-index:1;display:inline-grid;grid-template-columns:.70em .86em;align-items:end;margin-left:-.06em;filter:drop-shadow(0 0 1px #fff) drop-shadow(0 0 18px rgba(142,84,255,.48)) drop-shadow(0 5px 0 rgba(108,68,190,.34))}
    .nova7-logo-v,.nova7-logo-a{font-size:1em;font-weight:800;letter-spacing:0}.nova7-logo-v{transform:scaleX(1.04)}.nova7-logo-a{margin-left:-.34em;transform:scaleX(1.08)}
    .status{display:flex;align-items:center;justify-content:center;gap:14px;margin:0 0 28px;color:#8b8fff;font-size:clamp(11px,.8vw,13px);font-weight:700;letter-spacing:.24em;text-transform:uppercase;text-shadow:0 0 18px rgba(139,143,255,.4)}
    .wrench{width:21px;height:21px;flex:0 0 auto;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    .message{max-width:560px;margin:0;color:rgba(238,238,246,.68);font-size:clamp(12px,.9vw,15px);line-height:1.75;overflow-wrap:anywhere;text-wrap:balance}
    .back-soon{color:rgba(139,143,255,.55);font-size:clamp(9px,.64vw,11px);font-weight:700;letter-spacing:.14em;text-transform:uppercase;margin-top:26px}
    @keyframes monogramDrift{from{transform:translate3d(-160px,-160px,0)}to{transform:translate3d(0,0,0)}}
    @keyframes logoPulse{0%,100%{opacity:.9;transform:scale(.985)}50%{opacity:1;transform:scale(1.015)}}
    @media(max-width:600px){main{width:min(92vw,520px);margin-top:-4vh}.nova7-wordmark{--logo-size:58px;margin-bottom:40px}.status{gap:10px;margin-bottom:22px;letter-spacing:.18em}.wrench{width:18px;height:18px}.message{max-width:350px}.back-soon{margin-top:22px}}
    @media(prefers-reduced-motion:reduce){.monogram-track,.nova7-wordmark{animation:none}}
  </style>
</head>
<body>
  <div class="star-field" aria-hidden="true"><div class="monogram-track">${stars}</div></div>
  <div class="stage"><main>
    <h1 class="nova7-wordmark" aria-label="Nova"><span class="nova7-logo-n">N</span><svg class="nova7-logo-star" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 0 C55 29 71 45 100 50 C71 55 55 71 50 100 C45 71 29 55 0 50 C29 45 45 29 50 0 Z"></path></svg><span class="nova7-logo-va" aria-hidden="true"><span class="nova7-logo-v">V</span><span class="nova7-logo-a">A</span></span></h1>
    <div class="status"><svg class="wrench" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg><span>Maintenance</span><svg class="wrench" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg></div>
    <p class="message">${message}</p>
    <div class="back-soon">Nova · Back soon</div>
  </main></div>
</body>
</html>`;
  return new Response(body, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Retry-After": "60",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src https://fonts.googleapis.com https://fonts.gstatic.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY"
    }
  });
}

async function siteState(db) {
  const now = Date.now();
  const [maintenance, banners] = await Promise.all([
    maintenanceState(db),
    db.prepare("SELECT id,message AS text,tone AS type,dismissible,is_active AS active,starts_at AS startsAt,expires_at AS expiresAt,created_at AS createdAt FROM site_banners WHERE is_active=1 AND (starts_at IS NULL OR starts_at<=?) AND (expires_at IS NULL OR expires_at>?) ORDER BY created_at DESC LIMIT 8").bind(now, now).all()
  ]);
  return apiJson({
    maintenance,
    banners: (banners.results || []).map(exposeBanner)
  });
}

async function adminSite(request, db) {
  await requireRole(request, db, DEVELOPER_ROLES);
  const [maintenance, banners] = await Promise.all([
    db.prepare("SELECT m.enabled,m.message,m.updated_at AS updatedAt,u.username AS updatedBy FROM site_maintenance m LEFT JOIN users u ON u.id=m.updated_by WHERE m.id=1").first(),
    db.prepare("SELECT b.id,b.message AS text,b.tone AS type,b.dismissible,b.is_active AS active,b.starts_at AS startsAt,b.expires_at AS expiresAt,b.created_at AS createdAt,b.updated_at AS updatedAt,u.username AS createdBy FROM site_banners b LEFT JOIN users u ON u.id=b.created_by ORDER BY b.created_at DESC LIMIT 100").all()
  ]);
  return apiJson({
    maintenance: { enabled: !!maintenance?.enabled, message: maintenance?.message || "", updatedAt: Number(maintenance?.updatedAt || 0), updatedBy: maintenance?.updatedBy || "" },
    banners: (banners.results || []).map(exposeBanner)
  });
}

async function adminSetMaintenance(request, db) {
  requireSameOrigin(request);
  const auth = await requireRole(request, db, DEVELOPER_ROLES);
  const body = await readJson(request);
  const enabled = !!body.enabled;
  const message = cleanText(body.message, 280) || (enabled ? "Nova is currently under maintenance. Check back soon." : "");
  const now = Date.now();
  await db.prepare("INSERT INTO site_maintenance(id,enabled,message,updated_by,updated_at) VALUES(1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled,message=excluded.message,updated_by=excluded.updated_by,updated_at=excluded.updated_at")
    .bind(enabled ? 1 : 0, message, auth.id, now).run();
  maintenanceCache = { checkedAt: now, state: { enabled, message, updatedAt: now } };
  await audit(db, auth.id, enabled ? "maintenance.enable" : "maintenance.disable", "site", "maintenance", message, {});
  return apiJson({ maintenance: { enabled, message, updatedAt: now } });
}

async function adminCreateBanner(request, db) {
  requireSameOrigin(request);
  const auth = await requireRole(request, db, DEVELOPER_ROLES);
  const body = await readJson(request);
  const message = cleanText(body.message, 300);
  const tone = enumValue(cleanText(body.tone, 20).toLowerCase(), ["info", "warn", "danger", "success"], "info");
  const expiresAt = body.expiresAt == null ? null : Number(body.expiresAt);
  if (!message) return apiError("MESSAGE_REQUIRED", "Banner message is required", 400);
  if (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= Date.now())) return apiError("INVALID_EXPIRY", "Banner expiry must be in the future", 400);
  const id = randomId();
  const now = Date.now();
  await db.prepare("INSERT INTO site_banners(id,message,tone,dismissible,is_active,starts_at,expires_at,created_by,created_at,updated_at) VALUES(?,?,?,?,1,NULL,?,?,?,?)")
    .bind(id, message, tone, body.dismissible === false ? 0 : 1, expiresAt, auth.id, now, now).run();
  await audit(db, auth.id, "banner.create", "banner", id, message, { tone, expiresAt });
  return apiJson({ id }, 201);
}

async function adminUpdateBanner(request, db) {
  requireSameOrigin(request);
  const auth = await requireRole(request, db, DEVELOPER_ROLES);
  const body = await readJson(request);
  const id = cleanText(body.id, 80);
  const existing = id ? await db.prepare("SELECT * FROM site_banners WHERE id=?").bind(id).first() : null;
  if (!existing) return apiError("BANNER_NOT_FOUND", "Banner not found", 404);
  const message = body.message == null ? existing.message : cleanText(body.message, 300);
  const tone = body.tone == null ? existing.tone : enumValue(cleanText(body.tone, 20).toLowerCase(), ["info", "warn", "danger", "success"], existing.tone);
  const dismissible = body.dismissible == null ? Number(existing.dismissible) : body.dismissible ? 1 : 0;
  const active = body.active == null ? Number(existing.is_active) : body.active ? 1 : 0;
  const expiresAt = Object.prototype.hasOwnProperty.call(body, "expiresAt") ? (body.expiresAt == null ? null : Number(body.expiresAt)) : existing.expires_at;
  if (!message) return apiError("MESSAGE_REQUIRED", "Banner message is required", 400);
  if (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= Date.now())) return apiError("INVALID_EXPIRY", "Banner expiry must be in the future", 400);
  await db.prepare("UPDATE site_banners SET message=?,tone=?,dismissible=?,is_active=?,expires_at=?,updated_at=? WHERE id=?")
    .bind(message, tone, dismissible, active, expiresAt, Date.now(), id).run();
  await audit(db, auth.id, active ? "banner.update" : "banner.disable", "banner", id, message, { tone, active: !!active, expiresAt });
  return apiJson({ ok: true });
}

async function adminDeleteBanner(request, db) {
  requireSameOrigin(request);
  const auth = await requireRole(request, db, DEVELOPER_ROLES);
  const body = await readJson(request);
  const id = cleanText(body.id, 80);
  const existing = id ? await db.prepare("SELECT message FROM site_banners WHERE id=?").bind(id).first() : null;
  if (!existing) return apiError("BANNER_NOT_FOUND", "Banner not found", 404);
  await db.prepare("DELETE FROM site_banners WHERE id=?").bind(id).run();
  await audit(db, auth.id, "banner.delete", "banner", id, existing.message, {});
  return apiJson({ ok: true });
}

function exposeBanner(row) {
  return {
    ...row,
    dismissible: !!row.dismissible,
    active: !!row.active,
    startsAt: row.startsAt == null ? null : Number(row.startsAt),
    expiresAt: row.expiresAt == null ? null : Number(row.expiresAt),
    createdAt: Number(row.createdAt || 0),
    updatedAt: Number(row.updatedAt || 0)
  };
}

async function adminOverview(request, db) {
  const auth = await requireRole(request, db, STAFF_ROLES);
  const now = Date.now();
  const [totalUsers, activeUsers, suspendedUsers, onlineUsers, reports, tickets, logs, messages, chatRestrictions, openTasks, recentReports] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS count FROM users WHERE account_status<>'deleted'").first(),
    db.prepare("SELECT COUNT(*) AS count FROM users WHERE account_status='active'").first(),
    db.prepare("SELECT COUNT(*) AS count FROM users WHERE account_status IN ('suspended','banned')").first(),
    db.prepare("SELECT COUNT(*) AS count FROM user_presence WHERE state IN ('online','idle','dnd') AND last_seen_at>?").bind(now - PRESENCE_FRESH_MS).first(),
    db.prepare("SELECT COUNT(*) AS count FROM reports WHERE report_type<>'plan_request' AND status IN ('open','assigned','appealed')").first(),
    db.prepare("SELECT COUNT(*) AS count FROM support_tickets WHERE status IN ('open','in_progress','waiting_user')").first(),
    db.prepare("SELECT COUNT(*) AS count FROM proxy_navigation_logs WHERE created_at>?").bind(now - 86400000).first(),
    db.prepare("SELECT COUNT(*) AS count FROM social_messages WHERE created_at>? AND deleted_at IS NULL").bind(now - 86400000).first(),
    db.prepare("SELECT COUNT(DISTINCT user_id) AS count FROM chat_restrictions WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?)").bind(now).first(),
    db.prepare("SELECT COUNT(*) AS count FROM admin_tasks WHERE status IN ('open','in_progress','waiting')").first(),
    db.prepare(`SELECT r.id,r.report_type AS reportType,r.reason,r.status,r.created_at AS createdAt,
      reporter.username AS reporter,target.username AS targetUser
      FROM reports r LEFT JOIN users reporter ON reporter.id=r.reporter_id
      LEFT JOIN users target ON target.id=r.target_user_id
      WHERE r.report_type<>'plan_request' AND r.status IN ('open','assigned','appealed') ORDER BY r.created_at DESC LIMIT 6`).all()
  ]);
  return apiJson({
    role: highestRole(auth.roles),
    metrics: {
      users: Number(activeUsers?.count || 0),
      totalUsers: Number(totalUsers?.count || 0),
      activeUsers: Number(activeUsers?.count || 0),
      suspendedUsers: Number(suspendedUsers?.count || 0),
      onlineUsers: Number(onlineUsers?.count || 0),
      openReports: Number(reports?.count || 0),
      openTickets: Number(tickets?.count || 0),
      proxyNavigations24h: Number(logs?.count || 0),
      messages24h: Number(messages?.count || 0),
      activeChatRestrictions: Number(chatRestrictions?.count || 0),
      openTasks: Number(openTasks?.count || 0)
    },
    recentReports: recentReports.results || []
  });
}

function exposeAdminTask(row) {
  return {
    id: row.id, kind: row.kind, taskType: row.taskType, title: row.title, description: row.description || "",
    priority: row.priority, status: row.status, creator: row.creator || "System", assignedTo: row.assignedTo || null,
    assignedRole: row.assignedRole || null, targetType: row.targetType || null, targetId: row.targetId || null,
    targetUsername: row.targetUsername || null, action: parseJson(row.actionJson, {}), resolution: row.resolution || "",
    dueAt: row.dueAt == null ? null : Number(row.dueAt), createdAt: Number(row.createdAt || 0), updatedAt: Number(row.updatedAt || 0),
    completedAt: row.completedAt == null ? null : Number(row.completedAt), completedBy: row.completedBy || null
  };
}

function adminTaskSelect() {
  return `SELECT t.id,t.kind,t.task_type AS taskType,t.title,t.description,t.priority,t.status,
    creator.username AS creator,assignee.username AS assignedTo,t.assigned_role AS assignedRole,
    t.target_type AS targetType,t.target_id AS targetId,t.target_username AS targetUsername,t.action_json AS actionJson,
    t.resolution,t.due_at AS dueAt,t.created_at AS createdAt,t.updated_at AS updatedAt,t.completed_at AS completedAt,
    completer.username AS completedBy,t.created_by AS createdById,t.assigned_to AS assignedToId
    FROM admin_tasks t LEFT JOIN users creator ON creator.id=t.created_by LEFT JOIN users assignee ON assignee.id=t.assigned_to
    LEFT JOIN users completer ON completer.id=t.completed_by`;
}

async function adminTasks(request, url, db) {
  const auth = await requireRole(request, db, STAFF_ROLES);
  const role = highestRole(auth.roles || ["user"]);
  const requestedStatus = cleanText(url.searchParams.get("status"), 24).toLowerCase();
  const scope = cleanText(url.searchParams.get("scope"), 24).toLowerCase();
  const clauses = [], args = [];
  if (["open","in_progress","waiting","completed","rejected","cancelled"].includes(requestedStatus)) { clauses.push("t.status=?"); args.push(requestedStatus); }
  if (role === "admin") {
    clauses.push("(t.created_by=? OR t.assigned_to=? OR t.assigned_role='admin')"); args.push(auth.id, auth.id);
  } else if (role === "developer" && scope !== "all") {
    clauses.push("(t.created_by=? OR t.assigned_to=? OR t.assigned_role IN ('developer','admin') OR t.kind='request')"); args.push(auth.id, auth.id);
  }
  if (scope === "mine") { clauses.push("(t.assigned_to=? OR t.assigned_role=?)"); args.push(auth.id, role); }
  else if (scope === "created") { clauses.push("t.created_by=?"); args.push(auth.id); }
  else if (scope === "requests") clauses.push("t.kind='request'");
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await db.prepare(`${adminTaskSelect()} ${where} ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'waiting' THEN 2 ELSE 3 END,
    CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,t.updated_at DESC LIMIT 150`).bind(...args).all();
  return apiJson({ tasks: (result.results || []).map(exposeAdminTask), role });
}

async function adminCreateTask(request, db) {
  requireSameOrigin(request);
  const auth = await requireRole(request, db, STAFF_ROLES);
  const body = await readJson(request);
  const actorRole = highestRole(auth.roles || ["user"]);
  let kind = enumValue(cleanText(body.kind, 16).toLowerCase(), ["task","request"], actorRole === "admin" ? "request" : "task");
  if (actorRole === "admin") kind = "request";
  const taskType = enumValue(cleanText(body.taskType, 40).toLowerCase(), ["general","password_reset","account_action","role_change","moderation_review","report_review","support_followup","voice_issue","game_issue","proxy_issue","theme_ui","site_change"], "general");
  const title = cleanText(body.title, 100);
  const description = cleanText(body.description, 1200);
  const priority = enumValue(cleanText(body.priority, 16).toLowerCase(), ["low","normal","high","urgent"], "normal");
  let assignedRole = enumValue(cleanText(body.assignedRole, 20).toLowerCase(), ["admin","developer","owner"], "");
  const assignedUsername = normalizeUsername(body.assignedUsername);
  let assigned = assignedUsername ? await loadUserByUsername(db, assignedUsername) : null;
  if (assignedUsername && (!assigned || !assigned.roles.some(role => STAFF_ROLES.has(role)))) return apiError("STAFF_NOT_FOUND", "Choose a staff account", 404);
  if (assigned) assignedRole = highestRole(assigned.roles || ["user"]);
  if (actorRole === "admin") {
    if (!assignedRole) assignedRole = "developer";
    if (!["developer","owner"].includes(assignedRole)) return apiError("FORBIDDEN", "Admins can send requests to Developers or Owner", 403);
  } else if (actorRole === "developer" && kind === "task") {
    if (!assignedRole) assignedRole = "admin";
    if (assignedRole === "owner") return apiError("FORBIDDEN", "Create a request when asking Owner; tasks can be assigned at or below Developer", 403);
  }
  if (!title) return apiError("TITLE_REQUIRED", "Add a task title", 400);
  let target = null;
  const targetUsername = normalizeUsername(body.targetUsername);
  if (targetUsername) {
    target = await loadUserByUsername(db, targetUsername);
    if (!target) return apiError("USER_NOT_FOUND", "Target user not found", 404);
  }
  const dueAt = body.dueAt == null ? null : Number(body.dueAt);
  if (dueAt !== null && (!Number.isFinite(dueAt) || dueAt <= Date.now())) return apiError("INVALID_DUE_DATE", "Due date must be in the future", 400);
  const id = `task_${crypto.randomUUID()}`;
  const now = Date.now();
  const action = { source: cleanText(body.source, 40), requestedAction: cleanText(body.requestedAction, 80) };
  await db.prepare(`INSERT INTO admin_tasks(id,kind,task_type,title,description,priority,status,created_by,assigned_to,assigned_role,target_type,target_id,target_username,action_json,resolution,due_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?,'open',?,?,?,?,?,?,?,'',?,?,?)`)
    .bind(id, kind, taskType, title, description, priority, auth.id, assigned?.id || null, assignedRole || null,
      target ? "user" : cleanText(body.targetType, 40) || null, target?.id || cleanText(body.targetId, 100) || null,
      target?.username || targetUsername || null, JSON.stringify(action), dueAt, now, now).run();
  await audit(db, auth.id, `task.${kind}.create`, "task", id, description || title, { taskType, priority, assignedRole, assignedTo: assigned?.username || null, targetUsername: target?.username || null });
  return apiJson({ id, ok: true }, 201);
}

async function adminUpdateTask(request, db) {
  requireSameOrigin(request);
  const auth = await requireRole(request, db, STAFF_ROLES);
  const body = await readJson(request);
  const id = cleanText(body.id, 100);
  const current = id ? await db.prepare(`${adminTaskSelect()} WHERE t.id=? LIMIT 1`).bind(id).first() : null;
  if (!current) return apiError("TASK_NOT_FOUND", "Task not found", 404);
  const actorRole = highestRole(auth.roles || ["user"]);
  const privileged = actorRole === "owner" || actorRole === "developer";
  const isAssigned = current.assignedToId === auth.id || current.assignedRole === actorRole;
  const isCreator = current.createdById === auth.id;
  if (!privileged && !isAssigned && !isCreator) return apiError("FORBIDDEN", "This task is not assigned to you", 403);
  let status = enumValue(cleanText(body.status, 24).toLowerCase(), ["open","in_progress","waiting","completed","rejected","cancelled"], current.status);
  if (actorRole === "admin" && isCreator && !isAssigned && !["open","cancelled"].includes(status)) return apiError("FORBIDDEN", "You can cancel your request, but the assigned staff member completes it", 403);
  let assigned = null, assignedRole = current.assignedRole;
  if (body.claim === true) {
    if (current.assignedRole && current.assignedRole !== actorRole && actorRole !== "owner" && !(actorRole === "developer" && current.kind === "request")) return apiError("FORBIDDEN", "This task is assigned to another staff role", 403);
    assigned = auth;
    status = "in_progress";
  }
  if (Object.prototype.hasOwnProperty.call(body, "assignedUsername") || Object.prototype.hasOwnProperty.call(body, "assignedRole")) {
    if (!privileged) return apiError("FORBIDDEN", "Only Developers or Owner can reassign tasks", 403);
    const username = normalizeUsername(body.assignedUsername);
    assigned = username ? await loadUserByUsername(db, username) : null;
    if (username && (!assigned || !assigned.roles.some(role => STAFF_ROLES.has(role)))) return apiError("STAFF_NOT_FOUND", "Choose a staff account", 404);
    assignedRole = assigned ? highestRole(assigned.roles || ["user"]) : enumValue(cleanText(body.assignedRole, 20).toLowerCase(), ["admin","developer","owner"], current.assignedRole || "");
    if (actorRole === "developer" && assignedRole === "owner" && current.kind !== "request") return apiError("FORBIDDEN", "Developers cannot assign tasks to Owner", 403);
  }
  const resolution = cleanText(body.resolution, 1200) || current.resolution || "";
  const now = Date.now();
  const done = ["completed","rejected","cancelled"].includes(status);
  await db.prepare(`UPDATE admin_tasks SET status=?,resolution=?,assigned_to=COALESCE(?,assigned_to),assigned_role=?,updated_at=?,
    completed_at=?,completed_by=? WHERE id=?`)
    .bind(status, resolution, assigned?.id || null, assignedRole || null, now, done ? now : null, done ? auth.id : null, id).run();
  await audit(db, auth.id, `task.${status}`, "task", id, resolution, { assignedRole, assignedTo: assigned?.username || current.assignedTo || null });
  return apiJson({ ok: true, status });
}

async function adminUsers(request, url, db) {
  await requireRole(request, db, STAFF_ROLES);
  const query = cleanText(url.searchParams.get("q"), 80).toLowerCase();
  const status = cleanText(url.searchParams.get("status"), 20).toLowerCase();
  const clauses = [], args = [];
  if (query) {
    const like = `%${query.replace(/[%_]/g, "")}%`;
    clauses.push("(lower(u.username) LIKE ? OR lower(COALESCE(p.display_name,'')) LIKE ?)");
    args.push(like, like);
  }
  if (["active", "suspended", "banned"].includes(status)) { clauses.push("u.account_status=?"); args.push(status); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const sql = `${profileSelect()}, COALESCE((SELECT group_concat(role) FROM user_roles ur WHERE ur.user_id=u.id AND (ur.expires_at IS NULL OR ur.expires_at>?)),'') AS role_list
    FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id LEFT JOIN user_stats s ON s.user_id=u.id
    ${where} ORDER BY u.created_at DESC LIMIT 100`;
  const result = await db.prepare(sql).bind(Date.now(), ...args).all();
  const users = (result.results || []).map(row => {
    row.roles = [...new Set(["user", ...String(row.role_list || "").split(",").filter(Boolean)])];
    return exposeAdminUser(row);
  });
  return apiJson({ users });
}

async function adminStaff(request, db) {
  await requireRole(request, db, DEVELOPER_ROLES);
  const now = Date.now();
  const result = await db.prepare(`${profileQuery()}
    WHERE EXISTS(SELECT 1 FROM user_roles sr WHERE sr.user_id=u.id
      AND sr.role IN ('developer','admin','owner') AND (sr.expires_at IS NULL OR sr.expires_at>?))
    ORDER BY CASE public_role WHEN 'owner' THEN 0 WHEN 'developer' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,u.username COLLATE NOCASE`).bind(now).all();
  return apiJson({ staff: (result.results || []).map(exposeAdminUser) });
}

async function adminSetUserStatus(request, db) {
  requireSameOrigin(request);
  const auth = await requireRole(request, db, ADMIN_ROLES);
  const body = await readJson(request);
  const target = await loadUserByUsername(db, normalizeUsername(body.username));
  const status = cleanText(body.status, 20).toLowerCase();
  const reason = cleanText(body.reason, 240);
  if (!["active", "suspended", "banned"].includes(status)) return apiError("INVALID_STATUS", "Invalid account status", 400);
  if (!target) return apiError("USER_NOT_FOUND", "User not found", 404);
  if (target.id === auth.id) return apiError("SELF_ACTION_FORBIDDEN", "You cannot change your own account status", 400);
  const targetRole = highestRole(target.roles || ["user"]);
  const actorRole = highestRole(auth.roles || ["user"]);
  if (roleRank(actorRole) <= roleRank(targetRole)) {
    return apiError("PROTECTED_ACCOUNT", "You can only manage accounts below your staff level", 403);
  }
  if (status !== "active" && !reason) return apiError("REASON_REQUIRED", "A reason is required", 400);
  const now = Date.now();
  await db.batch([
    db.prepare("UPDATE users SET account_status=?,updated_at=? WHERE id=?").bind(status, now, target.id),
    ...(status === "active" ? [] : [db.prepare("UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL").bind(now, target.id)])
  ]);
  await audit(db, auth.id, `user.${status}`, "user", target.id, reason, { username: target.username, previousStatus: target.account_status });
  return apiJson({ ok: true, status });
}

async function adminResetUserPassword(request, db) {
  requireSameOrigin(request);
  const auth = await requireRole(request, db, DEVELOPER_ROLES);
  const body = await readJson(request);
  const target = await loadUserByUsername(db, normalizeUsername(body.username));
  const password = String(body.newPassword || "");
  const reason = cleanText(body.reason, 240);
  if (!target) return apiError("USER_NOT_FOUND", "User not found", 404);
  if (target.id === auth.id) return apiError("SELF_ACTION_FORBIDDEN", "Change your own password from your account settings", 400);
  if (roleRank(highestRole(auth.roles || ["user"])) <= roleRank(highestRole(target.roles || ["user"]))) return apiError("PROTECTED_ACCOUNT", "You can only reset passwords for accounts below your staff level", 403);
  if (weakPassword(password, target.username)) return apiError("WEAK_PASSWORD", "Use at least 8 characters and avoid common passwords", 400);
  if (!reason) return apiError("REASON_REQUIRED", "An audit reason is required", 400);
  const salt = randomToken(16);
  const hash = await derivePassword(password, salt);
  const now = Date.now();
  await db.batch([
    db.prepare("UPDATE users SET password_hash=?,password_salt=?,legacy_hash='',updated_at=? WHERE id=?").bind(hash, salt, now, target.id),
    db.prepare("UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL").bind(now, target.id)
  ]);
  await db.prepare(`UPDATE admin_tasks SET status='completed',resolution=?,completed_at=?,completed_by=?,updated_at=?
    WHERE task_type='password_reset' AND target_id=? AND status IN ('open','in_progress','waiting')`)
    .bind("Password reset completed", now, auth.id, now, target.id).run();
  await audit(db, auth.id, "user.password_reset", "user", target.id, reason, { username: target.username });
  return apiJson({ ok: true });
}

function canRestrictChatTarget(actor, target) {
  if (!target || target.id === actor.id) return false;
  const targetRole = highestRole(target.roles || ["user"]);
  const actorRole = highestRole(actor.roles || ["user"]);
  return roleRank(actorRole) > roleRank(targetRole);
}

async function adminChatMessages(request, url, db) {
  const auth = await requireRole(request, db, ADMIN_ROLES);
  const reason = cleanText(request.headers.get("X-Nova-Audit-Reason"), 240);
  if (!reason) return apiError("AUDIT_REASON_REQUIRED", "An investigation reason is required", 400);
  const query = cleanText(url.searchParams.get("q"), 120).toLowerCase();
  const username = normalizeUsername(url.searchParams.get("username"));
  const channelKind = enumValue(cleanText(url.searchParams.get("channel"), 20), ["", "everyone", "dm", "group"], "");
  if (!query && !username) return apiError("SEARCH_REQUIRED", "Enter a username or message text", 400);
  const clauses = ["m.deleted_at IS NULL"], args = [];
  if (query) { clauses.push("lower(m.body) LIKE ?"); args.push(`%${query.replace(/[%_]/g, "")}%`); }
  if (username) { clauses.push("u.username=? COLLATE NOCASE"); args.push(username); }
  if (channelKind) { clauses.push("c.kind=?"); args.push(channelKind); }
  const result = await db.prepare(`SELECT m.id,u.username,COALESCE(p.display_name,u.username) AS displayName,
    COALESCE(p.avatar_url,'') AS avatarUrl,c.kind AS channelKind,c.name AS channelName,m.channel_id AS channelId,
    m.body,m.message_type AS messageType,m.created_at AS createdAt
    FROM social_messages m JOIN users u ON u.id=m.sender_id LEFT JOIN user_profiles p ON p.user_id=u.id
    JOIN social_channels c ON c.id=m.channel_id WHERE ${clauses.join(" AND ")}
    ORDER BY m.created_at DESC LIMIT 100`).bind(...args).all();
  const eventClauses = ["e.expires_at>?"], eventArgs = [Date.now()];
  if (query) { eventClauses.push("lower(e.excerpt) LIKE ?"); eventArgs.push(`%${query.replace(/[%_]/g, "")}%`); }
  if (username) { eventClauses.push("u.username=? COLLATE NOCASE"); eventArgs.push(username); }
  if (channelKind) { eventClauses.push("c.kind=?"); eventArgs.push(channelKind); }
  const events = await db.prepare(`SELECT e.id,u.username,e.channel_id AS channelId,e.rule_code AS ruleCode,e.excerpt,e.created_at AS createdAt
    FROM chat_moderation_events e LEFT JOIN users u ON u.id=e.user_id LEFT JOIN social_channels c ON c.id=e.channel_id
    WHERE ${eventClauses.join(" AND ")} ORDER BY e.created_at DESC LIMIT 100`).bind(...eventArgs).all();
  await audit(db, auth.id, "chat.search", "social_messages", username || "", reason, { query: query ? "provided" : "", username, channelKind, messages: result.results?.length || 0, filteredEvents: events.results?.length || 0 });
  return apiJson({ messages: (result.results || []).map(row => ({ ...row, body: row.messageType === "image" ? "[Image]" : cleanText(row.body, 1000), createdAt: Number(row.createdAt || 0) })), filteredEvents: events.results || [] });
}


async function adminClearEveryoneChat(request, db) {
  requireSameOrigin(request);
  const auth = await requireRole(request, db, ADMIN_ROLES);
  const body = await readJson(request);
  const reason = cleanText(body.reason, 240);
  if (!reason) return apiError("REASON_REQUIRED", "An audit reason is required", 400);

  const now = Date.now();
  const countRow = await db.prepare("SELECT COUNT(*) AS count FROM social_messages WHERE channel_id='everyone' AND deleted_at IS NULL").first();
  const count = Number(countRow?.count || 0);

  if (count > 0) {
    await db.prepare("UPDATE social_messages SET deleted_at=? WHERE channel_id='everyone' AND deleted_at IS NULL").bind(now).run();
  }

  await audit(db, auth.id, "chat.everyone_clear", "social_channel", "everyone", reason, { deletedMessages: count });
  return apiJson({ ok: true, deletedMessages: count });
}

async function adminChatRestrictions(request, url, db) {
  await requireRole(request, db, ADMIN_ROLES);
  const username = normalizeUsername(url.searchParams.get("username"));
  const now = Date.now();
  const where = username ? "AND target.username=? COLLATE NOCASE" : "";
  const statement = db.prepare(`SELECT r.id,target.username,COALESCE(p.display_name,target.username) AS displayName,
    COALESCE(p.avatar_url,'') AS avatarUrl,r.scope,r.action,r.reason,r.created_at AS createdAt,r.expires_at AS expiresAt,
    issuer.username AS issuedBy FROM chat_restrictions r JOIN users target ON target.id=r.user_id
    LEFT JOIN user_profiles p ON p.user_id=target.id LEFT JOIN users issuer ON issuer.id=r.issued_by
    WHERE r.revoked_at IS NULL AND (r.expires_at IS NULL OR r.expires_at>?) ${where}
    ORDER BY r.created_at DESC LIMIT 200`);
  const result = username ? await statement.bind(now, username).all() : await statement.bind(now).all();
  return apiJson({ restrictions: result.results || [] });
}

async function adminCreateChatRestriction(request, db) {
  requireSameOrigin(request);
  const auth = await requireRole(request, db, ADMIN_ROLES);
  const body = await readJson(request);
  const target = await loadUserByUsername(db, normalizeUsername(body.username));
  const scope = enumValue(cleanText(body.scope, 20), ["all", "everyone"], "all");
  const reason = cleanText(body.reason, 240);
  const expiresAt = body.expiresAt == null ? null : Number(body.expiresAt);
  if (!target) return apiError("USER_NOT_FOUND", "User not found", 404);
  if (!canRestrictChatTarget(auth, target)) return apiError("PROTECTED_ACCOUNT", "You cannot restrict that account", 403);
  if (!reason) return apiError("REASON_REQUIRED", "A Social-timeout reason is required", 400);
  if (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= Date.now())) return apiError("INVALID_EXPIRY", "Social-timeout expiry must be in the future", 400);
  const id = `chat_${randomId()}`, now = Date.now();
  await db.batch([
    db.prepare("UPDATE chat_restrictions SET revoked_at=?,revoked_by=? WHERE user_id=? AND scope=? AND revoked_at IS NULL").bind(now, auth.id, target.id, scope),
    db.prepare("INSERT INTO chat_restrictions(id,user_id,scope,action,reason,issued_by,created_at,expires_at) VALUES(?,?,?,'ban',?,?,?,?)").bind(id, target.id, scope, reason, auth.id, now, expiresAt)
  ]);
  await audit(db, auth.id, expiresAt ? "chat.timeout" : "chat.ban", "user", target.id, reason, { username: target.username, scope, expiresAt });
  return apiJson({ ok: true, restriction: { id, username: target.username, scope, reason, expiresAt } }, 201);
}

async function adminRevokeChatRestriction(request, db) {
  requireSameOrigin(request);
  const auth = await requireRole(request, db, ADMIN_ROLES);
  const body = await readJson(request);
  const id = cleanText(body.id, 100);
  const reason = cleanText(body.reason, 240);
  if (!reason) return apiError("REASON_REQUIRED", "A reason for ending the Social timeout is required", 400);
  const restriction = id ? await db.prepare("SELECT r.id,r.user_id,r.scope,r.expires_at,u.username FROM chat_restrictions r JOIN users u ON u.id=r.user_id WHERE r.id=? AND r.revoked_at IS NULL LIMIT 1").bind(id).first() : null;
  if (!restriction) return apiError("CHAT_RESTRICTION_NOT_FOUND", "Active Social timeout not found", 404);
  await db.prepare("UPDATE chat_restrictions SET revoked_at=?,revoked_by=? WHERE id=?").bind(Date.now(), auth.id, id).run();
  await audit(db, auth.id, restriction.expires_at == null ? "chat.ban.end" : "chat.timeout.end", "user", restriction.user_id, reason, { username: restriction.username, scope: restriction.scope, restrictionId: id });
  return apiJson({ ok: true });
}

async function adminReports(request, url, db) {
  await requireRole(request, db, STAFF_ROLES);
  const status = cleanText(url.searchParams.get("status"), 20).toLowerCase();
  const allowedStatuses = ["open", "assigned", "resolved", "dismissed", "appealed"];
  const where = allowedStatuses.includes(status) ? "WHERE r.report_type<>'plan_request' AND r.status=?" : "WHERE r.report_type<>'plan_request'";
  const statement = db.prepare(`SELECT r.id,r.report_type AS reportType,r.reason,r.status,r.created_at AS createdAt,r.updated_at AS updatedAt,
    reporter.username AS reporter,target.username AS targetUser,assignee.username AS assignedTo
    FROM reports r LEFT JOIN users reporter ON reporter.id=r.reporter_id
    LEFT JOIN users target ON target.id=r.target_user_id LEFT JOIN users assignee ON assignee.id=r.assigned_to
    ${where} ORDER BY CASE WHEN r.status IN ('open','appealed','assigned') THEN 0 ELSE 1 END,r.created_at DESC LIMIT 200`);
  const result = allowedStatuses.includes(status) ? await statement.bind(status).all() : await statement.all();
  return apiJson({ reports: result.results || [] });
}

async function adminReportAction(request, db) {
  requireSameOrigin(request);
  const auth = await requireRole(request, db, STAFF_ROLES);
  const body = await readJson(request);
  const id = cleanText(body.id, 80);
  const action = cleanText(body.action, 20).toLowerCase();
  const reason = cleanText(body.reason, 240);
  if (!["assign", "resolve", "dismiss", "reopen"].includes(action)) return apiError("INVALID_ACTION", "Invalid report action", 400);
  const report = id ? await db.prepare("SELECT id,status,report_type FROM reports WHERE id=?").bind(id).first() : null;
  if (!report) return apiError("REPORT_NOT_FOUND", "Report not found", 404);
  if (report.report_type === "plan_request") return apiError("USE_SUPERNOVA_PANEL", "Manage upgrade requests from the Supernova panel", 409);
  if (["resolve", "dismiss"].includes(action) && !reason) return apiError("REASON_REQUIRED", "A resolution note is required", 400);
  const status = action === "assign" ? "assigned" : action === "reopen" ? "open" : action === "resolve" ? "resolved" : "dismissed";
  await db.prepare("UPDATE reports SET status=?,assigned_to=?,updated_at=? WHERE id=?")
    .bind(status, action === "reopen" ? null : auth.id, Date.now(), id).run();
  await audit(db, auth.id, `report.${action}`, "report", id, reason, { previousStatus: report.status, status });
  return apiJson({ ok: true, status });
}

async function adminSupernova(request, db) {
  await requireRole(request, db, STAFF_ROLES);
  const now = Date.now();
  const [members, requests] = await Promise.all([
    db.prepare(`SELECT u.username,COALESCE(p.display_name,u.username) AS displayName,COALESCE(p.avatar_url,'') AS avatarUrl,
      up.note,up.granted_at AS grantedAt,up.expires_at AS expiresAt,grantor.username AS grantedBy
      FROM user_plans up JOIN users u ON u.id=up.user_id LEFT JOIN user_profiles p ON p.user_id=u.id
      LEFT JOIN users grantor ON grantor.id=up.granted_by
      WHERE up.plan='supernova' AND up.status='active' AND (up.expires_at IS NULL OR up.expires_at>?)
      AND u.account_status='active' ORDER BY COALESCE(up.granted_at,up.updated_at) DESC`).bind(now).all(),
    db.prepare(`SELECT r.id,r.reason,r.status,r.created_at AS createdAt,u.username,
      COALESCE(p.display_name,u.username) AS displayName,COALESCE(p.avatar_url,'') AS avatarUrl
      FROM reports r JOIN users u ON u.id=r.reporter_id LEFT JOIN user_profiles p ON p.user_id=u.id
      WHERE r.report_type='plan_request' AND r.status IN ('open','assigned')
      ORDER BY r.created_at ASC`).all()
  ]);
  return apiJson({ members: members.results || [], requests: requests.results || [] });
}

async function adminSupernovaAction(request, db) {
  requireSameOrigin(request);
  const auth = await requireRole(request, db, ADMIN_ROLES);
  const body = await readJson(request);
  const action = cleanText(body.action, 20).toLowerCase();
  const note = cleanText(body.note || body.reason, 240);
  const now = Date.now();
  if (!["grant", "revoke", "approve", "deny"].includes(action)) return apiError("INVALID_ACTION", "Invalid Supernova action", 400);

  if (action === "approve" || action === "deny") {
    const requestId = cleanText(body.requestId, 80);
    const report = requestId ? await db.prepare(`SELECT r.id,r.reporter_id,u.username
      FROM reports r JOIN users u ON u.id=r.reporter_id
      WHERE r.id=? AND r.report_type='plan_request' AND r.status IN ('open','assigned') LIMIT 1`).bind(requestId).first() : null;
    if (!report) return apiError("REQUEST_NOT_FOUND", "Supernova request not found", 404);
    if (action === "approve") {
      await db.batch([
        supernovaGrantStatement(db, report.reporter_id, auth.id, note || "Upgrade request approved", null, now),
        db.prepare("UPDATE reports SET status='resolved',assigned_to=?,updated_at=? WHERE id=?").bind(auth.id, now, report.id)
      ]);
    } else {
      await db.prepare("UPDATE reports SET status='dismissed',assigned_to=?,updated_at=? WHERE id=?").bind(auth.id, now, report.id).run();
    }
    await audit(db, auth.id, `supernova.${action}`, "user", report.reporter_id, note || (action === "approve" ? "Upgrade request approved" : "Upgrade request denied"), { username: report.username, requestId: report.id });
    return apiJson({ ok: true, username: report.username, plan: action === "approve" ? "supernova" : "free" });
  }

  const target = await loadUserByUsername(db, normalizeUsername(body.username));
  if (!target) return apiError("USER_NOT_FOUND", "User not found", 404);
  if (action === "grant") {
    const expiresAt = body.expiresAt == null ? null : Number(body.expiresAt);
    if (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= now)) return apiError("INVALID_EXPIRY", "Plan expiry must be in the future", 400);
    await db.batch([
      supernovaGrantStatement(db, target.id, auth.id, note || "Manual Supernova grant", expiresAt, now),
      db.prepare("UPDATE reports SET status='resolved',assigned_to=?,updated_at=? WHERE reporter_id=? AND report_type='plan_request' AND status IN ('open','assigned')").bind(auth.id, now, target.id)
    ]);
    await audit(db, auth.id, "supernova.grant", "user", target.id, note || "Manual Supernova grant", { username: target.username, expiresAt });
    return apiJson({ ok: true, username: target.username, plan: "supernova", expiresAt });
  }

  const existing = await db.prepare("SELECT plan,status FROM user_plans WHERE user_id=? AND plan='supernova' AND status='active'").bind(target.id).first();
  if (!existing) return apiError("NOT_SUPERNOVA", "That account does not have Supernova Pro", 409);
  await db.prepare("UPDATE user_plans SET status='revoked',updated_at=? WHERE user_id=?").bind(now, target.id).run();
  await audit(db, auth.id, "supernova.revoke", "user", target.id, note || "Manual Supernova revoke", { username: target.username });
  return apiJson({ ok: true, username: target.username, plan: "free" });
}

function supernovaGrantStatement(db, userId, grantedBy, note, expiresAt, now) {
  return db.prepare(`INSERT INTO user_plans(user_id,plan,status,note,granted_by,granted_at,expires_at,updated_at)
    VALUES(?,'supernova','active',?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET plan='supernova',status='active',
    note=excluded.note,granted_by=excluded.granted_by,granted_at=excluded.granted_at,expires_at=excluded.expires_at,updated_at=excluded.updated_at`)
    .bind(userId, note, grantedBy, now, expiresAt, now);
}

async function adminProxyLogs(request, url, db) {
  const auth = await requireRole(request, db, DEVELOPER_ROLES);
  const reason = cleanText(request.headers.get("X-Nova-Audit-Reason"), 240);
  if (!reason) return apiError("AUDIT_REASON_REQUIRED", "An investigation reason is required", 400);
  const domain = cleanText(url.searchParams.get("domain"), 120).toLowerCase();
  const deviceHash = cleanText(url.searchParams.get("device"), 128);
  const clauses = [], args = [];
  if (domain) { clauses.push("l.domain LIKE ?"); args.push(`%${domain}%`); }
  if (deviceHash) { clauses.push("l.device_id_hash = ?"); args.push(deviceHash); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await db.prepare(`SELECT l.id,l.device_id_hash AS deviceId,l.sanitized_url AS url,l.domain,l.result,l.reason,l.incident_id AS incidentId,l.created_at AS createdAt,l.expires_at AS expiresAt,u.username FROM proxy_navigation_logs l LEFT JOIN users u ON u.id=l.user_id ${where} ORDER BY l.created_at DESC LIMIT 250`).bind(...args).all();
  await audit(db, auth.id, "proxy_logs.view", "proxy_logs", "", reason, { domain, deviceHash, rows: result.results?.length || 0 });
  return apiJson({ logs: result.results || [] });
}

async function adminDeviceBans(request, db) {
  await requireRole(request, db, ADMIN_ROLES);
  const now = Date.now();
  const result = await db.prepare(`SELECT b.device_id_hash AS deviceId,b.reason,b.created_at AS createdAt,b.expires_at AS expiresAt,
    creator.username AS bannedBy,
    (SELECT u.username FROM proxy_navigation_logs l LEFT JOIN users u ON u.id=l.user_id
      WHERE l.device_id_hash=b.device_id_hash ORDER BY l.created_at DESC LIMIT 1) AS username,
    (SELECT MAX(l.created_at) FROM proxy_navigation_logs l WHERE l.device_id_hash=b.device_id_hash) AS lastSeenAt
    FROM device_bans b LEFT JOIN users creator ON creator.id=b.banned_by
    WHERE b.expires_at IS NULL OR b.expires_at>?
    ORDER BY b.created_at DESC`).bind(now).all();
  return apiJson({ bans: result.results || [] });
}

async function adminBanDevice(request, db) {
  requireSameOrigin(request);
  const auth = await requireRole(request, db, ADMIN_ROLES);
  const body = await readJson(request);
  const deviceId = cleanText(body.deviceId, 128);
  const reason = cleanText(body.reason, 240);
  const expiresAt = body.expiresAt == null ? null : Number(body.expiresAt);
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(deviceId)) return apiError("INVALID_DEVICE_ID", "Enter a complete device hash from Proxy Activity", 400);
  if (!reason) return apiError("REASON_REQUIRED", "A ban reason is required", 400);
  if (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= Date.now())) return apiError("INVALID_EXPIRY", "Ban expiry must be in the future", 400);
  const ownDevice = deviceIdFrom(request);
  if (ownDevice && await sha256(ownDevice) === deviceId) return apiError("SELF_DEVICE_FORBIDDEN", "You cannot ban the device you are using", 400);
  const actorRole = highestRole(auth.roles || ["user"]);
  const protectedDevice = await db.prepare(`SELECT ur.role FROM user_roles ur
    WHERE ur.role IN ('developer','admin','owner') AND (ur.expires_at IS NULL OR ur.expires_at>?)
    AND ur.user_id IN (
      SELECT user_id FROM auth_sessions WHERE device_id_hash=?
      UNION SELECT user_id FROM proxy_navigation_logs WHERE device_id_hash=?
    ) ORDER BY CASE ur.role WHEN 'owner' THEN 3 WHEN 'developer' THEN 2 WHEN 'admin' THEN 1 ELSE 0 END DESC LIMIT 1`).bind(Date.now(), deviceId, deviceId).first();
  if (protectedDevice && roleRank(actorRole) <= roleRank(protectedDevice.role)) return apiError("PROTECTED_DEVICE", "You can only ban devices belonging to lower staff levels", 403);
  const now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO device_bans(device_id_hash,reason,banned_by,created_at,expires_at) VALUES(?,?,?,?,?) ON CONFLICT(device_id_hash) DO UPDATE SET reason=excluded.reason,banned_by=excluded.banned_by,created_at=excluded.created_at,expires_at=excluded.expires_at").bind(deviceId, reason, auth.id, now, expiresAt),
    db.prepare("UPDATE auth_sessions SET revoked_at=? WHERE device_id_hash=? AND revoked_at IS NULL").bind(now, deviceId)
  ]);
  await audit(db, auth.id, "device.ban", "device", deviceId, reason, { expiresAt });
  return apiJson({ ok: true });
}

async function adminUnbanDevice(request, db) {
  requireSameOrigin(request);
  const auth = await requireRole(request, db, ADMIN_ROLES);
  const body = await readJson(request);
  const deviceId = cleanText(body.deviceId, 128);
  const reason = cleanText(body.reason, 240);
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(deviceId)) return apiError("INVALID_DEVICE_ID", "Invalid device hash", 400);
  if (!reason) return apiError("REASON_REQUIRED", "An unban reason is required", 400);
  const existing = await db.prepare("SELECT device_id_hash FROM device_bans WHERE device_id_hash=?").bind(deviceId).first();
  if (!existing) return apiError("DEVICE_BAN_NOT_FOUND", "That device is not banned", 404);
  await db.prepare("DELETE FROM device_bans WHERE device_id_hash=?").bind(deviceId).run();
  await audit(db, auth.id, "device.unban", "device", deviceId, reason, {});
  return apiJson({ ok: true });
}

async function adminSetRole(request, db) {
  requireSameOrigin(request);
  const auth = await requireRole(request, db, DEVELOPER_ROLES);
  const body = await readJson(request);
  const target = await loadUserByUsername(db, normalizeUsername(body.username));
  const role = cleanText(body.role, 20).toLowerCase();
  const action = cleanText(body.action, 20).toLowerCase();
  const reason = cleanText(body.reason, 240);
  const actorRole = highestRole(auth.roles || ["user"]);
  if (!["developer", "admin"].includes(role)) return apiError("INVALID_ROLE", "Invalid staff role", 400);
  if (actorRole === "developer" && role !== "admin") return apiError("FORBIDDEN", "Developers can manage Admin roles; only Owner can manage Developers", 403);
  if (!["grant", "revoke"].includes(action)) return apiError("INVALID_ACTION", "Invalid role action", 400);
  if (!reason) return apiError("REASON_REQUIRED", "An audit reason is required", 400);
  if (!target) return apiError("USER_NOT_FOUND", "User not found", 404);
  if (target.id === auth.id) return apiError("SELF_ACTION_FORBIDDEN", "You cannot change your own staff role", 400);
  const targetRole = highestRole(target.roles || ["user"]);
  if (targetRole === "owner" || roleRank(actorRole) <= roleRank(targetRole)) return apiError("PROTECTED_ACCOUNT", "You can only manage staff below your level", 403);
  const expiresAt = body.expiresAt == null ? null : Number(body.expiresAt);
  if (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= Date.now())) return apiError("INVALID_EXPIRY", "Role expiry must be in the future", 400);
  if (action === "grant") await db.batch([
    db.prepare("DELETE FROM user_roles WHERE user_id=? AND role IN ('developer','admin')").bind(target.id),
    db.prepare("INSERT INTO user_roles(user_id,role,granted_by,expires_at) VALUES(?,?,?,?)").bind(target.id, role, auth.id, expiresAt)
  ]);
  else await db.prepare("DELETE FROM user_roles WHERE user_id=? AND role=?").bind(target.id, role).run();
  await audit(db, auth.id, `role.${action}`, "user", target.id, reason, { role, username: target.username, expiresAt });
  return apiJson({ ok: true });
}

async function adminAudit(request, url, db) {
  await requireRole(request, db, DEVELOPER_ROLES);
  const result = await db.prepare("SELECT a.id,u.username AS actor,a.action,a.target_type AS targetType,a.target_id AS targetId,a.reason,a.metadata_json AS metadata,a.created_at AS createdAt FROM admin_audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 250").all();
  return apiJson({ logs: (result.results || []).map(row => ({ ...row, metadata: parseJson(row.metadata, {}) })) });
}

async function resolveChannel(db, userId, requested, create) {
  if (requested === "everyone") return { id: "everyone", publicId: "everyone", kind: "everyone" };
  if (requested.startsWith("group:")) {
    const id = cleanText(requested.slice(6), 80);
    const member = await db.prepare("SELECT 1 FROM social_channel_members m JOIN social_channels c ON c.id=m.channel_id WHERE m.channel_id=? AND m.user_id=? AND c.kind='group'").bind(id, userId).first();
    return member ? { id, publicId: `group:${id}`, kind: "group" } : null;
  }
  if (!requested.startsWith("dm:")) return null;
  const username = normalizeUsername(requested.slice(3));
  const other = await loadUserByUsername(db, username);
  if (!other || other.id === userId) return null;
  if (await isBlockedBetween(db, userId, other.id)) return null;
  const friendship = await db.prepare("SELECT 1 FROM friendships WHERE status='accepted' AND ((requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)) LIMIT 1").bind(userId, other.id, other.id, userId).first();
  if (!friendship) return null;
  const ids = [userId, other.id].sort();
  const channelId = `dm_${(await sha256(ids.join(":"))).slice(0, 40)}`;
  if (create) await db.batch([
    db.prepare("INSERT OR IGNORE INTO social_channels(id,kind,name) VALUES(?,'dm','')").bind(channelId),
    db.prepare("INSERT OR IGNORE INTO social_channel_members(channel_id,user_id) VALUES(?,?)").bind(channelId, userId),
    db.prepare("INSERT OR IGNORE INTO social_channel_members(channel_id,user_id) VALUES(?,?)").bind(channelId, other.id)
  ]);
  else {
    const exists = await db.prepare("SELECT 1 FROM social_channels WHERE id=?").bind(channelId).first();
    if (!exists) return { id: channelId, publicId: `dm:${other.username}`, kind: "dm", otherId: other.id };
  }
  return { id: channelId, publicId: `dm:${other.username}`, kind: "dm", otherId: other.id };
}

async function isBlockedBetween(db, firstUserId, secondUserId) {
  return !!(await db.prepare("SELECT 1 FROM social_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?) LIMIT 1")
    .bind(firstUserId, secondUserId, secondUserId, firstUserId).first());
}

async function requireUser(request, db) {
  const user = await optionalUser(request, db);
  if (!user) throw new ApiFailure("AUTH_REQUIRED", "Sign in required", 401);
  return user;
}

async function requireSocialUser(request, db) {
  return requireUser(request, db);
}

async function requireRole(request, db, allowed) {
  const user = await requireUser(request, db);
  if (!user.roles.some(role => allowed.has(role))) throw new ApiFailure("FORBIDDEN", "You do not have permission to use this feature", 403);
  return user;
}

async function optionalUser(request, db) {
  if (requestUserCache.has(request)) return requestUserCache.get(request);
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) {
    requestUserCache.set(request, null);
    return null;
  }
  const tokenHash = await sha256(token);
  const now = Date.now();
  const cached = sessionUserCache.get(tokenHash);
  if (cached && now - cached.checkedAt < 5000) {
    requestUserCache.set(request, cached.user);
    return cached.user;
  }
  const row = await db.prepare("SELECT u.*,s.token_hash,s.last_seen_at AS session_last_seen_at FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.last_seen_at>? AND u.account_status='active' LIMIT 1").bind(tokenHash, now, now - SESSION_IDLE_MS).first();
  if (!row) {
    sessionUserCache.set(tokenHash, { checkedAt: now, user: null });
    requestUserCache.set(request, null);
    return null;
  }
  const roles = await loadRoles(db, row.id);
  if (now - Number(row.session_last_seen_at || 0) > 5 * 60 * 1000) {
    await db.prepare("UPDATE auth_sessions SET last_seen_at=? WHERE token_hash=?").bind(now, tokenHash).run();
  }
  const user = { ...row, roles, tokenHash };
  sessionUserCache.set(tokenHash, { checkedAt: now, user });
  if (sessionUserCache.size > 2000) {
    for (const [key, entry] of sessionUserCache) if (now - entry.checkedAt > 30000) sessionUserCache.delete(key);
  }
  requestUserCache.set(request, user);
  return user;
}

async function loadUser(db, id) {
  const row = await db.prepare(`${profileQuery()} WHERE u.id=? LIMIT 1`).bind(id).first();
  if (!row) return null;
  row.roles = await loadRoles(db, id);
  return row;
}

async function loadUserByUsername(db, username) {
  if (!username) return null;
  const row = await db.prepare(`${profileQuery()} WHERE u.username=? COLLATE NOCASE LIMIT 1`).bind(username).first();
  if (!row) return null;
  row.roles = await loadRoles(db, row.id);
  return row;
}

async function loadRoles(db, id) {
  const result = await db.prepare("SELECT role FROM user_roles WHERE user_id=? AND (expires_at IS NULL OR expires_at>?)").bind(id, Date.now()).all();
  return [...new Set(["user", ...(result.results || []).map(r => r.role)])];
}

function profileSelect() {
  return `SELECT u.id,u.username,u.account_status,u.created_at,u.updated_at,
    COALESCE(p.display_name,u.username) AS display_name,COALESCE(p.bio,'') AS bio,COALESCE(p.status_text,'') AS status_text,
    COALESCE(p.avatar_url,'') AS avatar_url,COALESCE(p.banner_url,'') AS banner_url,COALESCE(p.pronouns,'') AS pronouns,
    COALESCE(p.location_text,'') AS location_text,COALESCE(p.website_url,'') AS website_url,
    COALESCE(p.online_visibility,'everyone') AS online_visibility,COALESCE(p.activity_visibility,'friends') AS activity_visibility,
    COALESCE(s.xp,0) AS xp,COALESCE(s.level,1) AS level,COALESCE(s.streak,0) AS streak,
    COALESCE((SELECT up.plan FROM user_plans up WHERE up.user_id=u.id AND up.status='active'
      AND (up.expires_at IS NULL OR up.expires_at>unixepoch()*1000) LIMIT 1),'free') AS plan,
    EXISTS(SELECT 1 FROM reports sr WHERE sr.reporter_id=u.id AND sr.report_type='plan_request'
      AND sr.status IN ('open','assigned')) AS supernova_request_pending,
    COALESCE((SELECT ur.role FROM user_roles ur WHERE ur.user_id=u.id AND ur.role IN ('developer','admin','owner')
      AND (ur.expires_at IS NULL OR ur.expires_at>unixepoch()*1000)
      ORDER BY CASE ur.role WHEN 'owner' THEN 3 WHEN 'developer' THEN 2 WHEN 'admin' THEN 1 ELSE 0 END DESC LIMIT 1),'user') AS public_role`;
}

function profileQuery() {
  return `${profileSelect()} FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id LEFT JOIN user_stats s ON s.user_id=u.id`;
}

function messageSelect() {
  return `SELECT m.id,m.channel_id,m.body,m.message_type,m.reply_to_id,m.created_at,u.username,
    COALESCE(p.display_name,u.username) AS display_name,COALESCE(p.avatar_url,'') AS avatar_url,
    ru.username AS reply_username,rm.body AS reply_body,rm.message_type AS reply_type
    FROM social_messages m
    JOIN users u ON u.id=m.sender_id
    LEFT JOIN user_profiles p ON p.user_id=u.id
    LEFT JOIN social_messages rm ON rm.id=m.reply_to_id AND rm.deleted_at IS NULL
    LEFT JOIN users ru ON ru.id=rm.sender_id`;
}

function exposeMessage(row) {
  return { id: Number(row.id), channel: row.channel_id, from: row.username, displayName: row.display_name, avatarUrl: row.avatar_url, body: row.body, type: row.message_type, replyToId: row.reply_to_id ? Number(row.reply_to_id) : null, replyFrom: row.reply_username || "", replyBody: row.reply_body || "", replyType: row.reply_type || "", createdAt: Number(row.created_at), ts: Number(row.created_at) };
}

function exposeMe(user) {
  if (!user) return null;
  return { ...exposeProfile(user, true), roles: user.roles || ["user"], role: highestRole(user.roles || ["user"]), accountStatus: user.account_status, supernovaRequestPending: !!user.supernova_request_pending, adsDisabled: user.plan === "supernova" };
}

function exposeProfile(user, own) {
  const roles = user.roles || [user.public_role || "user"];
  const plan = user.plan === "supernova" ? "supernova" : "free";
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name || user.username,
    bio: user.bio || "",
    statusText: user.status_text || "",
    avatarUrl: user.avatar_url || "",
    bannerUrl: user.banner_url || "",
    pronouns: user.pronouns || "",
    locationText: user.location_text || "",
    websiteUrl: user.website_url || "",
    level: Number(user.level || 1),
    xp: Number(user.xp || 0),
    streak: Number(user.streak || 0),
    presenceState: user.presence_state || "offline",
    role: highestRole(roles),
    staff: roles.some(role => STAFF_ROLES.has(role)),
    plan,
    tier: plan,
    supernova: plan === "supernova",
    joinedAt: Number(user.created_at || 0),
    ...(own ? { onlineVisibility: user.online_visibility, activityVisibility: user.activity_visibility } : {})
  };
}

function exposeAdminUser(row) {
  return { ...exposeProfile(row, true), accountStatus: row.account_status, updatedAt: Number(row.updated_at || 0) };
}

async function createSession(db, userId, deviceId) {
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO auth_sessions(token_hash,user_id,device_id_hash,created_at,last_seen_at,expires_at) VALUES(?,?,?,?,?,?)")
      .bind(tokenHash, userId, deviceId ? await sha256(deviceId) : "", now, now, now + SESSION_MS),
    db.prepare("UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL AND token_hash NOT IN (SELECT token_hash FROM auth_sessions WHERE user_id=? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 10)")
      .bind(now, userId, userId)
  ]);
  return { token };
}

async function audit(db, actorId, action, targetType, targetId, reason, metadata) {
  const now = Date.now();
  await db.prepare("INSERT INTO admin_audit_logs(actor_id,action,target_type,target_id,reason,metadata_json,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)")
    .bind(actorId, action, targetType, targetId, reason || "", JSON.stringify(metadata || {}), now, now + AUDIT_LOG_MS).run();
}

async function maybeCleanup(db) {
  const now = Date.now();
  if (now - lastCleanupAt < 60 * 60 * 1000) return;
  lastCleanupAt = now;
  await db.batch([
    db.prepare("DELETE FROM auth_sessions WHERE expires_at<? OR revoked_at IS NOT NULL").bind(now),
    db.prepare("DELETE FROM auth_rate_limits WHERE blocked_until<? AND updated_at<?").bind(now, now - 24 * 60 * 60 * 1000),
    db.prepare("DELETE FROM proxy_navigation_logs WHERE expires_at<?").bind(now),
    db.prepare("DELETE FROM chat_moderation_events WHERE expires_at<?").bind(now),
    db.prepare("DELETE FROM admin_audit_logs WHERE expires_at<?").bind(now),
    db.prepare("DELETE FROM device_bans WHERE expires_at IS NOT NULL AND expires_at<?").bind(now),
    db.prepare("DELETE FROM user_roles WHERE expires_at IS NOT NULL AND expires_at<?").bind(now),
    db.prepare("UPDATE user_plans SET status='revoked',updated_at=? WHERE status='active' AND expires_at IS NOT NULL AND expires_at<?").bind(now, now),
    db.prepare("DELETE FROM social_typing WHERE updated_at<?").bind(now - 15000),
    db.prepare("DELETE FROM voice_room_events WHERE expires_at<?").bind(now),
    db.prepare("DELETE FROM voice_restrictions WHERE revoked_at IS NOT NULL OR (expires_at IS NOT NULL AND expires_at<?)").bind(now)
  ]);
}

async function activeDeviceBan(request, db) {
  const deviceId = deviceIdFrom(request);
  if (!deviceId) return null;
  const hash = await sha256(deviceId);
  const now = Date.now();
  const cached = deviceBanCache.get(hash);
  if (cached && now - cached.checkedAt < 15000) return cached.value;
  const value = await db.prepare("SELECT reason,expires_at FROM device_bans WHERE device_id_hash=? AND (expires_at IS NULL OR expires_at>?) LIMIT 1")
    .bind(hash, now).first();
  deviceBanCache.set(hash, { checkedAt: now, value });
  if (deviceBanCache.size > 1000) {
    for (const [key, entry] of deviceBanCache) if (now - entry.checkedAt > 60000) deviceBanCache.delete(key);
  }
  return value;
}

function requireSameOrigin(request) {
  const origin = request.headers.get("Origin");
  const target = new URL(request.url);
  const fetchSite = String(request.headers.get("Sec-Fetch-Site") || "").toLowerCase();
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    throw new ApiFailure("BAD_ORIGIN", "Cross-origin request blocked", 403);
  }
  if (request.headers.get("X-Nova-Request") !== "1") {
    throw new ApiFailure("BAD_REQUEST_CONTEXT", "Nova request header required", 403);
  }
  if (!origin) {
    if (["same-origin", "same-site", "none"].includes(fetchSite)) return;
    throw new ApiFailure("BAD_ORIGIN", "Request origin is required", 403);
  }
  try {
    if (new URL(origin).origin !== target.origin) throw new Error("mismatch");
  } catch {
    throw new ApiFailure("BAD_ORIGIN", "Cross-origin request blocked", 403);
  }
}

function isPrivateDeploymentPath(pathname) {
  let normalized;
  try { normalized = decodeURIComponent(pathname).replace(/\\/g, "/").toLowerCase(); }
  catch { return true; }
  if (normalized.includes("..") || normalized.startsWith("/.")) return true;
  if (PRIVATE_DEPLOYMENT_FILES.has(normalized)) return true;
  if (/\.(?:sql|sh|toml|md|map)$/i.test(normalized)) return true;
  return /^\/(?:screenshot|screen recording)\b/i.test(normalized);
}

function privateAssetNotFound() {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

async function readJson(request, maxBytes = MAX_JSON_BODY_BYTES) {
  const type = request.headers.get("Content-Type") || "";
  if (!type.includes("application/json")) throw new ApiFailure("INVALID_CONTENT_TYPE", "JSON request required", 415);
  const declaredSize = Number(request.headers.get("Content-Length") || 0);
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    throw new ApiFailure("REQUEST_TOO_LARGE", "Request body is too large", 413);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new ApiFailure("REQUEST_TOO_LARGE", "Request body is too large", 413);
  }
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ApiFailure("INVALID_JSON", "JSON request must be an object", 400);
    }
    return value;
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    throw new ApiFailure("INVALID_JSON", "Request body is not valid JSON", 400);
  }
}

function normalizeUsername(value) {
  const username = String(value || "").trim().toLowerCase();
  return /^[a-z0-9_]{3,20}$/.test(username) ? username : "";
}

function weakPassword(password, username) {
  const value = String(password || "");
  if (value.length < 8 || value.length > 128) return true;
  const normalized = value.toLowerCase();
  if (username && normalized === String(username).toLowerCase()) return true;
  return new Set([
    "password", "password1", "password123", "12345678", "123456789",
    "qwerty123", "letmein12", "iloveyou", "admin123", "welcome1"
  ]).has(normalized);
}

function cleanText(value, max) {
  return String(value == null ? "" : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

function cleanUrl(value, max) {
  const raw = cleanText(value, max);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    return url.href;
  }
  catch { return ""; }
}

function cleanImageUrl(value, max) {
  const source = String(value == null ? "" : value).trim();
  if (source.length > max) return "";
  const raw = cleanText(source, max);
  if (!raw) return "";
  if (/^data:image\/(?:webp|jpeg|png);base64,[a-z0-9+/=]+$/i.test(raw)) return raw;
  return cleanUrl(raw, Math.min(max, 2048));
}

function sanitizeSettings(value, depth = 0) {
  if (depth > 6) return null;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return cleanText(value, 4000);
  if (Array.isArray(value)) return value.slice(0, 100).map(item => sanitizeSettings(item, depth + 1));
  if (!value || typeof value !== "object") return null;
  const output = Object.create(null);
  for (const key of Object.keys(value).slice(0, 100)) {
    if (["__proto__", "prototype", "constructor"].includes(key)) continue;
    const safeKey = cleanText(key, 80);
    if (safeKey) output[safeKey] = sanitizeSettings(value[key], depth + 1);
  }
  return output;
}

function sanitizeNavigationUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    const sensitive = /^(access_token|auth|authorization|code|credential|email|jwt|key|pass|password|session|signature|token)$/i;
    [...url.searchParams.keys()].forEach(key => { if (sensitive.test(key)) url.searchParams.set(key, "[removed]"); });
    if (url.username) url.username = "";
    if (url.password) url.password = "";
    return { url: url.href.slice(0, 2048), domain: url.hostname.toLowerCase().slice(0, 253) };
  } catch { return null; }
}

function enumValue(value, allowed, fallback) { return allowed.includes(value) ? value : fallback; }
function clampNumber(value, min, max) { const num = Number(value); return Number.isFinite(num) ? Math.min(max, Math.max(min, num)) : min; }
function parseJson(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }
function randomId() { return crypto.randomUUID().replace(/-/g, ""); }
function randomToken(bytes) { const data = new Uint8Array(bytes); crypto.getRandomValues(data); return base64url(data); }
function deviceIdFrom(request) { return cleanText(request.headers.get("X-Nova-Device"), 128); }

async function enforceAuthRateLimit(request, db, action, limit, windowMs, blockMs) {
  const deviceId = deviceIdFrom(request);
  const ipAddress = cleanText(request.headers.get("CF-Connecting-IP"), 128);
  const scopeKeys = [];

  if (deviceId) {
    const deviceKey = `${action}:device:${await sha256(deviceId)}`;
    await enforceRateLimit(db, deviceKey, limit, windowMs, blockMs);
    scopeKeys.push(deviceKey);
  }

  if (ipAddress) {
    const ipKey = `${action}:ip:${await sha256(ipAddress)}`;
    const ipLimit = Math.max(limit * 12, 60);
    await enforceRateLimit(db, ipKey, ipLimit, windowMs, blockMs);
    scopeKeys.push(ipKey);
  }

  if (!scopeKeys.length) {
    const fallbackKey = `${action}:unknown`;
    await enforceRateLimit(db, fallbackKey, limit, windowMs, blockMs);
    scopeKeys.push(fallbackKey);
  }

  return scopeKeys;
}

async function enforceUserRateLimit(db, userId, action, limit, windowMs, blockMs) {
  const scopeKey = `user:${action}:${await sha256(userId)}`;
  return enforceRateLimit(db, scopeKey, limit, windowMs, blockMs);
}

async function enforceRateLimit(db, scopeKey, limit, windowMs, blockMs) {
  const now = Date.now();
  const row = await db.prepare("SELECT attempts,window_started_at,blocked_until FROM auth_rate_limits WHERE scope_key=?").bind(scopeKey).first();
  if (row && Number(row.blocked_until || 0) > now) {
    throw new ApiFailure("RATE_LIMITED", "Too many attempts. Please wait and try again.", 429);
  }
  if (!row || now - Number(row.window_started_at || 0) >= windowMs) {
    await db.prepare("INSERT INTO auth_rate_limits(scope_key,attempts,window_started_at,blocked_until,updated_at) VALUES(?,1,?,0,?) ON CONFLICT(scope_key) DO UPDATE SET attempts=1,window_started_at=excluded.window_started_at,blocked_until=0,updated_at=excluded.updated_at").bind(scopeKey, now, now).run();
    return scopeKey;
  }
  const attempts = Number(row.attempts || 0) + 1;
  const blockedUntil = attempts > limit ? now + blockMs : 0;
  await db.prepare("UPDATE auth_rate_limits SET attempts=?,blocked_until=?,updated_at=? WHERE scope_key=?").bind(attempts, blockedUntil, now, scopeKey).run();
  if (blockedUntil) throw new ApiFailure("RATE_LIMITED", "Too many attempts. Please wait and try again.", 429);
  return scopeKey;
}

async function clearAuthRateLimit(db, scopeKeys) {
  const keys = (Array.isArray(scopeKeys) ? scopeKeys : [scopeKeys]).filter(Boolean);
  if (keys.length) {
    await db.batch(keys.map(scopeKey => db.prepare("DELETE FROM auth_rate_limits WHERE scope_key=?").bind(scopeKey)));
  }
}

async function derivePassword(password, salt, iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromBase64url(salt), iterations }, key, 256);
  return `pbkdf2-sha256$${iterations}$${base64url(new Uint8Array(bits))}`;
}

async function verifyPassword(password, salt, expected) {
  if (!salt || !expected) return false;
  let iterations = LEGACY_PASSWORD_ITERATIONS;
  let digest = expected;
  const match = /^pbkdf2-sha256\$(\d+)\$([A-Za-z0-9_-]+)$/.exec(expected);
  if (match) {
    iterations = Number(match[1]);
    digest = match[2];
  }
  if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 1000000) return false;
  const calculated = await derivePassword(password, salt, iterations);
  const calculatedDigest = calculated.slice(calculated.lastIndexOf("$") + 1);
  return constantTimeEqual(calculatedDigest, digest);
}

function passwordIterations(encoded) {
  const match = /^pbkdf2-sha256\$(\d+)\$/.exec(String(encoded || ""));
  return match ? Number(match[1]) : 0;
}

function passwordDigest(encoded) {
  const match = /^pbkdf2-sha256\$\d+\$([A-Za-z0-9_-]+)$/.exec(String(encoded || ""));
  return match ? match[1] : "";
}

async function sha256(value) { return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))); }
function base64url(bytes) { let binary = ""; bytes.forEach(byte => { binary += String.fromCharCode(byte); }); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
function fromBase64url(value) { const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="); const binary = atob(normalized); return Uint8Array.from(binary, char => char.charCodeAt(0)); }
function constantTimeEqual(a, b) { if (a.length !== b.length) return false; let mismatch = 0; for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i); return mismatch === 0; }

function highestRole(roles) {
  for (const role of ["owner", "developer", "admin", "user"]) if (roles.includes(role)) return role;
  return "user";
}
function roleRank(role) { return ({ user: 0, admin: 1, developer: 2, owner: 3 })[role] || 0; }
function isDeveloperOrOwner(user) { return !!user?.roles?.some(role => DEVELOPER_ROLES.has(role)); }

function cookieValue(request, name) {
  const match = (request.headers.get("Cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function sessionCookie(token) { return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${Math.floor(SESSION_MS / 1000)}; HttpOnly; Secure; SameSite=Strict; Priority=High`; }
function clearSessionCookie() { return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict; Priority=High`; }

function apiJson(value, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    ...extraHeaders
  });
  return new Response(status === 204 ? null : JSON.stringify(value), { status, headers });
}

function apiError(code, message, status = 400, details = {}) { return apiJson({ error: { code, message, ...details } }, status); }

function internalApiError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  if (message.includes("no such table") || message.includes("no such column") || message.includes("has no column named")) {
    return apiError("DATABASE_SCHEMA_MISMATCH", "Nova's database needs the clean Nova 7 schema", 503);
  }
  if (message.includes("turso") || message.includes("database") || message.includes("sql error")) {
    return apiError("DATABASE_ERROR", "Nova could not reach its database", 503);
  }
  return apiError("INTERNAL_ERROR", "Nova could not complete that request", 500);
}

class ApiFailure extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status; }
}
