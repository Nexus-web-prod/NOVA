# Database

NOVA uses Turso/libSQL. Cloudflare Pages remains the static host. Server-side Pages/Worker code uses the private `nova-db` database, while the website's approved browser-direct integration uses the separate `public-nova-db` database.

## Routing rule

**Use Cloudflare Workers only for private or privileged operations.** This includes authentication and sessions, private account/profile fields, user-specific data, private messages, moderation, admin tools, secrets, permission checks, and writes that require trusted authorization or abuse protection.

Public, non-sensitive data should be served directly from the browser to the public Turso database whenever the schema and access pattern support it. Do not send public reads through a Worker just because the route historically used `/api/*`.

Keep public and private data separated. Never put private account data or secrets in `public-nova-db`, and never expose private `nova-db` credentials to the browser. A browser-visible token is public and grants its database permissions; it must only be used with a database and permissions that are safe to expose. Public writes also need abuse controls or a design that limits what an anonymous client can change.

## Private Worker database

The NOVA Pages Worker uses `TURSO_DATABASE_URL` pointed at `libsql://nova-db-nexuswebprod.aws-us-east-2.turso.io`. The deployed Cloudflare environment must use the same private database URL and its encrypted `TURSO_AUTH_TOKEN` secret. Keep the token in encrypted Worker environment configuration; never put it in HTML, JavaScript, `wrangler.toml`, or source control.

The preview Worker must also use the private NOVA database, not `public-nova-db`. Do not switch the server-side Worker to the public database to reduce Worker usage, and do not move or copy user data between databases as part of routine stabilization.

`migrations/TURSO_SCHEMA.sql` and `migrations/UNO_SCHEMA.sql` are retained schema sources. Do not remove migration history merely because production has already applied it. The expected imported schema version is 717; after deployment, `/api/health` should report `backend: "turso-libsql"` and schema version 717.

## Browser-direct Turso

`website/js/nova-turso-direct.js` implements the browser-side libSQL HTTP client. `website/js/nova-turso-config.js` points it at `public-nova-db` and contains the existing browser-visible public database token intentionally available to clients. Do not copy or expose the private Worker token there.

The current direct-Turso integration in `website/js/nova-v7-api.js` covers public aggregate game-stat reads, game-view counts, and anonymous per-browser game ratings when configured. The public database never receives a signed-in NOVA user ID for rating rows; the browser creates a random local rating key and stores only its SHA-256 hash in the guest-rating table. Ratings are therefore browser-scoped rather than synchronized to a signed-in account.

Other paths still use same-origin `/api/*` calls and must be reviewed individually. Private profile data, authenticated or account-linked operations, social features, moderation, admin tools, and privileged operations remain on the Worker. Do not blindly rewrite every API call or remove the Worker while private routes still depend on it.

## Cloudflare Workers reduction

The target is **static Pages hosting plus Workers only for private/privileged operations**—not a Worker for every database request. Migrate public endpoints in batches, verify schemas, query behavior, CORS and failure handling, and inventory the remaining `/api/*` callers. Keep `_worker.js` until all private endpoints NOVA still needs have been identified and Pages routing/deployment configuration is verified. Removing it prematurely can break login, social features, moderation, voice, admin, and other dependent features.

## Validation

When changing database routing, verify that:
- The private Worker and preview configurations still target `nova-db`.
- The encrypted `TURSO_AUTH_TOKEN` remains server-side and is not stored in source configuration.
- Public browser credentials cannot access private data or perform privileged writes.
- Game statistics and anonymous ratings retain their intended fallback behavior.
- Regression tests cover the public/private database boundary.
