# Nova 7 security hardening - 2026-07-18

Status: deployed and verified on the `dev` and `beta` Pages branches.

## Critical fixes

- Sandboxed every proxied browser tab into a unique origin. Proxied pages no longer receive `allow-same-origin`, top-level navigation, or download permission, so they cannot act as Nova or call authenticated Nova APIs.
- Removed the production proxy inspector, BroadcastChannel command bridge, and remote JavaScript evaluation path.
- Removed the legacy browser-admin application, published default key, hidden admin trigger, client-side reward grants, and obsolete global admin commands.
- Replaced the browser-controlled admin boundary with D1-backed session and role checks on every admin endpoint. Staff changes remain owner-only.
- Changed sessions to host-only, Secure, HttpOnly, SameSite=Strict cookies with a seven-day idle timeout and a maximum of ten active sessions per account.
- Added exact same-origin validation plus a required custom request header to every state-changing API handler.
- Replaced the removable maintenance overlay as the security boundary. The Worker now returns a standalone `503` document instead of Nova's application HTML and rejects non-staff API traffic while maintenance is active. Staff sessions and the minimum login/status endpoints remain available.

## Backend and account fixes

- Retired the Nova 6 `nova_users` and `nova_kv` authority, disabled weak legacy-hash login, and added schema 712 cleanup for old hashes, tables, and shared-IP authentication lockouts.
- Kept the minimum password length at eight, rejected common passwords and username-equal passwords, and set PBKDF2-SHA-256 hashing to Cloudflare's supported maximum of 100,000 iterations. Added signed-in migration for the earlier 120,000-iteration hashes and an owner-only, audited recovery reset.
- Added login, registration, password, profile, settings, activity, presence, social, image, report, support, AI, and proxy-log rate limits.
- Added session revocation after password changes and account suspension or bans.
- Added strict JSON body size/type checks, URL credential rejection, nested settings sanitization, report-type validation, and image format/size limits.
- Replaced unrestricted localStorage backup restore/export with a one-megabyte, preference-only allowlist and sanitized bookmarks, recents, nicknames, URLs, and nested settings before legacy UI code runs.
- Preserved server-side ownership checks for DMs, groups, tickets, blocks, reports, device bans, staff roles, and Supernova grants.

## Deployment and browser hardening

- Added CSP, HSTS, COOP/COEP, CORP, Permissions-Policy, no-sniff, frame, referrer, and cross-domain policy headers.
- Removed source-map references from production runtime files.
- Self-hosted the pinned Dreamland 0.0.25 runtime instead of executing a third-party runtime script.
- Changed deployment to an explicit runtime allowlist. SQL, shell, TOML, Markdown, prototypes, audit files, and legacy admin scripts cannot enter the Pages upload.
- Added Worker-level 404 protection for internal operational files even if a future deploy command includes them accidentally.
- Scoped the macOS placeholder check to runtime files so unrelated cloud placeholders do not block a release.

## Verification

- `node --check` passes for the Worker, service worker, API, account, proxy, admin, and pinned vendor scripts.
- `bash -n deploy-pages-d1.sh` passes.
- `tests/security-check.mjs` dynamically verifies the maintenance boundary and checks every mutation and admin route.
- Live Cloudflare verification created a disposable 100,000-iteration account, completed login with a secure session cookie, and removed every diagnostic row afterward.
- Live migration verification also exercised a disposable 120,000-iteration account end to end: authenticated challenge, browser proof, 100,000-iteration replacement, fresh login, and complete cleanup.
- Schema 712 applies to a clean SQLite database, creates 32 tables, and leaves no `nova_users` or `nova_kv` tables.
- No credential-shaped Google or Resend key was found in the deployable Nova source.

## Before publishing

- Rotate every Google AI and email-provider key that was pasted into a chat or shared elsewhere, then replace the corresponding Cloudflare secrets. Shared secrets must be treated as compromised even when they are not present in source control.
- Review the local build, apply schema 712, and deploy only after approval.
