import * as z from 'zod';
import { sessionAuthRequirement, cityIdParam, errorResponseOf, invalidRequestOrMessageResponse, type Paths } from '../registry';
import { cityPopulationSchema } from '@/lib/zod-schemas/cityPopulation';

// --- Schemas ---

// Reuse the actual validation schema from zod-schemas/cityPopulation.ts
// (single source of truth, also given to the AI City Creator).
const CityPopulationRequestSchema = cityPopulationSchema.meta({ id: 'CityPopulation' });

const CityPopulationResultSchema = z.object({
    success: z.literal(true),
    message: z.string(),
    stats: z.object({
        partiesCount: z.number().int(),
        peopleCount: z.number().int(),
        rolesCount: z.number().int(),
        adminBodiesCount: z.number().int(),
    }),
}).meta({ id: 'CityPopulationResult' });

// --- Routes ---

export const cityPopulationPaths: Paths = {
    '/api/cities/{cityId}/populate': {
        post: {
            summary: 'Import the council of a city',
            description:
                'Creates the parties, administrative bodies, people and roles of a city in one transaction. '
                + 'Works only on a city that has no parties, people, roles or meetings. '
                + 'A role names its party or its administrative body by the `name` of an entry in the same request. '
                + 'The city is set to pending. Requires superadmin authorization.',
            tags: ['Cities'],
            security: sessionAuthRequirement,
            requestParams: { path: cityIdParam },
            requestBody: {
                required: true,
                content: { 'application/json': { schema: CityPopulationRequestSchema } },
            },
            responses: {
                200: {
                    description: 'Counts of the created records',
                    content: { 'application/json': { schema: CityPopulationResultSchema } },
                },
                400: invalidRequestOrMessageResponse('Invalid data, or the city already has data'),
                401: errorResponseOf('Unauthorized — not a superadmin'),
                404: errorResponseOf('City not found'),
            },
            'x-access-level': 'superadmin',
        },
    },
};
