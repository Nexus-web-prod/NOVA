# Database

Nova uses Turso/libSQL. The Pages worker reads `TURSO_DATABASE_URL` and the
secret `TURSO_AUTH_TOKEN`. The imported production baseline is schema 717. Nova cleanup migration 718 moves runtime-owned game/voice schema into the canonical migration system.

`migrations/TURSO_SCHEMA.sql` and `migrations/UNO_SCHEMA.sql` are retained schema sources. Migration
history must not be removed merely because production has already applied it.

Set the secret with Wrangler for each Pages environment. Never place database
tokens in HTML, JavaScript, `wrangler.toml`, or source control. After a deploy,
`/api/health` should report `backend: "turso-libsql"` and a compatible schema with migration 718 applied before the request-time DDL fallback is retired.


## Database cleanup and migration commands

```bash
npm run db:snapshot
npm run db:baseline
npm run db:verify
npm run db:audit
npm run db:cleanup -- --dry-run
npm run db:migrate
```

Migration `718_runtime_schema_ownership.sql` is the first cleanup migration. Once it is recorded in `schema_migrations`, normal requests stop performing the legacy runtime schema initialization for the migrated tables.
