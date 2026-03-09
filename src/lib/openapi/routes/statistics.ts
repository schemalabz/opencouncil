import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, ErrorResponseSchema } from '../registry';

extendZodWithOpenApi(z);

// --- Schemas ---

const StatisticsResponseSchema = z.object({
    topic: z.array(z.object({
        id: z.string(),
        name: z.string(),
        count: z.number().int(),
        duration: z.number(),
    })).optional(),
    person: z.array(z.object({
        id: z.string(),
        name: z.string(),
        count: z.number().int(),
        duration: z.number(),
    })).optional(),
    party: z.array(z.object({
        id: z.string(),
        name: z.string(),
        count: z.number().int(),
        duration: z.number(),
    })).optional(),
}).openapi('StatisticsResponse');

registry.register('StatisticsResponse', StatisticsResponseSchema);

// --- Routes ---

registry.registerPath({
    method: 'get',
    path: '/api/statistics',
    summary: 'Get speaking statistics',
    description: 'Returns aggregated speaking statistics grouped by topic, person, and party. Filter by city, meeting, person, party, subject, or administrative body.',
    tags: ['Statistics'],
    request: {
        query: z.object({
            cityId: z.string().optional().openapi({ description: 'Filter by city ID' }),
            meetingId: z.string().optional().openapi({ description: 'Filter by meeting ID' }),
            personId: z.string().optional().openapi({ description: 'Filter by person ID' }),
            partyId: z.string().optional().openapi({ description: 'Filter by party ID' }),
            subjectId: z.string().optional().openapi({ description: 'Filter by subject ID' }),
            administrativeBodyId: z.string().optional().openapi({ description: 'Filter by administrative body ID' }),
        }),
    },
    responses: {
        200: {
            description: 'Aggregated statistics',
            content: {
                'application/json': { schema: StatisticsResponseSchema },
            },
        },
        500: {
            description: 'Server error',
            content: {
                'application/json': { schema: ErrorResponseSchema },
            },
        },
    },
});
