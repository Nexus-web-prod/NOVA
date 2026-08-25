# Nova database

Nova's imported Turso database is schema version **717**. This directory is the canonical home for database evolution from version 718 forward.

## Important baseline rule

The repository did not contain the complete SQL that originally created all production tables, so the 717 baseline must not be guessed. Generate a read-only production snapshot first:

```bash
export TURSO_DATABASE_URL='libsql://...'
export TURSO_AUTH_TOKEN='...'
npm run db:snapshot
npm run db:baseline
```

`db:baseline` copies the verified `database-cleanup/before/schema.sql` into `database/migrations/717_production_baseline.sql`. Review it before committing it.

## Normal workflow

```bash
npm run db:snapshot
npm run db:verify
npm run db:audit
npm run db:cleanup -- --dry-run
npm run db:migrate
npm run db:verify
```

Destructive cleanup requires an explicit `--apply` flag. The cleanup tool aborts if a category exceeds its safety limit.

Never store Turso tokens, database dumps, or production exports in Git.
