# Database

NOVA uses Turso/libSQL. The legacy `nova-db` database is separate from
`public-nova-db`.

## Browser-direct Turso

`website/js/nova-turso-direct.js` is the browser-side libSQL HTTP client.
`website/js/nova-turso-config.js` points it at `public-nova-db` and now
restores the existing public database token so the direct game-statistics
paths in `website/js/nova-v7-api.js` can be used.

**The browser token is public.** It is sent in every direct database request
and can be read from the site's JavaScript or network panel. Anyone with it
can send SQL requests with the token's database permissions. This setup is
only acceptable if `public-nova-db` is intended to be publicly accessible and
contains no private account data or secrets. Do not reuse the private
`nova-db` token here. The token being visible does not make it safe to grant
access to private tables.

The direct client currently covers game-stat reads, ratings, and view writes
when the client is ready. Other API calls continue to use same-origin
`/api/*` endpoints as a compatibility fallback.

## Cloudflare Workers status

**Worker removal is not complete. Do not delete `_worker.js` yet.** NOVA's
account/authentication, profile, social/chat, moderation, presence, voice,
admin, and several game operations still rely on the Worker. Removing the
Worker before replacing those endpoints will break those features.

The direct game-stat routes reduce calls for those operations only; they do
not eliminate Worker usage across NOVA. A full static-Pages-only migration
requires replacing every remaining `/api/*` consumer, checking each direct
query against the actual public database schema, regression-testing the
application, and then removing the Worker routing entrypoint. Browser-side
SQL is not a substitute for server-enforced authorization.

## Database separation

- `nova-db` remains the private server-side database. Its token belongs only
  in the encrypted Cloudflare secret `TURSO_AUTH_TOKEN`.
- `public-nova-db` is the browser-facing database used by the direct client.
  Treat all data and write operations reachable with its token as public.
- Never place the private database token in HTML, JavaScript, or source control.
