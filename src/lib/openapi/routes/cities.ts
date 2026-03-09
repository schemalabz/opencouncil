import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, sessionAuth, ValidationErrorSchema, ErrorResponseSchema } from '../registry';

extendZodWithOpenApi(z);

// --- Schemas ---

const CitySchema = z.object({
    id: z.string(),
    name: z.string(),
    name_en: z.string(),
    name_municipality: z.string(),
    name_municipality_en: z.string(),
    timezone: z.string(),
    logoImage: z.string().nullable(),
    officialSupport: z.boolean(),
    status: z.enum(['active', 'pending', 'inactive']),
    authorityType: z.enum(['municipality', 'region', 'other']),
    supportsNotifications: z.boolean(),
    consultationsEnabled: z.boolean(),
    meetingCount: z.number().int().optional(),
    personCount: z.number().int().optional(),
}).openapi('City');

registry.register('City', CitySchema);

// --- Routes ---

registry.registerPath({
    method: 'get',
    path: '/api/cities',
    summary: 'List cities',
    description: 'Returns all active cities with counts. When includeUnlisted=true, also includes unlisted cities the authenticated user can administer.',
    tags: ['Cities'],
    request: {
        query: z.object({
            includeUnlisted: z.string()
                .optional()
                .openapi({ description: 'When "true", includes unlisted cities the user can administer', example: 'false' }),
        }),
    },
    responses: {
        200: {
            description: 'List of cities',
            content: {
                'application/json': {
                    schema: z.array(CitySchema),
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
    method: 'post',
    path: '/api/cities',
    summary: 'Create a city',
    description: 'Creates a new city. Requires superadmin authorization. Accepts multipart/form-data with city fields and a logo image.',
    tags: ['Cities'],
    security: [{ [sessionAuth.name]: [] }],
    request: {
        body: {
            required: true,
            description: 'City creation data as multipart/form-data',
            content: {
                'multipart/form-data': {
                    schema: z.object({
                        id: z.string().min(2).openapi({ description: 'Unique city slug (lowercase letters and dashes)', example: 'athens' }),
                        name: z.string().min(2).openapi({ description: 'City name in Greek', example: 'Αθήνα' }),
                        name_en: z.string().min(2).openapi({ description: 'City name in English', example: 'Athens' }),
                        name_municipality: z.string().min(2).openapi({ description: 'Municipality name in Greek' }),
                        name_municipality_en: z.string().min(2).openapi({ description: 'Municipality name in English' }),
                        timezone: z.string().min(1).openapi({ description: 'IANA timezone', example: 'Europe/Athens' }),
                        authorityType: z.enum(['municipality', 'region', 'other']).openapi({ description: 'Type of authority' }),
                        officialSupport: z.string().openapi({ description: '"true" or "false"' }),
                        status: z.enum(['active', 'pending', 'inactive']),
                        supportsNotifications: z.string().openapi({ description: '"true" or "false"' }),
                        consultationsEnabled: z.string().openapi({ description: '"true" or "false"' }),
                        logoImage: z.string().openapi({ description: 'Logo image file', format: 'binary' }),
                    }),
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
        401: {
            description: 'Unauthorized — not authenticated',
            content: {
                'application/json': { schema: ErrorResponseSchema },
            },
        },
        403: {
            description: 'Forbidden — superadmin access required',
            content: {
                'application/json': { schema: ErrorResponseSchema },
            },
        },
    },
    'x-access-level': 'superadmin',
});
