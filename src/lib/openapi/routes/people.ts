import { z } from 'zod';
import { registry, sessionAuth, ErrorResponseSchema } from '../registry';

// --- Schemas ---

// Matches the Person Prisma model fields returned by the handlers.
const PersonSchema = z.object({
    id: z.string(),
    name: z.string(),
    name_en: z.string(),
    name_short: z.string(),
    name_short_en: z.string(),
    image: z.string().nullable(),
    profileUrl: z.string().nullable(),
    cityId: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
}).openapi('Person');

// Matches PersonWithRelations — includes roles (simplified).
const PersonWithRolesSchema = PersonSchema.extend({
    roles: z.array(z.object({
        id: z.string(),
        partyId: z.string().nullable(),
        administrativeBodyId: z.string().nullable(),
        title: z.string().nullable(),
        from: z.string().nullable(),
        until: z.string().nullable(),
    })),
}).openapi('PersonWithRoles');

// POST/PUT request — multipart/form-data (no Zod schema in handler; matches manual FormData extraction)
const PersonRequestSchema = z.object({
    name: z.string(),
    name_en: z.string(),
    name_short: z.string(),
    name_short_en: z.string(),
    profileUrl: z.string().optional(),
    image: z.string().optional().openapi({ description: 'Profile image file', format: 'binary' }),
    roles: z.string().optional().openapi({ description: 'JSON array of role objects' }),
}).openapi('PersonRequest');

const MessageSchema = z.object({ message: z.string() });

registry.register('Person', PersonSchema);
registry.register('PersonWithRoles', PersonWithRolesSchema);
registry.register('PersonRequest', PersonRequestSchema);

// --- Routes ---

const cityIdParam = z.object({
    cityId: z.string().openapi({ description: 'City ID', example: 'athens' }),
});

const personIdParam = cityIdParam.extend({
    personId: z.string().openapi({ description: 'Person ID' }),
});

registry.registerPath({
    method: 'get',
    path: '/api/cities/{cityId}/people',
    summary: 'List people for a city',
    tags: ['People'],
    request: { params: cityIdParam },
    responses: {
        200: {
            description: 'List of people with their roles',
            content: { 'application/json': { schema: z.array(PersonWithRolesSchema) } },
        },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/cities/{cityId}/people',
    summary: 'Create a person',
    tags: ['People'],
    security: [{ [sessionAuth.name]: [] }],
    request: {
        params: cityIdParam,
        body: {
            required: true,
            content: { 'multipart/form-data': { schema: PersonRequestSchema } },
        },
    },
    responses: {
        200: {
            description: 'Created person',
            content: { 'application/json': { schema: PersonSchema } },
        },
        400: {
            description: 'Invalid role data',
            content: { 'application/json': { schema: ErrorResponseSchema } },
        },
        401: {
            description: 'Unauthorized',
            content: { 'application/json': { schema: ErrorResponseSchema } },
        },
    },
    'x-access-level': 'admin',
});

registry.registerPath({
    method: 'get',
    path: '/api/cities/{cityId}/people/{personId}',
    summary: 'Get a person',
    tags: ['People'],
    request: { params: personIdParam },
    responses: {
        200: {
            description: 'Person with their roles',
            content: { 'application/json': { schema: PersonWithRolesSchema } },
        },
    },
});

registry.registerPath({
    method: 'put',
    path: '/api/cities/{cityId}/people/{personId}',
    summary: 'Update a person',
    tags: ['People'],
    security: [{ [sessionAuth.name]: [] }],
    request: {
        params: personIdParam,
        body: {
            required: true,
            content: { 'multipart/form-data': { schema: PersonRequestSchema } },
        },
    },
    responses: {
        200: {
            description: 'Updated person',
            content: { 'application/json': { schema: PersonWithRolesSchema } },
        },
        400: {
            description: 'Invalid role data',
            content: { 'application/json': { schema: ErrorResponseSchema } },
        },
        401: {
            description: 'Unauthorized',
            content: { 'application/json': { schema: ErrorResponseSchema } },
        },
    },
    'x-access-level': 'admin',
});

registry.registerPath({
    method: 'delete',
    path: '/api/cities/{cityId}/people/{personId}',
    summary: 'Delete a person',
    tags: ['People'],
    security: [{ [sessionAuth.name]: [] }],
    request: { params: personIdParam },
    responses: {
        200: {
            description: 'Person deleted',
            content: { 'application/json': { schema: MessageSchema } },
        },
        401: {
            description: 'Unauthorized',
            content: { 'application/json': { schema: ErrorResponseSchema } },
        },
    },
    'x-access-level': 'admin',
});
