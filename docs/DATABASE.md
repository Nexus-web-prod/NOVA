# Database

NOVA currently uses Turso/libSQL. The legacy `nova-db` database is retained
separately from `public-nova-db`.

## Browser-direct access and Worker removal

A browser-direct Turso HTTP client exists in
`website/js/nova-turso-direct.js`, but the browser-visible configuration must
not contain a live Turso auth token. A Turso `rw` token is a database-level
credential: anyone who can load the website can extract it and issue arbitrary
SQL against that database. Unlike a database with row-level security, raw
Turso SQL does not enforce per-user table/row policies automatically.

The direct-client config therefore remains disabled until the public database
access model is safe for anonymous clients. Do not put `TURSO_AUTH_TOKEN`,
a service token, or any privileged credential in HTML, JavaScript, or source
control. The previous token committed to this branch must be revoked/rotated in
the Turso dashboard immediately; deleting it from a later commit does not make
the old value secret again.

## What remains to be migrated

This branch is **not** a completed Worker removal. Most account, authentication,
profile, social, moderation, presence, voice, and game operations still use
`/api/*` routes implemented in `_worker.js`. Merely changing the database URL
does not replace the authorization and business logic in those routes.

Cloudflare Pages can remain the static host while the Worker dependency is
removed, but each endpoint must be replaced with a safe direct-client design
or a non-Worker backend. With Turso, exposing a database-wide writable token
to the browser is not a safe way to do this. Do not remove the Worker until the
replacement routes are implemented and regression-tested.

The existing server-side path uses `TURSO_DATABASE_URL` and the encrypted
`TURSO_AUTH_TOKEN` Pages secret. Keep privileged credentials server-side.
