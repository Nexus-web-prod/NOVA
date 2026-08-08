# Nova 7 Cloudflare Setup

Nova 7 uses Cloudflare Pages Functions and D1. Accounts, profiles, sessions,
roles, friends, chat, groups, presence, reports, announcements, proxy logs, and
admin audit records use authenticated `/api/*` routes. The old browser-readable
`/rest/v1/*` table API is intentionally disabled.

## Security model

- Passwords use salted PBKDF2-SHA-256. Legacy hashes are upgraded after login.
- Sessions are server records referenced by `HttpOnly`, `Secure`, `SameSite=Lax` cookies.
- Guests can browse. A signed-in account can use Social immediately.
- Login, registration, messaging, reactions, typing, friend requests, groups, and reports are rate limited by the Worker.
- Developer, admin, and owner roles are checked by the Worker on every protected request.
- Privileged roles are never inferred from a username or legacy browser data.
- Supernova memberships and upgrade requests are stored in D1 and managed through audited admin actions.
- Proxy navigation records contain sanitized URLs and hashed random device IDs.
- Standard proxy logs expire after 14 days, incident records after 90 days, and audit logs after one year.

## Deploy

The included script locates the existing D1 database, updates `wrangler.toml`,
applies the additive schema remotely, and deploys the `dev` branch:

```sh
cd "/Users/closcon000/Documents/Codex/2026-06-21/hi/outputs/nova-preview-updated 3"
./deploy-pages-d1.sh
```

After deployment, verify:

```text
https://dev.nova-7.pages.dev/api/health
```

It should report `ok: true`, `backend: "cloudflare-d1"`, `schema: "nova-7"`,
`schemaVersion: 710`, and `aiConfigured: true`.

## Google Gemini keys

Supernova AI sends requests through the Worker so Google API keys never reach
the browser. Configure up to four keys as encrypted Cloudflare Pages secrets:

```sh
./configure-google-ai.sh
```

Accounts are assigned consistently across the configured keys. Google keys from
the same project normally share a project quota; use multiple keys only for
projects you are authorized to operate.

## Migration behavior

`D1_SCHEMA.sql` is additive and keeps the two legacy source tables only for
one-way account import. Existing users can sign in with their old password; a
successful login replaces the legacy hash. The retired email-verification table
is removed when schema 708 is applied.

## Owner bootstrap

The schema does not grant staff access based on account names. After the intended
owner has registered, run the explicit one-time bootstrap command:

```sh
CONFIRM_OWNER=connor ./grant-owner.sh connor
```

The confirmation value and username must match. Normal deployments never add or
change owner access.

Photo messages and avatars are compressed in the browser and capped before their
data URLs are stored in D1. Move media to R2 before raising those limits or
supporting high-volume image storage.

## One-time database reset

To erase every account, profile, message, role, log, and legacy row while
preserving the Nova 7 schema:

```sh
CONFIRM_WIPE=nova-db ./reset-d1.sh
```

The reset is deliberately separate from normal deployment.
