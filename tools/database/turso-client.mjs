export function tursoHttpUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('Missing TURSO_DATABASE_URL');
  return raw.replace(/^libsql:\/\//i, 'https://').replace(/\/$/, '') + '/v2/pipeline';
}

function arg(value) {
  if (value == null) return { type: 'null' };
  if (typeof value === 'boolean') return { type: 'integer', value: value ? '1' : '0' };
  if (typeof value === 'number') return Number.isInteger(value)
    ? { type: 'integer', value: String(value) }
    : { type: 'float', value: String(value) };
  return { type: 'text', value: String(value) };
}

function value(cell) {
  if (!cell || cell.type === 'null') return null;
  if (cell.type === 'integer') {
    const n = Number(cell.value);
    return Number.isSafeInteger(n) ? n : String(cell.value);
  }
  if (cell.type === 'float') return Number(cell.value);
  return cell.value ?? null;
}

function rows(result) {
  const cols = (result?.cols || []).map(c => c.name);
  return (result?.rows || []).map(row => Object.fromEntries(cols.map((c, i) => [c, value(row[i])])));
}

export class TursoClient {
  constructor(url = process.env.TURSO_DATABASE_URL, token = process.env.TURSO_AUTH_TOKEN) {
    this.url = tursoHttpUrl(url);
    this.token = String(token || '');
    if (!this.token) throw new Error('Missing TURSO_AUTH_TOKEN');
  }

  stmt(sql, args = []) { return { type: 'execute', stmt: { sql, args: args.map(arg) } }; }

  async send(requests, baton = null) {
    const body = { requests };
    if (baton) body.baton = baton;
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Turso request failed: ${payload?.message || payload?.error || response.status}`);
    return payload;
  }

  parse(payload, expected) {
    const entries = Array.isArray(payload?.results) ? payload.results.slice(0, expected) : [];
    if (entries.length < expected) throw new Error('Incomplete Turso pipeline response');
    return entries.map((entry, i) => {
      if (entry?.type !== 'ok' || entry?.response?.type !== 'execute') {
        throw new Error(`Turso SQL error at statement ${i + 1}: ${entry?.error?.message || entry?.error || 'unknown error'}`);
      }
      return entry.response.result || {};
    });
  }

  async query(sql, args = []) {
    const payload = await this.send([this.stmt(sql, args), { type: 'close' }]);
    return rows(this.parse(payload, 1)[0]);
  }

  async first(sql, args = []) { return (await this.query(sql, args))[0] || null; }

  async transaction(statements) {
    if (!statements.length) return [];
    const opening = await this.send([this.stmt('BEGIN IMMEDIATE'), ...statements.map(s => this.stmt(s.sql, s.args || []))]);
    const baton = opening.baton;
    if (!baton) throw new Error('Turso transaction did not return a baton');
    try {
      const parsed = this.parse(opening, statements.length + 1).slice(1);
      await this.send([this.stmt('COMMIT'), { type: 'close' }], baton);
      return parsed.map(rows);
    } catch (error) {
      try { await this.send([this.stmt('ROLLBACK'), { type: 'close' }], baton); } catch {}
      throw error;
    }
  }
}

export function splitSql(source) {
  const out = [];
  let buf = '', quote = null, lineComment = false, blockComment = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i], next = source[i + 1];
    if (lineComment) { if (ch === '\n') { lineComment = false; buf += ch; } continue; }
    if (blockComment) { if (ch === '*' && next === '/') { blockComment = false; i++; } continue; }
    if (!quote && ch === '-' && next === '-') { lineComment = true; i++; continue; }
    if (!quote && ch === '/' && next === '*') { blockComment = true; i++; continue; }
    if (quote) {
      buf += ch;
      if (ch === quote) {
        if (next === quote) { buf += next; i++; }
        else quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; buf += ch; continue; }
    if (ch === ';') { if (buf.trim()) out.push(buf.trim()); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}
