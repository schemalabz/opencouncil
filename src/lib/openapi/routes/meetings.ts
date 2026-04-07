import { z } from 'zod';
import { registry, sessionAuth, ValidationErrorSchema, ErrorResponseSchema } from '../registry';
import { meetingSchema } from '@/lib/zod-schemas/meeting';

// --- Response Schemas ---

const AdministrativeBodySchema = z.object({
    id: z.string(),
    name: z.string(),
    cityId: z.string(),
}).openapi('AdministrativeBody');

// Matches CouncilMeetingWithAdminBody — the shape returned by create/edit/get handlers.
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
    administrativeBody: AdministrativeBodySchema.nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
}).openapi('Meeting');

// --- Request Schemas ---

// Reuse the actual validation schema from the route handler (single source of truth).
// zod-to-openapi handles .transform() correctly: documents the input type (string for date).
const CreateMeetingSchema = meetingSchema.openapi('CreateMeeting');

registry.register('AdministrativeBody', AdministrativeBodySchema);
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
        201: {
            description: 'Meeting created',
            content: {
                'application/json': { schema: MeetingSchema },
            },
        },
        400: {
            description: 'Invalid meeting data',
            content: {
                'application/json': { schema: ValidationErrorSchema },
            },
        },
        403: {
            description: 'Forbidden — admin access required for this city',
            content: {
                'application/json': { schema: ErrorResponseSchema },
            },
        },
        409: {
            description: 'Conflict — a meeting with this ID already exists',
            content: {
                'application/json': { schema: ErrorResponseSchema },
            },
        },
    },
    'x-access-level': 'admin',
});

registry.registerPath({
    method: 'get',
    path: '/api/cities/{cityId}/meetings/{meetingId}',
    summary: 'Get a meeting',
    description: 'Returns full meeting data including transcript, people, parties, and subjects. Transcript is omitted when hidden for review.',
    tags: ['Meetings'],
    request: {
        params: z.object({
            cityId: z.string().openapi({ description: 'City ID', example: 'athens' }),
            meetingId: z.string().openapi({ description: 'Meeting ID' }),
        }),
    },
    responses: {
        200: {
            description: 'Full meeting data',
            content: {
                'application/json': {
                    schema: z.object({
                        meeting: MeetingSchema,
                        transcriptHiddenForReview: z.boolean(),
                        transcript: z.array(z.unknown()),
                        speakerTags: z.array(z.unknown()),
                        people: z.array(z.unknown()),
                        parties: z.array(z.unknown()),
                        subjects: z.array(z.unknown()),
                        city: z.unknown(),
                        taskStatus: z.unknown(),
                    }).openapi('MeetingData'),
                },
            },
        },
        404: {
            description: 'Meeting not found',
            content: {
                'application/json': { schema: ErrorResponseSchema },
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
    method: 'put',
    path: '/api/cities/{cityId}/meetings/{meetingId}',
    summary: 'Update a meeting',
    description: 'Updates an existing meeting. Requires admin authorization for the city.',
    tags: ['Meetings'],
    security: [{ [sessionAuth.name]: [] }],
    request: {
        params: z.object({
            cityId: z.string().openapi({ description: 'City ID', example: 'athens' }),
            meetingId: z.string().openapi({ description: 'Meeting ID' }),
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
            description: 'Updated meeting',
            content: {
                'application/json': { schema: MeetingSchema },
            },
        },
        400: {
            description: 'Invalid meeting data',
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
        500: {
            description: 'Server error',
            content: {
                'application/json': { schema: ErrorResponseSchema },
            },
        },
    },
    'x-access-level': 'admin',
});
