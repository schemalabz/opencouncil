import * as z from 'zod';
import { MeetingFormat, MeetingKind, MeetingScheduleStatus } from '@prisma/client';
import { sessionAuthRequirement, ValidationErrorSchema, ErrorResponseSchema, cityIdParam, meetingIdParam, type Paths } from '@/lib/openapi/registry';
import { AdministrativeBodySchema, CityWithGeometrySchema, PartyWithPeopleSchema, PersonWithRolesSchema } from '@/lib/openapi/entities';
import { meetingListQuerySchema, meetingSchema } from '@/lib/zod-schemas/meeting';

// --- Response Schemas ---

// Matches CouncilMeetingWithAdminBody — the shape returned by create/edit/get handlers.
// The admin responses carry the stored name, an override that is null when the
// name is derived. The public list carries the display name in `name`/`name_en`.
const MeetingSchema = z.object({
    id: z.string(),
    name: z.string().nullable().meta({ description: 'In public responses, the name to print on its own: the body, the title and the date («Δημοτικό Συμβούλιο · 3η Τακτική · 12/03/2026»), or the override. In admin responses, the stored override (null when derived).' }),
    name_en: z.string().nullable(),
    title: z.string().optional().meta({ description: 'Public responses only: the short title («3η Τακτική»), for a place that shows the body and the date next to it.' }),
    title_en: z.string().optional(),
    dateTime: z.iso.datetime(),
    cityId: z.string(),
    youtubeUrl: z.string().nullable(),
    agendaUrl: z.string().nullable(),
    videoUrl: z.string().nullable(),
    audioUrl: z.string().nullable(),
    released: z.boolean(),
    muxPlaybackId: z.string().nullable(),
    calendarEventId: z.string().nullable().meta({ description: 'ID of the Google Calendar event of the meeting.' }),
    administrativeBodyId: z.string().nullable(),
    administrativeBody: AdministrativeBodySchema.nullable(),
    scheduleStatus: z.enum(MeetingScheduleStatus),
    scheduleStatusReason: z.string().nullable(),
    kind: z.enum(MeetingKind).nullable().meta({ description: 'Null: the record states no single kind. The invitation is not read yet, the record holds several meetings, or the meeting is none of these kinds.' }),
    sessionNumber: z.number().int().nullable().meta({ description: 'The official number, as the municipality prints it. Not unique.' }),
    format: z.enum(MeetingFormat).nullable().meta({ description: 'Null: not stated yet. The meeting is expected as usual, with a recording, in the hall of its body.' }),
    closedToPublic: z.boolean(),
    place: z.string().nullable().meta({ description: 'In public responses, the place of the meeting or else of its body.' }),
    continuationOfId: z.string().nullable().optional().meta({ description: 'Admin responses only.' }),
    postponedFromId: z.string().nullable().optional().meta({ description: 'Admin responses only. Public responses carry postponedFromDate instead.' }),
    hiddenByPostponement: z.boolean().optional().meta({ description: 'Admin responses only.' }),
    postponedFromDate: z.iso.datetime().nullable().optional().meta({ description: 'Public responses only: the date for which the meeting was first scheduled, when it replaces a postponed meeting.' }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
}).meta({ id: 'Meeting' });

// The list endpoint returns the WithSubjects variant (CouncilMeetingWithAdminBodyAndSubjects).
// subjects have a rich shape; documented as an opaque array here.
const MeetingWithSubjectsSchema = MeetingSchema.extend({
    subjects: z.array(z.unknown()),
}).meta({ id: 'MeetingWithSubjects' });

// POST additionally returns processAgendaStatus when processAgenda was requested.
const MeetingCreatedSchema = MeetingSchema.extend({
    processAgendaStatus: z.string().optional(),
}).meta({ id: 'MeetingCreated' });

const MeetingDataSchema = z.object({
    meeting: MeetingSchema,
    transcriptHiddenForReview: z.boolean(),
    transcript: z.array(z.unknown()),
    speakerTags: z.array(z.unknown()),
    people: z.array(PersonWithRolesSchema),
    parties: z.array(PartyWithPeopleSchema),
    subjects: z.array(z.unknown()),
    city: CityWithGeometrySchema,
    taskStatus: z.unknown(),
}).meta({ id: 'MeetingData' });

// --- Request Schemas ---

// The validation schema of the route handler. A transformed field (date)
// renders as the string the caller sends.
const CreateMeetingSchema = meetingSchema.meta({ id: 'CreateMeeting' });

// Update reuses the same source but drops the create-only fields the PUT handler
// ignores: meetingId (identified by the URL) and processAgenda (POST-only trigger).
const UpdateMeetingSchema = meetingSchema.omit({ meetingId: true, processAgenda: true }).meta({ id: 'UpdateMeeting' });

// --- Routes ---

export const meetingsPaths: Paths = {
    '/api/cities/{cityId}/meetings': {
        get: {
            summary: 'List meetings for a city',
            description: 'Returns the released meetings of the given city, ordered by date descending. '
                + 'With includeUnreleased=true, an authorized caller also gets the unreleased ones.',
            tags: ['Meetings'],
            requestParams: { path: cityIdParam, query: meetingListQuerySchema },
            responses: {
                200: {
                    description: 'List of meetings',
                    content: { 'application/json': { schema: z.array(MeetingWithSubjectsSchema) } },
                },
                400: {
                    description: 'Invalid query parameters',
                    content: { 'application/json': { schema: ValidationErrorSchema } },
                },
                500: {
                    description: 'Server error',
                    content: { 'application/json': { schema: ErrorResponseSchema } },
                },
            },
        },
        post: {
            summary: 'Create a meeting',
            description: 'Creates a new council meeting for the given city. Requires admin authorization for the city.',
            tags: ['Meetings'],
            security: sessionAuthRequirement,
            requestParams: { path: cityIdParam },
            requestBody: {
                required: true,
                content: { 'application/json': { schema: CreateMeetingSchema } },
            },
            responses: {
                201: {
                    description: 'Meeting created',
                    content: { 'application/json': { schema: MeetingCreatedSchema } },
                },
                400: {
                    description: 'Invalid meeting data',
                    content: { 'application/json': { schema: ValidationErrorSchema } },
                },
                401: {
                    description: 'Unauthorized — authentication required',
                    content: { 'application/json': { schema: ErrorResponseSchema } },
                },
                // Note: no 409 is documented. The handler auto-generates a unique
                // meetingId when omitted (retrying on collision), and a client-supplied
                // duplicate id currently surfaces as a 500 rather than a 409 — see the
                // follow-up on aligning handler status codes with the documented spec.
            },
            'x-access-level': 'admin',
        },
    },
    '/api/cities/{cityId}/meetings/{meetingId}': {
        get: {
            summary: 'Get a meeting',
            description: 'Returns full meeting data including transcript, people, parties, and subjects. Transcript is omitted when hidden for review.',
            tags: ['Meetings'],
            requestParams: { path: meetingIdParam },
            responses: {
                200: {
                    description: 'Full meeting data',
                    content: { 'application/json': { schema: MeetingDataSchema } },
                },
                404: {
                    description: 'Meeting not found',
                    content: { 'application/json': { schema: ErrorResponseSchema } },
                },
                500: {
                    description: 'Server error',
                    content: { 'application/json': { schema: ErrorResponseSchema } },
                },
            },
        },
        put: {
            summary: 'Update a meeting',
            description: 'Updates an existing meeting. Requires admin authorization for the city.',
            tags: ['Meetings'],
            security: sessionAuthRequirement,
            requestParams: { path: meetingIdParam },
            requestBody: {
                required: true,
                content: { 'application/json': { schema: UpdateMeetingSchema } },
            },
            responses: {
                200: {
                    description: 'Updated meeting',
                    content: { 'application/json': { schema: MeetingSchema } },
                },
                400: {
                    description: 'Invalid meeting data',
                    content: { 'application/json': { schema: ValidationErrorSchema } },
                },
                401: {
                    description: 'Unauthorized — admin access required for this city',
                    content: { 'application/json': { schema: ErrorResponseSchema } },
                },
                500: {
                    description: 'Server error',
                    content: { 'application/json': { schema: ErrorResponseSchema } },
                },
            },
            'x-access-level': 'admin',
        },
    },
};
