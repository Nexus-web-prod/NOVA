# Database

NOVA's database is Turso/libSQL. The active database URL is
`libsql://public-nova-db-nexuswebprod.aws-us-east-2.turso.io`. The old
`nova-db` database is retained as a backup and must not be changed during this
migration.

## Browser-direct access

The `website/js/nova-turso-direct.js` module implements the browser-side
libSQL HTTP pipeline transport. `website/js/nova-turso-config.js` contains the
public browser configuration and must be populated with the `public-nova-db`
token before direct queries activate. This architecture intentionally makes
that token visible to visitors.

The first migrated feature group is game metrics. Once the direct client is
configured, `NovaAPI.gameStats()`, `NovaAPI.rateGame()`, and
`NovaAPI.recordGameView()` query or update `game_stats`, `game_ratings`, and
`game_guest_ratings` directly instead of calling their `/api/games/*` Pages
Worker routes. If the direct client is not configured, these methods keep using
the existing API as a migration fallback.

**This is a staged migration, not a complete Worker removal yet.** Most account,
profile, social, moderation, voice, and game-write operations still use
`/api/*` routes implemented in `_worker.js`. Those route contracts must be
migrated individually before removing the Pages Worker; simply changing the
database URL cannot do that.

The current expected imported schema version is 717. `migrations/TURSO_SCHEMA.sql`
and `migrations/UNO_SCHEMA.sql` are retained schema sources. Do not delete
migration history just because production has already applied it.

For the existing server-side path, the Pages Worker reads `TURSO_DATABASE_URL`
and the Pages secret `TURSO_AUTH_TOKEN`. The direct browser path does not use
that Pages secret; it uses the public token in `nova-turso-config.js`.
