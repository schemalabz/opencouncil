# Database Seeding

This document explains the database seeding process and tools in detail.

## Overview

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
   - Podcast specs (with parts and utterance connections)

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

# City ID for test users (default: chania)
DEV_TEST_CITY_ID=chania
```

## Test Users

The seeding process automatically creates test users with different permission levels:

- **Super Admin**: Full access across all cities
- **City Admin**: Admin access to the configured test city
- **Party Admin**: Admin access to a specific party
- **Person Admin**: Admin access to a specific person
- **Read Only**: No administrative permissions

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
