import { sessionAuthRequirement, SuccessSchema, cityIdParam, editAuthResponses, errorResponseOf, invalidRequestOrMessageResponse, type Paths } from '@/lib/openapi/registry';
import { electedOrderRequestSchema } from '@/lib/zod-schemas/role';

// The validation schema of the handler.
const ElectedOrderRequestSchema = electedOrderRequestSchema.meta({ id: 'ElectedOrderRequest' });

export const rolesPaths: Paths = {
    '/api/cities/{cityId}/roles/elected-order': {
        post: {
            summary: 'Set the elected order of a body',
            description: 'Sets the rank of each member of one administrative body in the election result. '
                + 'Requires admin authorization for the city.',
            tags: ['People'],
            security: sessionAuthRequirement,
            requestParams: { path: cityIdParam },
            requestBody: {
                required: true,
                content: { 'application/json': { schema: ElectedOrderRequestSchema } },
            },
            responses: {
                200: {
                    description: 'The elected order is saved',
                    content: { 'application/json': { schema: SuccessSchema } },
                },
                400: invalidRequestOrMessageResponse('Invalid request body, or a role that does not exist'),
                401: editAuthResponses[401],
                403: errorResponseOf('Not authorized to edit the city, or a role does not belong to the body or the city'),
                500: errorResponseOf('Server error'),
            },
            'x-access-level': 'admin',
        },
    },
};
