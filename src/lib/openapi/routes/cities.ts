import { z } from 'zod';
import { registry, sessionAuth, ValidationErrorSchema, ErrorResponseSchema } from '../registry';
import { baseCityFields, createCityFormDataSchema, updateCityFormDataSchema, authorityTypeSchema, cityStatusSchema } from '@/lib/zod-schemas/city';

// --- Response Schemas ---
// Reuse baseCityFields (single source of truth for model field names and
// types), then add the DB-generated fields that aren't part of the form.

const CitySchema = z.object({
    id: z.string(),
    ...baseCityFields,
    logoImage: z.string().nullable(),
    diavgeiaUid: z.string().nullable(),
    wikipediaId: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
}).openapi('City');

const CityWithCountsSchema = CitySchema.extend({
    _count: z.object({
        persons: z.number().int(),
        parties: z.number().int(),
        councilMeetings: z.number().int(),
    }),
}).openapi('CityWithCounts');

// Matches CityMinimalWithCounts returned by getAllCitiesMinimal() — a subset of CitySchema
// without diavgeiaUid, wikipediaId, createdAt, updatedAt.
const CityMinimalSchema = z.object({
    id: z.string(),
    name: z.string(),
    name_en: z.string(),
    name_municipality: z.string(),
    name_municipality_en: z.string(),
    logoImage: z.string().nullable(),
    supportsNotifications: z.boolean(),
    status: cityStatusSchema,
    officialSupport: z.boolean(),
    authorityType: authorityTypeSchema,
    _count: z.object({
        persons: z.number().int(),
        parties: z.number().int(),
        councilMeetings: z.number().int(),
    }),
}).openapi('CityMinimal');

// GET /api/cities/{cityId} includes PostGIS geometry
const CityWithGeometrySchema = CitySchema.extend({
    geometry: z.record(z.unknown()).nullable().optional().openapi({ description: 'GeoJSON geometry' }),
}).openapi('CityWithGeometry');

const MessageSchema = z.object({ message: z.string() }).openapi('Message');

registry.register('City', CitySchema);
registry.register('CityWithCounts', CityWithCountsSchema);
registry.register('CityMinimal', CityMinimalSchema);
registry.register('CityWithGeometry', CityWithGeometrySchema);
registry.register('Message', MessageSchema);

// --- Request Schemas ---
// Reuse the actual validation schema from zod-schemas/city.ts (single
// source of truth for field rules). Only override logoImage because
// z.instanceof(File) doesn't serialize to OpenAPI — replace with binary.
const CreateCityRequestSchema = createCityFormDataSchema
    .omit({ logoImage: true })
    .extend({
        logoImage: z.string().openapi({ description: 'Logo image file', format: 'binary' }),
    })
    .openapi('CreateCityRequest');

const UpdateCityRequestSchema = updateCityFormDataSchema
    .omit({ logoImage: true })
    .extend({
        logoImage: z.string().optional().openapi({ description: 'Replacement logo image file', format: 'binary' }),
    })
    .openapi('UpdateCityRequest');

registry.register('CreateCityRequest', CreateCityRequestSchema);
registry.register('UpdateCityRequest', UpdateCityRequestSchema);

// --- Routes ---

registry.registerPath({
    method: 'get',
    path: '/api/cities',
    summary: 'List cities',
    description:
        'Returns all listed cities with counts of persons, parties, and released meetings. ' +
        'When includeUnlisted=true, also includes unlisted cities the authenticated user can administer.',
    tags: ['Cities'],
    request: {
        query: z.object({
            includeUnlisted: z.string()
                .optional()
                .openapi({
                    description: 'When "true", includes unlisted cities the user can administer',
                    example: 'false',
                }),
        }),
    },
    responses: {
        200: {
            description: 'List of cities with counts',
            content: {
                'application/json': {
                    schema: z.array(CityWithCountsSchema),
                },
            },
        },
        400: {
            description: 'Invalid query parameters',
            content: {
                'application/json': { schema: ValidationErrorSchema },
            },
        },
    },
});

registry.registerPath({
    method: 'get',
    path: '/api/cities/all',
    summary: 'List all cities (minimal)',
    description: 'Returns all cities with minimal fields and counts. Used for public city selectors and maps.',
    tags: ['Cities'],
    responses: {
        200: {
            description: 'List of minimal city objects with counts',
            content: {
                'application/json': {
                    schema: z.array(CityMinimalSchema),
                },
            },
        },
        500: {
            description: 'Server error',
            content: {
                'application/json': { schema: ErrorResponseSchema },
            },
        },
    },
});

registry.registerPath({
    method: 'post',
    path: '/api/cities',
    summary: 'Create a city',
    description:
        'Creates a new city. Requires superadmin authorization. ' +
        'Accepts multipart/form-data with city fields and a logo image.',
    tags: ['Cities'],
    security: [{ [sessionAuth.name]: [] }],
    request: {
        body: {
            required: true,
            description: 'City creation data as multipart/form-data',
            content: {
                'multipart/form-data': {
                    schema: CreateCityRequestSchema,
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Created city',
            content: {
                'application/json': { schema: CitySchema },
            },
        },
        400: {
            description: 'Invalid city data',
            content: {
                'application/json': { schema: ValidationErrorSchema },
            },
        },
        401: {
            description: 'Unauthorized — not authenticated',
            content: {
                'application/json': { schema: ErrorResponseSchema },
            },
        },
    },
    'x-access-level': 'superadmin',
});

registry.registerPath({
    method: 'get',
    path: '/api/cities/{cityId}',
    summary: 'Get a city',
    description: 'Returns a single city by ID including PostGIS geometry.',
    tags: ['Cities'],
    request: {
        params: z.object({
            cityId: z.string().openapi({ description: 'City ID', example: 'athens' }),
        }),
    },
    responses: {
        200: {
            description: 'City data with geometry',
            content: {
                'application/json': { schema: CityWithGeometrySchema },
            },
        },
        404: {
            description: 'City not found',
            content: {
                'application/json': { schema: ErrorResponseSchema },
            },
        },
    },
});

registry.registerPath({
    method: 'put',
    path: '/api/cities/{cityId}',
    summary: 'Update a city',
    description: 'Updates an existing city. Requires admin authorization for the city.',
    tags: ['Cities'],
    security: [{ [sessionAuth.name]: [] }],
    request: {
        params: z.object({
            cityId: z.string().openapi({ description: 'City ID', example: 'athens' }),
        }),
        body: {
            required: true,
            description: 'City update data as multipart/form-data (all fields optional)',
            content: {
                'multipart/form-data': {
                    schema: UpdateCityRequestSchema,
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Updated city',
            content: {
                'application/json': { schema: CitySchema },
            },
        },
        400: {
            description: 'Invalid city data',
            content: {
                'application/json': { schema: ValidationErrorSchema },
            },
        },
        401: {
            description: 'Unauthorized — admin access required for this city',
            content: {
                'application/json': { schema: ErrorResponseSchema },
            },
        },
    },
    'x-access-level': 'admin',
});

registry.registerPath({
    method: 'delete',
    path: '/api/cities/{cityId}',
    summary: 'Delete a city',
    description: 'Deletes a city. Requires admin authorization for the city.',
    tags: ['Cities'],
    security: [{ [sessionAuth.name]: [] }],
    request: {
        params: z.object({
            cityId: z.string().openapi({ description: 'City ID', example: 'athens' }),
        }),
    },
    responses: {
        200: {
            description: 'City deleted',
            content: {
                'application/json': { schema: MessageSchema },
            },
        },
        401: {
            description: 'Unauthorized — admin access required for this city',
            content: {
                'application/json': { schema: ErrorResponseSchema },
            },
        },
    },
    'x-access-level': 'admin',
});
