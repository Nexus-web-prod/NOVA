(function () {
  "use strict";

  (function purgeLegacyClientAuthority() {
    try {
      var remove = [];
      for (var index = 0; index < localStorage.length; index += 1) {
        var key = localStorage.key(index) || "";
        if (key.indexOf("nova:user:") === 0 ||
            key.indexOf("nova_db:nova:user:") === 0 ||
            key.indexOf("nova:admin:") === 0 ||
            key.indexOf("nova_db:nova:admin:") === 0 ||
            key === "nova_local_table:nova_users" ||
            key === "nova_local_table:nova_kv") remove.push(key);
      }
      remove.forEach(function (key) { localStorage.removeItem(key); });
    } catch (error) {}
  })();

  var deviceId = localStorage.getItem("nova_device_id");
  if (!deviceId) {
    deviceId = crypto.randomUUID ? crypto.randomUUID() : "nova-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    localStorage.setItem("nova_device_id", deviceId);
  }

  var _getCache = new Map();
  var _getInflight = new Map();
  var _cacheChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("nova-api-cache-v1") : null;

  function _cacheTtl(path) {
    path = String(path || "");
    if (path === "/api/me") return 30000;
    if (path.indexOf("/api/settings") === 0 || path.indexOf("/api/profile") === 0) return 60000;
    if (path.indexOf("/api/games/stats") === 0) return 60000;
    if (path.indexOf("/api/social/presence") === 0) return 30000;
    if (path.indexOf("/api/social/requests") === 0) return 45000;
    if (path === "/api/social") return 30000;
    if (path.indexOf("/api/social/reactions") === 0) return 15000;
    if (path.indexOf("/api/social/typing") === 0) return 8000;
    if (path.indexOf("/api/social/messages") === 0) return 5000;
    if (path.indexOf("/api/profiles/search") === 0) return 15000;
    if (path.indexOf("/api/profiles") === 0) return 60000;
    if (path.indexOf("/api/voice/v2/rooms") === 0 || path.indexOf("/api/voice/rooms") === 0) return 30000;
    if (path.indexOf("/api/voice/v2/state") === 0 || path.indexOf("/api/voice/room") === 0) return 5000;
    if (path.indexOf("/api/boardgames/") === 0) return 1200;
    if (path.indexOf("/api/supernova/") === 0) return 30000;
    return 0;
  }

  function _clonePayload(value) {
    if (typeof structuredClone === "function") { try { return structuredClone(value); } catch (error) {} }
    try { return JSON.parse(JSON.stringify(value)); } catch (error) { return value; }
  }

  function _dropCachePrefix(prefix) {
    Array.from(_getCache.keys()).forEach(function (key) { if (String(key).indexOf(prefix) === 0) _getCache.delete(key); });
  }

  function _invalidateGetCache(path) {
    path = String(path || "");
    if (path.indexOf("/api/social/typing") === 0 || path === "/api/presence" || path.indexOf("/api/proxy/navigation") === 0) return;
    if (path.indexOf("/api/social/reactions") === 0) { _dropCachePrefix("/api/social/reactions"); _dropCachePrefix("/api/social/messages"); }
    else if (path.indexOf("/api/social/messages") === 0) { _dropCachePrefix("/api/social/messages"); _dropCachePrefix("/api/social/reactions"); }
    else if (path.indexOf("/api/voice/v2/") === 0) { _dropCachePrefix("/api/voice/v2/"); }
    else if (path.indexOf("/api/boardgames/") === 0) { _dropCachePrefix("/api/boardgames/"); }
    else _getCache.clear();
    if (_cacheChannel) try { _cacheChannel.postMessage({ type: "invalidate", path: path }); } catch (error) {}
  }

  if (_cacheChannel) _cacheChannel.onmessage = function (event) {
    var data = event.data || {};
    if (data.type === "invalidate") {
      var ip = String(data.path || "");
      if (ip.indexOf("/api/social/typing") === 0 || ip === "/api/presence" || ip.indexOf("/api/proxy/navigation") === 0) return;
      if (ip.indexOf("/api/social/reactions") === 0) { _dropCachePrefix("/api/social/reactions"); _dropCachePrefix("/api/social/messages"); }
      else if (ip.indexOf("/api/social/messages") === 0) { _dropCachePrefix("/api/social/messages"); _dropCachePrefix("/api/social/reactions"); }
      else if (ip.indexOf("/api/voice/v2/") === 0) _dropCachePrefix("/api/voice/v2/");
      else if (ip.indexOf("/api/boardgames/") === 0) _dropCachePrefix("/api/boardgames/");
      else _getCache.clear();
      return;
    }
    if (data.type === "put" && data.key && data.expiresAt > Date.now()) {
      _getCache.set(data.key, { value: data.value, expiresAt: data.expiresAt });
    }
  };

  async function _requestCore(path, options) {
    options = Object.assign({}, options || {});
    var method = String(options.method || "GET").toUpperCase();
    var cacheTtl = method === "GET" && !options.noCache ? _cacheTtl(path) : 0;
    delete options.noCache;
    if (cacheTtl > 0) {
      var cached = _getCache.get(path);
      if (cached && cached.expiresAt > Date.now()) return _clonePayload(cached.value);
      if (_getInflight.has(path)) return _getInflight.get(path).then(_clonePayload);
    }
    var timeoutMs = Math.max(1000, Number(options.timeoutMs || 20000));
    delete options.timeoutMs;
    var headers = new Headers(options.headers || {});
    headers.set("X-Nova-Device", deviceId);
    if (String(options.method || "GET").toUpperCase() !== "GET") headers.set("X-Nova-Request", "1");
    if (options.body && !(options.body instanceof FormData) && typeof options.body !== "string") {
      headers.set("Content-Type", "application/json");
      options.body = JSON.stringify(options.body);
    }
    var controller = !options.signal && typeof AbortController !== "undefined" ? new AbortController() : null;
    var timeoutId = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;
    if (controller) options.signal = controller.signal;
    var response;
    try {
      response = await fetch(path, Object.assign({ credentials: "same-origin", headers: headers }, options));
    } catch (error) {
      if (error && error.name === "AbortError") {
        var timeoutError = new Error("Nova took too long to respond. Please try again.");
        timeoutError.code = "REQUEST_TIMEOUT";
        timeoutError.status = 408;
        throw timeoutError;
      }
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      var error = new Error((payload.error && payload.error.message) || "Nova could not complete that request");
      error.code = payload.error && payload.error.code;
      error.status = response.status;
      if (payload.error) Object.keys(payload.error).forEach(function (key) { if (!(key in error)) error[key] = payload.error[key]; });
      throw error;
    }
    if (cacheTtl > 0) {
      var entry = { value: _clonePayload(payload), expiresAt: Date.now() + cacheTtl };
      _getCache.set(path, entry);
      if (_cacheChannel) try { _cacheChannel.postMessage({ type: "put", key: path, value: entry.value, expiresAt: entry.expiresAt }); } catch (error) {}
    } else if (method !== "GET") {
      _invalidateGetCache(path);
    }
    return payload;
  }

  function request(path, options) {
    options = Object.assign({}, options || {});
    var method = String(options.method || "GET").toUpperCase();
    var ttl = method === "GET" && !options.noCache ? _cacheTtl(path) : 0;
    if (ttl > 0) {
      var cached = _getCache.get(path);
      if (cached && cached.expiresAt > Date.now()) return Promise.resolve(_clonePayload(cached.value));
      if (_getInflight.has(path)) return _getInflight.get(path).then(_clonePayload);
      var pending = _requestCore(path, options);
      _getInflight.set(path, pending);
      return pending.finally(function () { _getInflight.delete(path); });
    }
    return _requestCore(path, options);
  }

  function cacheUser(user) {
    window.__novaV7User = user || null;
    if (!user) {
      localStorage.removeItem("nova_account");
    } else {
      localStorage.setItem("nova_account", JSON.stringify({
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatarUrl || "",
        avatarUrl: user.avatarUrl || "",
        role: user.role,
        roles: user.roles || [user.role || "user"],
        plan: user.plan || user.tier || "free",
        tier: user.tier || user.plan || "free",
        supernova: !!user.supernova,
        adsDisabled: !!user.adsDisabled,
        supernovaRequestPending: !!user.supernovaRequestPending,
        level: user.level || 1,
        xp: user.xp || 0
      }));
    }
    window.dispatchEvent(new CustomEvent("nova:session-changed", { detail: { user: user || null } }));
    document.dispatchEvent(new CustomEvent("nova:account-changed", { detail: { user: user || null } }));
  }

  // Public aggregate game stats and anonymous per-browser ratings use the
  // public database. Never put a signed-in account ID in the public database:
  // the rating identity is a random local browser key, not the NOVA user ID.
  async function directDeviceHash() {
    var anonymousKey = "";
    try {
      anonymousKey = localStorage.getItem("nova_public_rating_key") || "";
      if (!anonymousKey) {
        anonymousKey = window.crypto && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now()) + "-" + Math.random().toString(36).slice(2) + "-" + Math.random().toString(36).slice(2);
        localStorage.setItem("nova_public_rating_key", anonymousKey);
      }
    } catch (error) {}
    if (!anonymousKey || !window.crypto || !crypto.subtle) return "";
    var digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(anonymousKey));
    return Array.from(new Uint8Array(digest)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  function directNormalizeGameSlug(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 100);
  }

  async function directGameStats(slugs) {
    var unique = Array.from(new Set((slugs || []).map(directNormalizeGameSlug).filter(Boolean))).slice(0, 50);
    if (!unique.length) return { stats: {} };
    var marks = unique.map(function () { return "?"; }).join(",");
    var baseRows = await window.NovaTursoDirect.query(
      "SELECT slug, views, rating_sum, rating_count FROM game_stats WHERE slug IN (" + marks + ")",
      unique
    );
    var hash = await directDeviceHash();
    var ratingRows = hash ? (await window.NovaTursoDirect.query(
      "SELECT slug, rating FROM game_guest_ratings WHERE device_id_hash = ? AND slug IN (" + marks + ")",
      [hash].concat(unique)
    )).rows || [] : [];
    var rows = new Map((baseRows.rows || []).map(function (row) { return [row.slug, row]; }));
    var myRatings = new Map(ratingRows.map(function (row) { return [row.slug, Number(row.rating || 0)]; }));
    var stats = {};
    unique.forEach(function (slug) {
      var row = rows.get(slug) || {};
      var count = Math.max(0, Number(row.rating_count || 0));
      var sum = Math.max(0, Number(row.rating_sum || 0));
      stats[slug] = {
        views: Math.max(0, Number(row.views || 0)),
        avg: count ? Math.round((sum / count) * 100) / 100 : 0,
        count: count,
        myRating: Math.max(0, Math.min(5, myRatings.get(slug) || 0))
      };
    });
    return { stats: stats };
  }

  async function directReadGameStats(slug, myRating) {
    var result = await window.NovaTursoDirect.query(
      "SELECT views, rating_sum, rating_count FROM game_stats WHERE slug = ? LIMIT 1",
      [slug]
    );
    var row = result.rows[0] || {};
    var count = Math.max(0, Number(row.rating_count || 0));
    var sum = Math.max(0, Number(row.rating_sum || 0));
    return {
      views: Math.max(0, Number(row.views || 0)),
      avg: count ? Math.round((sum / count) * 100) / 100 : 0,
      count: count,
      myRating: Math.max(0, Math.min(5, Number(myRating || 0)))
    };
  }

  async function directRateGame(slugValue, ratingValue) {
    var slug = directNormalizeGameSlug(slugValue);
    var rating = Number(ratingValue);
    if (!slug || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      var invalid = new Error("Choose a rating from 1 to 5");
      invalid.code = "INVALID_RATING";
      invalid.status = 400;
      throw invalid;
    }
    var owner = await directDeviceHash();
    if (!owner) throw new Error("Nova could not create an anonymous rating key");
    var existing = await window.NovaTursoDirect.query(
      "SELECT rating FROM game_guest_ratings WHERE device_id_hash = ? AND slug = ? LIMIT 1",
      [owner, slug]
    );
    var oldRating = existing.rows.length ? Number(existing.rows[0].rating || 0) : 0;
    var now = Date.now();
    if (existing.rows.length) {
      await window.NovaTursoDirect.execute(
        "UPDATE game_guest_ratings SET rating = ?, updated_at = ? WHERE device_id_hash = ? AND slug = ?",
        [rating, now, owner, slug]
      );
      await window.NovaTursoDirect.execute(
        "INSERT INTO game_stats(slug, rating_sum, rating_count, updated_at) VALUES(?,?,0,?) " +
        "ON CONFLICT(slug) DO UPDATE SET rating_sum = MAX(0, game_stats.rating_sum + ?), updated_at = excluded.updated_at",
        [slug, rating, now, rating - oldRating]
      );
    } else {
      await window.NovaTursoDirect.execute(
        "INSERT INTO game_guest_ratings(device_id_hash, slug, rating, updated_at) VALUES(?,?,?,?)",
        [owner, slug, rating, now]
      );
      await window.NovaTursoDirect.execute(
        "INSERT INTO game_stats(slug, rating_sum, rating_count, updated_at) VALUES(?,?,1,?) " +
        "ON CONFLICT(slug) DO UPDATE SET rating_sum = game_stats.rating_sum + excluded.rating_sum, " +
        "rating_count = game_stats.rating_count + 1, updated_at = excluded.updated_at",
        [slug, rating, now]
      );
    }
    return { slug: slug, stats: await directReadGameStats(slug, rating) };
  }

  async function directRecordGameView(slugValue) {
    var slug = directNormalizeGameSlug(slugValue);
    if (!slug) {
      var invalid = new Error("Game identifier is invalid");
      invalid.code = "INVALID_GAME";
      invalid.status = 400;
      throw invalid;
    }
    var now = Date.now();
    await window.NovaTursoDirect.execute(
      "INSERT INTO game_stats(slug, views, updated_at) VALUES(?,1,?) " +
      "ON CONFLICT(slug) DO UPDATE SET views = game_stats.views + 1, updated_at = excluded.updated_at",
      [slug, now]
    );
    return { slug: slug, stats: await directReadGameStats(slug, 0) };
  }

  // Everyone, Announcements, DMs, and friend relationships use the public
  // browser-side Turso database. Direct routes fail closed rather than
  // silently splitting reads and writes across Turso and the Worker.
  // DM/friend records in this public database are not private. Private groups
  // and other privileged social operations still use their existing API.
  var directSocialReadsAvailable = null;
  function directPublicChannel(channel) { return channel === "everyone" || channel === "announcements"; }
  function directSocialUserId() {
    var user = window.__novaV7User || null;
    return user && user.id ? String(user.id) : "";
  }
  function directExposeMessage(row) {
    return { id:Number(row.id), channel:row.channel_id, from:row.username,
      displayName:row.display_name || row.username, avatarUrl:row.avatar_url || "",
      body:row.body, type:row.message_type || "text",
      replyToId:row.reply_to_id ? Number(row.reply_to_id) : null,
      replyFrom:row.reply_username || "", replyBody:row.reply_body || "",
      replyType:row.reply_type || "", createdAt:Number(row.created_at || 0), ts:Number(row.created_at || 0) };
  }
  function directBuildReactions(rows) {
    var out = {};
    (rows || []).forEach(function (row) {
      var id = String(row.message_id);
      if (!out[id]) out[id] = [];
      out[id].push({ emoji:row.emoji, count:Number(row.reaction_count || 0), mine:!!Number(row.mine || 0) });
    });
    return out;
  }
  function directBuildPolls(rows) {
    var out = {};
    (rows || []).forEach(function (row) {
      var id = String(row.message_id);
      if (!out[id]) out[id] = { messageId:Number(row.message_id), question:row.question, closed:!!row.closed_at, options:[], totalVotes:0 };
      var option = { index:Number(row.option_index), label:row.label, votes:Number(row.vote_count || 0), mine:!!Number(row.mine || 0) };
      out[id].options.push(option); out[id].totalVotes += option.votes;
    });
    return out;
  }
  function directSocialStatements(channel, after, userId) {
    var order = after > 0 ? "ASC" : "DESC";
    var messagesSql = "SELECT m.id,m.channel_id,m.body,m.message_type,m.reply_to_id,m.created_at," +
      "u.username,COALESCE(p.display_name,u.username) AS display_name,COALESCE(p.avatar_url,'') AS avatar_url," +
      "ru.username AS reply_username,rm.body AS reply_body,rm.message_type AS reply_type " +
      "FROM social_messages m JOIN users u ON u.id=m.sender_id LEFT JOIN user_profiles p ON p.user_id=u.id " +
      "LEFT JOIN social_messages rm ON rm.id=m.reply_to_id AND rm.deleted_at IS NULL LEFT JOIN users ru ON ru.id=rm.sender_id " +
      "WHERE m.channel_id=? AND m.id>? AND m.deleted_at IS NULL " +
      "AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE (b.blocker_id=? AND b.blocked_id=m.sender_id) OR (b.blocker_id=m.sender_id AND b.blocked_id=?)) " +
      "ORDER BY m.id " + order + " LIMIT 200";
    var reactionSql = "SELECT r.message_id,r.emoji,COUNT(*) AS reaction_count,MAX(CASE WHEN r.user_id=? THEN 1 ELSE 0 END) AS mine " +
      "FROM social_message_reactions r WHERE r.message_id IN (SELECT id FROM social_messages WHERE channel_id=? AND deleted_at IS NULL ORDER BY id DESC LIMIT 200) " +
      "AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE (b.blocker_id=? AND b.blocked_id=r.user_id) OR (b.blocker_id=r.user_id AND b.blocked_id=?)) " +
      "GROUP BY r.message_id,r.emoji ORDER BY MIN(r.created_at) ASC";
    var statements = [
      { sql:messagesSql, args:[channel,after,userId,userId] },
      { sql:reactionSql, args:[userId,channel,userId,userId] }
    ];
    if (channel === "everyone") {
      statements.push({ sql:"SELECT p.message_id,p.question,p.closed_at,o.option_index,o.label,COUNT(v.user_id) AS vote_count," +
        "MAX(CASE WHEN v.user_id=? THEN 1 ELSE 0 END) AS mine FROM social_polls p " +
        "JOIN social_messages m ON m.id=p.message_id AND m.channel_id='everyone' AND m.deleted_at IS NULL " +
        "JOIN social_poll_options o ON o.poll_message_id=p.message_id " +
        "LEFT JOIN social_poll_votes v ON v.poll_message_id=p.message_id AND v.option_index=o.option_index " +
        "WHERE p.message_id IN (SELECT id FROM social_messages WHERE channel_id='everyone' AND deleted_at IS NULL ORDER BY id DESC LIMIT 200) " +
        "GROUP BY p.message_id,p.question,p.closed_at,o.option_index,o.label ORDER BY p.message_id,o.option_index", args:[userId] });
      statements.push({ sql:"SELECT m.id,m.channel_id,m.body,m.message_type,m.reply_to_id,m.created_at,u.username," +
        "COALESCE(p.display_name,u.username) AS display_name,COALESCE(p.avatar_url,'') AS avatar_url," +
        "ru.username AS reply_username,rm.body AS reply_body,rm.message_type AS reply_type " +
        "FROM social_channel_pins cp JOIN social_messages m ON m.id=cp.message_id AND m.channel_id=cp.channel_id AND m.deleted_at IS NULL " +
        "JOIN users u ON u.id=m.sender_id LEFT JOIN user_profiles p ON p.user_id=u.id " +
        "LEFT JOIN social_messages rm ON rm.id=m.reply_to_id AND rm.deleted_at IS NULL LEFT JOIN users ru ON ru.id=rm.sender_id " +
        "WHERE cp.channel_id='everyone' LIMIT 1", args:[] });
    }
    return statements;
  }
  async function directPublicMessages(channelValue, afterValue) {
    var channel=String(channelValue || "everyone");
    if (!directPublicChannel(channel) || !window.NovaTursoDirect || !window.NovaTursoDirect.ready()) throw new Error("Direct public social reads unavailable");
    var userId=directSocialUserId();
    if (!userId) throw new Error("Signed-in user required for social reads");
    var after=Math.max(0,Number(afterValue || 0));
    var results=await window.NovaTursoDirect.batch(directSocialStatements(channel,after,userId));
    var rows=(results[0] && results[0].rows || []).map(directExposeMessage);
    if (!after) rows.reverse();
    var reactions=directBuildReactions(results[1] && results[1].rows || []);
    var polls={}, pinnedMessage=null;
    if (channel === "everyone") {
      polls=directBuildPolls(results[2] && results[2].rows || []);
      var pinRow=results[3] && results[3].rows && results[3].rows[0];
      if (pinRow) { pinnedMessage=directExposeMessage(pinRow); if (polls[String(pinnedMessage.id)]) pinnedMessage.type="poll"; }
      rows=rows.map(function (message) { return polls[String(message.id)] ? Object.assign({},message,{type:"poll"}) : message; });
    }
    directSocialReadsAvailable=true;
    return { channel:channel, messages:rows, reactions:reactions, polls:polls, pinnedMessage:pinnedMessage };
  }
  async function directPublicSendMessage(body) {
    if (!window.NovaTursoDirect || !window.NovaTursoDirect.ready()) {
      throw new Error("Public Turso is unavailable. Message was not sent.");
    }
    body = body || {};
    var channel = String(body.channel || "everyone");
    if (!directPublicChannel(channel)) throw new Error("Direct public send only supports public channels.");
    var userId = directSocialUserId();
    if (!userId) throw new Error("Sign in before sending a message.");
    var type = body.messageType === "image" ? "image" : "text";
    var text = String(body.body || "");
    if (type === "image") {
      if (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(text) || text.length > 125000) {
        throw new Error("Image must be a compressed JPEG, PNG, or WebP under 90 KB.");
      }
    } else {
      text = text.replace(/\s+/g, " ").trim();
      if (text.length > 2000) text = text.slice(0, 2000);
    }
    if (!text) throw new Error("Message cannot be empty.");
    var replyToId = Math.max(0, Number(body.replyToId || 0)) || null;
    if (replyToId) {
      var parent = await window.NovaTursoDirect.query(
        "SELECT id FROM social_messages WHERE id=? AND channel_id=? AND deleted_at IS NULL LIMIT 1",
        [replyToId, channel]
      );
      if (!parent.rows || !parent.rows.length) replyToId = null;
    }
    var now = Date.now();
    var inserted = await window.NovaTursoDirect.execute(
      "INSERT INTO social_messages(channel_id,sender_id,body,message_type,reply_to_id,created_at) VALUES(?,?,?,?,?,?) RETURNING id",
      [channel, userId, text, type, replyToId, now]
    );
    // libSQL HTTP responses can omit last_insert_rowid for writes. RETURNING
    // supplies the inserted ID in the same statement to avoid a false failure.
    var returnedId = inserted && inserted.rows && inserted.rows.length ? inserted.rows[0].id : null;
    var id = Number(returnedId != null ? returnedId : inserted.lastInsertRowid);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new Error("Public Turso did not confirm the new message ID.");
    }
    // Read-after-write verification detects a wrong database, failed insert, or
    // schema mismatch instead of reporting success based only on the insert.
    var verify = await window.NovaTursoDirect.query(
      "SELECT m.id,m.channel_id,m.body,m.message_type,m.reply_to_id,m.created_at," +
      "u.username,COALESCE(p.display_name,u.username) AS display_name,COALESCE(p.avatar_url,'') AS avatar_url," +
      "ru.username AS reply_username,rm.body AS reply_body,rm.message_type AS reply_type " +
      "FROM social_messages m JOIN users u ON u.id=m.sender_id LEFT JOIN user_profiles p ON p.user_id=u.id " +
      "LEFT JOIN social_messages rm ON rm.id=m.reply_to_id AND rm.deleted_at IS NULL LEFT JOIN users ru ON ru.id=rm.sender_id " +
      "WHERE m.id=? AND m.channel_id=? AND m.deleted_at IS NULL LIMIT 1",
      [id, channel]
    );
    if (!verify.rows || !verify.rows.length) {
      throw new Error("Message insert was accepted, but read-after-write verification failed on public Turso.");
    }
    directSocialReadsAvailable = true;
    return { message: directExposeMessage(verify.rows[0]), database: "public-turso", verified: true };
  }

  async function directPublicReactions(channelValue) {
    var channel=String(channelValue || "everyone");
    if (!directPublicChannel(channel) || !window.NovaTursoDirect || !window.NovaTursoDirect.ready()) throw new Error("Direct public social reads unavailable");
    var userId=directSocialUserId();
    if (!userId) throw new Error("Signed-in user required for social reads");
    var result=await window.NovaTursoDirect.query(
      "SELECT r.message_id,r.emoji,COUNT(*) AS reaction_count,MAX(CASE WHEN r.user_id=? THEN 1 ELSE 0 END) AS mine " +
      "FROM social_message_reactions r WHERE r.message_id IN (SELECT id FROM social_messages WHERE channel_id=? AND deleted_at IS NULL ORDER BY id DESC LIMIT 200) " +
      "AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE (b.blocker_id=? AND b.blocked_id=r.user_id) OR (b.blocker_id=r.user_id AND b.blocked_id=?)) " +
      "GROUP BY r.message_id,r.emoji ORDER BY MIN(r.created_at) ASC", [userId,channel,userId,userId]);
    return { channel:channel, reactions:directBuildReactions(result.rows || []) };
  }

  async function directPublicToggleReaction(channelValue, messageIdValue, emojiValue) {
    var channel=String(channelValue || "everyone");
    var messageId=Math.max(0,Number(messageIdValue || 0));
    var emoji=String(emojiValue || "");
    var allowed=["❤️","👍","😂","😮","😢","🔥"];
    if (!directPublicChannel(channel)) throw new Error("Direct reactions only support public channels.");
    if (!Number.isSafeInteger(messageId) || messageId <= 0 || allowed.indexOf(emoji) < 0) throw new Error("Choose a valid message and supported reaction.");
    if (!window.NovaTursoDirect || !window.NovaTursoDirect.ready()) throw new Error("Public Turso is unavailable; reaction was not changed.");
    var userId=directSocialUserId();
    if (!userId) throw new Error("Sign in before reacting.");
    var message=await window.NovaTursoDirect.query("SELECT id FROM social_messages WHERE id=? AND channel_id=? AND deleted_at IS NULL LIMIT 1",[messageId,channel]);
    if (!message.rows || !message.rows.length) throw new Error("Public message was not found.");
    var existing=await window.NovaTursoDirect.query("SELECT 1 AS found FROM social_message_reactions WHERE message_id=? AND user_id=? AND emoji=? LIMIT 1",[messageId,userId,emoji]);
    if (existing.rows && existing.rows.length) {
      await window.NovaTursoDirect.execute("DELETE FROM social_message_reactions WHERE message_id=? AND user_id=? AND emoji=?",[messageId,userId,emoji]);
    } else {
      await window.NovaTursoDirect.execute("INSERT INTO social_message_reactions(message_id,user_id,emoji,created_at) VALUES(?,?,?,?)",[messageId,userId,emoji,Date.now()]);
    }
    var result=await directPublicReactions(channel);
    return {ok:true,messageId:messageId,reactions:(result.reactions || {})[String(messageId)] || []};
  }
  async function directPublicVotePoll(messageIdValue, optionIndexValue) {
    var messageId=Math.max(0,Number(messageIdValue || 0));
    var optionIndex=Number(optionIndexValue);
    if (!Number.isSafeInteger(messageId) || messageId <= 0 || !Number.isSafeInteger(optionIndex) || optionIndex < 0) throw new Error("Choose a valid poll option.");
    if (!window.NovaTursoDirect || !window.NovaTursoDirect.ready()) throw new Error("Public Turso is unavailable; vote was not saved.");
    var userId=directSocialUserId();
    if (!userId) throw new Error("Sign in before voting.");
    var option=await window.NovaTursoDirect.query("SELECT o.option_index FROM social_poll_options o JOIN social_polls p ON p.message_id=o.poll_message_id JOIN social_messages m ON m.id=p.message_id WHERE p.message_id=? AND o.option_index=? AND p.closed_at IS NULL AND m.channel_id='everyone' AND m.deleted_at IS NULL LIMIT 1",[messageId,optionIndex]);
    if (!option.rows || !option.rows.length) throw new Error("That poll choice is unavailable.");
    await window.NovaTursoDirect.execute("INSERT INTO social_poll_votes(poll_message_id,user_id,option_index,created_at) VALUES(?,?,?,?) ON CONFLICT(poll_message_id,user_id) DO UPDATE SET option_index=excluded.option_index,created_at=excluded.created_at",[messageId,userId,optionIndex,Date.now()]);
    var pollRows=await window.NovaTursoDirect.query("SELECT p.message_id,p.question,p.closed_at,o.option_index,o.label,COUNT(v.user_id) AS vote_count,MAX(CASE WHEN v.user_id=? THEN 1 ELSE 0 END) AS mine FROM social_polls p JOIN social_messages m ON m.id=p.message_id AND m.channel_id='everyone' AND m.deleted_at IS NULL JOIN social_poll_options o ON o.poll_message_id=p.message_id LEFT JOIN social_poll_votes v ON v.poll_message_id=p.message_id AND v.option_index=o.option_index WHERE p.message_id=? GROUP BY p.message_id,p.question,p.closed_at,o.option_index,o.label ORDER BY o.option_index",[userId,messageId]);
    var polls=directBuildPolls(pollRows.rows || []);
    return {ok:true,poll:polls[String(messageId)] || null};
  }


  // Public-Turso DM and friend records. These records are public by design here.
  var directPublicSocialSchemaPromise=null;
  function directEnsurePublicSocialSchema(){
    if(!directPublicSocialSchemaPromise) directPublicSocialSchemaPromise=window.NovaTursoDirect.batch([
      {sql:"CREATE TABLE IF NOT EXISTS nova_public_dm_messages (id INTEGER PRIMARY KEY AUTOINCREMENT,sender_id TEXT NOT NULL,recipient_id TEXT NOT NULL,sender_username TEXT NOT NULL,recipient_username TEXT NOT NULL,body TEXT NOT NULL,message_type TEXT NOT NULL DEFAULT 'text',created_at INTEGER NOT NULL)",args:[]},
      {sql:"CREATE INDEX IF NOT EXISTS nova_public_dm_pair_idx ON nova_public_dm_messages(sender_id,recipient_id,id)",args:[]},
      {sql:"CREATE TABLE IF NOT EXISTS nova_public_friend_requests (from_user_id TEXT NOT NULL,to_user_id TEXT NOT NULL,from_username TEXT NOT NULL,to_username TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(from_user_id,to_user_id))",args:[]},
      {sql:"CREATE TABLE IF NOT EXISTS nova_public_friends (user_id TEXT NOT NULL,friend_id TEXT NOT NULL,username TEXT NOT NULL,friend_username TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(user_id,friend_id))",args:[]},
      {sql:"CREATE TABLE IF NOT EXISTS nova_public_social_migrations (user_id TEXT PRIMARY KEY,friends_migrated_at INTEGER NOT NULL)",args:[]}
    ]).catch(function(e){directPublicSocialSchemaPromise=null;throw e;});
    return directPublicSocialSchemaPromise;
  }
  function directPublicIdentity(){
    var u=window.__novaV7User||{},id=u.id==null?"":String(u.id),username=String(u.username||"").trim().toLowerCase();
    if(!id||!username) throw new Error("Sign in before using direct public DMs or friends.");
    return {id:id,username:username};
  }
  async function directPublicFindUser(value){
    var username=String(value||"").trim().toLowerCase();
    if(!/^[a-z0-9_.-]{2,32}$/.test(username)) throw new Error("Enter a valid username.");
    var r=await window.NovaTursoDirect.query("SELECT id,username FROM users WHERE lower(username)=? LIMIT 1",[username]);
    if(!r.rows||!r.rows.length) throw new Error("That NOVA user was not found in public Turso.");
    return {id:String(r.rows[0].id),username:String(r.rows[0].username||username).toLowerCase()};
  }
  function directPublicDMChannel(value){var m=/^dm:([a-z0-9_.-]{2,32})$/i.exec(String(value||""));return m?m[1].toLowerCase():"";}
  async function directPublicDMMessages(channel,afterValue){
    if(!window.NovaTursoDirect||!window.NovaTursoDirect.ready()) throw new Error("Public Turso unavailable; DM Worker fallback is disabled.");
    await directEnsurePublicSocialSchema();
    var me=directPublicIdentity(),peerName=directPublicDMChannel(channel),peer=await directPublicFindUser(peerName),after=Math.max(0,Number(afterValue||0));
    var r=await window.NovaTursoDirect.query("SELECT id,sender_username,body,message_type,created_at FROM nova_public_dm_messages WHERE ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)) AND id>? ORDER BY id DESC LIMIT 200",[me.id,peer.id,peer.id,me.id,after]);
    var rows=(r.rows||[]).map(function(x){return {id:Number(x.id),channel:"dm:"+peerName,from:String(x.sender_username||""),displayName:String(x.sender_username||""),avatarUrl:"",body:String(x.body||""),type:x.message_type||"text",replyToId:null,replyFrom:"",replyBody:"",replyType:"",createdAt:Number(x.created_at||0),ts:Number(x.created_at||0)};}).reverse();
    return {channel:"dm:"+peerName,messages:rows,reactions:{},polls:{},pinnedMessage:null,database:"public-turso"};
  }
  async function directPublicSendDM(body){
    if(!window.NovaTursoDirect||!window.NovaTursoDirect.ready()) throw new Error("Public Turso unavailable; DM was not sent.");
    await directEnsurePublicSocialSchema();
    var me=directPublicIdentity(),peerName=directPublicDMChannel(body&&body.channel);
    if(!peerName) throw new Error("A valid DM recipient is required.");
    var peer=await directPublicFindUser(peerName); if(peer.id===me.id) throw new Error("You cannot message yourself.");
    var text=String(body&&body.body||"").replace(/\s+/g," ").trim(),type=body&&body.messageType==="image"?"image":"text";
    if(type==="image"){if(!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(text)||text.length>125000)throw new Error("Image must be a compressed JPEG, PNG, or WebP under 90 KB.");}
    else if(text.length>2000)text=text.slice(0,2000);
    if(!text)throw new Error("Message cannot be empty.");
    var now=Date.now(),ins=await window.NovaTursoDirect.execute("INSERT INTO nova_public_dm_messages(sender_id,recipient_id,sender_username,recipient_username,body,message_type,created_at) VALUES(?,?,?,?,?,?,?) RETURNING id",[me.id,peer.id,me.username,peer.username,text,type,now]);
    var id=Number(ins&&ins.rows&&ins.rows[0]&&ins.rows[0].id);
    if(!Number.isSafeInteger(id)||id<=0)throw new Error("Public Turso did not confirm the DM ID.");
    var check=await window.NovaTursoDirect.query("SELECT id FROM nova_public_dm_messages WHERE id=? AND sender_id=? LIMIT 1",[id,me.id]);
    if(!check.rows||!check.rows.length)throw new Error("DM insert could not be verified.");
    return {message:{id:id,channel:"dm:"+peerName,from:me.username,displayName:me.username,avatarUrl:"",body:text,type:type,createdAt:now,ts:now},database:"public-turso",verified:true};
  }
  async function directPublicFriendRequest(value){
    await directEnsurePublicSocialSchema();var me=directPublicIdentity(),peer=await directPublicFindUser(value);
    if(peer.id===me.id)throw new Error("Cannot add yourself.");
    var f=await window.NovaTursoDirect.query("SELECT 1 AS found FROM nova_public_friends WHERE user_id=? AND friend_id=? LIMIT 1",[me.id,peer.id]);
    if(f.rows&&f.rows.length)throw new Error("You are already friends.");
    await window.NovaTursoDirect.execute("INSERT INTO nova_public_friend_requests(from_user_id,to_user_id,from_username,to_username,created_at) VALUES(?,?,?,?,?) ON CONFLICT(from_user_id,to_user_id) DO NOTHING",[me.id,peer.id,me.username,peer.username,Date.now()]);
    return {ok:true,database:"public-turso"};
  }
  async function directPublicRespondFriendRequest(value,actionValue){
    await directEnsurePublicSocialSchema();var me=directPublicIdentity(),peer=await directPublicFindUser(value),action=String(actionValue||"").toLowerCase();
    if(action!=="accept"&&action!=="decline")throw new Error("Choose accept or decline.");
    var q=await window.NovaTursoDirect.query("SELECT 1 AS found FROM nova_public_friend_requests WHERE from_user_id=? AND to_user_id=? LIMIT 1",[peer.id,me.id]);
    if(!q.rows||!q.rows.length)throw new Error("Friend request not found in public Turso.");
    if(action==="accept"){var now=Date.now();await window.NovaTursoDirect.batch([
      {sql:"INSERT INTO nova_public_friends(user_id,friend_id,username,friend_username,created_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id,friend_id) DO NOTHING",args:[me.id,peer.id,me.username,peer.username,now]},
      {sql:"INSERT INTO nova_public_friends(user_id,friend_id,username,friend_username,created_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id,friend_id) DO NOTHING",args:[peer.id,me.id,peer.username,me.username,now]},
      {sql:"DELETE FROM nova_public_friend_requests WHERE from_user_id=? AND to_user_id=?",args:[peer.id,me.id]}
    ]);}else await window.NovaTursoDirect.execute("DELETE FROM nova_public_friend_requests WHERE from_user_id=? AND to_user_id=?",[peer.id,me.id]);
    return {ok:true,action:action,database:"public-turso"};
  }
  async function directPublicSocialRequests(){
    await directEnsurePublicSocialSchema();var me=directPublicIdentity();
    var r=await window.NovaTursoDirect.query("SELECT from_username AS username,created_at FROM nova_public_friend_requests WHERE to_user_id=? ORDER BY created_at DESC LIMIT 200",[me.id]);
    return {incoming:(r.rows||[]).map(function(x){return {username:x.username,createdAt:Number(x.created_at||0)};}),groupInvites:[],database:"public-turso"};
  }
  async function directPublicFriendPresence(){
    await directEnsurePublicSocialSchema();var me=directPublicIdentity();
    var r=await window.NovaTursoDirect.query("SELECT friend_username AS username FROM nova_public_friends WHERE user_id=? ORDER BY lower(friend_username) LIMIT 1000",[me.id]);
    var names=[],seen=Object.create(null);
    function addName(value){var name=String(value||"").trim(),key=name.toLowerCase();if(name&&!seen[key]){seen[key]=true;names.push(name);}}
    (r.rows||[]).forEach(function(x){addName(x.username);});

    // The original friend graph lives behind the legacy Social endpoint, not
    // in this newly provisioned public database. Import it once per account,
    // then keep normal friend-list reads on public Turso.
    var migrated=await window.NovaTursoDirect.query("SELECT 1 AS done FROM nova_public_social_migrations WHERE user_id=? LIMIT 1",[me.id]);
    if(!migrated.rows||!migrated.rows.length){
      var legacy=await request("/api/social",{noCache:true});
      var legacyFriends=Array.isArray(legacy&&legacy.friends)?legacy.friends:[];
      var inserts=[],allResolved=true,legacyNames=[];
      for(var i=0;i<legacyFriends.length;i++){
        var item=legacyFriends[i],name=String(typeof item==="string"?item:item&&item.username||"").trim();
        if(!name)continue;
        legacyNames.push(name);addName(name);
        try{
          var peer=await directPublicFindUser(name),now=Date.now();
          if(peer.id!==me.id){
            inserts.push({sql:"INSERT INTO nova_public_friends(user_id,friend_id,username,friend_username,created_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id,friend_id) DO NOTHING",args:[me.id,peer.id,me.username,peer.username,now]});
            inserts.push({sql:"INSERT INTO nova_public_friends(user_id,friend_id,username,friend_username,created_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id,friend_id) DO NOTHING",args:[peer.id,me.id,peer.username,me.username,now]});
          }
        }catch(error){allResolved=false;}
      }
      if(inserts.length)await window.NovaTursoDirect.batch(inserts);
      if(allResolved){
        await window.NovaTursoDirect.execute("INSERT INTO nova_public_social_migrations(user_id,friends_migrated_at) VALUES(?,?) ON CONFLICT(user_id) DO NOTHING",[me.id,Date.now()]);
      }
    }
    names.sort(function(a,b){return a.localeCompare(b,undefined,{sensitivity:"base"});});
    return {friends:names.map(function(username){return {username:username,presenceState:"offline",activityType:"",activityLabel:""};}),database:"public-turso"};
  }
  async function directPublicRemoveFriend(value){
    await directEnsurePublicSocialSchema();var me=directPublicIdentity(),peer=await directPublicFindUser(value);
    await window.NovaTursoDirect.batch([
      {sql:"DELETE FROM nova_public_friends WHERE user_id=? AND friend_id=?",args:[me.id,peer.id]},
      {sql:"DELETE FROM nova_public_friends WHERE user_id=? AND friend_id=?",args:[peer.id,me.id]}
    ]);
    return {ok:true,database:"public-turso"};
  }

  var api = {
    deviceId: deviceId,
    request: request,
    me: function () { return request("/api/me"); },
    login: function (body) { return request("/api/auth/login", { method: "POST", body: body }); },
    register: function (body) { return request("/api/auth/register", { method: "POST", body: body }); },
    logout: function () {
      return request("/api/presence", { method: "POST", body: { state: "offline" } })
        .catch(function () {})
        .then(function () { return request("/api/auth/logout", { method: "POST", body: {} }); })
        .then(function (result) { window.location.reload(); return result; });
    },
    changePassword: function (body) { return request("/api/auth/change-password", { method: "POST", body: body }); },
    getProfile: function () { return request("/api/profile"); },
    saveProfile: function (body) { return request("/api/profile", { method: "PATCH", body: body }); },
    getSettings: function () { return request("/api/settings"); },
    saveSettings: function (settings) { return request("/api/settings", { method: "PATCH", body: { settings: settings } }); },
    gameStats: function (slugs) { var fallback = function () { return request("/api/games/stats?slugs=" + encodeURIComponent((slugs || []).join(","))); }; if (window.NovaTursoDirect && window.NovaTursoDirect.ready()) return directGameStats(slugs).catch(function () { return fallback(); }); return fallback(); },
    rateGame: function (slug, rating) { if (window.NovaTursoDirect && window.NovaTursoDirect.ready()) return directRateGame(slug, rating); return request("/api/games/rating", { method: "POST", body: { slug: slug, rating: rating } }); },
    recordGameView: function (slug) { if (window.NovaTursoDirect && window.NovaTursoDirect.ready()) return directRecordGameView(slug); return request("/api/games/view", { method: "POST", body: { slug: slug } }); },
    publicProfile: function (username) { return request("/api/profiles/" + encodeURIComponent(username)); },
    publicProfiles: function (usernames) { return request("/api/profiles?usernames=" + encodeURIComponent(usernames.join(","))); },
    searchProfiles: function (query) { return request("/api/profiles/search?q=" + encodeURIComponent(String(query || ""))); },
    social: function () { return window.NovaTursoDirect && window.NovaTursoDirect.ready() ? directPublicFriendPresence() : Promise.reject(new Error("Public Turso unavailable; social Worker fallback is disabled.")); },
    friendPresence: function () { return window.NovaTursoDirect && window.NovaTursoDirect.ready() ? directPublicFriendPresence() : Promise.reject(new Error("Public Turso unavailable; friend-presence Worker fallback is disabled.")); },
    socialRequests: function () { return window.NovaTursoDirect && window.NovaTursoDirect.ready() ? directPublicSocialRequests() : Promise.reject(new Error("Public Turso unavailable; friend-request Worker fallback is disabled.")); },
    messages: function (channel, after) {
      var fallback = function () { return request("/api/social/messages?channel=" + encodeURIComponent(channel) + "&after=" + (after || 0)); };
      if (directPublicDMChannel(channel)) return directPublicDMMessages(channel, after);
      if (directPublicChannel(channel)) {
        if (!window.NovaTursoDirect || !window.NovaTursoDirect.ready()) {
          return Promise.reject(new Error("Public Turso is not configured; public messages were not loaded."));
        }
        return directPublicMessages(channel, after).catch(function (error) {
          directSocialReadsAvailable = false;
          throw new Error("Public Turso read failed; Worker fallback is disabled for public channels. " + (error && error.message || ""));
        });
      }
      return fallback();
    },
    sendMessage: function (body) {
      if (directPublicDMChannel(body && body.channel)) return directPublicSendDM(body);
      if (directPublicChannel(body && body.channel || "everyone")) return directPublicSendMessage(body);
      return request("/api/social/messages", { method: "POST", body: body });
    },
    createEveryonePoll: function (question, options) { return request("/api/social/everyone/polls", { method: "POST", body: { question: question, options: options } }); },
    voteEveryonePoll: function (messageId, optionIndex) { return directPublicVotePoll(messageId, optionIndex); },
    endEveryonePoll: function (messageId) { return request("/api/social/everyone/polls/end", { method: "POST", body: { messageId: messageId } }); },
    pinEveryoneMessage: function (messageId) { return request("/api/social/everyone/pin", { method: "POST", body: { messageId: messageId || null } }); },
    reactions: function (channel) {
      var fallback = function () { return request("/api/social/reactions?channel=" + encodeURIComponent(channel)); };
      if (directPublicChannel(channel)) {
        if (!window.NovaTursoDirect || !window.NovaTursoDirect.ready()) {
          return Promise.reject(new Error("Public Turso is not configured; public reactions were not loaded."));
        }
        return directPublicReactions(channel).catch(function (error) {
          directSocialReadsAvailable = false;
          throw new Error("Public Turso reactions failed; Worker fallback is disabled for public channels. " + (error && error.message || ""));
        });
      }
      return fallback();
    },
    toggleReaction: function (channel, messageId, emoji) {
      if (directPublicChannel(channel)) return directPublicToggleReaction(channel, messageId, emoji);
      return request("/api/social/reactions", { method: "POST", body: { channel: channel, messageId: messageId, emoji: emoji } });
    },
    typing: function (channel) { return request("/api/social/typing?channel=" + encodeURIComponent(channel)); },
    setTyping: function (channel, typing) { return request("/api/social/typing", { method: "POST", body: { channel: channel, typing: !!typing } }); },
    friendRequest: function (username) { return window.NovaTursoDirect && window.NovaTursoDirect.ready() ? directPublicFriendRequest(username) : Promise.reject(new Error("Public Turso unavailable; friend-request Worker fallback is disabled.")); },
    respondFriendRequest: function (username, action) { return window.NovaTursoDirect && window.NovaTursoDirect.ready() ? directPublicRespondFriendRequest(username, action) : Promise.reject(new Error("Public Turso unavailable; friend-request Worker fallback is disabled.")); },
    removeFriend: function (username) { return window.NovaTursoDirect && window.NovaTursoDirect.ready() ? directPublicRemoveFriend(username) : Promise.reject(new Error("Public Turso unavailable; friend Worker fallback is disabled.")); },
    socialBlocks: function () { return request("/api/social/blocks"); },
    blockUser: function (username, reason) { return request("/api/social/blocks", { method: "POST", body: { username: username, reason: reason || "" } }); },
    unblockUser: function (username) { return request("/api/social/blocks", { method: "DELETE", body: { username: username } }); },
    report: function (body) { return request("/api/reports", { method: "POST", body: body }); },
    supportTickets: function () { return request("/api/support/tickets"); },
    supportTicket: function (id) { return request("/api/support/tickets?ticket=" + encodeURIComponent(id)); },
    createSupportTicket: function (body) { return request("/api/support/tickets", { method: "POST", body: body }); },
    replySupportTicket: function (ticketId, message) { return request("/api/support/tickets/messages", { method: "POST", body: { ticketId: ticketId, message: message } }); },
    setSupportTicketStatus: function (ticketId, action) { return request("/api/support/tickets/status", { method: "POST", body: { ticketId: ticketId, action: action } }); },
    supernovaState: function () { return request("/api/supernova/state"); },
    saveSupernovaState: function (body) { return request("/api/supernova/state", { method: "PUT", body: body }); },
    supernovaAccess: function () { return request("/api/supernova/access"); },
    claimSupernovaTrial: function () { return request("/api/supernova/trial", { method: "POST", body: {} }); },
    createSupernovaReferral: function (username) { return request("/api/supernova/referrals", { method: "POST", body: { username: username } }); },
    respondSupernovaReferral: function (referralId, action) { return request("/api/supernova/referrals/respond", { method: "POST", body: { referralId: referralId, action: action } }); },
    aiChat: function (body) { return request("/api/ai/chat", { method: "POST", body: body, timeoutMs: 60000 }); },
    createGroup: function (name, usernames) { return request("/api/social/groups", { method: "POST", body: { name: name, usernames: usernames } }); },
    inviteGroup: function (groupId, username) { return request("/api/social/groups/invite", { method: "POST", body: { groupId: groupId, username: username } }); },
    respondGroup: function (groupId, action) { return request("/api/social/groups/respond", { method: "POST", body: { groupId: groupId, action: action } }); },
    leaveGroup: function (groupId) { return request("/api/social/groups/member", { method: "DELETE", body: { groupId: groupId } }); },
    voiceRooms: function () { return request("/api/voice/rooms"); },
    voiceRoom: function (roomId) { return request("/api/voice/room?room=" + encodeURIComponent(roomId)); },
    createVoiceRoom: function (body) { return request("/api/voice/rooms", { method: "POST", body: body }); },
    requestVoiceJoin: function (roomId) { return request("/api/voice/request", { method: "POST", body: { roomId: roomId } }); },
    admitVoiceMember: function (roomId, username, action) { return request("/api/voice/admit", { method: "POST", body: { roomId: roomId, username: username, action: action } }); },
    leaveVoiceRoom: function (roomId) { return request("/api/voice/leave", { method: "POST", body: { roomId: roomId } }); },
    voiceAction: function (body) { return request("/api/voice/action", { method: "POST", body: body }); },
    voiceTranscript: function (roomId, text) { return request("/api/voice/transcript", { method: "POST", body: { roomId: roomId, text: text } }); },
    reportVoice: function (body) { return request("/api/voice/report", { method: "POST", body: body }); },
    voiceIce: function (roomId) { return request("/api/voice/ice?room=" + encodeURIComponent(roomId)); },
    contentVotes: function (kind) { return request("/api/content-votes?kind=" + encodeURIComponent(kind || "game"), { noCache: true }); },
    updateContentVote: function (body) { return request("/api/content-votes", { method: "POST", body: body }); },
    adminOverview: function () { return request("/api/admin/overview"); },
    adminViews: function () { return request("/api/admin/views", { noCache: true }); },
    adminHealth: function () { return request("/api/admin/health", { noCache: true, timeoutMs: 12000 }); },
    adminContentVotes: function (status) { return request("/api/admin/content-votes?status=" + encodeURIComponent(status || ""), { noCache: true }); },
    adminUpdateContentVote: function (body) { return request("/api/admin/content-votes", { method: "PATCH", body: body }); },
    adminTasks: function (status, scope) { return request("/api/admin/tasks?status=" + encodeURIComponent(status || "") + "&scope=" + encodeURIComponent(scope || "")); },
    adminCreateTask: function (body) { return request("/api/admin/tasks", { method: "POST", body: body }); },
    adminUpdateTask: function (body) { return request("/api/admin/tasks", { method: "PATCH", body: body }); },
    adminUsers: function (query, status) { return request("/api/admin/users?q=" + encodeURIComponent(query || "") + "&status=" + encodeURIComponent(status || "")); },
    adminStaff: function () { return request("/api/admin/staff"); },
    adminUserStatus: function (body) { return request("/api/admin/users/status", { method: "POST", body: body }); },
    adminResetUserPassword: function (body) { return request("/api/admin/users/password", { method: "POST", body: body }); },
    adminChatMessages: function (reason, query, username, channel) { return request("/api/admin/chat/messages?q=" + encodeURIComponent(query || "") + "&username=" + encodeURIComponent(username || "") + "&channel=" + encodeURIComponent(channel || ""), { headers: { "X-Nova-Audit-Reason": reason } }); },
    adminChatRestrictions: function (username) { return request("/api/admin/chat/restrictions?username=" + encodeURIComponent(username || "")); },
    adminCreateChatRestriction: function (body) { return request("/api/admin/chat/restrictions", { method: "POST", body: body }); },
    adminRevokeChatRestriction: function (body) { return request("/api/admin/chat/restrictions", { method: "DELETE", body: body }); },
    adminClearEveryoneChat: function (reason) { return request("/api/admin/chat/everyone/clear", { method: "DELETE", body: { reason: reason } }); },
    adminClearAnnouncementsChat: function (reason) { return request("/api/admin/chat/announcements/clear", { method: "DELETE", body: { reason: reason } }); },
    adminReports: function (status) { return request("/api/admin/reports?status=" + encodeURIComponent(status || "")); },
    adminReportAction: function (body) { return request("/api/admin/reports/action", { method: "POST", body: body }); },
    adminTickets: function (status, query) { return request("/api/admin/tickets?status=" + encodeURIComponent(status || "") + "&q=" + encodeURIComponent(query || "")); },
    adminTicket: function (id) { return request("/api/admin/tickets?ticket=" + encodeURIComponent(id)); },
    adminTicketAction: function (body) { return request("/api/admin/tickets/action", { method: "POST", body: body }); },
    adminRole: function (body) { return request("/api/admin/roles", { method: "POST", body: body }); },
    adminProxyLogs: function (reason, domain, device) { return request("/api/admin/proxy-logs?domain=" + encodeURIComponent(domain || "") + "&device=" + encodeURIComponent(device || ""), { headers: { "X-Nova-Audit-Reason": reason } }); },
    adminDeviceBans: function () { return request("/api/admin/device-bans"); },
    adminBanDevice: function (body) { return request("/api/admin/device-bans", { method: "POST", body: body }); },
    adminUnbanDevice: function (body) { return request("/api/admin/device-bans", { method: "DELETE", body: body }); },
    siteState: function () { return request("/api/site-state"); },
    adminSite: function () { return request("/api/admin/site"); },
    adminSetMaintenance: function (body) { return request("/api/admin/maintenance", { method: "PATCH", body: body }); },
    adminCreateBanner: function (body) { return request("/api/admin/banners", { method: "POST", body: body }); },
    adminUpdateBanner: function (body) { return request("/api/admin/banners", { method: "PATCH", body: body }); },
    adminDeleteBanner: function (id) { return request("/api/admin/banners", { method: "DELETE", body: { id: id } }); },
    adminSupernova: function () { return request("/api/admin/supernova"); },
    adminSupernovaAction: function (body) { return request("/api/admin/supernova", { method: "POST", body: body }); },
    adminVoice: function () { return request("/api/admin/voice"); },
    adminVoiceAction: function (body) { return request("/api/admin/voice/action", { method: "POST", body: body }); },
    adminAudit: function () { return request("/api/admin/audit"); },
    cacheUser: cacheUser
  };

  window.NovaAPI = api;
  var PRESENCE_ACTIVITY_KEY = "nova_presence_activity_at";
  var IDLE_AFTER_MS = 60 * 1000;
  var OFFLINE_AFTER_MS = 2 * 60 * 1000;
  var lastActivityAt = Date.now();
  var lastActivityStoredAt = 0;
  var lastPresenceAt = 0;
  var currentPresenceState = "";
  var PRESENCE_LEADER_KEY = "nova_presence_leader_v1";
  var presenceTabId = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
  function isPresenceLeader() {
    var now = Date.now(), lease = null;
    try { lease = JSON.parse(localStorage.getItem(PRESENCE_LEADER_KEY) || "null"); } catch (error) {}
    if (!lease || Number(lease.expiresAt || 0) < now || lease.id === presenceTabId) {
      try { localStorage.setItem(PRESENCE_LEADER_KEY, JSON.stringify({ id: presenceTabId, expiresAt: now + 20000 })); } catch (error) {}
      return true;
    }
    return false;
  }

  function sharedActivityAt() {
    var shared = Number(localStorage.getItem(PRESENCE_ACTIVITY_KEY) || 0);
    return Math.max(lastActivityAt, shared);
  }

  function sendPresence(state, force) {
    if (!window.__novaV7User || !isPresenceLeader()) return;
    var now = Date.now();
    if (!force && state === currentPresenceState && now - lastPresenceAt < 55000) return;
    currentPresenceState = state;
    lastPresenceAt = now;
    api.request("/api/presence", { method: "POST", body: { state: state } }).catch(function () {
      lastPresenceAt = 0;
    });
  }

  function syncPresence() {
    if (!window.__novaV7User || !isPresenceLeader()) return;
    var inactiveFor = Date.now() - sharedActivityAt();
    var state = inactiveFor >= OFFLINE_AFTER_MS ? "offline" : (inactiveFor >= IDLE_AFTER_MS ? "idle" : "online");
    var heartbeatDue = state !== "offline" && Date.now() - lastPresenceAt >= 60000;
    if (state !== currentPresenceState || heartbeatDue) sendPresence(state, true);
  }

  function recordActivity() {
    var now = Date.now();
    lastActivityAt = now;
    if (now - lastActivityStoredAt >= 5000) {
      lastActivityStoredAt = now;
      localStorage.setItem(PRESENCE_ACTIVITY_KEY, String(now));
    }
    if (currentPresenceState && currentPresenceState !== "online") sendPresence("online", true);
  }

  document.addEventListener("nova:account-changed", function (event) {
    if (event.detail && event.detail.user) {
      recordActivity();
      sendPresence("online", true);
    } else {
      currentPresenceState = "";
    }
  });

  // Count one Nova view per full document load. Internal SPA navigation is not
  // counted, keeping the metric useful and the database cost to one tiny write.
  request("/api/analytics/view", { method: "POST", body: {} }).catch(function () {});

  api.me().then(function (data) {
    window.__novaV7User = data.user || null;
    cacheUser(data.user || null);
  }).catch(function () {});

  ["pointerdown", "keydown", "touchstart", "wheel", "mousemove"].forEach(function (type) {
    document.addEventListener(type, recordActivity, { passive: true, capture: true });
  });

  setInterval(syncPresence, 10000);

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) recordActivity();
  });
  window.addEventListener("focus", recordActivity);
  window.addEventListener("online", recordActivity);
  window.addEventListener("storage", function (event) {
    if (event.key === PRESENCE_ACTIVITY_KEY && Number(event.newValue || 0) > lastActivityAt) syncPresence();
  });

  document.addEventListener("nova:navigate", function (event) {
    if (!event.detail || !event.detail.url) return;
    api.request("/api/proxy/navigation", { method: "POST", body: { url: event.detail.url, result: "opened" } }).catch(function () {});
  });
})();
