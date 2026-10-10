import { sessionAuthRequirement, ErrorResponseSchema, InvalidRequestSchema, SuccessSchema, cityIdParam, type Paths } from '../registry';
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
                400: {
                    description: 'Invalid request body, or a role or body that does not exist',
                    content: { 'application/json': { schema: InvalidRequestSchema.or(ErrorResponseSchema) } },
                },
                403: {
                    description: 'A role does not belong to the body or the city',
                    content: { 'application/json': { schema: ErrorResponseSchema } },
                },
                500: {
                    description: 'Server error',
                    content: { 'application/json': { schema: ErrorResponseSchema } },
                },
            },
            'x-access-level': 'admin',
        },
    },
};
