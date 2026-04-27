---
name: test-backup
description: Test a Snapshooter database backup by restoring it locally and verifying data integrity
argument-hint: "<path-to-backup.sql.gz>"
---

# Test Backup Restore

Restore a Snapshooter production database backup to the local development database and verify it works.

## Arguments

- `$ARGUMENTS` — required: path to the downloaded `.sql.gz` backup file (e.g., `~/Downloads/production.sql.gz`)

## Prerequisites

The user must download the backup file manually from Snapshooter first (signed URLs expire in 1 hour and can't be automated).

## Step 0: Check for Nix

This skill requires Nix. All commands run inside `nix develop --command bash -c '...'` to access `psql`, `gunzip`, and other tools. The local database is managed via Nix flake outputs (`nix run .#oc-dev-db-nix`).

Before doing anything else, check if `nix` is available:

```bash
command -v nix
```

If `nix` is not found, **stop immediately** and tell the user:
- This skill requires the Nix development environment
- They should either set up Nix (see the project's `flake.nix`) or restore the backup manually using their local PostgreSQL and `psql`

Do not proceed with any further steps if Nix is not available.

## Step 1: Validate Input

Verify the backup file exists and is a gzip file:

```bash
file "$ARGUMENTS"  # Should show "gzip compressed data"
ls -lh "$ARGUMENTS"  # Show file size for reference
```

If the file doesn't exist or isn't gzip, stop and tell the user.

## Step 2: Pre-Restore Analysis (no DB changes)

Before touching the database, extract information from the dump file to help the user decide whether to proceed.

### 2a: Extract backup metadata

```bash
# Get the pg_dump header for version info
gunzip -c "$ARGUMENTS" | head -10
```

### 2b: Check migration gap

Extract migration names from the backup and compare with the codebase:

```bash
# Extract migration names from the dump (migration_name is the 4th tab-separated column)
gunzip -c "$ARGUMENTS" | awk -F"\t" '/^COPY public._prisma_migrations/{found=1; next} /^\\\./{found=0} found{print $4}' | sort > /tmp/backup_migrations.txt

# List codebase migrations
ls -1 prisma/migrations/ | grep -v migration_lock | sort > /tmp/codebase_migrations.txt

# Find migrations in codebase but NOT in backup
comm -23 /tmp/codebase_migrations.txt /tmp/backup_migrations.txt > /tmp/missing_migrations.txt
```

### 2c: Report findings

Present to the user:
- Backup source PostgreSQL version (from the dump header)
- Backup file size
- Number of migrations in the backup vs codebase
- List of **pending migrations** (in codebase but not in backup) — these will need to be applied after restore
- The latest migration in the backup (indicates how recent the backup's schema is)

If there are pending migrations, explain:
- These migrations will be applied after restore via `prisma migrate deploy`
- If the pending migrations are **additive** (new columns, new tables), this is safe — the app will work, just with empty new fields
- If pending migrations are **destructive** (dropping columns, renaming tables), there's risk of data loss or incompatibility — recommend getting a newer backup instead

Ask the user: **proceed with restore, or get a newer backup?**

## Step 3: Check Prerequisites

Only run this step after the user confirms they want to proceed.

### 3a: Ensure PostgreSQL is running with PostGIS

Detect the socket directory dynamically — it's under `/tmp/oc-pg-*` (based on an md5 hash of the data dir). Use a glob to find it:

```bash
SOCKET_DIR=$(ls -d /tmp/oc-pg-* 2>/dev/null | head -1)
```

Check if PostgreSQL is reachable and PostGIS is available:

```bash
psql -h "$SOCKET_DIR" -U opencouncil -d template1 -c "SELECT 1" 2>&1
psql -h "$SOCKET_DIR" -U opencouncil -d template1 -tA -c "SELECT name FROM pg_available_extensions WHERE name = 'postgis';"
```

**If PostgreSQL is not running or PostGIS is not available**, start it automatically:

```bash
nix run .#oc-dev-db-nix &
sleep 3
```

This starts **only the database** (with PostGIS) in the background — no app, no seeding. This is the correct way to start it for restore testing.

After starting, re-detect the socket dir and verify the connection works. If it still fails, tell the user to check their Nix setup.

**Important**: Do NOT use `nix run .#dev` (which starts the app + DB and seeds on startup) or bare `pg_ctl` (which starts Postgres without PostGIS).

### 3b: Confirm with user

Tell the user:
- "This will **drop and recreate** the local `opencouncil` database"
- "Your current local data (seed data, test data) will be lost"
- "You can recreate it later with `npx prisma db seed` or `nix run .#cleanup`"
- Ask: "Do you want to back up the current local DB first?"

If user wants a backup:
```bash
pg_dump -h /tmp/oc-pg-* -U opencouncil opencouncil | gzip > /tmp/opencouncil-local-backup-$(date +%Y%m%d-%H%M%S).sql.gz
```
Tell them the path.

## Step 4: Restore

### 4a: Drop and recreate the database

Force-disconnect any active connections, then drop and recreate:

```bash
# Terminate existing connections
psql -h /tmp/oc-pg-* -U opencouncil -d template1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'opencouncil' AND pid <> pg_backend_pid();"

# Drop and recreate
psql -h /tmp/oc-pg-* -U opencouncil -d template1 -c "DROP DATABASE opencouncil;"
psql -h /tmp/oc-pg-* -U opencouncil -d template1 -c "CREATE DATABASE opencouncil;"
```

### 4b: Restore the backup

```bash
gunzip -c "$ARGUMENTS" | psql -h /tmp/oc-pg-* -U opencouncil -d opencouncil 2>&1 | grep "^ERROR:" | sort | uniq -c | sort -rn > /tmp/restore_errors.txt
```

### 4c: Analyze errors

Read `/tmp/restore_errors.txt` and categorize:

**Harmless errors** (expected, ignore):
- `role "readandwrite" does not exist` — Aiven-specific roles
- `role "pgsync" does not exist` — Aiven replication role
- `role "readonly" does not exist` — Aiven read-only role
- `role "doadmin" does not exist` — DigitalOcean admin role
- `role "postgres" does not exist` — Aiven superuser
- `extension "aiven_extras" is not available` — Aiven-specific extension
- `extension "vector" is not available` — pgvector, not used locally

**Real errors** (indicate a problem):
- `syntax error at or near` — data spilled out of a failed COPY; means a table creation failed
- `relation already exists` — database wasn't clean before restore
- Any other ERROR not in the harmless list

If there are real errors, stop and report them. The restore is broken and needs investigation.

## Step 5: Apply Pending Migrations

If Step 2 identified pending migrations:

```bash
DATABASE_URL="postgresql://opencouncil@localhost:5432/opencouncil?host=/tmp/oc-pg-*" npx prisma migrate deploy
```

Verify all migrations applied successfully.

## Step 6: Verify Data Integrity

Run a comprehensive data check:

```bash
psql -h /tmp/oc-pg-* -U opencouncil -d opencouncil -c "
SELECT
  (SELECT count(*) FROM \"City\") AS cities,
  (SELECT count(*) FROM \"CouncilMeeting\") AS meetings,
  (SELECT count(*) FROM \"Person\") AS persons,
  (SELECT count(*) FROM \"Party\") AS parties,
  (SELECT count(*) FROM \"User\") AS users,
  (SELECT count(*) FROM \"Word\") AS words,
  (SELECT count(*) FROM \"Utterance\") AS utterances,
  (SELECT count(*) FROM \"Subject\") AS subjects,
  (SELECT count(*) FROM \"Notification\") AS notifications;
"
```

Flag any key tables with zero rows — they should all have data in a production backup.

Also check that PostGIS data survived:
```bash
psql -h /tmp/oc-pg-* -U opencouncil -d opencouncil -c "SELECT count(*) FROM \"City\" WHERE geometry IS NOT NULL;"
```

## Step 7: Clear Next.js Cache

Remove the `.next` directory so the app doesn't serve stale cached data from the previous database:

```bash
rm -rf .next
```

## Step 8: Summary Report

Present a final summary:

```
Backup Restore Test — [DATE]
=============================
Backup file:      [path] ([size])
Source PG version: [version from dump header]
Restore status:    SUCCESS / FAILED
Errors:            [N harmless, N real]
Migrations:        [N applied after restore]
Data:
  Cities:      [N] ([N with geometry])
  Meetings:    [N]
  Persons:     [N]
  Users:       [N]
  Words:       [N]
  Utterances:  [N]
  Subjects:    [N]

Next steps:
  - Restart `nix run .#dev` and browse the app to verify
  - When done, run `nix run .#cleanup` to reset to seed data

Post-restore:
  - .next cache cleared to avoid stale data
```

## Notes

- The backup is a plain SQL format (`pg_dump` without `-Fc`). This means we must restore into a clean/empty database — restoring on top of existing tables causes cascading COPY errors where data spills out as syntax errors.
- `nix run .#dev` seeds the database on startup. After a restore, the seed step may fail because tables already exist with data. This is fine — the app still works.
- To get back to normal local development after testing, run `nix run .#cleanup` to reset the database and re-seed.
- Use `nix run .#oc-dev-db-nix` to start only the database (with PostGIS) — not `nix run .#dev` (which also starts the app and seeds) or bare `pg_ctl` (which starts Postgres without PostGIS extensions).
- The socket directory path is `/tmp/oc-pg-XXXXXXXX` where the hash depends on the data directory. Discover it with `ls -d /tmp/oc-pg-* 2>/dev/null | head -1`.
