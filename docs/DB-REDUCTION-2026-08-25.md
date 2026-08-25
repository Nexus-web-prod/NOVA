# Nova 7.0 Database Usage Reduction — 2026-08-25

This build combines the schema/cleanup 718 work with a runtime read-reduction pass.

## Runtime reductions
- Same-tab GET request coalescing in `website/js/nova-v7-api.js`.
- Short cross-tab shared read snapshots for hot Social, presence, reactions, typing, Voice room-list, UNO lobby and `/api/me` GETs.
- All non-GET mutations invalidate shared snapshots before writing.
- Hidden tabs no longer run the periodic presence heartbeat loop.
- Social friend-presence polling: 15s -> 30s.
- Social requests/group-invite polling: 15s -> 30s.
- Chat idle polling: 5s base / 20s max -> 6.5s base / 30s max.
- Reaction polling: 3s -> 7s.
- Typing polling: 3s -> 5s.
- Voice room discovery refresh: 10s -> 20s and hidden-tab suppressed.
- Standalone UNO: active polling 850ms -> 1500ms; hidden timer 850ms -> 15s with no DB read while hidden.

## Backend hot-query reduction
Incremental `/api/social/messages?after=...` polls no longer run `loadChannelReactions()` over the latest 200 messages. Full reaction snapshots are still returned on initial history loads; the dedicated slower reaction endpoint handles subsequent reaction changes.

## Existing cleanup/migration work retained
- Migration 718 and `schema_migrations` tracking.
- Canonical migration/database tooling.
- Request-time DDL skipped after migration 718 is installed.
- Guarded stale-data audit/cleanup tooling.

## Safety
No proxy architecture/files were intentionally modified by this database reduction pass. No production data is deleted by deploying this change. Destructive stale-data cleanup remains opt-in.
