import * as z from 'zod';
import { sessionAuthRequirement, cityIdParam, editAuthResponses, errorResponseOf, invalidRequestResponse, type Paths } from '@/lib/openapi/registry';
import { AdministrativeBodyWithSettingsSchema } from '@/lib/openapi/entities';
import { administrativeBodyContactsSchema, administrativeBodySchema, updateAdministrativeBodyRequestSchema } from '@/lib/zod-schemas/administrativeBody';

// The validation schemas of the handlers. diavgeiaUnitIds is the
// comma-separated text that the handlers split.
const AdministrativeBodyRequestSchema = administrativeBodySchema.meta({ id: 'AdministrativeBodyRequest' });
const AdministrativeBodyUpdateRequestSchema = updateAdministrativeBodyRequestSchema.meta({ id: 'AdministrativeBodyUpdateRequest' });
const AdministrativeBodyContactsRequestSchema = administrativeBodyContactsSchema.meta({
    id: 'AdministrativeBodyContactsRequest',
    description: 'The request of an admin of the body who is not an admin of the city.',
});

const bodyIdParam = cityIdParam.extend({
    bodyId: z.string().meta({ description: 'Administrative body ID' }),
});

const errorResponses = {
    400: invalidRequestResponse('Invalid administrative body data'),
    ...editAuthResponses,
    500: errorResponseOf('Server error'),
};

export const administrativeBodiesPaths: Paths = {
    '/api/cities/{cityId}/administrative-bodies': {
        post: {
            summary: 'Create an administrative body',
            description: 'Creates a council, committee or community of the city. Requires admin authorization for the city.',
            tags: ['Administrative bodies'],
            security: sessionAuthRequirement,
            requestParams: { path: cityIdParam },
            requestBody: {
                required: true,
                content: { 'application/json': { schema: AdministrativeBodyRequestSchema } },
            },
            responses: {
                201: {
                    description: 'Created administrative body',
                    content: { 'application/json': { schema: AdministrativeBodyWithSettingsSchema } },
                },
                ...errorResponses,
            },
            'x-access-level': 'admin',
        },
    },
    '/api/cities/{cityId}/administrative-bodies/{bodyId}': {
        put: {
            summary: 'Update an administrative body',
            description: 'Updates an administrative body. Requires an admin of the city or of the body. '
                + 'A body of `{ "confirmConventions": true, "decisionConventions": {…} }` instead confirms the '
                + 'decision conventions of the body, and the meetings of the body are derived again. '
                + 'An admin of the body who is not an admin of the city sends AdministrativeBodyContactsRequest. '
                + 'That request changes only `youtubeChannelUrl` and `contactEmails`, and the route ignores the other fields.',
            tags: ['Administrative bodies'],
            security: sessionAuthRequirement,
            requestParams: { path: bodyIdParam },
            requestBody: {
                required: true,
                content: { 'application/json': { schema: z.union([AdministrativeBodyUpdateRequestSchema, AdministrativeBodyContactsRequestSchema]) } },
            },
            responses: {
                200: {
                    description: 'Updated administrative body',
                    content: { 'application/json': { schema: AdministrativeBodyWithSettingsSchema } },
                },
                ...errorResponses,
            },
            'x-access-level': 'admin',
        },
    },
};
