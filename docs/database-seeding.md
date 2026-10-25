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

A restore that fails leaves the database empty, so the next run starts again from the beginning. A `reset` that fails keeps the data that it was to replace. `reset` applies the migrations of your checkout after the restore, so a migration that fails leaves the artifact in the database. Prisma then refuses every later run until you resolve the failed migration: run `npm run seed -- reset` again after you fix it, or run `npx prisma migrate resolve --rolled-back <migration>`. While a restore or a reset runs, a running app waits for the database.

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

- `npm run seed -- reset` replaces the tables, views, types, and functions in `public` with the artifact and adds the test accounts. It keeps the extensions, such as PostGIS.
- `--full` loads the full set: every content row of production, about 600 MB. The release does not hold it, so pass `--from` with the private location that the team uses.
- `--from` takes a local archive, a directory that holds one, or the base URL of another published artifact. `SEED_ARTIFACT_URL` sets the default.
- `npm run seed -- fetch` only downloads and checks. Downloads stay in `~/.cache/opencouncil/seed-artifacts/` (`$XDG_CACHE_HOME` when it is set). Every clone and worktree on the machine shares them, so a second restore of the same artifact reads nothing from the network. In Docker, the cache is in `.data/cache/` of the checkout.
- `--db` defaults to `DATABASE_URL`, from the environment or from `.env`.

Every `seed` command refuses a database that is not on this machine. `restore` refuses a database that already has tables, and an artifact with a migration that your checkout does not have: pull `main` first.

## Overview of `prisma/seed.ts`

Local setups no longer use `prisma/seed.ts` and `prisma/seed_data.json`. The previews of pull requests with migrations still seed from them, until previews load the seed artifact too.

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
   - Administrative bodies (includes `diavgeiaUnitIds`, `contactEmails`, etc.)
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

## Resetting Local Database

If you need to reset your local database and start fresh with a clean seeded database:

```bash
nix run .#cleanup
```

This command will:
- Remove `.data/postgres` (all local database files)
- Remove `.next` (Next.js build cache)

You'll be prompted for confirmation before deletion. After cleanup, run `nix run .#dev` again to create a fresh database with seeded data.
