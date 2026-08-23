import { z } from 'zod';
import { registry, ErrorResponseSchema } from '../registry';
import { searchRequestSchema } from '@/lib/zod-schemas/search';

// --- Schemas ---

// Reuse the actual validation schema from the route handler (single source of truth).
const SearchRequestSchema = searchRequestSchema.openapi('SearchRequest');

const SearchResultSchema = z.object({
    results: z.array(z.unknown()).openapi({
        description:
            'Matching results. Each item is a SearchResultLight — a Subject with its relations, '
            + 'a relevance `score`, and its `councilMeeting` (including `city` and `administrativeBody`). '
            + 'When the request sets `detailed: true`, items are SearchResultDetailed, which additionally '
            + 'include `speakerSegments` and `context`. See src/lib/search/types.ts for the full shape.',
    }),
    pagination: z.object({
        total: z.number().int(),
        page: z.number().int(),
        pageSize: z.number().int(),
        totalPages: z.number().int(),
    }),
    derivedFilters: z.object({
        cityIds: z.array(z.string()).optional(),
        dateRange: z.object({ start: z.string(), end: z.string() }).optional(),
    }).openapi({
        description:
            'The filters the search read out of the query text, because the request had not set them. '
            + 'A query naming a municipality or a period in prose narrows the results; these are the '
            + 'filters it narrowed by. Empty when the query text supplied nothing.',
    }),
}).openapi('SearchResponse');

// Matches the actual { error: { code, message, details } } shape returned by the handler
const SearchErrorSchema = z.object({
    error: z.object({
        code: z.string(),
        message: z.string(),
        details: z.unknown(),
    }),
}).openapi('SearchError');

registry.register('SearchRequest', SearchRequestSchema);
registry.register('SearchResponse', SearchResultSchema);
registry.register('SearchError', SearchErrorSchema);

// --- Routes ---

registry.registerPath({
    method: 'post',
    path: '/api/search',
    summary: 'Full-text search across transcripts',
    description: 'Searches meeting transcripts using Elasticsearch. Supports filtering by city, person, party, topic, date range, and geographic location. '
        + 'Results are limited to the municipalities of the host the request arrives on (opencouncil.gr returns Greek municipalities, opencouncil.fr French ones), '
        + 'whether or not `cityIds` is set. A `cityIds` entry outside that country matches nothing.',
    tags: ['Search'],
    request: {
        body: {
            required: true,
            content: {
                'application/json': {
                    schema: SearchRequestSchema,
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Search results with pagination',
            content: {
                'application/json': { schema: SearchResultSchema },
            },
        },
        400: {
            description: 'Invalid search parameters',
            content: {
                'application/json': { schema: SearchErrorSchema },
            },
        },
        500: {
            description: 'Search engine error',
            content: {
                'application/json': { schema: SearchErrorSchema },
            },
        },
    },
});
