/* NOVA direct Turso HTTP client.
 * This is a browser-side client for the libSQL HTTP pipeline API.
 * Configure window.NOVA_TURSO_CONFIG before this file with:
 *   { url: "https://public2-nova-db-nexuswebprod.aws-us-east-2.turso.io",
 *     authToken: "YOUR PUBLIC DATABASE TOKEN" }
 * The token is intentionally client-visible in this architecture.
 *
 * Important: this client only provides SQL transport. App routes must be
 * migrated from /api/* to explicit query functions before Cloudflare Pages
 * can be removed from those request paths.
 */
(function (global) {
  "use strict";

  var config = global.NOVA_TURSO_CONFIG || {};
  var dbUrl = String(config.url || "").trim().replace(/\/$/, "");
  var authToken = String(config.authToken || "").trim();
  var ready = /^https:\/\//i.test(dbUrl) && !!authToken &&
    authToken !== "YOUR PUBLIC DATABASE TOKEN";

  function assertReady() {
    if (!ready) {
      throw new Error("Direct Turso is not configured: set NOVA_TURSO_CONFIG.url and authToken.");
    }
  }

  function encodeArg(value) {
    if (value === null || value === undefined) return { type: "null" };
    if (typeof value === "boolean") return { type: "integer", value: value ? "1" : "0" };
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new TypeError("SQL numeric arguments must be finite.");
      if (Number.isInteger(value)) return { type: "integer", value: String(value) };
      return { type: "float", value: value };
    }
    if (value instanceof ArrayBuffer) {
      var bytes = new Uint8Array(value);
      var binary = "";
      for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return { type: "blob", base64: btoa(binary) };
    }
    if (ArrayBuffer.isView(value)) return encodeArg(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    return { type: "text", value: String(value) };
  }

  function decodeValue(value) {
    if (!value || value.type === "null") return null;
    if (value.type === "integer") {
      var n = Number(value.value);
      return Number.isSafeInteger(n) ? n : value.value;
    }
    if (value.type === "float") return Number(value.value);
    if (value.type === "blob") {
      var raw = atob(value.base64 || "");
      var bytes = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      return bytes;
    }
    return value.value == null ? null : value.value;
  }

  async function pipeline(requests) {
    assertReady();
    var response = await fetch(dbUrl + "/v2/pipeline", {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers: {
        "Authorization": "Bearer " + authToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ requests: requests })
    });
    if (!response.ok) {
      var detail = await response.text().catch(function () { return ""; });
      throw new Error("Turso HTTP " + response.status + (detail ? ": " + detail.slice(0, 300) : ""));
    }
    var payload = await response.json();
    var results = payload.results || [];
    for (var i = 0; i < results.length; i++) {
      var item = results[i];
      if (item.type === "error" || item.error) {
        var err = item.error || {};
        throw new Error(err.message || "Turso query failed");
      }
    }
    return results;
  }

  function statement(sql, args) {
    if (typeof sql !== "string" || !sql.trim()) throw new TypeError("SQL statement is required.");
    return {
      type: "execute",
      stmt: {
        sql: sql,
        args: (args || []).map(encodeArg),
        named_args: [],
        want_rows: true
      }
    };
  }

  function resultRows(result) {
    var data = result && result.response && result.response.result;
    if (!data) return { rows: [], columns: [], rowsAffected: 0, lastInsertRowid: null };
    var columns = (data.cols || []).map(function (col) { return col.name; });
    var rows = (data.rows || []).map(function (row) {
      var out = {};
      row.forEach(function (value, index) { out[columns[index] || String(index)] = decodeValue(value); });
      return out;
    });
    return {
      rows: rows,
      columns: columns,
      rowsAffected: Number(data.affected_row_count || 0),
      lastInsertRowid: data.last_insert_rowid == null ? null : decodeValue(data.last_insert_rowid)
    };
  }

  async function execute(sql, args) {
    var results = await pipeline([statement(sql, args), { type: "close" }]);
    return resultRows(results[0]);
  }

  async function batch(statements) {
    if (!Array.isArray(statements) || !statements.length) return [];
    var requests = statements.map(function (item) {
      return statement(item.sql, item.args || []);
    });
    requests.push({ type: "close" });
    var results = await pipeline(requests);
    return results.slice(0, statements.length).map(resultRows);
  }

  var api = {
    ready: function () { return ready; },
    query: execute,
    execute: execute,
    batch: batch,
    // Explicit opt-in check is useful for a deployment smoke test.
    check: async function () {
      var result = await execute("SELECT 1 AS direct_turso_ok", []);
      return result.rows[0] && result.rows[0].direct_turso_ok === 1;
    }
  };

  global.NovaTursoDirect = api;
})(window);
