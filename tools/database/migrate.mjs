import fs from 'node:fs/promises';
import { TursoClient, splitSql } from './turso-client.mjs';
const db = new TursoClient();
const names = (await fs.readdir('database/migrations')).filter(n => /^\d+_.+\.sql$/.test(n)).sort((a,b)=>Number(a)-Number(b));
let applied = await db.query('SELECT version FROM schema_migrations').catch(() => []);
const have = new Set(applied.map(r => Number(r.version)));
for (const name of names) {
  const version = Number(name.split('_')[0]);
  if (version === 717) continue; // imported production baseline, never replay on production
  if (have.has(version)) { console.log(`skip ${name}`); continue; }
  const sql = await fs.readFile(`database/migrations/${name}`,'utf8');
  const statements = splitSql(sql).map(sql => ({ sql }));
  console.log(`apply ${name} (${statements.length} statements)`);
  await db.transaction(statements);
  have.add(version);
}
console.log('Migrations complete');
