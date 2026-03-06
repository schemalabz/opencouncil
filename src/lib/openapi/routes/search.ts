import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, ValidationErrorSchema, ErrorResponseSchema } from '../registry';

extendZodWithOpenApi(z);

// --- Schemas ---

const SearchRequestSchema = z.object({
    query: z.string().min(1).openapi({ description: 'Search query text', example: 'δημοτικό συμβούλιο' }),
    cityIds: z.array(z.string()).optional().openapi({ description: 'Filter by city IDs' }),
    personIds: z.array(z.string()).optional().openapi({ description: 'Filter by person IDs' }),
    partyIds: z.array(z.string()).optional().openapi({ description: 'Filter by party IDs' }),
    topicIds: z.array(z.string()).optional().openapi({ description: 'Filter by topic IDs' }),
    dateRange: z.object({
        start: z.string().datetime(),
        end: z.string().datetime(),
    }).optional().openapi({ description: 'Filter by date range (ISO 8601)' }),
    location: z.object({
        point: z.object({
            lat: z.number(),
            lon: z.number(),
        }),
        radius: z.number().min(0).max(100).default(5),
    }).optional().openapi({ description: 'Filter by geographic location and radius (km)' }),
    page: z.number().int().min(1).default(1).openapi({ description: 'Page number', example: 1 }),
    pageSize: z.number().int().min(1).max(100).default(10).openapi({ description: 'Results per page', example: 10 }),
    detailed: z.boolean().default(false).openapi({ description: 'Whether to include full utterance text' }),
}).openapi('SearchRequest');

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

registry.register('SearchRequest', SearchRequestSchema);
registry.register('SearchResponse', SearchResultSchema);

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
                'application/json': {
                    schema: z.object({
                        error: z.object({
                            code: z.string(),
                            message: z.string(),
                            details: z.unknown(),
                        }),
                    }),
                },
            },
        },
        500: {
            description: 'Search engine error',
            content: {
                'application/json': { schema: ErrorResponseSchema },
            },
        },
    },
});
