import * as z from 'zod';
import { sessionAuthRequirement, type Paths } from '../registry';
import { updateProfileSchema } from '@/lib/zod-schemas/user';

// The validation schema of the handler. Every field is optional; a phone of
// null removes the phone.
const UpdateProfileSchema = updateProfileSchema.meta({ id: 'UpdateProfile' });

export const profilePaths: Paths = {
    '/api/profile': {
        post: {
            summary: 'Update your profile',
            description: 'Updates the profile of the signed-in user. A phone that another account proved is refused. '
                + 'A phone that another account only typed is not saved: the response sets `phoneNeedsCode`, '
                + 'and the user must prove the number with a code.',
            tags: ['Profile'],
            security: sessionAuthRequirement,
            requestBody: {
                required: true,
                content: { 'application/json': { schema: UpdateProfileSchema } },
            },
            responses: {
                200: { description: 'The updated user, with `phoneNeedsCode: true` when the phone was not saved' },
                400: {
                    description: 'Invalid profile data, as zod `flattenError` output',
                    content: {
                        'application/json': {
                            schema: z.object({
                                error: z.object({
                                    formErrors: z.array(z.string()),
                                    fieldErrors: z.record(z.string(), z.array(z.string())),
                                }),
                            }),
                        },
                    },
                },
                401: { description: 'Not signed in' },
                409: {
                    description: 'Another account proved this phone',
                    content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string() }) }) } },
                },
            },
            'x-access-level': 'user',
        },
    },
};
