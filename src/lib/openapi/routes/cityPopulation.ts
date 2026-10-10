import * as z from 'zod';
import { sessionAuthRequirement, cityIdParam, errorResponseOf, invalidRequestOrMessageResponse, notAuthorizedResponse, type Paths } from '@/lib/openapi/registry';
import { cityPopulationAiRequestSchema, cityPopulationSchema } from '@/lib/zod-schemas/cityPopulation';

// --- Schemas ---

// Reuse the actual validation schema from zod-schemas/cityPopulation.ts
// (single source of truth, also given to the AI City Creator).
const CityPopulationRequestSchema = cityPopulationSchema.meta({ id: 'CityPopulation' });

const CityPopulationAiRequestSchema = cityPopulationAiRequestSchema.meta({ id: 'CityPopulationAiRequest' });

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
                401: notAuthorizedResponse,
                404: errorResponseOf('City not found'),
            },
            'x-access-level': 'superadmin',
        },
    },
    '/api/cities/{cityId}/populate/ai': {
        post: {
            summary: 'Draft the council of a city with AI',
            description:
                'Asks the model, with web search, for the parties, administrative bodies, people and roles of a city. '
                + 'Saves nothing: the City Creator shows the draft for review, then sends it to POST /api/cities/{cityId}/populate. '
                + 'Works only on a city that has no parties, people, roles or meetings. '
                + 'The response is a stream of server-sent events. Each event is a JSON object with a `type`: '
                + '`status`, `heartbeat`, `complete` (with the draft in `data`, in the `CityPopulation` shape) or `error`. '
                + 'Requires superadmin authorization.',
            tags: ['Cities'],
            security: sessionAuthRequirement,
            requestParams: { path: cityIdParam },
            requestBody: {
                required: true,
                content: { 'application/json': { schema: CityPopulationAiRequestSchema } },
            },
            responses: {
                200: {
                    description: 'A stream of server-sent events',
                    content: { 'text/event-stream': { schema: z.string() } },
                },
                400: invalidRequestOrMessageResponse('Invalid request, or the city already has data'),
                401: notAuthorizedResponse,
                404: errorResponseOf('City not found'),
            },
            'x-access-level': 'superadmin',
        },
    },
};
