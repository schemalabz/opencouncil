import { z } from 'zod';
import { registry, ErrorResponseSchema } from '../registry';
import { searchRequestSchema } from '@/lib/zod-schemas/search';

// --- Schemas ---

// Reuse the actual validation schema from the route handler (single source of truth).
const SearchRequestSchema = searchRequestSchema.openapi('SearchRequest');

const SearchResultSchema = z.object({
    results: z.array(z.object({
        meetingId: z.string(),
        cityId: z.string(),
        utteranceId: z.string().optional(),
        text: z.string(),
        score: z.number(),
    })).openapi({ description: 'Matching search results' }),
    pagination: z.object({
        total: z.number().int(),
        page: z.number().int(),
        pageSize: z.number().int(),
        totalPages: z.number().int(),
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
    description: 'Searches meeting transcripts using Elasticsearch. Supports filtering by city, person, party, topic, date range, and geographic location.',
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
