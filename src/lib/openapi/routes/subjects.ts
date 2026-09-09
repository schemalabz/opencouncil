import { z } from 'zod';
import { LocationType, NonAgendaReason } from '@prisma/client';
import { registry, sessionAuth, ValidationErrorSchema, ErrorResponseSchema, cityIdParam } from '@/lib/openapi/registry';
import { MAX_SUBJECT_LIMIT, DEFAULT_SUBJECT_LIMIT } from '@/lib/zod-schemas/subject';

// --- Response Schemas ---

// Matches ApiSubject in src/lib/db/subjectsApi.ts — the trimmed wire shape.
// The discussion itself (contributions, votes, attendance, highlights, the
// decision) is not part of this contract.
const SubjectTopicSchema = z.object({
    id: z.string(),
    name: z.string(),
    name_en: z.string(),
    colorHex: z.string(),
    icon: z.string().nullable(),
}).openapi('SubjectTopic');

const SubjectLocationSchema = z.object({
    type: z.nativeEnum(LocationType),
    text: z.string(),
    coordinates: z.object({
        lat: z.number(),
        lng: z.number(),
    }).nullable().openapi({ description: 'Centroid of the location geometry. Null when the geometry is missing.' }),
}).openapi('SubjectLocation');

const SubjectIntroducerSchema = z.object({
    id: z.string(),
    name: z.string(),
    name_en: z.string(),
}).openapi('SubjectIntroducer');

const SubjectSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    cityId: z.string(),
    meetingId: z.string(),
    meetingName: z.string(),
    meetingNameEn: z.string(),
    meetingDate: z.string().datetime(),
    agendaItemIndex: z.number().int().nullable().openapi({ description: 'Position on the official agenda. Null for a non-agenda subject.' }),
    agendaItemTitle: z.string().nullable().openapi({ description: 'The item as written on the official agenda.' }),
    nonAgendaReason: z.nativeEnum(NonAgendaReason).nullable(),
    withdrawn: z.boolean(),
    topic: SubjectTopicSchema.nullable(),
    location: SubjectLocationSchema.nullable(),
    introducedBy: SubjectIntroducerSchema.nullable(),
}).openapi('Subject');

registry.register('SubjectTopic', SubjectTopicSchema);
registry.register('SubjectLocation', SubjectLocationSchema);
registry.register('SubjectIntroducer', SubjectIntroducerSchema);
registry.register('Subject', SubjectSchema);

// --- Shared query parameters ---

const limitQuery = z.string().optional().openapi({
    description: `Maximum number of subjects to return (1-${MAX_SUBJECT_LIMIT}). Defaults to ${DEFAULT_SUBJECT_LIMIT}.`,
    example: '20',
});

const introducerIdQuery = z.string().optional().openapi({
    description: 'Return only subjects introduced by this person.',
});

const includeUnreleasedQuery = z.string().optional().openapi({
    description: 'Include subjects of unreleased meetings, and of a city that is not published. '
        + 'Requires an authorized session for the city, or a service key.',
    example: 'true',
});

const listResponses = {
    200: {
        description: 'List of subjects',
        content: { 'application/json': { schema: z.array(SubjectSchema) } },
    },
    400: {
        description: 'Invalid query parameters',
        content: { 'application/json': { schema: ValidationErrorSchema } },
    },
    401: {
        description: 'includeUnreleased requested without authorization',
        content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
        description: 'Server error',
        content: { 'application/json': { schema: ErrorResponseSchema } },
    },
};

// --- Routes ---

const meetingIdParam = cityIdParam.extend({
    meetingId: z.string().openapi({ description: 'Meeting ID' }),
});

const subjectIdParam = meetingIdParam.extend({
    subjectId: z.string().openapi({ description: 'Subject ID' }),
});

registry.registerPath({
    method: 'get',
    path: '/api/cities/{cityId}/subjects',
    summary: 'List subjects for a city',
    description: 'Returns subjects of released meetings of the given city, newest meeting first, '
        + 'in agenda order within a meeting. The city must be published, and it must belong to the '
        + 'realm of the host that serves the request. Filter by introducer and by meeting date.',
    tags: ['Subjects'],
    request: {
        params: cityIdParam,
        query: z.object({
            introducerId: introducerIdQuery,
            from: z.string().optional().openapi({ description: 'Earliest meeting date, inclusive (ISO 8601).', example: '2025-01-01' }),
            to: z.string().optional().openapi({
                description: 'Latest meeting date, inclusive (ISO 8601). A date with no time of day covers the whole day.',
                example: '2025-12-31',
            }),
            limit: limitQuery,
            includeUnreleased: includeUnreleasedQuery,
        }),
    },
    responses: listResponses,
});

registry.registerPath({
    method: 'get',
    path: '/api/cities/{cityId}/meetings/{meetingId}/subjects',
    summary: 'List subjects for a meeting',
    description: 'Returns the subjects of one meeting, in agenda order. The meeting must be released, '
        + 'and its city must be published in the realm of the host that serves the request.',
    tags: ['Subjects'],
    request: {
        params: meetingIdParam,
        query: z.object({
            introducerId: introducerIdQuery,
            limit: limitQuery,
            includeUnreleased: includeUnreleasedQuery,
        }),
    },
    responses: listResponses,
});

registry.registerPath({
    method: 'get',
    path: '/api/cities/{cityId}/meetings/{meetingId}/subjects/{subjectId}',
    summary: 'Get a subject',
    tags: ['Subjects'],
    request: {
        params: subjectIdParam,
        query: z.object({
            includeUnreleased: includeUnreleasedQuery,
        }),
    },
    responses: {
        200: {
            description: 'The subject',
            content: { 'application/json': { schema: SubjectSchema } },
        },
        401: {
            description: 'includeUnreleased requested without authorization',
            content: { 'application/json': { schema: ErrorResponseSchema } },
        },
        404: {
            description: 'Subject not found',
            content: { 'application/json': { schema: ErrorResponseSchema } },
        },
        500: {
            description: 'Server error',
            content: { 'application/json': { schema: ErrorResponseSchema } },
        },
    },
});

// --- Admin routes ---

const UpdateSubjectSchema = z.object({
    nonAgendaReason: z.nativeEnum(NonAgendaReason).nullable().optional(),
    withdrawn: z.boolean().optional(),
}).openapi('UpdateSubject');

registry.register('UpdateSubject', UpdateSubjectSchema);

registry.registerPath({
    method: 'patch',
    path: '/api/cities/{cityId}/meetings/{meetingId}/subjects/{subjectId}',
    summary: 'Update the agenda flags of a subject',
    description: 'Updates `nonAgendaReason` and `withdrawn`. Requires superadmin access.',
    tags: ['Subjects'],
    security: [{ [sessionAuth.name]: [] }],
    'x-access-level': 'superadmin',
    request: {
        params: subjectIdParam,
        body: {
            required: true,
            content: { 'application/json': { schema: UpdateSubjectSchema } },
        },
    },
    responses: {
        200: {
            description: 'The updated agenda flags',
            content: {
                'application/json': {
                    schema: z.object({
                        id: z.string(),
                        nonAgendaReason: z.nativeEnum(NonAgendaReason).nullable(),
                        withdrawn: z.boolean(),
                    }),
                },
            },
        },
        400: {
            description: 'Invalid request body',
            content: { 'application/json': { schema: ErrorResponseSchema } },
        },
        403: {
            description: 'Superadmin access required',
            content: { 'application/json': { schema: ErrorResponseSchema } },
        },
        404: {
            description: 'Subject not found',
            content: { 'application/json': { schema: ErrorResponseSchema } },
        },
    },
});
