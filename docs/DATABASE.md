# Database

NOVA uses Turso/libSQL. Cloudflare Pages remains the static host.

## Routing rule

**Use Cloudflare Workers only for private or privileged operations.** This includes
authentication and sessions, private account/profile fields, user-specific data,
private messages, moderation, admin tools, secrets, permission checks, and any
write that must be authorized or protected against abuse.

Public, non-sensitive data should be served directly from the browser to the
public Turso database whenever the schema and access pattern support it. This
includes public catalog/statistics reads and other genuinely public content.
Do not send public reads through a Worker just because the route historically
used `/api/*`.

Keep public and private data separated. Never put private account data or secrets
in `public-nova-db`, and never expose the private `nova-db` credentials to the
browser. A browser-visible token is public and grants its database permissions;
it must only be used with a database whose contents and granted permissions are
safe to expose. Public writes also need abuse controls or a design that limits
what an anonymous client can change.

## Browser-direct Turso

`website/js/nova-turso-direct.js` implements the browser-side libSQL HTTP
client. `website/js/nova-turso-config.js` points it at `public-nova-db` and
contains the existing public database token intentionally visible to clients.

The current direct-Turso integration in `website/js/nova-v7-api.js` covers
public aggregate game-stat reads, game-view counts, and anonymous per-browser
game ratings when configured. The public database never receives a signed-in
NOVA user ID for rating rows; the browser creates a random local rating key and
stores only its SHA-256 hash in the guest-rating table. This means the rating
selection is browser-scoped rather than synchronized to a signed-in account.

Other paths still use same-origin `/api/*` calls and must be reviewed
individually. Private profile data, authenticated rating writes when direct
Turso is unavailable, social features, admin tools, and privileged operations
remain on the Worker. Do not blindly rewrite every API call or remove the
Worker while private routes still depend on it.

## Cloudflare Workers reduction

The target is **static Pages hosting plus Workers only for private/privileged
operations**—not a Worker for every database request. Migrate public endpoints
in batches, verify their schemas, query behavior, CORS and failure handling,
and then inventory the remaining `/api/*` callers. Keep `_worker.js` until
all private endpoints that NOVA still needs have been identified and the Pages
routing/deployment configuration is verified. Removing it prematurely will
break login, social features, moderation, voice, admin, and other dependent
features.
