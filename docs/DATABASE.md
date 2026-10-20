# Database

Nova uses Turso/libSQL. Server-side Pages/Worker code reads `TURSO_DATABASE_URL` and the encrypted `TURSO_AUTH_TOKEN`. The current expected imported schema version is 717.

## Keep the databases separate

- **`nova-db`** is the private server-side database for the NOVA Worker. Keep `TURSO_DATABASE_URL` in `wrangler.toml` pointed at `libsql://nova-db-nexuswebprod.aws-us-east-2.turso.io`; the deployed Cloudflare environment must use the same database URL and its encrypted `TURSO_AUTH_TOKEN` secret.
- **`public-nova-db`** is only for the website/browser-side integration that is intentionally configured for public access. Do not point the server-side Worker at it as a way to reduce Cloudflare Worker usage, and never expose `TURSO_AUTH_TOKEN` in browser code.
- Keep the two database URLs and credentials in their intended environments. Do not move or copy user data between them as part of routine stabilization.

`migrations/TURSO_SCHEMA.sql` and `migrations/UNO_SCHEMA.sql` are retained schema sources. Migration history must not be removed merely because production has already applied it.

Never place database tokens in HTML, JavaScript, `wrangler.toml`, or source control. After a deploy, `/api/health` should report `backend: "turso-libsql"` and schema version 717. If health fails, inspect the deployed environment's database URL and encrypted token before changing schema or migrating data.
