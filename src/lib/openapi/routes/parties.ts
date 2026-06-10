import { z } from 'zod';
import { registry, sessionAuth, ErrorResponseSchema } from '../registry';

// --- Schemas ---

// Matches the Party Prisma model fields returned by the handlers.
const PartySchema = z.object({
    id: z.string(),
    name: z.string(),
    name_en: z.string(),
    name_short: z.string(),
    name_short_en: z.string(),
    colorHex: z.string(),
    logo: z.string().nullable(),
    cityId: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
}).openapi('Party');

// Matches PartyWithPersons returned by getPartiesForCity() and getParty().
const PartyWithPeopleSchema = PartySchema.extend({
    people: z.array(z.object({
        id: z.string(),
        name: z.string(),
        name_en: z.string(),
        name_short: z.string(),
        name_short_en: z.string(),
    })),
}).openapi('PartyWithPeople');

// POST/PUT request — multipart/form-data (no Zod schema in handler; matches manual FormData extraction)
const PartyRequestSchema = z.object({
    name: z.string(),
    name_en: z.string(),
    name_short: z.string(),
    name_short_en: z.string(),
    colorHex: z.string().openapi({ description: 'Hex color code, e.g. #3B82F6' }),
    logo: z.string().optional().openapi({ description: 'Logo image file', format: 'binary' }),
}).openapi('PartyRequest');

const MessageSchema = z.object({ message: z.string() });

registry.register('Party', PartySchema);
registry.register('PartyWithPeople', PartyWithPeopleSchema);
registry.register('PartyRequest', PartyRequestSchema);

// --- Routes ---

const cityIdParam = z.object({
    cityId: z.string().openapi({ description: 'City ID', example: 'athens' }),
});

const partyIdParam = cityIdParam.extend({
    partyId: z.string().openapi({ description: 'Party ID' }),
});

registry.registerPath({
    method: 'get',
    path: '/api/cities/{cityId}/parties',
    summary: 'List parties for a city',
    tags: ['Parties'],
    request: { params: cityIdParam },
    responses: {
        200: {
            description: 'List of parties with their members',
            content: { 'application/json': { schema: z.array(PartyWithPeopleSchema) } },
        },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/cities/{cityId}/parties',
    summary: 'Create a party',
    tags: ['Parties'],
    security: [{ [sessionAuth.name]: [] }],
    request: {
        params: cityIdParam,
        body: {
            required: true,
            content: { 'multipart/form-data': { schema: PartyRequestSchema } },
        },
    },
    responses: {
        200: {
            description: 'Created party',
            content: { 'application/json': { schema: PartySchema } },
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
    path: '/api/cities/{cityId}/parties/{partyId}',
    summary: 'Get a party',
    tags: ['Parties'],
    request: { params: partyIdParam },
    responses: {
        200: {
            description: 'Party with its members',
            content: { 'application/json': { schema: PartyWithPeopleSchema } },
        },
        404: {
            description: 'Party not found',
            content: { 'application/json': { schema: ErrorResponseSchema } },
        },
    },
});

registry.registerPath({
    method: 'put',
    path: '/api/cities/{cityId}/parties/{partyId}',
    summary: 'Update a party',
    tags: ['Parties'],
    security: [{ [sessionAuth.name]: [] }],
    request: {
        params: partyIdParam,
        body: {
            required: true,
            content: { 'multipart/form-data': { schema: PartyRequestSchema } },
        },
    },
    responses: {
        200: {
            description: 'Updated party',
            content: { 'application/json': { schema: PartySchema } },
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
    path: '/api/cities/{cityId}/parties/{partyId}',
    summary: 'Delete a party',
    tags: ['Parties'],
    security: [{ [sessionAuth.name]: [] }],
    request: { params: partyIdParam },
    responses: {
        200: {
            description: 'Party deleted',
            content: { 'application/json': { schema: MessageSchema } },
        },
        401: {
            description: 'Unauthorized',
            content: { 'application/json': { schema: ErrorResponseSchema } },
        },
    },
    'x-access-level': 'admin',
});
