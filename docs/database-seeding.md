# Database Seeding

This document explains the database seeding process and tools in detail.

## Seed artifacts

A seed artifact is a copy of the public content of production: every supported city, and the latest 2 released meetings of each administrative body with their transcripts, subjects, and decisions. It holds no accounts and no other personal data. `packages/seed-pipeline/README.md` explains how it is made and checked.

Every development setup prepares the database with `npm run db:deploy:seed`: `nix run .#dev`, `./run.sh` (Docker), and a manual setup. On an empty database, it:

1. downloads the latest published artifact (about 50 MB) and checks it against its manifest;
2. restores it and applies the migrations of your checkout;
3. generates the Prisma client and adds the test accounts (see [Test Users](#test-users)).

On a later run, it keeps your data. It applies new migrations and puts back any right of a test account that is missing. When the database has migrations but no meetings in a supported city, for example from the old seed, the run says so: `npm run seed -- reset` replaces it with the artifact.

The artifact is the only source of development data. The run stops and says what to do when:

- this machine has no PostgreSQL 16 client tools (`pg_restore`, `psql`), or no `tar` that reads zstd. The Nix and Docker setups include them. For a manual setup, install them, for example `apt install postgresql-client-16 zstd` or `brew install postgresql@16 zstd`. Put their `bin` directory first on `PATH`, or set `SEED_PG_BIN` to it;
- the artifact cannot be downloaded. Check the network, or pass `--from` with a local copy;
- the artifact has a migration that your checkout does not have. Pull `main`, or pass `--from` with an older release from [the releases page](https://github.com/schemalabz/opencouncil-seed-data/releases).

A restore that fails leaves the database empty, so the next run starts again from the beginning. A `reset` that fails keeps the data that it was to replace. `reset` applies the migrations of your checkout after the restore, so a migration that fails leaves the artifact in the database. The private rows then wait in the schema `seed_keep`. After the fix, `npm run seed -- reset` or `npm run seed -- setup` brings them back; `prisma migrate resolve` alone does not. A kept row that a new migration cannot take, such as one without a value for a new required column, stops every later carry: give the column a value in `seed_keep` by hand, or pass `--drop-private`. Prisma then refuses every later run until you resolve the failed migration: run `npm run seed -- reset` again after you fix it, or run `npx prisma migrate resolve --rolled-back <migration>`. While a restore or a reset runs, a running app waits for the database.

The client tools must be version 16. The artifact is a PostgreSQL 16 dump, which `pg_restore` 15 cannot read. These combinations were tested with it:

| `pg_restore` | Server 16 | Server 17 | Server 18 |
|---|---|---|---|
| 16 | works | works | works |
| 17, 18 | fails: the server does not know `transaction_timeout` | works | works |

Production, Nix, and Docker run version 16 for the client tools and the server.

The steps also run on their own:

```bash
npm run seed -- restore --db postgresql://opencouncil@localhost:5432/opencouncil
npm run seed -- fixtures --db postgresql://opencouncil@localhost:5432/opencouncil
```

- `npm run seed -- reset` replaces the tables, views, types, and functions in `public` with the artifact and adds the test accounts. It keeps the extensions, such as PostGIS. It also keeps the rows of every table that `tables.json` marks as private: accounts, rights, MCP tokens, notification settings. An artifact holds none of them, so without this a reset would drop them. A kept row that points at content that the artifact does not have, such as a right to a city that only this database has, is left out. A reader's address is a content row (`Location`), so a reset drops the addresses that readers entered on this database. The run reports how many rows it kept and which tables lost rows. `--drop-private` drops the private rows too.
- `--full` loads the full set: every content row of production, about 600 MB. The release does not hold it, so pass `--from` with the private location that the team uses.
- `--from` takes a local archive, a directory that holds one, or the base URL of another published artifact. `SEED_ARTIFACT_URL` sets the default.
- `npm run seed -- fetch` only downloads and checks. Downloads stay in `~/.cache/opencouncil/seed-artifacts/` (`$XDG_CACHE_HOME` when it is set). Every clone and worktree on the machine shares them, so a second restore of the same artifact reads nothing from the network. In Docker, the cache is in `.data/cache/` of the checkout.
- `--db` defaults to `DATABASE_URL`, from the environment or from `.env`.
- `nix run .#seed -- <command>` runs the same command from a Nix package, with no checkout and no `.env`: the package carries the schema, the migrations, a generated Prisma client, and the PostgreSQL 16 client tools. Pass `--db` explicitly. A preview host uses it to load the artifact into a preview's database.

Every `seed` command refuses a database that is not on this machine. `restore` refuses a database that already has tables, and an artifact with a migration that your checkout does not have: pull `main` first.

## Overview of `prisma/seed.ts`

Local setups and PR previews load the published seed artifact. The legacy JSON export and `prisma/seed.ts` commands below remain available for manual use. They no longer supply preview data.

The seeding process consists of two main components:
1. A seed data generator script (`scripts/generate_seed_dump.ts`)
2. A seeding script (`prisma/seed.ts`) that consumes the generated data

## Generating Seed Data

The `generate_seed_dump` script extracts a subset of data from an existing database to create seed data for development:

```bash
npx tsx scripts/generate_seed_dump.ts -s "postgresql://user:pass@host:port/db" -p chania/latest athens/latest
```

### Options

- `-s, --source`: Connection string for the source database (required)
- `-o, --output`: Path to save the JSON file (default: `./prisma/seed_data.json`)
- `-p, --pairs`: City/Meeting pairs to include (format: `cityId/meetingId` or `cityId/latest`)

Use the special value `latest` as meetingId to include the most recent meeting for a city:
```bash
npx tsx scripts/generate_seed_dump.ts -s "postgresql://db-url" -p athens/latest chania/latest
```

### Data Structure

The seed data follows a structure that avoids duplication and maintains clear relationships between entities:

1. **Core Entities**: Topics and cities are foundational and don't depend on other entities
2. **One-to-Many Relationships**: When an entity can have many related records (e.g., a person having multiple roles), the related records are included with the parent entity
3. **Entity References**: Instead of duplicating entity data, references to existing entities are used (e.g., a speaker segment referencing a speaker tag by ID)

## Seeding Process

The seeding process is handled by `prisma/seed.ts` which:

1. Checks for a local `seed_data.json` file
2. If not found, downloads it from the project's GitHub repository
3. Seeds the database with the data in dependency order
4. Creates synthetic task statuses for meetings with processed data
5. Creates predefined [test users for development](#test-users)
6. Prints a per-meeting summary table showing what was seeded

### Dependencies and Order

The seeding process follows a specific order to respect entity dependencies:

1. **Core Entities** (no dependencies)
   - Topics
   - Cities (includes `diavgeiaUid` and all config fields)

2. **City-Related Entities** (depend on cities)
   - Administrative bodies. They include `diavgeiaUnitIds`, the other body fields, and the documents that each body sends.
     - The recipient addresses stay out of the dump, so the seed restores each document switched off.
     - Before you try a send, switch the document on in the body form and add a To address.
     - In a dump from before #874, a non-empty `contactEmails` list becomes a transcript row, switched off, without its addresses.
   - Parties

3. **Person-Related Entities** (depend on cities and parties)
   - Persons
   - Roles
   - Speaker tags

4. **Meeting-Related Entities** (depend on cities, administrative bodies, and persons)
   - Meetings
   - Subjects (with locations via PostGIS)
   - Decisions (linked to subjects, from Diavgeia)
   - Speaker contributions
   - Speaker segments (with summaries, topic labels, subject connections)
   - Utterances and words
   - Highlights (with highlighted utterance connections)

5. **Post-Processing**
   - Task statuses (synthetic, based on meeting data state)
   - Voiceprints (depend on speaker segments and persons)
   - Consultations (hardcoded for Athens)
   - Test users

### Configuration

The seeding process can be configured through environment variables:

```bash
# URL to download seed data from if local file doesn't exist
SEED_DATA_URL=https://custom-url/seed_data.json

# Path to local seed data file
SEED_DATA_PATH=./custom/path/seed_data.json
```

## Test Users

The seeding process automatically creates test users with different permission levels:

- **Super Admin**: Full access across all cities
- **City Admin**: Admin access to every supported city
- **Party Admin**: Admin access to one party in each supported city: the party with the most roles
- **Person Admin**: Admin access to one person in each supported city, as a claim: the person with the most speaker segments that no other account has claimed
- **Body Admin**: Admin access to one administrative body in each supported city: the body with the most meetings, other than the council when the city has one
- **Read Only**: No administrative permissions

`src/lib/db/testUsers.ts` holds the only implementation. A run adds only what is missing, so it also puts back rights that a refresh removed. On a database restored from a seed artifact, run it with:

```bash
npm run seed -- fixtures --db postgresql://opencouncil@localhost:5432/opencouncil
npm run --silent seed -- status --db postgresql://opencouncil@localhost:5432/opencouncil --json
```

In development mode, a floating panel appears for instant user switching without email authentication.

## Refreshing staging

`scripts/seed/refresh-staging.sh` replaces staging's content with production's, from the newest SnapShooter dump. It keeps staging's accounts, rights, MCP tokens, and other private rows, as `reset` does. A refresh deletes the meetings and other content that people made on staging, and it leaves out the private rows that point at that content. The weekly run is manual for now.

You need:

- the Nix dev shell, which brings `rclone`, `greenmask`, and the PostgreSQL tools;
- the read-only rclone remote `oc-backups` for the backup bucket. Run `nix develop --command bash .claude/skills/test-backup/setup-remote.sh` once;
- `STAGING_DATABASE_URL`: the direct URL of staging's database (port 25060, not the pool), as a role that owns staging's objects and may create a schema;
- a checkout of the commit that staging runs. The script refuses a checkout whose newest migration is not staging's.

```bash
nix develop --command scripts/seed/refresh-staging.sh
```

The script:

1. makes a run directory `.data/staging-refresh.*` in the checkout, which only you can read, and downloads the newest production dump into it. It refuses a dump older than 30 hours, because SnapShooter runs every day;
2. runs `produce`, then deletes the dump, and runs `verify` (about 30 minutes together);
3. runs `seed reset --full` against staging (about 5 minutes);
4. deletes the run directory. When the reset fails or you stop the run, it keeps the verified artifact and prints the command that resets from it. `--keep` always keeps the run directory. `--from <run directory>` skips the first two steps and resets from a verified artifact.

A kept run directory holds production's content. Delete it after the next run succeeds. The script warns about each run directory that an earlier run left.

While the reset runs, staging does not answer, and its private tables are empty for a few seconds: a person who signs in then gets a new account, and the kept one, with its rights, is left out. Run it when nobody uses staging. The run adds the test accounts and the Serbian review city, and a right to that city is left out, because the fixtures add the city after the kept rows come back. For the same reason, every run reports 5 `_NotificationLocation` rows as left out: they link the test accounts to the fixture locations, and the fixtures add them again.

The reset waits at most one minute for each lock on a table. Then it stops and changes nothing. Its error lists the sessions that hold locks on its tables. A stalled app backend can hold a lock for hours: when the app does not answer, terminate that session (`SELECT pg_terminate_backend(<pid>)`). Then run the command that the script printed.

Afterwards, check the line that the run prints: how many private rows it kept, and which rows it left out and why. `reset` refuses a database named `production`, which the same cluster holds.

## Resetting Local Database

If you need to reset your local database and start fresh with a clean seeded database:

```bash
nix run .#cleanup
```

This command will:
- Remove `.data/postgres` (all local database files)
- Remove `.next` (Next.js build cache)

You'll be prompted for confirmation before deletion. After cleanup, run `nix run .#dev` again to create a fresh database with seeded data.
