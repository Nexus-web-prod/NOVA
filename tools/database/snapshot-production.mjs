import fs from 'node:fs/promises';
import path from 'node:path';
import { TursoClient } from './turso-client.mjs';

const db = new TursoClient();
const outDir = path.resolve('database-cleanup/before');
await fs.mkdir(outDir, { recursive: true });

const tables = await db.query("SELECT name, sql FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
const indexes = await db.query("SELECT name,tbl_name AS table_name,sql FROM sqlite_schema WHERE type='index' AND name NOT LIKE 'sqlite_autoindex_%' ORDER BY tbl_name,name");
const columns = {}, foreignKeys = {}, rowCounts = {};
for (const table of tables) {
  const safe = String(table.name).replace(/"/g, '""');
  columns[table.name] = await db.query(`PRAGMA table_info("${safe}")`);
  foreignKeys[table.name] = await db.query(`PRAGMA foreign_key_list("${safe}")`);
  const count = await db.first(`SELECT COUNT(*) AS count FROM "${safe}"`);
  rowCounts[table.name] = Number(count?.count || 0);
}
const integrity = {
  captured_at: new Date().toISOString(),
  integrity_check: await db.query('PRAGMA integrity_check'),
  foreign_key_check: await db.query('PRAGMA foreign_key_check'),
  schema_meta: await db.first('SELECT version,applied_at FROM nova_schema_meta WHERE id=1').catch(() => null),
  schema_migrations: await db.query('SELECT version,name,applied_at FROM schema_migrations ORDER BY version').catch(() => [])
};
const schema = [...tables.map(x => x.sql).filter(Boolean), ...indexes.map(x => x.sql).filter(Boolean)].join(';\n\n') + ';\n';
await Promise.all([
  fs.writeFile(path.join(outDir, 'tables.json'), JSON.stringify(tables.map(x => x.name), null, 2) + '\n'),
  fs.writeFile(path.join(outDir, 'columns.json'), JSON.stringify(columns, null, 2) + '\n'),
  fs.writeFile(path.join(outDir, 'indexes.json'), JSON.stringify(indexes, null, 2) + '\n'),
  fs.writeFile(path.join(outDir, 'foreign-keys.json'), JSON.stringify(foreignKeys, null, 2) + '\n'),
  fs.writeFile(path.join(outDir, 'row-counts.json'), JSON.stringify(rowCounts, null, 2) + '\n'),
  fs.writeFile(path.join(outDir, 'schema.sql'), schema),
  fs.writeFile(path.join(outDir, 'integrity.json'), JSON.stringify(integrity, null, 2) + '\n')
]);
console.log(`Snapshot complete: ${tables.length} tables, ${Object.values(rowCounts).reduce((a,b)=>a+b,0)} rows`);
console.log(outDir);
