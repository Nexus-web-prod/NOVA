# Database

Nova uses Turso/libSQL. The Pages worker reads `TURSO_DATABASE_URL` and the
secret `TURSO_AUTH_TOKEN`. The current expected imported schema version is 717.

`migrations/TURSO_SCHEMA.sql` and `migrations/UNO_SCHEMA.sql` are retained schema sources. Migration
history must not be removed merely because production has already applied it.

Set the secret with Wrangler for each Pages environment. Never place database
tokens in HTML, JavaScript, `wrangler.toml`, or source control. After a deploy,
`/api/health` should report `backend: "turso-libsql"` and schema version 717.
