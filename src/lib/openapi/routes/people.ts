import * as z from 'zod';
import { sessionAuthRequirement, MessageSchema, cityIdParam, errorResponseOf, invalidRequestOrMessageResponse, editAuthResponses, type Paths } from '@/lib/openapi/registry';
import { PersonWithRolesSchema } from '@/lib/openapi/entities';
import { personFormDataSchema, personUpdateFormDataSchema } from '@/lib/zod-schemas/person';

// POST/PUT request — multipart/form-data. The roles field is the JSON string that the caller sends.
const PersonRequestSchema = personFormDataSchema.meta({ id: 'PersonRequest' });
// On PUT the roles are optional: an absent field keeps the roles as they are.
const PersonUpdateRequestSchema = personUpdateFormDataSchema.meta({ id: 'PersonUpdateRequest' });

// --- Routes ---

const personIdParam = cityIdParam.extend({
    personId: z.string().meta({ description: 'Person ID' }),
});

export const peoplePaths: Paths = {
    '/api/cities/{cityId}/people': {
        get: {
            summary: 'List people for a city',
            tags: ['People'],
            requestParams: { path: cityIdParam },
            responses: {
                200: {
                    description: 'List of people with their roles',
                    content: { 'application/json': { schema: z.array(PersonWithRolesSchema) } },
                },
            },
        },
        post: {
            summary: 'Create a person',
            tags: ['People'],
            security: sessionAuthRequirement,
            requestParams: { path: cityIdParam },
            requestBody: {
                required: true,
                content: { 'multipart/form-data': { schema: PersonRequestSchema } },
            },
            responses: {
                200: {
                    description: 'Created person with their roles',
                    content: { 'application/json': { schema: PersonWithRolesSchema } },
                },
                400: invalidRequestOrMessageResponse('Invalid person or role data'),
                ...editAuthResponses,
            },
            'x-access-level': 'admin',
        },
    },
    '/api/cities/{cityId}/people/{personId}': {
        get: {
            summary: 'Get a person',
            tags: ['People'],
            requestParams: { path: personIdParam },
            responses: {
                200: {
                    description: 'Person with their roles',
                    content: { 'application/json': { schema: PersonWithRolesSchema } },
                },
            },
        },
        put: {
            summary: 'Update a person',
            description: 'Without a roles field, the roles of the person stay as they are.',
            tags: ['People'],
            security: sessionAuthRequirement,
            requestParams: { path: personIdParam },
            requestBody: {
                required: true,
                content: { 'multipart/form-data': { schema: PersonUpdateRequestSchema } },
            },
            responses: {
                200: {
                    description: 'Updated person',
                    content: { 'application/json': { schema: PersonWithRolesSchema } },
                },
                400: invalidRequestOrMessageResponse('Invalid person or role data'),
                ...editAuthResponses,
            },
            'x-access-level': 'admin',
        },
        delete: {
            summary: 'Delete a person',
            tags: ['People'],
            security: sessionAuthRequirement,
            requestParams: { path: personIdParam },
            responses: {
                200: {
                    description: 'Person deleted',
                    content: { 'application/json': { schema: MessageSchema } },
                },
                ...editAuthResponses,
            },
            'x-access-level': 'superadmin',
        },
    },
};
