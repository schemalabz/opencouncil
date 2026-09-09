# Elasticsearch Integration

This document describes how OpenCouncil uses Elasticsearch to provide powerful search capabilities for council meeting subjects. It covers the setup, configuration, and implementation details of our hybrid search system that combines traditional text search with semantic search.


### Table of Contents

1. [Overview](#overview)
2. [Codebase Structure](#codebase-structure)
3. [Set up Elasticsearch](#set-up-elasticsearch)
4. [Configure PostgreSQL Views](#configure-postgresql-views)
5. [Configure the Ingest Pipeline](#configure-the-ingest-pipeline)
6. [Set up PGSync](#set-up-pgsync)
   - [Deploying a Schema Change](#deploying-a-schema-change)
7. [Sync Data](#sync-data)
8. [Search Examples](#search-examples)
9. [Best Practices & FAQ](#best-practices--faq)


### Architecture Overview

The system uses a two-layer architecture:
1. **PostgreSQL**: Primary source of truth for all data
2. **PGSync**: Change data capture middleware that syncs PostgreSQL to Elasticsearch
3. **Elasticsearch**: Search layer that provides fast and flexible search capabilities

When searching:
1. Elasticsearch is used to find relevant subjects based on text queries and filters
2. The returned subject IDs are used to fetch complete data from PostgreSQL
3. This approach combines the best of both worlds:
   - Elasticsearch's powerful search capabilities
   - PostgreSQL's data integrity and relationships
   - Real-time sync via PGSync's logical decoding

**Data Filtering:**
- All subjects are synced to Elasticsearch, regardless of meeting release status
- The `meeting_released` field is included in each document
- Application queries should filter by `meeting_released: true` to show only public content
- This approach maintains real-time sync simplicity while providing flexibility for admin views

### Search Components

1. **Traditional Text Search**
   - Full-text search on subject names, descriptions, and speaker segments
   - Greek language support with proper analysis
   - Nested queries for speaker segments
   - Filtering by city, person, party, date, and location

2. **Semantic Search**
   - Uses Elasticsearch's `semantic_text` field type
   - Automatically handles embedding generation and search
   - Supports semantic search on:
     - Subject names
     - Subject descriptions
     - Concatenated speaker segment text

3. **Hybrid Search**
   - One scored Elasticsearch query, not a rank-fusion retriever
   - The lexical clauses share a single `bool.should`, so a document scores the sum of every field tier it matched (title, description, introducer, transcript, speaker name, location)
   - Every lexical clause is rescored to `base + k * log1p(bm25)`, so the fields that matched set the score level and raw BM25 stays a small within-tier tiebreak
   - A `combined_fields` gate in filter context decides eligibility across the union of the fields, so the term requirement is asked once per document instead of once per field
   - The semantic arm is a fallback. It competes with the lexical sum through `dis_max` (score = max), it is gated by a similarity cutoff, and it maps into the description tier's score range
   - A `function_score` multiplier then nudges among similar matches by administrative body, discussion length and recency
   - Typical `_score`: about 26 for a paraphrase-only semantic hit, about 150-210 for a title match
   - Configurable parameters:
     - `enableSemanticSearch`: adds the semantic fallback arm. The API route sets it to `true`
     - `semanticMinScore`: the similarity cutoff for that arm (default 0.930)

   RRF (Reciprocal Rank Fusion) is no longer used, and the `rank_window_size` and `rank_constant`
   knobs are gone with it. Rank fusion double-counted whichever document cleared the semantic cutoff,
   which reordered near-tied lexical matches. `src/lib/search/query.ts` holds the measured cases and
   the calibration of every constant above.

4. **Automatic Filter Derivation**
   - Intelligently extracts filters from natural language queries using AI
   - Automatically identifies and processes:
     - City references (e.g., "in Athens", "in Chania")
     - Date ranges (e.g., "last month", "in 2023")
     - Latest meeting indicators (e.g., "latest meeting")
     - Location names (e.g., "near Syntagma Square")
   - Resolves locations to coordinates using Google Maps API
   - Merges derived filters with explicit request filters
   - Supports both Greek and English city names


## Codebase Structure

The search functionality is implemented across several files:

1. **API Layer** (`src/app/api/search/route.ts`)
   - Handles HTTP requests and response formatting
   - Validates request parameters using Zod
   - Implements error handling and pagination

2. **Search Implementation** (`src/lib/search/`)
   - `index.ts`: orchestrates a search, hydrates the hits from PostgreSQL, and manages the Elasticsearch client
   - `query.ts`: builds the Elasticsearch query. Every scoring constant lives here, with the measurement behind it
   - `filters.ts`: derives filters from natural language with AI, and resolves a location name to coordinates
   - `hits.ts`: partitions the hits, and reports the ones no subject backs
   - `retry.ts`: retries a failed Elasticsearch call with exponential backoff

3. **Ranking eval harness** (`scripts/search-eval.ts`)
   - Runs a labeled query set against the live index through the production query builder
   - `--tier-margin` measures whether the field tiers still hold, or whether only the metadata holds them
   - Read-only. It issues `_search` calls and nothing else

4. **Types and Interfaces**
   - `SearchRequest`: Defines the search request structure
   - `SearchConfig`: Configures search behavior
   - `SearchResult`: Defines the search result structure
   - `SubjectDocument`: Maps Elasticsearch document structure



## Set up Elasticsearch

### 1. Create an Elasticsearch Instance

We use Elastic Cloud's serverless project for our Elasticsearch instance.

### 2. Configure Inference Endpoints

Before creating our index, we need to set up the inference endpoints for semantic search. Elasticsearch automatically creates a preconfigured `.multilingual-e5-small-elasticsearch` endpoint that can be used with the `semantic_text` field type. However, this endpoint comes with `adaptive_allocations` preconfigured with a maximum of 32 allocations, which can lead to unexpected costs during scaling when using the connector.

You can verify the existing inference endpoints using:

```json
GET _inference/
```

While Elasticsearch provides a default `.multilingual-e5-small-elasticsearch` endpoint, we create our own custom endpoint to have better control over resource allocation and costs. If you need to make changes to our custom endpoint, you must first delete it using:

```json
DELETE /_inference/text_embedding/opencouncil-multilingual-e5-small-elasticsearch?force=true
```

Then create our custom inference endpoint with controlled allocation settings:

```json
PUT _inference/text_embedding/opencouncil-multilingual-e5-small-elasticsearch
{
  "service": "elasticsearch",
  "service_settings": {
    "num_threads": 1,
    "model_id": ".multilingual-e5-small_linux-x86_64",
    "adaptive_allocations": {
      "enabled": true,
      "min_number_of_allocations": 0,
      "max_number_of_allocations": 1
    }
  }
}
```

This custom endpoint will be used in our index mapping to ensure predictable resource allocation and cost management.

### 3. Schema Configuration

The index mapping and sync configuration are defined in `elasticsearch/schema.json`. This file contains:
- Elasticsearch index mappings (field types, analyzers, etc.)
- PGSync node configuration (tables, relationships, transformations)

The schema is version-controlled, so any changes to the index structure are tracked in git.

To create the index with the mappings from `elasticsearch/schema.json`, PGSync will handle this automatically during bootstrap (see [Sync Data](#sync-data) section).

You can view the current mapping configuration in `elasticsearch/schema.json`.



## Configure PostgreSQL Views

PGSync requires helper views to denormalize complex relationships and handle PostGIS geometry conversion. We provide a SQL script that creates all required views and runs verification checks.

### Required Views

1. **LocationSearchView** - Converts PostGIS geometry to GeoJSON format
2. **IntroducedByPartyView** - Resolves party affiliation through the `Role` table
3. **SpeakerContributionSearchView** - Denormalizes speaker contributions
4. **SubjectMetricsView** - Precomputes the per-subject discussion metrics
5. **MeetingAdministrativeBodyView** - Flattens the Subject → CouncilMeeting → AdministrativeBody join and casts the type enum to text. Exposes only the id and the type, because search results hydrate the full body from PostgreSQL
6. **CitySearchView** - Casts the `Realm` enum to text. Every other `City` column reaches the index as a direct column

### Realm, Not Country

The index stores `city_realm` (`greece`, `france`, `cyprus`, `serbia`), not an ISO country code.

PostgreSQL holds no country column. `REALMS` in `src/lib/realm.ts` maps a realm to its country, and
`getRealmCountry()` reads that map. A `CASE` expression in SQL would copy the map into a second place
that no test covers, so a new realm would sync an empty or wrong country. A caller that needs the
country resolves it from `city_realm` in application code.

### Discussion Metrics

`SubjectMetricsView` precomputes two scalar fields, because a nested array costs a nested query to
aggregate at search time. They exist for score rescoring. The search API exposes no filter on them:

| Field | Meaning |
|-------|---------|
| `contributor_count` | Number of `SpeakerContribution` rows on the subject |
| `discussion_speaking_seconds` | Time the council spent speaking about the subject |

`contributor_count` counts rows, the same measure as `getContributionCount()` in `src/lib/utils.ts`.
A subject that predates the contribution pipeline reports zero contributors.

`discussion_speaking_seconds` repeats `getDiscussionSecondsForSubjects()` in `src/lib/db/subject.ts`, so
the index agrees with the number the subject page shows:

- **Source**: utterances tagged `SUBJECT_DISCUSSION`. The summarize task writes these tags.
- **Excluded**: procedural segments, which are not part of a discussion.
- **No tags**: a subject with no tagged utterance reports 0. Re-run the summarize task to populate
  the tags for a subject that predates them.

The sum covers the tagged utterances rather than the span from the first mention to the last, so a
subject that the council revisits reports the time spent on it. The name avoids the word "duration"
because `calculateMeetingDurationMs()` uses it for a wall-clock span.

> **Never name the root table in `base_tables`.** `SubjectMetricsView` is keyed on the subject id, so
> it is tempting to declare `base_tables: ["Subject"]`. That is what `SubjectSearchView` did, and it
> made PGSync route `Subject` DELETE events as child re-syncs, so deleted subjects stayed in the
> index. Declare only the tables the view actually reads.

### Create the Views

A Prisma migration creates the views. Every database that runs the migrations gets them: local,
preview, staging, and production. No environment needs a manual step, and a database that lacks a
view is a database that is behind on migrations.

`elasticsearch/views.sql` stays the definition that you read and edit. It stays runnable too, and
the E2E harness runs it unchanged:

```bash
psql "$DATABASE_URL" < elasticsearch/views.sql
```

The file creates the views, runs verification checks on each one, and prints sample data.

View the full view definitions and verification logic in `elasticsearch/views.sql`.

### Carry a View Change into a Migration

After you edit `views.sql`, generate the migration that applies the change:

```bash
npx prisma migrate dev --create-only --name essync_<what_changed>
npm run views:migration
```

The first command creates an empty migration and names it. The `essync_` segment marks the
migration as generated. The second command writes the view DDL from `views.sql` into that
migration. It removes the comments, the `\echo` meta-commands, and the verification checks,
because a migration runs over a plain database connection that rejects psql meta-commands. It also
emits a `DROP VIEW IF EXISTS` for a view that `views.sql` no longer defines. It finds such a
removal by comparing the view names with the newest generated migration.

Commit `views.sql` and the migration together. The test
`src/lib/search/__tests__/view-migration.test.ts` regenerates the migration from `views.sql` and
compares the result with the newest generated migration, so CI fails when a view change carries no
migration. See issue #638.

**`CREATE OR REPLACE VIEW` cannot remove a column.** `views.sql` is written to be re-runnable, so it
uses `CREATE OR REPLACE`. To drop or rename a view column, add an explicit `DROP VIEW IF EXISTS` above
the view definition, as the removal of `SubjectSearchView` did.

**Migrations and views can collide.** PostgreSQL refuses to drop or retype a table column that a view
reads — and Prisma migrations run at build time on production, so a blocked migration is a failed
release. A migration that drops or retypes a column used by a view in `views.sql` must `DROP VIEW IF
EXISTS` that view first. Then update `views.sql` and generate the `essync_` migration that recreates
the view without the column: its timestamp is newer, so it runs after the migration that dropped the
column. Every database now carries the views, so the collision also stops a local `prisma migrate
dev` and the shadow database. It no longer waits for production. A **rename**
does not error: PostgreSQL rewrites the stored view definition silently, and the live view then drifts
from `views.sql` while `schema.json` still names the old column. Treat a rename of any column a view
reads as a schema change — update `views.sql` and `schema.json` together and redeploy.



## Configure the Ingest Pipeline

Subject descriptions, speaker contributions, and segment summaries contain markdown REF links (`[text](REF:TYPE:ID)`). The database keeps the raw markdown, because the frontend renders these links. The search index must not contain them: the markup adds noise tokens and it degrades the `semantic_text` embeddings (see the [FAQ on REF links](#best-practices--faq)).

An Elasticsearch [ingest pipeline](https://www.elastic.co/guide/en/elasticsearch/reference/current/ingest.html) named `strip-refs` removes the links at index time. PGSync attaches the pipeline to every document it writes, through the top-level `"pipeline": "strip-refs"` key in `elasticsearch/schema.json`. The pipeline runs before analysis and before `semantic_text` inference, so tokens and embeddings both come out clean. Delete operations do not use the pipeline and are unaffected.

The pipeline definition lives in [`elasticsearch/pipeline.json`](./pipeline.json). It uses one `gsub` processor for `description` and a `foreach` processor for the nested array (`speaker_contributions.text`), because a plain `gsub` does not iterate arrays of objects.

### Create or Update the Pipeline

The pipeline is a cluster-level object. Create it once per cluster. The same command also updates it, because `PUT` replaces the stored definition:

```bash
curl -X PUT "$ELASTICSEARCH_URL/_ingest/pipeline/strip-refs" \
  -H "Authorization: ApiKey $ELASTICSEARCH_API_KEY" \
  -H "Content-Type: application/json" \
  -d @elasticsearch/pipeline.json
```

**Order matters:** create the pipeline before PGSync runs with a schema that references it. If the pipeline is missing, every bulk write fails.

### Verify the Pipeline

Check that the stored definition matches the repository file:

```bash
curl "$ELASTICSEARCH_URL/_ingest/pipeline/strip-refs" \
  -H "Authorization: ApiKey $ELASTICSEARCH_API_KEY"
```

Simulate the pipeline against a sample document and confirm the REF links are stripped:

```bash
curl -X POST "$ELASTICSEARCH_URL/_ingest/pipeline/strip-refs/_simulate" \
  -H "Authorization: ApiKey $ELASTICSEARCH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "docs": [{"_source": {
      "description": "Ενημέρωση από [τον Δήμαρχο](REF:PERSON:abc123) για το θέμα",
      "speaker_contributions": [{"text": "Αναφορά στην [εισήγηση](REF:UTTERANCE:xyz789)."}]
    }}]
  }'
```

Expected output: `"description": "Ενημέρωση από τον Δήμαρχο για το θέμα"` and `"text": "Αναφορά στην εισήγηση."`.

### Scope and Re-indexing

- The pipeline transforms documents at index time only. PostgreSQL keeps the raw markdown.
- Existing documents keep their old text until they are re-indexed. Run a PGSync bootstrap to apply the pipeline to all documents.
- To strip an additional field, add a processor to `pipeline.json`, run the `PUT` command again, and re-index.



## PGSync Setup and Data Synchronization

[PGSync](https://github.com/toluaina/pgsync) is a change data capture (CDC) tool that syncs PostgreSQL to Elasticsearch using logical replication. It runs as a separate service in the [opencouncil-tasks](https://github.com/schemalabz/opencouncil-tasks) repository.

### Schema Configuration

> **Important**: The sync configuration is defined in `elasticsearch/schema.json`. A change to this file
> changes the structure of the documents in Elasticsearch. Some changes need a new index; most do not.
> See [Deploying a Schema Change](#deploying-a-schema-change).

The `elasticsearch/schema.json` file defines:
- **Index mapping**: Elasticsearch field types, analyzers
- **Ingest pipeline**: the top-level `pipeline` key names the pipeline that Elasticsearch runs on every indexed document (see [Configure the Ingest Pipeline](#configure-the-ingest-pipeline))
- **Nodes**: PostgreSQL tables and their relationships  
- **Transform rules**: Field renaming, scalar vs object variants
- **Children**: Nested relationships (e.g., speaker_contributions)

> **Edit `schema.json` as text.** The file is hand-formatted in a compact one-line style. A round-trip
> through a JSON parser reformats every line and turns a small change into a diff of hundreds of lines
> that buries the real edit. Make targeted text edits only.

**Resources for understanding the schema:**
- [PGSync Schema Documentation](https://pgsync.com/schema/) - Official guide to schema configuration
- [PGSync Examples](https://github.com/toluaina/pgsync/tree/main/examples) - Example schemas for various use cases

### Deploying a Schema Change

PGSync sends the `mapping` block from `schema.json` **only when it creates the index**
(`pgsync/search_client.py`, `if not indices.exists(...)`). On an index that already exists the block is
inert: a changed mapping never reaches it, and a new field gets its type from dynamic mapping the
moment a document carries it. Both failure modes disappear on the one path where the block does apply —
index creation.

**Every schema change therefore deploys as a rebuild**: bump the versioned index name in `schema.json`
and follow the rebuild procedure above. A full rebuild of the corpus takes minutes, search stays
available throughout (the alias serves the old index until the swap), and re-writing unchanged text is
absorbed by the inference cache. There is no cheaper deploy path worth maintaining.

**The views travel with the release.** A change to `views.sql` reaches production as a Prisma
migration, and migrations run at build time, so the release applies the views to every database. The
daemon reads `schema.json` from the production branch, so the release also carries the schema. The
`/es-deploy` skill compares the live views with `views.sql` and reports drift. It no longer applies
them.

#### Verify (after the bootstrap, before the alias swap)

```bash
# the index matches the repository: no undeclared fields, no type conflicts
diff <(python3 -c "import json;print('\n'.join(sorted(json.load(open('elasticsearch/schema.json'))[0]['mapping'])))") \
     <(curl -sS -H "$AUTH" "$ELASTICSEARCH_URL/$IDX/_mapping" \
       | python3 -c "import json,sys;print('\n'.join(sorted(k for k in list(json.load(sys.stdin).values())[0]['mappings']['properties'] if k!='_meta')))")

# a keyword field aggregates. A field that fell back to `text` fails here.
curl -sS -H "$AUTH" -H "$JSON" "$ELASTICSEARCH_URL/$IDX/_search?size=0" \
  -d '{"aggs":{"t":{"terms":{"field":"administrative_body_type"}}}}'
```

Then spot-check a document that predates the change, and confirm a semantic query still returns its
usual results.

`_cat/indices` reports `docs.count` including nested documents. Use `_count` for the number of subjects.

#### Measuring inference

When sizing or verifying a re-index, measure real embedding work, not cache hits:

- `inference_count` from `GET _ml/trained_models/<inference_id>/_stats` **includes cache hits**. Compute
  Δ`inference_count` − Δ`cache_hits`.
- The cache is per-allocation and resets when the allocation recycles, so a repeat write of unchanged
  text that looks free in a measurement still costs inference in a real migration.
- Record `node.start_time` on both sides of a measurement and discard the delta if it changed — the
  counters are scoped to the current allocation and restart at zero.

### Deployment and Sync Operations

PGSync setup, deployment, and sync operations are managed separately in the opencouncil-tasks repository. See the [PGSync Setup Guide](https://github.com/schemalabz/opencouncil-tasks/blob/main/docs/pgsync-setup.md).

### Testing Schema Changes

When making changes to `elasticsearch/schema.json` or `elasticsearch/views.sql`, use the E2E testing workflow to validate them locally before deploying.

**What gets tested:**
- `views.sql` creates valid PostgreSQL views
- `schema.json` is valid and PGSync can parse it  
- The views output matches what `schema.json` expects (columns, relationships)
- Documents are correctly indexed to Elasticsearch
- Live sync works (changes in DB appear in search results)
- WAL monitoring detects the replication slot

**How it works:**

```
┌─────────────────────────────────────────────────────────────┐
│                    opencouncil repo                         │
│                                                             │
│  elasticsearch/schema.json  ─┐                              │
│  elasticsearch/views.sql    ─┼── Defines ES index structure │
│  prisma/seed_data.json      ─┘   and data transformations   │
│                                                             │
│  ELASTICSEARCH_INDEX=subjects_test nix run .#dev            │
│    ├── Local PostgreSQL (wal_level=logical)                 │
│    └── Next.js App ───────────────────────────────┐         │
└───────────────────────────────────────────────────│─────────┘
                              │                     │
         PGSync reads schema, │                     │ App queries
         syncs via WAL        │                     │ test index
                              ▼                     │
┌─────────────────────────────────────────────────────────────┐
│                  opencouncil-tasks repo                     │
│                                                             │
│  ./scripts/pgsync-test.sh --daemon                          │
│    1. Creates views in DB (from opencouncil repo)           │
│    2. Bootstraps initial data to ES                         │
│    3. Runs PGSync daemon (continuous sync)                  │
│                                                             │
│  ./scripts/check-wal.sh  ─── WAL monitoring                 │
└─────────────────────────────────────────────────────────────┘
                              │                     │
                              ▼                     │
┌─────────────────────────────────────────────────────────────┐
│              Elasticsearch (test index)                     │
│                                                             │
│  subjects_test  ◄─────────────────────────────────┘         │
│    - Indexed seed data                                      │
│    - Live sync from DB changes                              │
│    - Queried by app at /search                              │
└─────────────────────────────────────────────────────────────┘
```

#### Setup (one-time)

1. **Configure opencouncil-tasks `.env`:**

   ```bash
   # PostgreSQL - local Nix DB
   # IMPORTANT: From inside Docker, "localhost" refers to the container, not your host.
   # Use host.docker.internal (macOS/Windows) or 172.17.0.1 (Linux Docker bridge)
   PG_URL=postgresql://opencouncil@host.docker.internal:5432/opencouncil
   # Or on Linux: postgresql://opencouncil@172.17.0.1:5432/opencouncil
   
   # Elasticsearch
   ELASTICSEARCH_URL=https://your-cluster.es.region.cloud:443
   ELASTICSEARCH_API_KEY_ID=<id>
   ELASTICSEARCH_API_KEY=<secret>
   
   # Path to opencouncil repo (relative to opencouncil-tasks)
   OPENCOUNCIL_REPO=../opencouncil
   ```

#### Running E2E Tests

**Terminal 1 (opencouncil):** Start local DB and app with test index

```bash
ELASTICSEARCH_INDEX=subjects_test nix run .#dev
# Wait for seeding to complete (watch the TUI logs)
```

**Terminal 2 (opencouncil-tasks):** Start PGSync daemon

```bash
OPENCOUNCIL_REPO=../opencouncil ./scripts/pgsync-test.sh --daemon
```

Once PGSync completes the initial bootstrap, your app is ready. You can now:

- Make changes to the local DB (via the app or `psql`)
- PGSync syncs them to `subjects_test` in real-time
- Search at `/search` uses the test index

Press Ctrl+C in the PGSync terminal to stop. The Redis container is automatically cleaned up.

#### Testing Live Sync (Important)

**Bootstrap vs Live Sync behave differently.** Bootstrap reads directly from views where columns are already transformed. Live sync receives WAL events with original table column names, then must map them to view columns.

Always test both:

1. **Bootstrap test**: Initial indexing when PGSync starts (uses view data directly)
2. **Live sync test**: Insert/update records after PGSync is running (uses WAL events)

**Testing live sync for nested/child relationships:**

When adding new nested fields (like `speaker_contributions`), the bootstrap may succeed even with an empty table. You must also test live sync by inserting data while PGSync is running.

Key behaviors to understand:

- **Child table changes may not auto-trigger parent re-sync**: When you insert into a child table (e.g., `SpeakerContribution`), PGSync detects the change but may not automatically re-index the parent document (`Subject`). You may need to update the parent record to trigger the full document re-sync.

- **WAL events use base table column names**: If your view aliases `id` to `contribution_id`, the WAL event still sends `id`. The schema's `primary_key` must match what WAL sends, then use `transform.rename` to map to the desired Elasticsearch field name.

**Example live sync test:**

```bash
# 1. Find a subject without contributions
psql "$PSQL_URL" -c "SELECT s.id, s.name, p.id as person_id, p.name 
  FROM \"Subject\" s 
  JOIN \"Person\" p ON p.\"cityId\" = s.\"cityId\" 
  WHERE NOT EXISTS (SELECT 1 FROM \"SpeakerContribution\" sc WHERE sc.\"subjectId\" = s.id) 
  LIMIT 3;"

# 2. Insert a contribution (replace IDs with actual values)
psql "$PSQL_URL" -c "INSERT INTO \"SpeakerContribution\" (id, text, \"subjectId\", \"speakerId\", \"createdAt\", \"updatedAt\") 
  VALUES ('test-contrib-1', 'Test contribution text.', '<SUBJECT_ID>', '<PERSON_ID>', NOW(), NOW());"

# 3. Watch PGSync logs - if stuck at Db: [N] but Elasticsearch: [0], trigger parent update:
psql "$PSQL_URL" -c "UPDATE \"Subject\" SET \"updatedAt\" = NOW() WHERE id = '<SUBJECT_ID>';"

# 4. Verify in Elasticsearch
curl -s "$ELASTICSEARCH_URL/subjects_test/_doc/<SUBJECT_ID>" \
  -H "Authorization: ApiKey $ELASTICSEARCH_API_KEY" | jq '._source.speaker_contributions'
```

#### Testing WAL Monitoring

With PGSync running in daemon mode, you can test the full WAL monitoring lifecycle: accumulation and drain. This helps understand how WAL behaves in production.

**Understanding WAL behavior:** PGSync uses logical replication, which only processes changes to tables defined in its schema. However, PostgreSQL retains WAL files for *all* database changes until PGSync advances its bookmark by processing a change it cares about. This means unrelated table changes accumulate WAL that only drains when you modify a synced table.

**Step 1: Start continuous WAL monitoring**

Set up a loop that runs `check-wal.sh` every 10 seconds with low thresholds for testing:

```bash
# From opencouncil-tasks repo (in a new terminal)
# Use low thresholds (warn at 5MB, critical at 10MB) to trigger alerts faster
while true; do WAL_WARNING_THRESHOLD_GB=0.03 WAL_CRITICAL_THRESHOLD_GB=0.05 ./scripts/check-wal.sh; sleep 10; done
```

You should see output showing the healthy replication slot:

```
✓ Slot 'subjects_test' (logical) healthy: 0MB retained, status: reserved, active: true
```

**Step 2: Generate WAL with unrelated changes**

While PGSync is still running, create a test table and insert data. Since this table isn't in PGSync's schema, changes accumulate WAL but PGSync ignores them:

```bash
# In opencouncil repo (nix develop shell)
# Create a test table (not synced by PGSync)
psql "$PSQL_URL" -c "CREATE TABLE IF NOT EXISTS wal_test (id bigserial primary key, payload text, ts timestamptz default now());"

# Generate ~5MB of WAL (run multiple times to accumulate more)
psql "$PSQL_URL" -c "INSERT INTO wal_test (payload) SELECT repeat(md5(random()::text), 10) FROM generate_series(1, 50000);"
```

Watch the monitoring output - WAL retained grows even though PGSync is running:

```
✓ Slot 'subjects_test' (logical) healthy: 5.2MB retained...
⚠️  WARNING: Slot 'subjects_test' (logical) has 8.4MB WAL retained (threshold: 0.005GB)
🚨 CRITICAL: Slot 'subjects_test' (logical) has 12.1MB WAL retained (threshold: 0.01GB)
```

**Step 3: Trigger WAL drain with a synced table change**

Now make a change to a table PGSync *does* care about. This causes PGSync to process the change and advance its WAL bookmark:

```bash
# Update a Subject (synced by PGSync) - this triggers WAL drain
psql "$PSQL_URL" -c "UPDATE \"Subject\" SET \"updatedAt\" = NOW() WHERE id = (SELECT id FROM \"Subject\" LIMIT 1);"
```

Or make a change through the app UI (e.g., add a meeting, or process agenda).

Watch the monitoring output over the next few check cycles - WAL retained will gradually drop:

```
✓ Slot 'subjects_test' (logical) healthy: 12.1MB retained, status: reserved, active: false
✓ Slot 'subjects_test' (logical) healthy: 8.4MB retained, status: reserved, active: false
✓ Slot 'subjects_test' (logical) healthy: 0.8MB retained, status: reserved, active: false
```

> **Note:** WAL cleanup isn't instant. PostgreSQL releases WAL files during checkpoints, which happen periodically (default every 5 minutes or when WAL reaches a threshold). You may need to wait 30-60 seconds to see the full drain.

**Step 4: Verify search sync**

Check that the change appears in search results at `/search`, confirming the full pipeline works.

**Cleanup:**

```bash
# Stop the monitoring loop (Ctrl+C)
# Drop the test table
psql "$PSQL_URL" -c "DROP TABLE IF EXISTS wal_test;"
```

For more details on WAL monitoring, thresholds, and production alerts, see the [PGSync Setup Guide](https://github.com/schemalabz/opencouncil-tasks/blob/main/docs/pgsync-setup.md#wal-monitoring-setup).

#### Quick Validation (Views Only)

For rapid iteration on view changes without running PGSync:

```bash
# Enter Nix dev shell (includes psql)
nix develop

# Create views against your database
psql "$PSQL_URL" < elasticsearch/views.sql

# Run validation queries
psql "$PSQL_URL" < elasticsearch/validate-views.sql

# When the change is final, generate the migration that carries it
npx prisma migrate dev --create-only --name essync_<what_changed>
npm run views:migration
```

#### Cleanup

```bash
# Delete the test index
curl -X DELETE "$ELASTICSEARCH_URL/subjects_test" -H "Authorization: ApiKey ..."

# Or use the cleanup flag for one-time bootstrap tests
./scripts/pgsync-test.sh --cleanup

# Reset local database and build cache (from opencouncil repo)
nix run .#cleanup
```

## Staging

Staging has **read-only search against the production `subjects` index** — there is no staging index and no staging sync pipeline. This works because the staging database is hydrated from production (`scripts/copy_db.sh`), so the production index approximately matches it.

Configuration on the staging app:
- `ELASTICSEARCH_URL`: the production Elastic Cloud endpoint
- `ELASTICSEARCH_API_KEY`: a dedicated key restricted to `read` on `subjects` (staging structurally cannot mutate the index)
- `ELASTICSEARCH_INDEX`: unset (defaults to `subjects`)
- `DEPLOYMENT_ENV=staging`

**Drift semantics:** hits whose subject no longer exists in the connected database are dropped from results (see `src/lib/search/hits.ts`). On production such orphans indicate a sync bug and trigger a Discord alert; on staging/preview they are expected (anything indexed after the last hydration) and only log a warning. Data edited on staging does not appear in staging search results.

**What staging does NOT cover:** changes to the indexing pipeline itself (`schema.json`, `views.sql`) — use the local E2E workflow above. If rehearsing a full re-index against staging-scale data ever becomes necessary, the options are a one-shot PGSync bootstrap against the staging DB into a separate index (drop the replication slot afterwards!) or a server-side `_reindex` copy of the prod index.

## Search Examples

### 1. Simple Text Search

A hand-written query for exploring the index from Kibana. The app does not build this one — see
[Hybrid Search](#2-hybrid-search) for the query it emits.

```json
GET subjects/_search
{
  "query": {
    "bool": {
      "should": [
        {
          "multi_match": {
            "query": "ηλεκτρικά πατίνια",
            "fields": [
              "name^4",
              "description^3"
            ],
            "type": "best_fields",
            "operator": "or"
          }
        },
        {
          "nested": {
            "path": "speaker_contributions",
            "query": {
              "match": {
                "speaker_contributions.text": {
                  "query": "ηλεκτρικά πατίνια",
                  "boost": 2
                }
              }
            },
            "inner_hits": {
              "_source": ["speaker_contributions.contribution_id"]
            }
          }
        }
      ],
      "minimum_should_match": 1,
      "filter": [
        {
          "term": {
            "meeting_released": true
          }
        },
        {
          "terms": {
            "city_id": ["athens", "chania"]
          }
        }
      ]
    }
  }
}
```

Key features of this query:
- Uses `multi_match` with `operator: "or"` for more lenient matching
- Boosts subject name matches (^4) and description matches (^3)
- Uses `nested` query to search within speaker segments
- Searches both `text` and `summary` fields in speaker segments
- Uses `inner_hits` to get IDs of matching speaker segments
- Filters by `meeting_released: true` to show only subjects from released meetings
- Filters results by city IDs

### 2. Hybrid Search

This is the query `buildSearchQuery` emits for a text search with the semantic arm on. It is one
scored query. There is no `rrf` retriever, and there are no `rank_window_size` or `rank_constant`
knobs.

The block below is **abbreviated**: it keeps one clause of each kind and drops the repeats, so it
shows the structure rather than a request you can paste. `src/lib/search/query.ts` is the source of
truth, and the full request is one `console.log` away from a unit test.

```jsonc
GET subjects/_search
{
  "size": 10,
  "from": 0,
  "track_total_hits": true,
  "query": {
    // Post-relevance multiplier: administrative body x discussion length x recency.
    // It nudges among similar matches, so it multiplies a relevance score and never
    // stands in for one. The filter-only browse path omits it and sorts by date.
    "function_score": {
      "boost_mode": "multiply",
      "functions": [{ "script_score": { "script": {
        "source": "<Painless: adminWeight * discussionFactor * recencyFactor>",
        "params": {
          "councilWeight": 1.15, "committeeWeight": 1.075, "communityWeight": 1.0,
          "defaultAdminBodyWeight": 1.0, "discussionWeight": 0.03,
          "recencyWeight": 0.1, "recencyScaleDays": 365, "nowMillis": 1787242196648
        }
      }}}],
      "query": {
        "bool": {
          // Hard filters, applied to both arms.
          "filter": [
            { "term": { "meeting_released": true } },
            { "terms": { "city_id": ["athens", "chania"] } }
          ],
          "must": [{
            // Lexical sum vs. semantic fallback, score = max. tie_breaker 0: strong
            // lexical matches sit ~2% apart, so any share of the semantic score
            // would reorder them.
            "dis_max": {
              "tie_breaker": 0,
              "queries": [
                {
                  "bool": {
                    "minimum_should_match": 1,
                    // Coverage gate, in filter context: it decides which documents are
                    // eligible and contributes no score. The term requirement is asked
                    // once across the union of the flat fields. The nested fields cannot
                    // join a combined_fields, so they stand as their own alternatives.
                    "filter": [{
                      "bool": {
                        "minimum_should_match": 1,
                        "should": [
                          {
                            "combined_fields": {
                              "query": "ηλεκτρικά πατίνια",
                              "fields": ["name", "description", "introduced_by_person_name", "location_text"],
                              "minimum_should_match": "2<75%"
                            }
                          },
                          {
                            "match": {
                              "name": {
                                "query": "ηλεκτρικά πατίνια",
                                "fuzziness": "AUTO:4,10",
                                "prefix_length": 2,
                                "minimum_should_match": "2<75%"
                              }
                            }
                          }
                          // ... plus a nested alternative over speaker_contributions.text
                          // and speaker_contributions.speaker_person_name, and one copy of
                          // every alternative per alternate spelling of the query.
                        ]
                      }
                    }],
                    // Scoring. Every clause is rescored to its tier band, so the score
                    // says WHICH fields matched. A document collects the tier of every
                    // clause it matches, and its score is that sum.
                    "should": [
                      {
                        "function_score": {
                          "boost_mode": "replace",
                          "query": { "match": { "name": { "query": "ηλεκτρικά πατίνια", "minimum_should_match": "2<75%" } } },
                          "functions": [{ "script_score": { "script": {
                            "source": "params.base + params.k * Math.log1p(_score)",
                            "params": { "base": 26, "k": 3.9 }
                          }}}]
                        }
                      },
                      {
                        "function_score": {
                          "boost_mode": "replace",
                          "query": { "match": { "name": { "query": "ηλεκτρικά πατίνια", "minimum_should_match": 1 } } },
                          "functions": [{ "script_score": { "script": {
                            "source": "params.base + params.k * Math.log1p(_score)",
                            "params": { "base": 14, "k": 2.1 }
                          }}}]
                        }
                      }
                      // ... plus the same pair for description, introduced_by_person_name,
                      // the nested transcript and the nested speaker name; the two phrase
                      // clauses; the fuzzy name clause; and location_text when the AI
                      // extracted a place.
                    ]
                  }
                },
                {
                  // Semantic fallback. The two sub-fields combine with dis_max, so the
                  // cutoff reads a plain similarity of the best field rather than an
                  // agreement between both. The script maps that similarity into the
                  // description tier's score range, and min_score drops everything below
                  // the cutoff, which is what keeps off-topic queries empty.
                  "function_score": {
                    "boost_mode": "replace",
                    "min_score": 26,
                    "query": {
                      "dis_max": {
                        "tie_breaker": 0,
                        "queries": [
                          { "semantic": { "query": "ηλεκτρικά πατίνια", "field": "name.semantic" } },
                          { "semantic": { "query": "ηλεκτρικά πατίνια", "field": "description.semantic" } }
                        ]
                      }
                    },
                    "functions": [{ "script_score": { "script": {
                      "source": "Math.max(params.base + (_score - params.cutoff) * params.scale, 0)",
                      "params": { "base": 26, "cutoff": 0.93, "scale": 320 }
                    }}}]
                  }
                }
              ]
            }
          }]
        }
      }
    }
  }
}
```

#### Field tiers

A clause's tier is the score level it awards. The pair of numbers is `base + k * log1p(bm25)`, so
`base` sets the level and `k` sizes the within-tier tiebreak. Each term clause splits into a strict
half (the field covers the query) and a partial half (the field matches one term), 65% and 35% of the
tier. Both fire on a full match, so a covering field totals its tier exactly.

| Clause | base | k |
|--------|------|---|
| `name` term | 40 | 6 |
| `introduced_by_person_name` term | 28 | 4 |
| `name` phrase | 20 | 3 |
| `description` term | 15 | 4 |
| `description` phrase | 8 | 2 |
| `speaker_contributions.text` term | 6 | 3 |
| `name` fuzzy | 4 | 2 |
| `location_text` term | 3 | 1 |
| `speaker_contributions.speaker_person_name` term | 0.3 | 0.2 |
| semantic fallback (mapped) | 26 | — |
| geo proximity (added once) | 2 | — |

The tiers are additive, so a stack of low tiers can reach a high one. Whether title matches still
lead is a property of the corpus, so it is measured rather than assumed:

```bash
SKIP_ENV_VALIDATION=1 npx tsx scripts/search-eval.ts --tier-margin
```

Run it after you change any base, any `k`, or any multiplier weight.

## Best Practices & FAQ

### Best Practices

1. **Search Configuration**
   - Use hybrid search for best results by setting `enableSemanticSearch: true`
   - Leave `semanticMinScore` alone unless you sweep it first: `npx tsx scripts/search-eval.ts --min-score <value>` reports where on-topic queries start to go empty and junk queries stop
   - Use filters to narrow down results and improve performance

2. **Performance Optimization**
   - Use pagination to limit result size (default: 10 results per page)
   - Implement proper caching strategies for frequently used queries
   - Monitor search performance using Elasticsearch metrics
   - Optimize filter combinations to reduce result set size
   - Use field boosting (e.g., `public_subject_name^3`) for better relevance

3. **Error Handling**
   - Handle common Elasticsearch errors in your application code
   - Implement proper logging for debugging and monitoring
   - Provide meaningful error messages to users
   - Implement retry mechanisms for transient failures
   - Validate input parameters using Zod schemas

4. **Data Consistency**
   - PGSync automatically keeps Elasticsearch in sync with PostgreSQL via logical replication
   - Monitor PGSync logs for sync errors or lag
   - PGSync uses Redis to checkpoint its position in the WAL stream
   - Changes are synced in near real-time (typically sub-second latency)

5. **Security**
   - Use API keys for authentication
   - Implement proper access control
   - Validate and sanitize user input
   - Monitor for suspicious activity
   - Keep Elasticsearch version up to date

### FAQ

**Q: Why do views keep original column names like `id` instead of aliasing to `contribution_id`?**  
A: PGSync's live sync receives WAL events with the base table's original column names. If your view aliases `id` to `contribution_id`, but WAL sends `id`, PGSync fails to match the primary key. The solution:
1. Keep the original column name in the view (e.g., `sc.id` not `sc.id AS contribution_id`)
2. Set `primary_key` in schema.json to match the WAL column name (`["id"]`)
3. Use `transform.rename` to map to the desired Elasticsearch field name (`"id": "contribution_id"`)

This ensures bootstrap (reads from view) and live sync (reads from WAL) both work correctly.

**Q: When do the discussion metrics refresh?**  
A: PGSync rebuilds the whole document when it re-syncs a `Subject`, and it re-syncs a `Subject` only when
the `Subject` row itself changes. A change to a child table does not trigger it, whatever `base_tables`
declares (see [Testing Live Sync](#testing-live-sync-important)) — the aggregate source rows carry their
own primary keys, which cannot match a subject id.

Both metrics therefore depend on their data committing together with a `Subject` write:

- `contributor_count` — `saveSubjectsForMeeting` writes the subjects and their contributions in one
  transaction, so the count is always current.
- `discussion_speaking_seconds` — the summarize task's utterance discussion tags are applied inside that
  same transaction for this reason. Written afterwards, they would never reach the index and every newly
  summarized subject would report 0.

So a writer that changes an utterance's discussion tag must do it alongside the subject write. Test both
bootstrap and live sync after you change the aggregates in `SubjectMetricsView`. Touch the parent `Subject`
row if the numbers look stale.

**Q: Why does an edit to an administrative body not appear in search?**  
A: `MeetingAdministrativeBodyView` has the primary key `(id, cityId)` of `CouncilMeeting`, so only
`CouncilMeeting` is declared as its base table. Moving a meeting to another body is a `CouncilMeeting`
write and syncs on its own. Editing the body row is not, so a type change reaches the index only when the
meeting or one of its subjects is next written.

A rename needs no sync at all: the index stores `administrative_body_id` and `administrative_body_type`
and no names, because search results hydrate the full body from PostgreSQL. Only a corrected `type` goes
stale, and it self-heals on the next write to the meeting or the subject. Update the `Subject` row to
force it sooner.

**Q: How is the speaker segments text concatenated?**  
A: The `SpeakerContributionSearchView` view exposes one row per speaker per subject. PGSync reads from this view and indexes the contribution text.

**Q: How do I handle updates to speaker segments?**  
A: PGSync automatically detects changes to related tables (Utterance, SpeakerSegment, etc.) and updates the corresponding Subject document in Elasticsearch. No manual intervention needed.

**Q: Can I search for specific speaker segments after finding a semantic match?**  
A: Yes, you can use the nested query on `speaker_contributions` to find the contributions within a subject that matched semantically. The search implementation supports both approaches.

**Q: How do I optimize semantic search performance?**  
A: Use dedicated inference endpoints for ingestion and search, and configure appropriate chunking settings for your text. The current implementation uses the `opencouncil-multilingual-e5-small-elasticsearch` model.

**Q: How does PGSync know when data changes?**  
A: PGSync uses PostgreSQL's logical decoding feature (Write-Ahead Log - WAL) to capture all data changes in real-time. It creates triggers on your tables and listens to the replication stream.

**Q: What happens if PGSync goes down?**  
A: PGSync tracks its position in the WAL stream using Redis. When it restarts, it resumes from where it left off, ensuring no data changes are missed.

**Q: How do I update the schema?**  
A: See <https://pgsync.com/advanced/re-indexing>

**Q: Why are REF links (`[text](REF:TYPE:ID)`) stripped with an ingest pipeline instead of SQL views?**
A: The old SubjectSearchView stripped REF links in SQL, but it declared `base_tables: ["Subject"]` and broke deletion propagation (see the next question). A view on the root table is not safe, so the stripping moved to the `strip-refs` ingest pipeline (see [Configure the Ingest Pipeline](#configure-the-ingest-pipeline)). The pipeline covers all text fields in one place and runs before analysis and before `semantic_text` inference.

Stripping matters mostly for semantic search. The measured impact of raw REF markup (`_analyze` and the e5 inference endpoint on the production cluster):
- **Keyword (BM25) search: unaffected.** The Greek analyzer keeps each `(REF:TYPE:ID)` target as one token (for example `ref:person:abc123`). The app queries use term-based `multi_match` and `match` with no phrase matching, so the extra token is noise that no user searches for.
- **Semantic search: a small, systematic cost.** `semantic_text` embeds the raw field value, so unstripped markup enters the embeddings. Measured on 300 staging subjects: markup-heavy documents gain similarity against every query, and clean documents lose the top result in ~4% of self-retrieval queries.

The frontend is unaffected: it renders REF links via `FormattedTextDisplay` and `stripMarkdown()`, and search results are hydrated from PostgreSQL, not from `_source`.

**Q: Why must views never list the root table in `base_tables`?**
A: PGSync builds an internal `base_table_to_node` mapping from all views' `base_tables`. If a view declares `base_tables: ["Subject"]` (the root table), PGSync treats Subject WAL events as child-node changes for that view, instead of root-table operations. This means DELETE events on Subject are never processed as document deletions — PGSync tries to "re-sync" the parent document instead, which fails silently because the row is already gone. **Rule: only use `base_tables` for tables that are NOT the root node.**

**Q: The schema is correct, but deletes still do not propagate. Why?**
A: Check the pgsync version that installed the `table_notify()` trigger function in the database. pgsync versions before 7.x have a bug: the DELETE branch of the function does not include the `indices` field in the notification, and the daemon drops every root DELETE notification. A bootstrap with pgsync >= 7.x re-creates the function and fixes this. To check, inspect the function: `SELECT prosrc FROM pg_proc WHERE proname = 'table_notify'` — the `TG_OP = 'DELETE'` branch must select `primary_keys, indices`, not only `primary_keys`.

**Q: Why use views instead of direct table joins in PGSync?**
A: Views handle complex logic (PostGIS conversion, role-based party resolution, utterance concatenation) in PostgreSQL where it's more efficient. PGSync sees views as simple tables, keeping the sync configuration clean.

**Q: Can I combine semantic search with traditional text search?**  
A: Yes. Set `enableSemanticSearch: true`. The two arms compete inside a `dis_max`, so a document scores the higher of its lexical sum and its mapped semantic score. The semantic arm is a fallback for a query that shares no stems with the documents that answer it; it cannot add to, and so cannot reorder, documents that already match lexically. RRF (Reciprocal Rank Fusion) is not used — it double-counted whichever document cleared the semantic cutoff.

**Q: How do I handle long texts in semantic search?**  
A: The `semantic_text` field type automatically handles text chunking. The current implementation uses default chunking settings, but you can adjust them if needed.

**Q: What's the difference between traditional and semantic search?**  
A: Traditional search uses exact text matching and relevance scoring, while semantic search understands the meaning of the text. The hybrid approach combines both for better results.

**Q: How do I handle pagination with hybrid search?**  
A: The implementation supports standard pagination using `from` and `size` parameters. A text search orders by score; the filter-only browse path sorts by `meeting_date` and breaks ties on `id`, because every subject of one meeting shares its date and Elasticsearch would otherwise order the tied documents arbitrarily per page.

**Q: How do I monitor search performance?**  
A: Use Elasticsearch's built-in monitoring tools and metrics. Key metrics to watch include:
- Query latency
- Cache hit rates
- Memory usage
- CPU utilization
- Index size

**Q: How do I handle search errors?**  
A: The implementation includes comprehensive error handling:
- Input validation using Zod
- Proper error responses with status codes
- Detailed error messages
- Logging for debugging
- Retry mechanisms for transient failures

---

**This document is the single source of truth for Elasticsearch setup and integration. The index schema itself is defined in `elasticsearch/schema.json`. All architectural changes must be reflected here.** 