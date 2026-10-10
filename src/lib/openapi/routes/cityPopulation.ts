import * as z from 'zod';
import { registry, sessionAuth, ValidationErrorSchema, ErrorResponseSchema, cityIdParam } from '../registry';
import { cityPopulationSchema } from '@/lib/zod-schemas/cityPopulation';

// --- Schemas ---

// Reuse the actual validation schema from zod-schemas/cityPopulation.ts
// (single source of truth, also given to the AI City Creator).
const CityPopulationRequestSchema = cityPopulationSchema.clone().openapi('CityPopulation');

const CityPopulationResultSchema = z.object({
    success: z.literal(true),
    message: z.string(),
    stats: z.object({
        partiesCount: z.number().int(),
        peopleCount: z.number().int(),
        rolesCount: z.number().int(),
        adminBodiesCount: z.number().int(),
    }),
}).openapi('CityPopulationResult');

registry.register('CityPopulation', CityPopulationRequestSchema);
registry.register('CityPopulationResult', CityPopulationResultSchema);

// --- Routes ---

registry.registerPath({
    method: 'post',
    path: '/api/cities/{cityId}/populate',
    summary: 'Import the council of a city',
    description:
        'Creates the parties, administrative bodies, people and roles of a city in one transaction. '
        + 'Works only on a city that has no parties, people, roles or meetings. '
        + 'A role names its party or its administrative body by the `name` of an entry in the same request. '
        + 'The city is set to pending. Requires superadmin authorization.',
    tags: ['Cities'],
    security: [{ [sessionAuth.name]: [] }],
    request: {
        params: cityIdParam,
        body: {
            required: true,
            content: { 'application/json': { schema: CityPopulationRequestSchema } },
        },
    },
    responses: {
        200: {
            description: 'Counts of the created records',
            content: { 'application/json': { schema: CityPopulationResultSchema } },
        },
        400: {
            description: 'Invalid data, or the city already has data',
            content: { 'application/json': { schema: z.union([ValidationErrorSchema, ErrorResponseSchema]) } },
        },
        401: {
            description: 'Unauthorized — not a superadmin',
            content: { 'application/json': { schema: ErrorResponseSchema } },
        },
        404: {
            description: 'City not found',
            content: { 'application/json': { schema: ErrorResponseSchema } },
        },
    },
    'x-access-level': 'superadmin',
});
