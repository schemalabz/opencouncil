# Elasticsearch Integration

This document describes how OpenCouncil uses Elasticsearch to provide powerful search capabilities for council meeting subjects. It covers the setup, configuration, and implementation details of our hybrid search system that combines traditional text search with semantic search.


### Table of Contents

1. [Overview](#overview)
2. [Codebase Structure](#codebase-structure)
3. [Set up Elasticsearch](#set-up-elasticsearch)
4. [Set up the Connector](#set-up-the-connector)
5. [Configure PostgreSQL](#configure-postgresql)
6. [Sync Data](#sync-data)
7. [Search Examples](#search-examples)
8. [Best Practices & FAQ](#best-practices--faq)


### Architecture Overview

The system uses a two-layer architecture:
1. **PostgreSQL**: Primary source of truth for all data
2. **Elasticsearch**: Search layer that provides fast and flexible search capabilities

When searching:
1. Elasticsearch is used to find relevant subjects based on text queries and filters
2. The returned subject IDs are used to fetch complete data from PostgreSQL
3. This approach combines the best of both worlds:
   - Elasticsearch's powerful search capabilities
   - PostgreSQL's data integrity and relationships

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


## Codebase Structure

The search functionality is implemented across several files:

1. **API Layer** (`src/app/api/search/route.ts`)
   - Handles HTTP requests and response formatting
   - Validates request parameters using Zod
   - Implements error handling and pagination

2. **Search Implementation** (`src/lib/search/search.ts`)
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

To avoid potential cost issues, we create a custom inference endpoint with controlled allocation settings:

```json
PUT _inference/text_embedding/custom-multilingual-e5-small-elasticsearch
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

### 3. Create the Index

All Elasticsearch commands in this guide should be run in the Elasticsearch Console. Create the `subjects` index with our specific mappings:

> **Note**: The field names in our mappings are prefixed with `public_subject_` because the PostgreSQL connector automatically adds this prefix to fields defined in the advanced sync configuration. This prefix is based on the table name and schema in the sync query.

```json
PUT subjects
{
  "mappings": {
    "properties": {
      "public_subject_id": { "type": "keyword" },
      "public_subject_name": { 
        "type": "text",
        "analyzer": "greek",
        "fields": {
          "keyword": {
            "type": "keyword",
            "ignore_above": 256
          },
          "semantic": {
            "type": "semantic_text",
            "inference_id": "custom-multilingual-e5-small-elasticsearch",
            "search_inference_id": "custom-multilingual-e5-small-elasticsearch-elasticsearch"
          }
        }
      },
      "public_subject_description": { 
        "type": "text",
        "analyzer": "greek",
        "fields": {
          "semantic": {
            "type": "semantic_text",
            "inference_id": "custom-multilingual-e5-small-elasticsearch",
            "search_inference_id": "custom-multilingual-e5-small-elasticsearch"
          }
        }
      },
      "public_subject_city_id": { "type": "keyword" },
      "public_subject_city_name": { 
        "type": "text",
        "analyzer": "greek",
        "fields": {
          "keyword": {
            "type": "keyword",
            "ignore_above": 256
          }
        }
      },
      "public_subject_city_name_en": { 
        "type": "text",
        "analyzer": "standard",
        "fields": {
          "keyword": {
            "type": "keyword",
            "ignore_above": 256
          }
        }
      },
      "public_subject_councilMeeting_id": { "type": "keyword" },
      "public_subject_meeting_date": { "type": "date" },
      "public_subject_meeting_name": { 
        "type": "text",
        "analyzer": "greek"
      },
      "public_subject_topic_id": { "type": "keyword" },
      "public_subject_topic_name": { 
        "type": "text",
        "analyzer": "greek",
        "fields": {
          "keyword": {
            "type": "keyword",
            "ignore_above": 256
          }
        }
      },
      "public_subject_topic_name_en": { 
        "type": "text",
        "analyzer": "standard",
        "fields": {
          "keyword": {
            "type": "keyword",
            "ignore_above": 256
          }
        }
      },
      "public_subject_introduced_by_person_id": { "type": "keyword" },
      "public_subject_introduced_by_person_name": { 
        "type": "text",
        "analyzer": "greek",
        "fields": {
          "keyword": {
            "type": "keyword",
            "ignore_above": 256
          }
        }
      },
      "public_subject_introduced_by_person_name_en": { 
        "type": "text",
        "analyzer": "standard",
        "fields": {
          "keyword": {
            "type": "keyword",
            "ignore_above": 256
          }
        }
      },
      "public_subject_introduced_by_party_id": { "type": "keyword" },
      "public_subject_introduced_by_party_name": { 
        "type": "text",
        "analyzer": "greek",
        "fields": {
          "keyword": {
            "type": "keyword",
            "ignore_above": 256
          }
        }
      },
      "public_subject_introduced_by_party_name_en": { 
        "type": "text",
        "analyzer": "standard",
        "fields": {
          "keyword": {
            "type": "keyword",
            "ignore_above": 256
          }
        }
      },
      "public_subject_location_text": { 
        "type": "text",
        "analyzer": "greek"
      },
      "public_subject_location_geojson": { 
        "type": "geo_shape"
      },
      "public_subject_speaker_segments": {
        "type": "nested",
        "properties": {
          "segment_id": { "type": "keyword" },
          "speaker": {
            "properties": {
              "person_id": { "type": "keyword" },
              "person_name": { 
                "type": "text",
                "analyzer": "greek",
                "fields": {
                  "keyword": {
                    "type": "keyword",
                    "ignore_above": 256
                  }
                }
              },
              "person_name_en": { 
                "type": "text",
                "analyzer": "standard",
                "fields": {
                  "keyword": {
                    "type": "keyword",
                    "ignore_above": 256
                  }
                }
              },
              "party_id": { "type": "keyword" },
              "party_name": { 
                "type": "text",
                "analyzer": "greek",
                "fields": {
                  "keyword": {
                    "type": "keyword",
                    "ignore_above": 256
                  }
                }
              },
              "party_name_en": { 
                "type": "text",
                "analyzer": "standard",
                "fields": {
                  "keyword": {
                    "type": "keyword",
                    "ignore_above": 256
                  }
                }
              }
            }
          },
          "text": { 
            "type": "text",
            "analyzer": "greek"
          },
          "summary": {
            "type": "text",
            "analyzer": "greek"
          }
        }
      }
    }
  }
}
```



## Set up the Connector

### 1. Create the Connector

Create the PostgreSQL connector in the Elasticsearch Console:

```json
PUT _connector/opencouncil-postgresql
{
  "name": "OpenCouncil PostgreSQL",
  "index_name": "subjects",
  "service_type": "postgresql"
}
```

### 2. Create an API Key

Create an API key for the connector:

```json
POST /_security/api_key
{
  "name": "opencouncil-connector",
  "role_descriptors": {
    "opencouncil-connector-role": {
      "cluster": [
        "monitor",
        "manage_connector"
      ],
      "indices": [
        {
          "names": [
            "subjects",
            ".search-acl-filter-subjects",
            ".elastic-connectors*"
          ],
          "privileges": [
            "all"
          ],
          "allow_restricted_indices": false
        }
      ]
    }
  }
}
```

Save the `encoded` value from the response as `ELASTICSEARCH_API_KEY` in your `.env` file.

### 3. Create Connector Configuration

Create a directory for the connector configuration in the project root:

```bash
mkdir -p connectors-config
```

Create a `config.yml` file in the `connectors-config` directory:

```yaml
# connectors-config/config.yml
elasticsearch:
  host: <ELASTICSEARCH_HOST>
  api_key: <ELASTICSEARCH_API_KEY>

connectors:
  - connector_id: "opencouncil-postgresql"
    service_type: "postgresql"
```

### 4. Run the Connector

Start the connector service using Docker Compose:

```bash
docker compose up elastic-connector
```

> **Note**: Ensure that the database is running when you start the connector. If you are using the local database, you can run it with: `docker compose up db`


Verify your connector is connected by getting the connector status (should be `needs_configuration`) and `last_seen` field (note that time is reported in UTC). The `last_seen` field indicates that the connector successfully connected to Elasticsearch.

```json
GET _connector/opencouncil-postgresql
```



## Configure PostgreSQL

### 1. Enable Commit Timestamp Tracking

Enable commit timestamp tracking in PostgreSQL (required for advanced sync rules):

```bash
docker exec -it opencouncil-db-1 psql -U postgres -c "ALTER SYSTEM SET track_commit_timestamp = on;"
```

Restart the database and then verify the setting is enabled:

```bash
docker exec -it opencouncil-db-1 psql -U postgres -c "SHOW track_commit_timestamp;"
```

### 2. Configure the PostgreSQL Connector

Set up the PostgreSQL connection details:

```json
PUT _connector/opencouncil-postgresql/_configuration
{
  "values": {
    "host": "db",
    "port": 5432,
    "username": "postgres",
    "password": "postgres",
    "database": "development",
    "schema": "public"
  }
}
```

Note: We use `db` as the host because that's the service name in our Docker Compose network. The connector service can reach the PostgreSQL service using this hostname.

### 3. Configure Advanced Sync Rules

Set up the advanced sync rules with our denormalizing query:

```json
PUT _connector/opencouncil-postgresql/_filtering
{
  "advanced_snippet": {
    "value": [
      {
        "tables": ["Subject"],
        "query": """SELECT
  s.*,
  l.text AS location_text,
  ST_AsGeoJSON(l.coordinates)::jsonb AS location_geojson,
  t.id AS topic_id, t.name AS topic_name, t.name_en AS topic_name_en,
  p.id AS introduced_by_person_id, p.name AS introduced_by_person_name, p.name_en AS introduced_by_person_name_en,
  pa.id AS introduced_by_party_id, pa.name AS introduced_by_party_name, pa.name_en AS introduced_by_party_name_en,
  c.id AS city_id, c.name AS city_name, c.name_en AS city_name_en,
  m.id AS councilMeeting_id, m."dateTime" AS meeting_date, m.name AS meeting_name,
  COALESCE(
    json_agg(
      jsonb_build_object(
        'segment_id', ss.id,
        'speaker', jsonb_build_object(
          'person_id', sp.id,
          'person_name', sp.name,
          'person_name_en', sp.name_en,
          'party_id', spa.id,
          'party_name', spa.name,
          'party_name_en', spa.name_en
        ),
        'text', u.utterances_text,
        'summary', sss.summary
      )
    ) FILTER (WHERE ss.id IS NOT NULL), '[]'
  ) AS speaker_segments
FROM "Subject" s
LEFT JOIN "Location" l ON s."locationId" = l.id
LEFT JOIN "Topic" t ON s."topicId" = t.id
LEFT JOIN "Person" p ON s."personId" = p.id
LEFT JOIN "Party" pa ON p."partyId" = pa.id
LEFT JOIN "City" c ON s."cityId" = c.id
LEFT JOIN "CouncilMeeting" m ON s."councilMeetingId" = m.id AND s."cityId" = m."cityId"
LEFT JOIN "SubjectSpeakerSegment" sss ON sss."subjectId" = s.id
LEFT JOIN "SpeakerSegment" ss ON ss.id = sss."speakerSegmentId"
LEFT JOIN "SpeakerTag" st ON ss."speakerTagId" = st.id
LEFT JOIN "Person" sp ON st."personId" = sp.id
LEFT JOIN "Party" spa ON sp."partyId" = spa.id
LEFT JOIN LATERAL (
  SELECT
    string_agg(u.text, ' ' ORDER BY u."startTimestamp") AS utterances_text
  FROM "Utterance" u
  WHERE u."speakerSegmentId" = ss.id
) u ON true
GROUP BY
  s.id, l.text, l.coordinates, t.id, t.name, t.name_en,
  p.id, p.name, p.name_en, pa.id, pa.name, pa.name_en,
  c.id, c.name, c.name_en, m.id, m."dateTime", m.name"""
      }
    ]
  }
}
```



## Sync Data

### 1. Start a Full Sync

Initiate a full sync to index all data:

```json
POST _connector/_sync_job
{
    "id": "opencouncil-postgresql",
    "job_type": "full"
}
```

### 2. Monitor Sync Status

Check the sync job status:

```json
GET _connector/_sync_job?connector_id=opencouncil-postgresql&size=1
```

### 3. Verify Data

Once the sync is complete, verify the data is in the index:

```json
GET subjects/_count
```

### 4. Clean Up (if needed)

To delete the connector and its sync jobs:

```json
DELETE _connector/opencouncil-postgresql?delete_sync_jobs=true
```

To delete the index:

```json
DELETE subjects
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
              "public_subject_name^4",
              "public_subject_description^3"
            ],
            "type": "best_fields",
            "operator": "or"
          }
        },
        {
          "nested": {
            "path": "public_subject_speaker_segments",
            "query": {
              "bool": {
                "should": [
                  {
                    "match": {
                      "public_subject_speaker_segments.text": {
                        "query": "ηλεκτρικά πατίνια",
                        "boost": 2
                      }
                    }
                  },
                  {
                    "match": {
                      "public_subject_speaker_segments.summary": {
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
              "_source": ["public_subject_speaker_segments.segment_id"]
            }
          }
        }
      ],
      "minimum_should_match": 1,
      "filter": [
        {
          "terms": {
            "public_subject_city_id": ["athens", "chania"]
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
                        "public_subject_name^4",
                        "public_subject_description^3"
                      ],
                      "type": "best_fields",
                      "operator": "or"
                    }
                  },
                  {
                    "nested": {
                      "path": "public_subject_speaker_segments",
                      "query": {
                        "bool": {
                          "should": [
                            {
                              "match": {
                                "public_subject_speaker_segments.text": {
                                  "query": "ηλεκτρικά πατίνια",
                                  "boost": 2
                                }
                              }
                            },
                            {
                              "match": {
                                "public_subject_speaker_segments.summary": {
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
                        "_source": ["public_subject_speaker_segments.segment_id"]
                      }
                    }
                  }
                ],
                "minimum_should_match": 1,
                "filter": [
                  {
                    "terms": {
                      "public_subject_city_id": ["athens", "chania"]
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
                      "field": "public_subject_description.semantic"
                    }
                  }
                ],
                "filter": [
                  {
                    "terms": {
                      "public_subject_city_id": ["athens", "chania"]
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
   - Keep Elasticsearch index in sync with PostgreSQL
   - Monitor sync job status and handle failures
   - Implement proper error handling for sync operations
   - Use transactions for related updates

5. **Security**
   - Use API keys for authentication
   - Implement proper access control
   - Validate and sanitize user input
   - Monitor for suspicious activity
   - Keep Elasticsearch version up to date

### FAQ

**Q: How is the speaker segments text concatenated?**  
A: The `public_subject_speaker_segments_text` field is automatically populated with the concatenated text of all speaker segments. This field is used for semantic search while maintaining the original nested structure for traditional search and filtering.

**Q: How do I handle updates to speaker segments?**  
A: When updating speaker segments, make sure to update both the nested `public_subject_speaker_segments` array and the concatenated `public_subject_speaker_segments_text` field to maintain consistency. The PostgreSQL connector will handle this automatically.

**Q: Can I search for specific speaker segments after finding a semantic match?**  
A: Yes, you can use the nested query on `public_subject_speaker_segments` to find specific segments within a subject that matched semantically. The search implementation supports both approaches.

**Q: How do I optimize semantic search performance?**  
A: Use dedicated inference endpoints for ingestion and search, and configure appropriate chunking settings for your text. The current implementation uses the `custom-multilingual-e5-small-elasticsearch` model.

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

**This document is the single source of truth for the Subject index. All changes must be reflected here.** 