import * as z from 'zod';
import type { Paths } from '@/lib/openapi/registry';
import { searchLocationSchema, searchRequestSchema } from '@/lib/zod-schemas/search';
import type { DerivedFilters } from '@/lib/search/types';
import { searchErrorSchema } from '@/lib/api/errors';

// --- Schemas ---

// Reuse the actual validation schema from the route handler (single source of truth).
const SearchRequestSchema = searchRequestSchema.meta({ id: 'SearchRequest' });

const SearchResultSchema = z.object({
    results: z.array(z.unknown()).meta({
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
    // `satisfies` makes a field added to DerivedFilters fail to compile here
    // until the spec documents it.
    derivedFilters: z.object({
        cityIds: z.array(z.string()).optional(),
        dateRange: z.object({ start: z.string(), end: z.string() }).optional(),
        locations: z.array(searchLocationSchema).optional().meta({
            description:
                'Places the query text named. These raise the rank of subjects pinned within '
                + '`radiusMeters` (metres) of a point, and do not remove other results.',
        }),
    } satisfies Record<keyof DerivedFilters, z.ZodType>).meta({
        description:
            'The filters the search read out of the query text, because the request had not set them. '
            + 'A query naming a municipality or a period in prose narrows the results; these are the '
            + 'filters it narrowed by. Empty when the query text supplied nothing.',
    }),
}).meta({ id: 'SearchResponse' });


// --- Routes ---

export const searchPaths: Paths = {
    '/api/search': {
        post: {
            summary: 'Full-text search across transcripts',
            description: 'Searches meeting transcripts using Elasticsearch. Supports filtering by city, person, party, administrative body, topic, date range, and geographic location. '
                + 'Results are limited to the municipalities of the host the request arrives on (opencouncil.gr returns Greek municipalities, opencouncil.fr French ones), '
                + 'whether or not `cityIds` is set. A `cityIds` entry outside that country matches nothing.',
            tags: ['Search'],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: SearchRequestSchema,
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
                        'application/json': { schema: searchErrorSchema },
                    },
                },
                500: {
                    description: 'Search engine error',
                    content: {
                        'application/json': { schema: searchErrorSchema },
                    },
                },
            },
        },
    },
};
