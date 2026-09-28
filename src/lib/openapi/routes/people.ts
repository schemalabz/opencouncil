import { z } from 'zod';
import { registry, sessionAuth, ErrorResponseSchema, MessageSchema, ValidationErrorSchema, cityIdParam } from '../registry';
import { personFormDataSchema } from '@/lib/zod-schemas/person';

// --- Schemas ---

// Matches the Person Prisma model fields returned by the handlers.
export const PersonSchema = z.object({
    id: z.string(),
    name: z.string(),
    name_en: z.string(),
    name_short: z.string(),
    name_short_en: z.string(),
    image: z.string().nullable(),
    profileUrl: z.string().nullable(),
    cityId: z.string(),
    activeFrom: z.string().datetime().nullable(),
    activeTo: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
}).openapi('Person');

// Scalar fields of the Role model. The API response also embeds the related
// `party`, `administrativeBody`, and `city` objects (RoleWithRelations); those
// are omitted here for brevity.
const RoleSchema = z.object({
    id: z.string(),
    personId: z.string(),
    cityId: z.string().nullable(),
    partyId: z.string().nullable(),
    administrativeBodyId: z.string().nullable(),
    isHead: z.boolean(),
    name: z.string().nullable(),
    name_en: z.string().nullable(),
    electedOrder: z.number().int().nullable(),
    startDate: z.string().datetime().nullable(),
    endDate: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
}).openapi('Role');

// Matches PersonWithRelations — a Person plus their roles.
export const PersonWithRolesSchema = PersonSchema.extend({
    roles: z.array(RoleSchema),
}).openapi('PersonWithRoles');

// POST/PUT request — multipart/form-data. Reuse the actual validation schema
// from zod-schemas/person.ts; z.instanceof(File) doesn't serialize to OpenAPI,
// so the image is documented as binary, and the roles field is a JSON string.
const PersonRequestSchema = personFormDataSchema
    .omit({ image: true, roles: true })
    .extend({
        image: z.string().optional().openapi({ description: 'Profile image file', format: 'binary' }),
        roles: z.string().openapi({
            description: 'JSON array of role objects, each with cityId, partyId or administrativeBodyId, '
                + 'name, name_en, isHead, startDate, endDate and electedOrder. Replaces all roles of the person.',
        }),
    })
    .openapi('PersonRequest');

registry.register('Person', PersonSchema);
registry.register('Role', RoleSchema);
registry.register('PersonWithRoles', PersonWithRolesSchema);
registry.register('PersonRequest', PersonRequestSchema);

// --- Routes ---

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
            description: 'Created person with their roles',
            content: { 'application/json': { schema: PersonWithRolesSchema } },
        },
        400: {
            description: 'Invalid person or role data',
            content: { 'application/json': { schema: z.union([ValidationErrorSchema, ErrorResponseSchema]) } },
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
            description: 'Invalid person or role data',
            content: { 'application/json': { schema: z.union([ValidationErrorSchema, ErrorResponseSchema]) } },
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
