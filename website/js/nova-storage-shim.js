/**
 * nova-storage-shim.js — Nova local compatibility layer
 *
 * Nova 6.0 uses the Pages Worker REST bridge for shared account, social,
 * admin, reward, and activity data.
 */
(function () {
  "use strict";

  const SB_URL = location.origin;
  const SB_KEY = "nova-local";
  const _orig = window.fetch.bind(window);
  const LOCAL_ONLY = false;
  const LEGACY_REMOTE_DISABLED = true;

  // ── localStorage helpers (guaranteed to work, always) ────────────────────────
  const LS_PREFIX = "nova_db:";

  function lsGet(key) {
    try { return localStorage.getItem(LS_PREFIX + key); } catch { return null; }
  }
  function lsSet(key, value) {
    try { localStorage.setItem(LS_PREFIX + key, value); return true; } catch { return false; }
  }
  function lsDel(key) {
    try { localStorage.removeItem(LS_PREFIX + key); return true; } catch { return false; }
  }
  function lsScan(prefix) {
    try {
      const results = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(LS_PREFIX + prefix)) results.push(k.slice(LS_PREFIX.length));
      }
      return results;
    } catch { return []; }
  }

  // ── Legacy REST-shaped API backed only by localStorage ──────────────────────
  const LOCAL_TABLE_PREFIX = "nova_local_table:";
  const LOCAL_TABLES = {
    nova_kv: { pk: ["key"], auto: null },
    nova_stream: { pk: ["id"], auto: "id" },
    nova_users: { pk: ["username"], auto: null },
    friends: { pk: ["username", "friend"], auto: null },
    friend_requests: { pk: ["to_user", "from_user"], auto: null },
    social_unread: { pk: ["username", "other_user"], auto: null },
    games: { pk: ["slug"], auto: null },
    groups: { pk: ["id"], auto: null },
    group_members: { pk: ["group_id", "username"], auto: null },
    group_invites: { pk: ["group_id", "to_user"], auto: null },
    nova_web_logs: { pk: ["id"], auto: "id" }
  };

  function tableKey(table) { return LOCAL_TABLE_PREFIX + table; }
  function readTable(table) {
    try {
      const raw = localStorage.getItem(tableKey(table));
      const rows = raw ? JSON.parse(raw) : [];
      return Array.isArray(rows) ? rows : [];
    } catch { return []; }
  }
  function writeTable(table, rows) {
    try { localStorage.setItem(tableKey(table), JSON.stringify(rows)); } catch {}
  }
  function nextId(table, rows) {
    return rows.reduce((max, row) => Math.max(max, parseInt(row.id, 10) || 0), 0) + 1;
  }
  function parseFilter(raw) {
    if (!raw || typeof raw !== "string" || raw.indexOf(".") < 0) return null;
    const idx = raw.indexOf(".");
    return { op: raw.slice(0, idx), value: raw.slice(idx + 1) };
  }
  function cleanInValue(value) {
    let out = String(value).trim().replace(/\\"/g, '"').replace(/\\'/g, "'");
    if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("'") && out.endsWith("'"))) out = out.slice(1, -1);
    return decodeURIComponent(out);
  }
  function splitInList(value) {
    const raw = String(value || "").replace(/^\(/, "").replace(/\)$/, "");
    const out = [];
    let cur = "", quoted = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if ((ch === '"' || ch === "'") && raw[i - 1] !== "\\") { quoted = !quoted; continue; }
      if (ch === "," && !quoted) { if (cur) out.push(cleanInValue(cur)); cur = ""; continue; }
      cur += ch;
    }
    if (cur) out.push(cleanInValue(cur));
    return out;
  }
  function compareValue(actual, op, expected) {
    const left = actual == null ? "" : String(actual);
    const right = expected == null ? "" : String(expected);
    if (op === "eq") return left === right;
    if (op === "neq") return left !== right;
    if (op === "gt") return Number(left) > Number(right);
    if (op === "gte") return Number(left) >= Number(right);
    if (op === "lt") return Number(left) < Number(right);
    if (op === "lte") return Number(left) <= Number(right);
    if (op === "like" || op === "ilike") {
      const needle = right.replace(/%/g, "").toLowerCase();
      const hay = op === "ilike" ? left.toLowerCase() : left;
      return hay.includes(op === "ilike" ? needle : right.replace(/%/g, ""));
    }
    if (op === "in") return splitInList(right).map(String).includes(left);
    return true;
  }
  function filterRows(rows, params) {
    return rows.filter(row => {
      for (const [key, raw] of params.entries()) {
        if (["select", "limit", "order"].includes(key)) continue;
        const parsed = parseFilter(raw);
        if (parsed && !compareValue(row[key], parsed.op, parsed.value)) return false;
      }
      return true;
    });
  }
  function selectRows(rows, select) {
    if (!select || select === "*") return rows;
    const cols = select.split(",").map(s => s.trim()).filter(Boolean);
    return rows.map(row => {
      const out = {};
      cols.forEach(col => { if (col in row) out[col] = row[col]; });
      return out;
    });
  }
  function orderRows(rows, order) {
    if (!order) return rows;
    const specs = order.split(",").map(item => {
      const [col, dir] = item.trim().split(".");
      return { col, dir: dir === "desc" ? -1 : 1 };
    }).filter(x => x.col);
    return rows.slice().sort((a, b) => {
      for (const s of specs) {
        const av = a[s.col], bv = b[s.col];
        if (av === bv) continue;
        return (av > bv ? 1 : -1) * s.dir;
      }
      return 0;
    });
  }
  function jsonResponse(value, status) {
    if (status === 204) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(value == null ? null : value), {
      status: status || 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  async function localRestFetch(input, opts) {
    const req = input instanceof Request ? input : new Request(new URL(String(input), location.href).href, opts || {});
    const url = new URL(req.url, location.href);
    const table = decodeURIComponent(url.pathname.slice("/rest/v1/".length).split("/")[0] || "");
    const spec = LOCAL_TABLES[table];
    if (!spec) return jsonResponse({ error: "Local table not found", table }, 404);
    const method = (req.method || "GET").toUpperCase();
    let rows = readTable(table);
    if (method === "GET") {
      rows = filterRows(rows, url.searchParams);
      rows = orderRows(rows, url.searchParams.get("order"));
      const limit = parseInt(url.searchParams.get("limit"), 10);
      if (limit > 0) rows = rows.slice(0, limit);
      return jsonResponse(selectRows(rows, url.searchParams.get("select")), 200);
    }
    if (method === "POST") {
      const prefer = req.headers.get("Prefer") || "";
      const body = await req.json().catch(() => null);
      const incoming = Array.isArray(body) ? body : [body];
      const returned = [];
      for (const item of incoming) {
        if (!item || typeof item !== "object") continue;
        const row = Object.assign({}, item);
        if (spec.auto && !row[spec.auto]) row[spec.auto] = nextId(table, rows);
        if (table === "nova_stream" && !row.ts) row.ts = Date.now();
        const idx = rows.findIndex(existing => spec.pk.every(pk => String(existing[pk]) === String(row[pk])));
        if (idx >= 0) {
          if (prefer.includes("ignore-duplicates")) {
            returned.push(rows[idx]);
          } else {
            rows[idx] = Object.assign({}, rows[idx], row);
            returned.push(rows[idx]);
          }
        } else {
          rows.push(row);
          returned.push(row);
        }
      }
      writeTable(table, rows);
      return prefer.includes("return=representation") ? jsonResponse(returned, 201) : jsonResponse(null, 201);
    }
    if (method === "DELETE") {
      const keep = rows.filter(row => !filterRows([row], url.searchParams).length);
      writeTable(table, keep);
      return jsonResponse(null, 204);
    }
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  window.fetch = function(input, opts) {
    try {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (LOCAL_ONLY && url.pathname.startsWith("/rest/v1/")) return localRestFetch(input, opts);
    } catch {}
    return _orig(input, opts);
  };

  // ── Local REST compatibility helpers ─────────────────────────────────────────
  function _h(extra) {
    return Object.assign({ "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY, "Content-Type": "application/json" }, extra || {});
  }

  async function _rest(path, opts) {
    if (LEGACY_REMOTE_DISABLED) return null;
    try {
      const r = await fetch("/rest/v1/" + path, Object.assign({ headers: _h() }, opts || {}));
      if (!r.ok) { console.warn("[nova-db] REST", r.status, path); return null; }
      const txt = await r.text(); return txt ? JSON.parse(txt) : null;
    } catch (e) { console.warn("[nova-db] fetch error", e); return null; }
  }

  async function _restOk(path, opts) {
    if (LEGACY_REMOTE_DISABLED) return false;
    try { const r = await fetch("/rest/v1/" + path, Object.assign({ headers: _h() }, opts || {})); return r.ok; }
    catch { return false; }
  }

  // ── KV — localStorage only ───────────────────────────────────────────────────
  async function kvGet(key) {
    const local = lsGet(key);
    if (local !== null) return local;
    const a = await _rest("nova_kv?key=eq." + encodeURIComponent(key) + "&select=value&limit=1");
    if (a && a.length) {
      lsSet(key, a[0].value); // cache locally
      return a[0].value;
    }
    return null;
  }
  // kvGetFresh keeps the old API name while reading only local data.
  const _kvFreshMem = Object.create(null);
  const KV_FRESH_TTL = {
    "nova:admin:maintenance": 25000,
    "nova:admin:banners": 25000,
    "nova:social:banned": 30000,
    "nova:admin:user_bans": 30000,
    "nova:admin:ip_bans": 60000,
    "nova:admin:device_bans": 60000,
    "nova:admin:hard_refresh": 45000,
    "nova:admin:devs": 120000,
    "nova:admin:custom_badges": 90000,
    "nova:admin:keys": 120000,
    "nova:admin:supernova": 90000
  };
  function kvFreshTtlMs(key) {
    if (KV_FRESH_TTL[key]) return KV_FRESH_TTL[key];
    if (key.startsWith("nova:admin:rewards:")) return 45000;
    return 20000;
  }
  function invalidateKvFresh(key) { delete _kvFreshMem[key]; }
  async function kvGetFresh(key) {
    const now = Date.now();
    const hit = _kvFreshMem[key];
    if (hit && (now - hit.t) < kvFreshTtlMs(key)) return hit.v;
    const val = await kvGet(key);
    _kvFreshMem[key] = { t: now, v: val };
    return val;
  }
  async function kvSet(key, value) {
    invalidateKvFresh(key);
    lsSet(key, value); // always write locally first
    await _restOk("nova_kv", { method: "POST", headers: _h({ "Prefer": "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }) });
    return true;
  }
  // kvSetFresh remains as a compatibility alias for an immediate local write.
  async function kvSetFresh(key, value) {
    invalidateKvFresh(key);
    lsSet(key, value); // write locally first so admin sees change instantly
    await _restOk("nova_kv", { method: "POST", headers: _h({ "Prefer": "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }) });
    return true;
  }
  async function kvDel(key) {
    invalidateKvFresh(key);
    lsDel(key);
    _restOk("nova_kv?key=eq." + encodeURIComponent(key), { method: "DELETE" });
    return true;
  }
  async function kvScan(prefix) {
    const local = lsScan(prefix);
    const remote = await _rest("nova_kv?key=like." + encodeURIComponent(prefix + "%") + "&select=key&limit=2000");
    const remoteKeys = remote ? remote.map(r => r.key) : [];
    return [...new Set([...local, ...remoteKeys])];
  }
  async function kvMGet(keys) {
    if (!keys.length) return [];
    return Promise.all(keys.map(k => kvGet(k)));
  }

  // ── Users — local to this browser ────────────────────────────────────────────
  function lsUserKey(username) { return "nova:user:" + username.toLowerCase(); }

  function _readLocalUser(key) {
    const local = lsGet(key);
    if (local) return local;
    try {
      const legacy = localStorage.getItem(key);
      if (legacy) {
        lsSet(key, legacy);
        return legacy;
      }
    } catch (e) {}
    return null;
  }

  function _cacheUser(key, raw) {
    lsSet(key, raw);
    try { localStorage.setItem(key, raw); } catch (e) {}
  }

  /** @returns {{ data: string|null, hadNetworkError: false }} */
  async function _fetchLocalUserTable(uname) {
    const key = lsUserKey(uname);
    const a = await _rest("nova_users?username=eq." + encodeURIComponent(uname) + "&select=username,hash,avatar,created_at&limit=1");
    if (a && a.length) {
      const row = a[0];
      return { data: JSON.stringify({ hash: row.hash || "", avatar: row.avatar || "", created: row.created_at ? new Date(row.created_at).getTime() : Date.now() }), hadNetworkError: false };
    }
    const kv = await _rest("nova_kv?key=eq." + encodeURIComponent(key) + "&select=value&limit=1");
    return { data: kv && kv.length ? kv[0].value : null, hadNetworkError: false };
  }

  /**
   * @param {string} username
   * @param {{ fresh?: boolean }} [opts] fresh=true skips local cache (admin search)
   */
  async function getUser(username, opts) {
    const uname = (username || "").toLowerCase();
    if (!uname) return null;
    const key = lsUserKey(uname);
    const fresh = !!(opts && opts.fresh);

    if (!fresh) {
      const remote = await _fetchLocalUserTable(uname);
      if (remote.data) {
        _cacheUser(key, remote.data);
        _resyncUser(uname, remote.data);
        return remote.data;
      }
      if (!remote.hadNetworkError) {
        const local = _readLocalUser(key);
        if (local) {
          _resyncUser(uname, local);
          return local;
        }
        return null;
      }
    } else {
      const local = _readLocalUser(key);
      if (local) return local;
      const table = await _fetchLocalUserTable(uname);
      if (table.data) _cacheUser(key, table.data);
      return table.data;
    }

    const local = _readLocalUser(key);
    if (local) {
      _resyncUser(uname, local);
      return local;
    }
    return null;
  }

  function _resyncUser(uname, raw) {
    try {
      const row = JSON.parse(raw);
      const payload = { username: uname, hash: row.hash || "", avatar: row.avatar || "", created_at: row.created ? new Date(row.created).toISOString() : new Date().toISOString() };
      _restOk("nova_users", {
        method: "POST",
        headers: _h({ "Prefer": "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify(payload)
      });
      _restOk("nova_kv", {
        method: "POST",
        headers: _h({ "Prefer": "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify({ key: lsUserKey(uname), value: raw, updated_at: new Date().toISOString() })
      });
    } catch(e) {}
  }

  async function userExists(username) {
    return !!(await getUser(username));
  }

  async function setUser(username, data) {
    const uname = (username || "").toLowerCase();
    if (!uname) return false;
    const key = lsUserKey(uname);
    const str = typeof data === "string" ? data : JSON.stringify(data);
    // Write to localStorage immediately (prefixed + legacy keys)
    _cacheUser(key, str);
    // Mirror into local compatibility tables used by older Nova modules.
    try {
      const row = typeof data === "string" ? JSON.parse(data) : data;
      await Promise.all([
        _restOk("nova_users", {
          method: "POST",
          headers: _h({ "Prefer": "resolution=merge-duplicates,return=minimal" }),
          body: JSON.stringify({ username: uname, hash: row.hash || "", avatar: row.avatar || "", created_at: row.created ? new Date(row.created).toISOString() : new Date().toISOString() })
        }),
        _restOk("nova_kv", {
          method: "POST",
          headers: _h({ "Prefer": "resolution=merge-duplicates,return=minimal" }),
          body: JSON.stringify({ key, value: str, updated_at: new Date().toISOString() })
        })
      ]);
    } catch(e) { console.warn("[nova-db] local user write failed:", e); }
    return true;
  }

  async function delUser(username) {
    const uname = username.toLowerCase();
    const key = lsUserKey(uname);
    lsDel(key);
    try { localStorage.removeItem(key); } catch (e) {}
    await Promise.all([
      _restOk("nova_users?username=eq." + encodeURIComponent(uname), { method: "DELETE" }),
      _restOk("nova_kv?key=eq." + encodeURIComponent(key), { method: "DELETE" })
    ]);
    return true;
  }

  // ── Friends ──────────────────────────────────────────────────────────────────
  async function getFriends(username) {
    const a = await _rest("friends?username=eq." + encodeURIComponent(username.toLowerCase()) + "&select=friend&limit=1000");
    return a ? a.map(r => r.friend) : [];
  }
  async function addFriend(username, friend) {
    return _restOk("friends", { method: "POST", headers: _h({ "Prefer": "resolution=ignore-duplicates,return=minimal" }), body: JSON.stringify({ username: username.toLowerCase(), friend: friend.toLowerCase() }) });
  }
  async function removeFriend(username, friend) {
    return _restOk("friends?username=eq." + encodeURIComponent(username.toLowerCase()) + "&friend=eq." + encodeURIComponent(friend.toLowerCase()), { method: "DELETE" });
  }
  async function isFriend(username, friend) {
    const a = await _rest("friends?username=eq." + encodeURIComponent(username.toLowerCase()) + "&friend=eq." + encodeURIComponent(friend.toLowerCase()) + "&select=friend&limit=1");
    return !!(a && a.length);
  }

  // ── Friend requests ──────────────────────────────────────────────────────────
  async function getRequests(toUser) {
    const a = await _rest("friend_requests?to_user=eq." + encodeURIComponent(toUser.toLowerCase()) + "&select=from_user&limit=200");
    return a ? a.map(r => r.from_user) : [];
  }
  async function addRequest(toUser, fromUser) {
    return _restOk("friend_requests", { method: "POST", headers: _h({ "Prefer": "resolution=ignore-duplicates,return=minimal" }), body: JSON.stringify({ to_user: toUser.toLowerCase(), from_user: fromUser.toLowerCase(), created_at: new Date().toISOString() }) });
  }
  async function removeRequest(toUser, fromUser) {
    return _restOk("friend_requests?to_user=eq." + encodeURIComponent(toUser.toLowerCase()) + "&from_user=eq." + encodeURIComponent(fromUser.toLowerCase()), { method: "DELETE" });
  }

  // ── Unread ───────────────────────────────────────────────────────────────────
  async function getUnreadHash(username) {
    const a = await _rest("social_unread?username=eq." + encodeURIComponent(username.toLowerCase()) + "&select=other_user,count");
    const out = {}; if (a) a.forEach(r => { out[r.other_user] = String(r.count); }); return out;
  }
  async function setUnreadField(username, otherUser, val) {
    return _restOk("social_unread", { method: "POST", headers: _h({ "Prefer": "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify({ username: username.toLowerCase(), other_user: otherUser.toLowerCase(), count: parseInt(val) || 0 }) });
  }
  async function incrUnreadField(username, otherUser, by) {
    by = parseInt(by) || 1;
    const cur = await _rest("social_unread?username=eq." + encodeURIComponent(username.toLowerCase()) + "&other_user=eq." + encodeURIComponent(otherUser.toLowerCase()) + "&select=count&limit=1");
    const curCount = (cur && cur[0]) ? (cur[0].count || 0) : 0;
    await setUnreadField(username, otherUser, curCount + by);
    return curCount + by;
  }

  // ── Games ────────────────────────────────────────────────────────────────────
  async function gameStats(slugs) {
    if (!window.NovaAPI || typeof window.NovaAPI.gameStats !== "function") return {};
    const payload = await window.NovaAPI.gameStats(slugs);
    return payload && payload.stats || {};
  }
  async function getGameField(slug, field) {
    const stats = await gameStats([slug]);
    const row = stats[slug] || {};
    const value = field === "rating_sum" ? Number(row.avg || 0) * Number(row.count || 0) : field === "rating_cnt" ? row.count : row.views;
    return String(value || 0);
  }
  async function getManyGameFields(slugs, field) {
    if (!slugs.length) return [];
    const stats = await gameStats(slugs);
    return slugs.map(slug => {
      const row = stats[slug] || {};
      const value = field === "rating_sum" ? Number(row.avg || 0) * Number(row.count || 0) : field === "rating_cnt" ? row.count : row.views;
      return String(value || 0);
    });
  }
  async function incrGameField(slug, field, by) {
    if (field !== "views" || !window.NovaAPI || typeof window.NovaAPI.recordGameView !== "function") return getGameField(slug, field);
    const payload = await window.NovaAPI.recordGameView(slug);
    return Number(payload && payload.stats && payload.stats.views || 0);
  }

  // ── Groups ───────────────────────────────────────────────────────────────────
  async function getGroupIds(username) {
    const a = await _rest("group_members?username=eq." + encodeURIComponent(username.toLowerCase()) + "&select=group_id&limit=200");
    if (!a) return "[]";
    const ids = a.map(r => r.group_id);
    if (!ids.length) return "[]";
    const list = ids.map(i => '"' + i + '"').join(",");
    const groups = await _rest("groups?id=in.(" + list + ")&select=id,name");
    const nameMap = {}; if (groups) groups.forEach(g => { nameMap[g.id] = g.name; });
    return JSON.stringify(ids.map(id => ({ id, name: nameMap[id] || "Group" })));
  }
  async function getGroupInfo(gid) {
    const a = await _rest("groups?id=eq." + encodeURIComponent(gid) + "&select=*&limit=1");
    if (!a || !a.length) return null;
    const g = a[0];
    const members = await _rest("group_members?group_id=eq." + encodeURIComponent(gid) + "&select=username");
    g.members = members ? members.map(r => r.username) : [];
    return JSON.stringify(g);
  }
  async function setGroupInfo(gid, data) {
    const info = typeof data === "string" ? JSON.parse(data) : data;
    return _restOk("groups", { method: "POST", headers: _h({ "Prefer": "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify({ id: gid, name: info.name || "Group", creator: info.creator || "", created_at: info.created ? new Date(info.created).toISOString() : new Date().toISOString() }) });
  }
  async function getGroupInvites(username) {
    const a = await _rest("group_invites?to_user=eq." + encodeURIComponent(username.toLowerCase()) + "&select=*&limit=200");
    if (!a) return "[]";
    return JSON.stringify(a.map(r => ({ gid: r.group_id, name: r.group_name, from: r.from_user, ts: new Date(r.created_at).getTime() })));
  }

  // ── Stream ───────────────────────────────────────────────────────────────────
  async function streamAdd(stream, fields) {
    let data = {};
    if (Array.isArray(fields)) { for (let i = 0; i < fields.length - 1; i += 2) data[fields[i]] = fields[i + 1]; }
    else if (fields && typeof fields === "object") { data = fields; }
    const r = await fetch("/rest/v1/nova_stream", { method: "POST", headers: _h({ "Prefer": "return=representation" }), body: JSON.stringify({ stream, data, ts: Date.now() }) });
    if (!r.ok) return null;
    const a = await r.json(); return (a && a[0]) ? String(a[0].id) : null;
  }
  async function streamRange(stream, start, end, count) {
    count = Math.min(count || 200, 500);
    let qs = "nova_stream?stream=eq." + encodeURIComponent(stream) + "&order=id.asc&limit=" + count + "&select=id,ts,data";
    if (start && start !== "-") {
      const id = start.startsWith("(") ? parseInt(start.slice(1)) : parseInt(start);
      if (!isNaN(id)) qs += "&id=gt." + id;
    }
    const a = await _rest(qs);
    if (!a) return [];
    return a.map(row => {
      const d = row.data || {};
      const out = { _id: String(row.id), ts: row.ts || Date.now(), ...d };
      // Map stored `cid` back to `_clientId` so appendMessages can deduplicate
      // optimistic bubbles against their server-confirmed copies.
      if (d.cid && !out._clientId) out._clientId = d.cid;
      return out;
    });
  }
  async function streamKeys(pattern) {
    const prefix = pattern.replace(/\*$/, "");
    const a = await _rest("nova_stream?stream=like." + encodeURIComponent(prefix + "%") + "&select=stream&limit=5000");
    if (!a) return [];
    return [...new Set(a.map(r => r.stream))];
  }

  // ── Unified API ───────────────────────────────────────────────────────────────
  async function sbGetFresh(key) {
    if (key.startsWith("nova:user:")) return getUser(key.slice(10), { fresh: true });
    return kvGetFresh(key);
  }

  async function sbPipeline(commands) {
    if (!Array.isArray(commands) || !commands.length) return [];
    return Promise.all(commands.map(([cmd, key]) => {
      if ((cmd || "").toUpperCase() === "GET") return sbGet(key);
      return null;
    }));
  }

  async function sbGet(key) {
    if (key.startsWith("nova:user:")) return getUser(key.slice(10));
    if (/^nova:social:friends2?:/.test(key)) return JSON.stringify(await getFriends(key.split(":").pop()));
    if (key.startsWith("nova:social:requests:")) return JSON.stringify(await getRequests(key.split(":").pop()));
    if (key.startsWith("nova:social:groups:")) return getGroupIds(key.split(":").pop());
    if (key.startsWith("nova:social:group_invites:")) return getGroupInvites(key.split(":").pop());
    if (key.startsWith("nova:group:info:")) return getGroupInfo(key.slice(16));
    if (key.startsWith("nova:rating_sum:")) return getGameField(key.slice(16), "rating_sum");
    if (key.startsWith("nova:rating_cnt:")) return getGameField(key.slice(16), "rating_count");
    if (key.startsWith("nova:views:")) return getGameField(key.slice(11), "views");
    return kvGet(key);
  }
  async function sbSet(key, value) {
    if (key.startsWith("nova:user:")) return setUser(key.slice(10), value);
    if (key.startsWith("nova:group:info:")) return setGroupInfo(key.slice(16), value);
    return kvSet(key, value);
  }
  async function sbDel(key) {
    if (key.startsWith("nova:user:")) return delUser(key.slice(10));
    if (key.startsWith("nova:stream:")) { _restOk("nova_stream?stream=eq." + encodeURIComponent(key), { method: "DELETE" }); return true; }
    return kvDel(key);
  }
  async function sbGetJson(key) { const v = await sbGet(key); if (!v) return null; try { return JSON.parse(v); } catch { return v; } }
  async function sbSetJson(key, val) { return sbSet(key, JSON.stringify(val)); }
  async function sbIncr(key, by) {
    by = parseFloat(by) || 1;
    if (key.startsWith("nova:views:")) return incrGameField(key.slice(11), "views", by);
    if (key.startsWith("nova:rating_sum:")) return incrGameField(key.slice(16), "rating_sum", by);
    if (key.startsWith("nova:rating_cnt:")) return incrGameField(key.slice(16), "rating_count", by);
    const cur = parseFloat(await kvGet(key)) || 0; const next = cur + by;
    await kvSet(key, String(next)); return next;
  }
  async function sbMGet(keys) {
    if (!keys.length) return [];
    const results = new Array(keys.length).fill(null);
    const vI=[], vS=[], rI=[], rS=[], cI=[], cS=[], kI=[], kK=[];
    keys.forEach((k,i) => {
      if (k.startsWith("nova:views:")) { vI.push(i); vS.push(k.slice(11)); }
      else if (k.startsWith("nova:rating_sum:")) { rI.push(i); rS.push(k.slice(16)); }
      else if (k.startsWith("nova:rating_cnt:")) { cI.push(i); cS.push(k.slice(16)); }
      else { kI.push(i); kK.push(k); }
    });
    const [vv,rv,cv,kv] = await Promise.all([
      vS.length ? getManyGameFields(vS,"views") : Promise.resolve([]),
      rS.length ? getManyGameFields(rS,"rating_sum") : Promise.resolve([]),
      cS.length ? getManyGameFields(cS,"rating_count") : Promise.resolve([]),
      kK.length ? kvMGet(kK) : Promise.resolve([])
    ]);
    vI.forEach((idx,i)=>{results[idx]=vv[i];}); rI.forEach((idx,i)=>{results[idx]=rv[i];});
    cI.forEach((idx,i)=>{results[idx]=cv[i];}); kI.forEach((idx,i)=>{results[idx]=kv[i];});
    return results;
  }
  async function sbSMembers(key) {
    if (/^nova:social:friends2?:/.test(key)) return getFriends(key.split(":").pop());
    if (key.startsWith("nova:social:requests:")) return getRequests(key.split(":").pop());
    const v = await kvGet(key); if (!v) return [];
    try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch { return []; }
  }
  async function sbSAdd(key, ...members) {
    if (/^nova:social:friends2?:/.test(key)) { const u=key.split(":").pop(); await Promise.all(members.map(m=>addFriend(u,m))); return members.length; }
    if (key.startsWith("nova:social:requests:")) { const u=key.split(":").pop(); await Promise.all(members.map(m=>addRequest(u,m))); return members.length; }
    const set = await sbSMembers(key); let changed=false;
    for (const m of members) { if (!set.includes(m)) { set.push(m); changed=true; } }
    if (changed) await sbSetJson(key, set); return changed ? members.length : 0;
  }
  async function sbSRem(key, ...members) {
    if (/^nova:social:friends2?:/.test(key)) { const u=key.split(":").pop(); await Promise.all(members.map(m=>removeFriend(u,m))); return members.length; }
    if (key.startsWith("nova:social:requests:")) { const u=key.split(":").pop(); await Promise.all(members.map(m=>removeRequest(u,m))); return members.length; }
    let set = await sbSMembers(key); const before=set.length;
    set = set.filter(m=>!members.includes(m));
    if (set.length !== before) await sbSetJson(key, set); return before-set.length;
  }
  async function sbSIsMember(key, member) {
    if (/^nova:social:friends2?:/.test(key)) return (await isFriend(key.split(":").pop(), member)) ? 1 : 0;
    return (await sbSMembers(key)).includes(member) ? 1 : 0;
  }
  async function sbHGetAll(key) {
    if (key.startsWith("nova:unread:")) return getUnreadHash(key.slice(12));
    const v = await kvGet(key); if (!v) return {};
    try { const o=JSON.parse(v); return (o&&typeof o==="object"&&!Array.isArray(o))?o:{}; } catch { return {}; }
  }
  async function sbHGet(key, field) {
    if (key.startsWith("nova:unread:")) {
      const a = await _rest("social_unread?username=eq."+encodeURIComponent(key.slice(12))+"&other_user=eq."+encodeURIComponent(field.toLowerCase())+"&select=count&limit=1");
      return (a&&a.length) ? String(a[0].count||0) : "0";
    }
    const h = await sbHGetAll(key); return (field in h) ? String(h[field]) : null;
  }
  async function sbHSet(key, field, val) {
    if (key.startsWith("nova:unread:")) return setUnreadField(key.slice(12), field, val);
    const h = await sbHGetAll(key); h[field]=String(val); return kvSet(key, JSON.stringify(h));
  }
  async function sbHIncrBy(key, field, by) {
    by = parseInt(by) || 1;
    if (key.startsWith("nova:unread:")) return incrUnreadField(key.slice(12), field, by);
    const h = await sbHGetAll(key); const next=(parseInt(h[field])||0)+by; h[field]=String(next);
    await kvSet(key, JSON.stringify(h)); return next;
  }
  async function sbScan(pattern) {
    const prefix = pattern.replace(/\*$/,"");
    if (prefix.startsWith("nova:user:")) {
      const local = lsScan("nova:user:");
      const remote = await _rest("nova_users?select=username&limit=5000");
      const remoteKeys = remote ? remote.map(r => "nova:user:" + r.username) : [];
      const kvRemote = await _rest("nova_kv?key=like." + encodeURIComponent("nova:user:%") + "&select=key&limit=5000");
      const kvKeys = kvRemote ? kvRemote.map(r => r.key) : [];
      return [...new Set([...local, ...remoteKeys, ...kvKeys])];
    }
    return kvScan(prefix);
  }

  window.__novaDB = {
    get:sbGet, getFresh:sbGetFresh, set:sbSet, del:sbDel,
    getJson:sbGetJson, setJson:sbSetJson,
    incr:sbIncr, incrFloat:sbIncr, mget:sbMGet, scan:sbScan, pipeline:sbPipeline,
    userExists, getUser,
    sAdd:sbSAdd, sRem:sbSRem, sIsMember:sbSIsMember, sMembers:sbSMembers,
    hGet:sbHGet, hSet:sbHSet, hGetAll:sbHGetAll, hIncrBy:sbHIncrBy,
    streamAdd, streamRange, streamKeys,
    _kvGet:kvGet, _kvGetFresh:kvGetFresh, _kvSet:kvSet, _kvSetFresh:kvSetFresh, _kvDel:kvDel, _kvScan:kvScan, _rest
  };

  window.__sb = { url:SB_URL, key:SB_KEY, h:_h, rest:_rest, restOk:_restOk };
  window.__NOVA_SUPABASE_URL = "";
  window.__NOVA_SUPABASE_KEY = "";
  window.__NOVA_DB_BACKEND = "turso-libsql";
  window.__NOVA_BACKEND_DISABLED = false;
  window.__NOVA_REDIS_URL = "";
  window.__NOVA_REDIS_TOKEN = "";

  console.debug("[Nova] Turso-backed Nova API active");
})();
