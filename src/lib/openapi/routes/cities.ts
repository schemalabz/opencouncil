import * as z from 'zod';
import { sessionAuthRequirement, MessageSchema, cityIdParam, errorResponseOf, invalidRequestOrMessageResponse, invalidRequestResponse, type Paths } from '../registry';
import { CitySchema, CityMinimalSchema, CityWithCountsSchema, CityWithGeometrySchema } from '@/lib/openapi/entities';
import { citiesListQuerySchema, createCityFormDataSchema, updateCityRequestFormDataSchema } from '@/lib/zod-schemas/city';

// --- Request Schemas ---
// The validation schemas of the handlers. Their file fields render as binary.
const CreateCityRequestSchema = createCityFormDataSchema.meta({ id: 'CreateCityRequest' });
const UpdateCityRequestSchema = updateCityRequestFormDataSchema.meta({ id: 'UpdateCityRequest' });

// --- Routes ---

export const citiesPaths: Paths = {
    '/api/cities': {
        get: {
            summary: 'List cities',
            description:
                'Returns all publicly listed cities (demo and supported) with counts of persons, parties, and released meetings. ' +
                'When includeUnlisted=true, also includes non-public cities the authenticated user can administer.',
            tags: ['Cities'],
            requestParams: { query: citiesListQuerySchema },
            responses: {
                200: {
                    description: 'List of cities with counts',
                    content: { 'application/json': { schema: z.array(CityWithCountsSchema) } },
                },
                400: invalidRequestResponse('Invalid query parameters'),
            },
        },
        post: {
            summary: 'Create a city',
            description:
                'Creates a new city. Requires superadmin authorization. ' +
                'Accepts multipart/form-data with city fields and a logo image.',
            tags: ['Cities'],
            security: sessionAuthRequirement,
            requestBody: {
                required: true,
                description: 'City creation data as multipart/form-data',
                content: { 'multipart/form-data': { schema: CreateCityRequestSchema } },
            },
            responses: {
                200: {
                    description: 'Created city',
                    content: { 'application/json': { schema: CitySchema } },
                },
                400: invalidRequestOrMessageResponse('Invalid city data, form data or boundary GeoJSON'),
                401: errorResponseOf('Unauthorized — not authenticated'),
            },
            'x-access-level': 'superadmin',
        },
    },
    '/api/cities/all': {
        get: {
            summary: 'List all cities (minimal)',
            description: 'Returns all cities with minimal fields and counts. Used for public city selectors and maps.',
            tags: ['Cities'],
            responses: {
                200: {
                    description: 'List of minimal city objects with counts',
                    content: { 'application/json': { schema: z.array(CityMinimalSchema) } },
                },
                500: errorResponseOf('Server error'),
            },
        },
    },
    '/api/cities/{cityId}': {
        get: {
            summary: 'Get a city',
            description: 'Returns a single city by ID including PostGIS geometry.',
            tags: ['Cities'],
            requestParams: { path: cityIdParam },
            responses: {
                200: {
                    description: 'City data with geometry',
                    content: { 'application/json': { schema: CityWithGeometrySchema } },
                },
                404: errorResponseOf('City not found'),
            },
        },
        put: {
            summary: 'Update a city',
            description: 'Updates an existing city. Requires admin authorization for the city.',
            tags: ['Cities'],
            security: sessionAuthRequirement,
            requestParams: { path: cityIdParam },
            requestBody: {
                required: true,
                description: 'City update data as multipart/form-data (all fields optional)',
                content: { 'multipart/form-data': { schema: UpdateCityRequestSchema } },
            },
            responses: {
                200: {
                    description: 'Updated city',
                    content: { 'application/json': { schema: CitySchema } },
                },
                400: invalidRequestOrMessageResponse('Invalid city data, form data or boundary GeoJSON'),
                401: errorResponseOf('Unauthorized — admin access required for this city'),
            },
            'x-access-level': 'admin',
        },
        delete: {
            summary: 'Delete a city',
            description: 'Deletes a city. Requires admin authorization for the city.',
            tags: ['Cities'],
            security: sessionAuthRequirement,
            requestParams: { path: cityIdParam },
            responses: {
                200: {
                    description: 'City deleted',
                    content: { 'application/json': { schema: MessageSchema } },
                },
                401: errorResponseOf('Unauthorized — admin access required for this city'),
            },
            'x-access-level': 'admin',
        },
    },
};
