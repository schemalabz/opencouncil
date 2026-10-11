import { z } from 'zod';
import { AdministrativeBodyType } from '@prisma/client';
import { registry, sessionAuth, ValidationErrorSchema, ErrorResponseSchema, cityIdParam } from '../registry';
import { meetingSchema } from '@/lib/zod-schemas/meeting';

// --- Response Schemas ---

const AdministrativeBodySchema = z.object({
    id: z.string(),
    name: z.string(),
    name_en: z.string(),
    type: z.nativeEnum(AdministrativeBodyType),
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
    videoUrl: z.string().nullable(),
    audioUrl: z.string().nullable(),
    released: z.boolean(),
    muxPlaybackId: z.string().nullable(),
    administrativeBodyId: z.string().nullable(),
    administrativeBody: AdministrativeBodySchema.nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
}).openapi('Meeting');

// The list endpoint returns the WithSubjects variant (CouncilMeetingWithAdminBodyAndSubjects).
// subjects have a rich shape; documented as an opaque array here.
const MeetingWithSubjectsSchema = MeetingSchema.extend({
    subjects: z.array(z.unknown()),
}).openapi('MeetingWithSubjects');

// POST additionally returns processAgendaStatus when processAgenda was requested.
const MeetingCreatedSchema = MeetingSchema.extend({
    processAgendaStatus: z.string().optional(),
}).openapi('MeetingCreated');

// --- Request Schemas ---

// Reuse the actual validation schema from the route handler (single source of truth).
// zod-to-openapi handles .transform() correctly: documents the input type (string for date).
const CreateMeetingSchema = meetingSchema.openapi('CreateMeeting');

// Update reuses the same source but drops the create-only fields the PUT handler
// ignores: meetingId (identified by the URL) and processAgenda (POST-only trigger).
const UpdateMeetingSchema = meetingSchema.omit({ meetingId: true, processAgenda: true }).openapi('UpdateMeeting');

registry.register('AdministrativeBody', AdministrativeBodySchema);
registry.register('Meeting', MeetingSchema);
registry.register('MeetingWithSubjects', MeetingWithSubjectsSchema);
registry.register('MeetingCreated', MeetingCreatedSchema);
registry.register('CreateMeeting', CreateMeetingSchema);
registry.register('UpdateMeeting', UpdateMeetingSchema);

// --- Routes ---

const meetingIdParam = cityIdParam.extend({
    meetingId: z.string().openapi({ description: 'Meeting ID' }),
});

registry.registerPath({
    method: 'get',
    path: '/api/cities/{cityId}/meetings',
    summary: 'List meetings for a city',
    description: 'Returns released meetings for the given city, ordered by date descending.',
    tags: ['Meetings'],
    request: {
        params: cityIdParam,
        query: z.object({
            limit: z.string().optional().openapi({ description: 'Maximum number of meetings to return (1-100)', example: '10' }),
        }),
    },
    responses: {
        200: {
            description: 'List of meetings',
            content: {
                'application/json': {
                    schema: z.array(MeetingWithSubjectsSchema),
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
        params: cityIdParam,
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
                'application/json': { schema: MeetingCreatedSchema },
            },
        },
        400: {
            description: 'Invalid meeting data',
            content: {
                'application/json': { schema: ValidationErrorSchema },
            },
        },
        401: {
            description: 'Unauthorized — authentication required',
            content: {
                'application/json': { schema: ErrorResponseSchema },
            },
        },
        // Note: no 409 is documented. The handler auto-generates a unique
        // meetingId when omitted (retrying on collision), and a client-supplied
        // duplicate id currently surfaces as a 500 rather than a 409 — see the
        // follow-up on aligning handler status codes with the documented spec.
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
        params: meetingIdParam,
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
        params: meetingIdParam,
        body: {
            required: true,
            content: {
                'application/json': {
                    schema: UpdateMeetingSchema,
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
