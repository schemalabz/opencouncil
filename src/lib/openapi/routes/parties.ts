import * as z from 'zod';
import { sessionAuthRequirement, MessageSchema, cityIdParam, editAuthResponses, errorResponseOf, invalidRequestOrMessageResponse, type Paths } from '@/lib/openapi/registry';
import { PartySchema, PartyWithPeopleSchema } from '@/lib/openapi/entities';
import { partyFormDataSchema } from '@/lib/zod-schemas/party';

// POST/PUT request — multipart/form-data. The validation schema of the
// handlers; the logo renders as binary.
const PartyRequestSchema = partyFormDataSchema.meta({ id: 'PartyRequest' });

// --- Routes ---

const partyIdParam = cityIdParam.extend({
    partyId: z.string().meta({ description: 'Party ID' }),
});

export const partiesPaths: Paths = {
    '/api/cities/{cityId}/parties': {
        get: {
            summary: 'List parties for a city',
            tags: ['Parties'],
            requestParams: { path: cityIdParam },
            responses: {
                200: {
                    description: 'List of parties with their members',
                    content: { 'application/json': { schema: z.array(PartyWithPeopleSchema) } },
                },
            },
        },
        post: {
            summary: 'Create a party',
            tags: ['Parties'],
            security: sessionAuthRequirement,
            requestParams: { path: cityIdParam },
            requestBody: {
                required: true,
                content: { 'multipart/form-data': { schema: PartyRequestSchema } },
            },
            responses: {
                200: {
                    description: 'Created party',
                    content: { 'application/json': { schema: PartySchema } },
                },
                400: invalidRequestOrMessageResponse('Invalid party data'),
                ...editAuthResponses,
            },
            'x-access-level': 'admin',
        },
    },
    '/api/cities/{cityId}/parties/{partyId}': {
        get: {
            summary: 'Get a party',
            tags: ['Parties'],
            requestParams: { path: partyIdParam },
            responses: {
                200: {
                    description: 'Party with its members',
                    content: { 'application/json': { schema: PartyWithPeopleSchema } },
                },
                404: errorResponseOf('Party not found'),
            },
        },
        put: {
            summary: 'Update a party',
            tags: ['Parties'],
            security: sessionAuthRequirement,
            requestParams: { path: partyIdParam },
            requestBody: {
                required: true,
                content: { 'multipart/form-data': { schema: PartyRequestSchema } },
            },
            responses: {
                200: {
                    description: 'Updated party',
                    content: { 'application/json': { schema: PartySchema } },
                },
                400: invalidRequestOrMessageResponse('Invalid party data'),
                ...editAuthResponses,
            },
            'x-access-level': 'admin',
        },
        delete: {
            summary: 'Delete a party',
            tags: ['Parties'],
            security: sessionAuthRequirement,
            requestParams: { path: partyIdParam },
            responses: {
                200: {
                    description: 'Party deleted',
                    content: { 'application/json': { schema: MessageSchema } },
                },
                ...editAuthResponses,
            },
            'x-access-level': 'admin',
        },
    },
};
