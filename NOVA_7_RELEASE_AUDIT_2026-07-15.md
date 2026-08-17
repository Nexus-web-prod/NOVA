# Nova 7 release audit

Date: 2026-07-15

## Result

The static project, Worker API, D1 schema, catalogs, and deployment scripts pass
the automated regression checks listed below. No deployment was performed during
this audit.

## Fixes completed

### Accounts, database, and security

- Raised the Nova 7 schema marker to version 708.
- Added login and registration rate limiting with temporary blocks and cleanup.
- Removed email collection, email-verification routes, delivery configuration,
  verification UI, and the retired verification table. Signed-in accounts can
  use Social immediately.
- Added server-enforced rate limits for messages, typing, reactions, friend
  requests, groups, and reports.
- Added a 256 KiB JSON request limit so oversized requests cannot consume
  unbounded Worker memory.
- Added a 20-second frontend API timeout with a useful error instead of an
  indefinitely hanging request.
- Removed automatic owner grants for accounts named `admin` or `connor`.
- Removed automatic developer grants imported from the browser-era
  `nova:admin:devs` record.
- Disabled the legacy admin shell and made admin-tab visibility depend only on
  the signed-in D1 role.
- Added `grant-owner.sh`, which requires an exact confirmation before explicitly
  bootstrapping the first owner.
- Completed `RESET_D1.sql` so every current Nova 7 and retired Nova 6 table is
  removed during a confirmed reset.
- Kept public staff badges available in profile results without exposing private
  account data to developers.
- Added the current role to batched public-profile results so staff badges render
  consistently across Social.
- Confirmed no API key or private key is stored anywhere in the project.

### Social and plans

- Corrected mutual-friend checks that converted string user IDs to `NaN`.
- Made friend requests deterministic: duplicate outgoing requests are rejected,
  reverse pending requests are accepted, and stale declined rows are cleared.
- Prevented duplicate pending Supernova plan requests.
- Routed Supernova upgrade requests through the authenticated D1 report API
  instead of reporting success from local browser state.
- Added D1-backed Supernova memberships, expirations, public profile badges, and
  an audited Nova Control panel for grants, approvals, denials, and revokes.
- Made the Supernova admin page visible to every staff role; developers receive
  read-only access while admins and owners retain grant and revoke controls.
- Restored the user-facing Supernova page entry in Nova Island for accounts with
  an active Supernova membership.
- Replaced the exposed browser-side AI call with an authenticated, rate-limited
  Worker endpoint that keeps Google Gemini API keys private.
- Preserved legacy Supernova memberships from account fields and the old
  `nova:admin:supernova` list during schema migration.

### Proxy, assets, and deployment

- Corrected the playground Vortex script path.
- Corrected the NBA app icon to a root-relative asset path.
- Updated the proxy failure page to describe logging accurately.
- Added `SAMEORIGIN` frame protection.
- Disabled stale one-day caching for JavaScript, CSS, and catalog JSON files.
- Added the correct AVIF response type for the existing
  `assets/media/icons/rs5.webp` file.
- Updated deployment health guidance to require schema version 708.
- Updated D1 documentation to match the implemented compressed image storage.

## Automated verification

- 61 JavaScript and MJS files: syntax passed.
- 5 HTML files and 22 inline scripts: syntax passed.
- HTML duplicate IDs: none found.
- 10 JSON files: parsed successfully.
- 5 shell scripts: `bash -n` passed.
- Worker/API coverage: 54 Worker route handlers, 39 distinct frontend API path
  templates, none missing.
- D1 lifecycle: 28 tables created, 0 left after reset, 28 recreated.
- D1 foreign-key check: no errors.
- Role migration simulation: 0 automatic owners, 0 automatic developers, explicit
  owner remains after schema reapplication.
- Catalogs: 88 games, 69 apps, and 7 movies; unique names and URLs with no missing
  thumbnails.
- 42 static local references: no missing files.
- 459 media files: readable by the filesystem type audit.
- 566 deploy files: no macOS cloud placeholder files.
- Project-owned secret scan: no API keys or private keys found.

## Remaining deployment checks

The local test environment could not open the project through the in-app
`file://` browser policy or bind a local Wrangler listener, so final visual
interaction testing must be done on the deployed Pages preview. Remote D1,
third-party game/app/movie destinations, and the external Wisp service also
require live network testing.

Device bans remain best-effort because a browser device ID can be reset by
clearing site data. Image messages currently store small compressed data URLs in
D1; R2 should be used before increasing image size or volume.

## Deployment verification

Run:

```sh
./deploy-pages-d1.sh
```

Then confirm `https://dev.nova-7.pages.dev/api/health` reports:

- `ok: true`
- `dbBound: true`
- `schemaVersion: 708`
