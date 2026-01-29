# Elasticsearch Integration

This document describes how OpenCouncil uses Elasticsearch to provide powerful search capabilities for council meeting subjects. It covers the setup, configuration, and implementation details of our hybrid search system that combines traditional text search with semantic search.


### Table of Contents

1. [Overview](#overview)
2. [Codebase Structure](#codebase-structure)
3. [Set up Elasticsearch](#set-up-elasticsearch)
4. [Configure PostgreSQL Views](#configure-postgresql-views)
5. [Set up PGSync](#set-up-pgsync)
6. [Sync Data](#sync-data)
7. [Search Examples](#search-examples)
8. [Best Practices & FAQ](#best-practices--faq)


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
   - Combines both traditional and semantic search results
   - Uses RRF (Reciprocal Rank Fusion) for result ranking
   - Configurable parameters:
     - `rank_window_size`: Number of results to consider from each retriever (default: 100)
     - `rank_constant`: Controls the balance between retrievers (default: 60)

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

2. **Search Implementation** (`src/lib/search/search.ts`)
   - Implements automatic filter derivation from natural language queries
   - Core search functionality using Elasticsearch
   - Implements hybrid search (traditional + semantic)
   - Handles result transformation and enrichment
   - Manages Elasticsearch client configuration

3. **Types and Interfaces**
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
3. **SubjectSpeakerSegmentSearchView** - Denormalizes speaker segments with concatenated utterances

### Create the Views

Run the provided SQL script to create all views and verify they work correctly:

```bash
psql "$DATABASE_URL" < elasticsearch/views.sql
```

The script will:
- Create all three required views
- Run verification checks on each view
- Display sample data to confirm everything works
- Show statistics about data coverage

**Important:** Views are database-specific. You need to run this script:
- When setting up a new database
- After cloning/restoring a database
- In each environment (dev, staging, production)

View the full view definitions and verification logic in `elasticsearch/views.sql`.



## PGSync Setup and Data Synchronization

[PGSync](https://github.com/toluaina/pgsync) is a change data capture (CDC) tool that syncs PostgreSQL to Elasticsearch using logical replication. It runs as a separate service in the [opencouncil-tasks](https://github.com/schemalabz/opencouncil-tasks) repository.

### Schema Configuration

> **Important**: The sync configuration is defined in `elasticsearch/schema.json`. Changing this schema effectively changes the structure of documents in Elasticsearch and requires re-indexing the entire index.

The `elasticsearch/schema.json` file defines:
- **Index mapping**: Elasticsearch field types, analyzers
- **Nodes**: PostgreSQL tables and their relationships  
- **Transform rules**: Field renaming, scalar vs object variants
- **Children**: Nested relationships (e.g., speaker_segments)

**Resources for understanding the schema:**
- [PGSync Schema Documentation](https://pgsync.com/schema/) - Official guide to schema configuration
- [PGSync Examples](https://github.com/toluaina/pgsync/tree/main/examples) - Example schemas for various use cases

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

## Search Examples

### 1. Simple Text Search

This example demonstrates a basic text search query that searches across subject names, descriptions, and speaker segments:

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
            "path": "speaker_segments",
            "query": {
              "bool": {
                "should": [
                  {
                    "match": {
                      "speaker_segments.text": {
                        "query": "ηλεκτρικά πατίνια",
                        "boost": 2
                      }
                    }
                  },
                  {
                    "match": {
                      "speaker_segments.summary": {
                        "query": "ηλεκτρικά πατίνια",
                        "boost": 2
                      }
                    }
                  }
                ],
                "minimum_should_match": 1
              }
            },
            "inner_hits": {
              "_source": ["speaker_segments.segment_id"]
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

This example demonstrates how to combine traditional text search with semantic search using RRF (Reciprocal Rank Fusion):

```json
GET subjects/_search
{
  "retriever": {
    "rrf": {
      "retrievers": [
        {
          "standard": {
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
                      "path": "speaker_segments",
                      "query": {
                        "bool": {
                          "should": [
                            {
                              "match": {
                                "speaker_segments.text": {
                                  "query": "ηλεκτρικά πατίνια",
                                  "boost": 2
                                }
                              }
                            },
                            {
                              "match": {
                                "speaker_segments.summary": {
                                  "query": "ηλεκτρικά πατίνια",
                                  "boost": 2
                                }
                              }
                            }
                          ],
                          "minimum_should_match": 1
                        }
                      },
                      "inner_hits": {
                        "_source": ["speaker_segments.segment_id"]
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
        },
        {
          "standard": {
            "query": {
              "bool": {
                "must": [
                  {
                    "semantic": {
                      "query": "ηλεκτρικά πατίνια",
                      "field": "description.semantic"
                    }
                  }
                ],
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
        }
      ],
      "rank_window_size": 100,
      "rank_constant": 60
    }
  }
}
```

Key features of this hybrid query:
- Combines traditional text search with semantic search
- Uses RRF to merge and rank results from both searches
- Maintains field boosting for traditional search
- Properly handles nested speaker segments search
- Uses `inner_hits` to get IDs of matching speaker segments
- Includes semantic search on description field
- Filters by `meeting_released: true` to show only subjects from released meetings
- Applies the same filters to both searches
- Configurable ranking parameters:
  - `rank_window_size`: Number of results to consider from each retriever (default: 100)
  - `rank_constant`: Controls balance between retrievers (default: 60)



## Best Practices & FAQ

### Best Practices

1. **Search Configuration**
   - Use hybrid search for best results by setting `enableSemanticSearch: true`
   - Configure appropriate `rank_window_size` (default: 100) and `rank_constant` (default: 60)
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

**Q: How is the speaker segments text concatenated?**  
A: The `SubjectSpeakerSegmentSearchView` view concatenates all utterance texts within each speaker segment using `string_agg()`, ordered by timestamp. PGSync reads from this view and indexes the concatenated text.

**Q: How do I handle updates to speaker segments?**  
A: PGSync automatically detects changes to related tables (Utterance, SpeakerSegment, etc.) and updates the corresponding Subject document in Elasticsearch. No manual intervention needed.

**Q: Can I search for specific speaker segments after finding a semantic match?**  
A: Yes, you can use the nested query on `speaker_segments` to find specific segments within a subject that matched semantically. The search implementation supports both approaches.

**Q: How do I optimize semantic search performance?**  
A: Use dedicated inference endpoints for ingestion and search, and configure appropriate chunking settings for your text. The current implementation uses the `opencouncil-multilingual-e5-small-elasticsearch` model.

**Q: How does PGSync know when data changes?**  
A: PGSync uses PostgreSQL's logical decoding feature (Write-Ahead Log - WAL) to capture all data changes in real-time. It creates triggers on your tables and listens to the replication stream.

**Q: What happens if PGSync goes down?**  
A: PGSync tracks its position in the WAL stream using Redis. When it restarts, it resumes from where it left off, ensuring no data changes are missed.

**Q: How do I update the schema?**  
A: See <https://pgsync.com/advanced/re-indexing>

**Q: Why use views instead of direct table joins in PGSync?**  
A: Views handle complex logic (PostGIS conversion, role-based party resolution, utterance concatenation) in PostgreSQL where it's more efficient. PGSync sees views as simple tables, keeping the sync configuration clean.

**Q: Can I combine semantic search with traditional text search?**  
A: Yes, the implementation uses RRF (Reciprocal Rank Fusion) to combine both traditional and semantic search results. You can control this with the `enableSemanticSearch` config option.

**Q: How do I handle long texts in semantic search?**  
A: The `semantic_text` field type automatically handles text chunking. The current implementation uses default chunking settings, but you can adjust them if needed.

**Q: What's the difference between traditional and semantic search?**  
A: Traditional search uses exact text matching and relevance scoring, while semantic search understands the meaning of the text. The hybrid approach combines both for better results.

**Q: How do I handle pagination with hybrid search?**  
A: The implementation supports standard pagination using `from` and `size` parameters. The RRF ranking ensures consistent ordering across pages.

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