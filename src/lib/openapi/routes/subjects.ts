import * as z from 'zod';
import { LocationType, NonAgendaReason } from '@prisma/client';
import { sessionAuthRequirement, editAuthResponses, cityIdParam, meetingIdParam, errorResponseOf, invalidRequestOrMessageResponse, invalidRequestResponse, type Paths } from '@/lib/openapi/registry';
import {
    meetingSubjectListQuerySchema,
    subjectAgendaFlagsSchema,
    subjectListQuerySchema,
    subjectQuerySchema,
} from '@/lib/zod-schemas/subject';

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
}).meta({ id: 'SubjectTopic' });

const SubjectLocationSchema = z.object({
    type: z.enum(LocationType),
    text: z.string(),
    coordinates: z.object({
        lat: z.number(),
        lng: z.number(),
    }).nullable().meta({ description: 'Centroid of the location geometry. Null when the geometry is missing.' }),
}).meta({ id: 'SubjectLocation' });

const SubjectIntroducerSchema = z.object({
    id: z.string(),
    name: z.string(),
    name_en: z.string(),
}).meta({ id: 'SubjectIntroducer' });

const SubjectSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    cityId: z.string(),
    meetingId: z.string(),
    meetingName: z.string(),
    meetingNameEn: z.string(),
    meetingDate: z.iso.datetime(),
    agendaItemIndex: z.number().int().nullable().meta({ description: 'Position on the official agenda. Null for a non-agenda subject.' }),
    agendaItemTitle: z.string().nullable().meta({ description: 'The item as written on the official agenda.' }),
    nonAgendaReason: z.enum(NonAgendaReason).nullable(),
    withdrawn: z.boolean(),
    topic: SubjectTopicSchema.nullable(),
    location: SubjectLocationSchema.nullable(),
    introducedBy: SubjectIntroducerSchema.nullable(),
}).meta({ id: 'Subject' });

const listResponses = {
    200: {
        description: 'List of subjects',
        content: { 'application/json': { schema: z.array(SubjectSchema) } },
    },
    400: invalidRequestResponse('Invalid query parameters'),
    ...editAuthResponses,
    500: errorResponseOf('Server error'),
};


const UpdateSubjectSchema = subjectAgendaFlagsSchema.meta({ id: 'UpdateSubject' });

const subjectIdParam = meetingIdParam.extend({
    subjectId: z.string().meta({ description: 'Subject ID' }),
});

// --- Routes ---

export const subjectsPaths: Paths = {
    '/api/cities/{cityId}/subjects': {
        get: {
            summary: 'List subjects for a city',
            description: 'Returns subjects of released meetings of the given city, newest meeting first, '
                + 'in agenda order within a meeting. The city must be published, and it must belong to the '
                + 'realm of the host that serves the request. Filter by introducer and by meeting date.',
            tags: ['Subjects'],
            requestParams: { path: cityIdParam, query: subjectListQuerySchema },
            responses: listResponses,
        },
    },
    '/api/cities/{cityId}/meetings/{meetingId}/subjects': {
        get: {
            summary: 'List subjects for a meeting',
            description: 'Returns the subjects of one meeting, in agenda order. The meeting must be released, '
                + 'and its city must be published in the realm of the host that serves the request.',
            tags: ['Subjects'],
            requestParams: { path: meetingIdParam, query: meetingSubjectListQuerySchema },
            responses: listResponses,
        },
    },
    '/api/cities/{cityId}/meetings/{meetingId}/subjects/{subjectId}': {
        get: {
            summary: 'Get a subject',
            tags: ['Subjects'],
            requestParams: { path: subjectIdParam, query: subjectQuerySchema },
            responses: {
                200: {
                    description: 'The subject',
                    content: { 'application/json': { schema: SubjectSchema } },
                },
                400: invalidRequestResponse('Invalid query parameters'),
                ...editAuthResponses,
                404: errorResponseOf('Subject not found'),
                500: errorResponseOf('Server error'),
            },
        },
        patch: {
            summary: 'Update the agenda flags of a subject',
            description: 'Updates `nonAgendaReason` and `withdrawn`. Requires superadmin access.',
            tags: ['Subjects'],
            security: sessionAuthRequirement,
            'x-access-level': 'superadmin',
            requestParams: { path: subjectIdParam },
            requestBody: {
                required: true,
                content: { 'application/json': { schema: UpdateSubjectSchema } },
            },
            responses: {
                200: {
                    description: 'The updated agenda flags',
                    content: {
                        'application/json': {
                            schema: SubjectSchema.pick({ id: true, nonAgendaReason: true, withdrawn: true }),
                        },
                    },
                },
                400: invalidRequestOrMessageResponse('Invalid request body, or no fields to update'),
                403: errorResponseOf('Superadmin access required'),
                404: errorResponseOf('Subject not found'),
            },
        },
    },
};
