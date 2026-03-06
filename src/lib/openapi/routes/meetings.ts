import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, sessionAuth, ValidationErrorSchema, ErrorResponseSchema } from '../registry';

extendZodWithOpenApi(z);

// --- Schemas ---

const MeetingSchema = z.object({
    id: z.string(),
    name: z.string(),
    name_en: z.string(),
    dateTime: z.string().datetime(),
    cityId: z.string(),
    youtubeUrl: z.string().nullable(),
    agendaUrl: z.string().nullable(),
    released: z.boolean(),
    muxPlaybackId: z.string().nullable(),
    administrativeBodyId: z.string().nullable(),
}).openapi('Meeting');

const CreateMeetingSchema = z.object({
    name: z.string().min(2).openapi({ description: 'Meeting name in Greek' }),
    name_en: z.string().min(2).openapi({ description: 'Meeting name in English' }),
    date: z.string().openapi({ description: 'Meeting date/time (ISO 8601)', example: '2024-09-15T18:00:00Z' }),
    youtubeUrl: z.string().url().optional().or(z.literal('')).openapi({ description: 'YouTube video URL' }),
    agendaUrl: z.string().url().optional().or(z.literal('')).openapi({ description: 'Agenda document URL' }),
    meetingId: z.string().min(1).openapi({ description: 'Unique meeting ID' }),
    administrativeBodyId: z.string().optional().openapi({ description: 'Administrative body to associate with' }),
}).openapi('CreateMeeting');

registry.register('Meeting', MeetingSchema);
registry.register('CreateMeeting', CreateMeetingSchema);

// --- Routes ---

registry.registerPath({
    method: 'get',
    path: '/api/cities/{cityId}/meetings',
    summary: 'List meetings for a city',
    description: 'Returns released meetings for the given city, ordered by date descending.',
    tags: ['Meetings'],
    request: {
        params: z.object({
            cityId: z.string().openapi({ description: 'City ID', example: 'athens' }),
        }),
        query: z.object({
            limit: z.string().optional().openapi({ description: 'Maximum number of meetings to return (1-100)', example: '10' }),
        }),
    },
    responses: {
        200: {
            description: 'List of meetings',
            content: {
                'application/json': {
                    schema: z.array(MeetingSchema),
                },
            },
        },
        400: {
            description: 'Invalid query parameters',
            content: {
                'application/json': { schema: ValidationErrorSchema },
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
    path: '/api/cities/{cityId}/meetings',
    summary: 'Create a meeting',
    description: 'Creates a new council meeting for the given city. Requires admin authorization for the city.',
    tags: ['Meetings'],
    security: [{ [sessionAuth.name]: [] }],
    request: {
        params: z.object({
            cityId: z.string().openapi({ description: 'City ID', example: 'athens' }),
        }),
        body: {
            required: true,
            content: {
                'application/json': {
                    schema: CreateMeetingSchema,
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Created meeting',
            content: {
                'application/json': { schema: MeetingSchema },
            },
        },
        401: {
            description: 'Unauthorized — admin access required for this city',
            content: {
                'application/json': { schema: ErrorResponseSchema },
            },
        },
        400: {
            description: 'Invalid meeting data',
            content: {
                'application/json': { schema: ValidationErrorSchema },
            },
        },
    },
    'x-access-level': 'admin',
});
