import * as z from 'zod';
import { AuthorityType, MeetingKind, Realm } from '@prisma/client';
import { meetingKindTitle } from '@opencouncil/ui/lib/meeting-title';
import type { MEETING_RECORD_INPUT_KEYS } from '@/lib/meetingLifecycleRules';
import { STARTABLE_MEETING_TASKS } from '@/lib/tasks/startableTasks';
import { baseCityFields, cityIdSchema } from '@/lib/zod-schemas/city';
import { baseMeetingFields } from '@/lib/zod-schemas/meeting';
import { isoZonedDateTime } from '@/lib/zod-schemas/dates';
import { refuseDuplicateKeys, webUrl } from '@/lib/zod-schemas/primitives';
import { UPLOAD_FORMAT_NAMES, type UploadKind } from '@/types/upload';
import { completeUploadRequestSchema, uploadSizeBytes } from '@/lib/zod-schemas/upload';
import { createTopicSchema, topicLabelKeys } from '@/lib/zod-schemas/topic';

/**
 * The input schemas of the admin tools. adminTools.ts registers them, and
 * adminData.ts takes their output types as its arguments, so a field exists in
 * one place only. They are in their own module so that they load without the
 * write layer: adminData.ts and adminTools.ts pull in server-only, Prisma and
 * env.mjs, and a test of the field rules needs none of them.
 *
 * The meeting tools build on baseMeetingFields, so a meeting that the REST
 * API takes, the tools take too, with the same link and body rules. The date
 * is stricter: REST also takes a date-only value, which the write reads as
 * UTC midnight. An agent must give the start time of the meeting.
 */

const meetingDateTime = isoZonedDateTime({
    error: 'dateTime needs a date, a time and a UTC offset, e.g. 2026-11-05T18:00+02:00',
}).meta({ description: 'Date and start time of the meeting with a UTC offset, e.g. "2026-11-05T18:00+02:00". '
    + 'Seconds are optional. A date without a time, or a time without an offset, is refused' });

/**
 * The record of a meeting, as the municipality announces it. Both meeting
 * tools take the same fields; the write path checks the rules of the record.
 * The link to a postponed meeting is not here: create_meeting adds it, and
 * update_meeting never changes it, because a new link changes which meetings
 * the public sees.
 */
// The words that an invitation prints for each kind, as the meeting titles use them.
const KIND_WORDS = Object.values(MeetingKind).map(kind => `${kind} (${meetingKindTitle(kind, null, 'el')})`).join(', ');

const meetingRecordInput = {
    kind: baseMeetingFields.kind.nullable().optional()
        .meta({ description: `The kind that the invitation prints: ${KIND_WORDS}. `
            + 'Null (the default on create): the record states no single kind, e.g. the invitation is not read yet. '
            + 'An urgent meeting is not a kind: set urgent. '
            + 'The kind, urgent and sessionNumber are facts of a Greek city only: leave them out for a city of another realm' }),
    urgent: baseMeetingFields.urgent.optional()
        .meta({ description: 'The invitation convenes the meeting urgently («Έκτακτη» or «Κατεπείγουσα»). Any kind can be urgent, '
            + 'on every body. Default on create: false' }),
    sessionNumber: baseMeetingFields.sessionNumber.nullable().optional()
        .meta({ description: 'The session number that the invitation prints, e.g. 3 for «3η Τακτική». Never compute it' }),
    scheduleStatus: baseMeetingFields.scheduleStatus.optional(),
    scheduleStatusReason: baseMeetingFields.scheduleStatusReason.nullable().optional(),
    format: baseMeetingFields.format.nullable().optional()
        .meta({ description: 'Null (the default on create): not stated yet, the meeting is expected as usual. '
            + 'byCirculation: a written vote with no recording, so the meeting is never transcribed or polled for a livestream' }),
    closedToPublic: baseMeetingFields.closedToPublic.optional()
        .meta({ description: 'The council decided to meet behind closed doors. Readers see this fact. The meeting is still recorded and transcribed' }),
    place: baseMeetingFields.place.nullable().optional(),
} satisfies Record<(typeof MEETING_RECORD_INPUT_KEYS)[number], z.ZodType>;

export const updateCityToolInput = z.object({
    cityId: cityIdSchema,
    status: z.literal('demo').optional().meta({ description: 'Publish a pending city as a public demo, or leave a demo unchanged. Supported cities are refused. Send separately from geojson.' }),
    geojson: z.string().min(1).optional().meta({ description: 'The complete verified municipal boundary GeoJSON text, not a URL. '
        + 'Use WGS84 [longitude, latitude] coordinates. Accepts Polygon, MultiPolygon, Feature or FeatureCollection; '
        + 'polygonal features are combined and non-polygonal features ignored. Replaces the existing boundary. Send separately from status.' }),
}).strict().superRefine((args, ctx) => {
    if (args.status === undefined && args.geojson === undefined) {
        ctx.addIssue({ code: 'custom', message: 'Supply geojson or status: "demo".' });
    }
    if (args.status !== undefined && args.geojson !== undefined) {
        ctx.addIssue({ code: 'custom', message: 'Send boundary and publication changes in separate calls.' });
    }
});
export type UpdateCityToolArgs = z.output<typeof updateCityToolInput>;

export const createMeetingToolInput = z.object({
    cityId: z.string().min(1),
    dateTime: meetingDateTime,
    youtubeUrl: baseMeetingFields.youtubeUrl.optional().meta({ description: 'URL of the meeting video' }),
    agendaUrl: baseMeetingFields.agendaUrl.optional().meta({ description: 'URL of the agenda PDF' }),
    administrativeBodyId: baseMeetingFields.administrativeBodyId.optional()
        .meta({ description: 'The body that meets (council, committee, community). See get_city' }),
    processAgenda: z.boolean().default(false)
        .meta({ description: 'Also queue the task that extracts the subjects from the agenda PDF. Needs agendaUrl' }),
    ...meetingRecordInput,
    postponedFromId: baseMeetingFields.postponedFromId.optional()
        .meta({ description: 'The id of the postponed meeting that this new meeting replaces. When this meeting '
            + 'is released, the postponed meeting is no longer public' }),
});
export type CreateMeetingToolArgs = z.output<typeof createMeetingToolInput>;

export const updateMeetingToolInput = z.object({
    cityId: z.string().min(1),
    meetingId: z.string().min(1),
    dateTime: meetingDateTime.optional(),
    youtubeUrl: baseMeetingFields.youtubeUrl.nullable().optional(),
    agendaUrl: baseMeetingFields.agendaUrl.nullable().optional(),
    administrativeBodyId: baseMeetingFields.administrativeBodyId.nullable().optional(),
    ...meetingRecordInput,
    released: z.boolean().optional().meta({ description: 'Release or unrelease the meeting. Send this separately from detail edits; uses the normal release lifecycle and notification rules' }),
    dryRun: z.boolean().optional().meta({ description: 'Visibility changes only: preview without changing data or scheduling notifications' }),
}).strict().superRefine(({ cityId, meetingId, released, dryRun, ...details }, ctx) => {
    if (released !== undefined && Object.values(details).some(value => value !== undefined)) {
        ctx.addIssue({ code: 'custom', path: ['released'], message: 'Send a visibility change separately from meeting detail edits.' });
    }
    if (dryRun !== undefined && released === undefined) {
        ctx.addIssue({ code: 'custom', path: ['dryRun'], message: 'dryRun applies to a released change only.' });
    }
});
export type UpdateMeetingToolArgs = z.output<typeof updateMeetingToolInput>;

/**
 * The kinds of meeting file an assistant can upload: the ones that an MCP
 * tool then takes as a URL. A decision has no MCP tool that reads it yet.
 */
export const MCP_UPLOAD_KINDS = ['agenda', 'recording'] as const satisfies readonly UploadKind[];

export const createUploadUrlToolInput = z.object({
    cityId: z.string().min(1),
    kind: z.enum(MCP_UPLOAD_KINDS)
        .meta({ description: 'What the file is: the agenda of a meeting, or the recording (video or audio) of a meeting' }),
    identifier: z.string().regex(/^[a-z0-9-]{1,40}$/)
        .meta({ description: 'Names the file: the date of the meeting, e.g. "2026-10-15", or the date and the '
            + 'body, e.g. "2026-10-15-oikonomiki". Lowercase letters a-z, digits and dashes only' }),
    format: z.enum(UPLOAD_FORMAT_NAMES)
        .meta({ description: 'The format of the file: pdf or docx for an agenda, mp4, mov or mp3 for a recording. '
            + 'The answer carries the matching Content-Type' }),
    sizeBytes: uploadSizeBytes
        .meta({ description: 'The exact size of the file in bytes, e.g. from `wc -c < <file>`. It decides '
            + 'whether the file goes up in one PUT or in parts' }),
});
export type CreateUploadUrlToolArgs = z.output<typeof createUploadUrlToolInput>;

const completion = completeUploadRequestSchema.shape;
export const completeUploadToolInput = z.object({
    cityId: z.string().min(1),
    key: completion.key.meta({ description: 'The `key` from create_upload_url' }),
    uploadId: completion.uploadId.meta({ description: '`completion.uploadId` from create_upload_url' }),
    token: completion.token.meta({ description: '`completion.token` from create_upload_url' }),
    sizeBytes: completion.sizeBytes.meta({ description: 'The same size as in create_upload_url' }),
});
export type CompleteUploadToolArgs = z.output<typeof completeUploadToolInput>;

export const startTaskToolInput = z.object({
    cityId: z.string().min(1),
    meetingId: z.string().min(1),
    type: z.enum(STARTABLE_MEETING_TASKS),
    force: z.boolean().default(false)
        .meta({ description: 'Run the step again although it already succeeded or is running. On transcribe this deletes the transcript' }),
    videoUrl: webUrl().optional()
        .meta({ description: 'transcribe only: the video to transcribe. Defaults to the youtubeUrl of the meeting. '
            + 'A URL passed here is STORED as the youtubeUrl of the meeting, which the public page embeds' }),
    agendaUrl: webUrl().optional()
        .meta({ description: 'processAgenda only: the agenda PDF. Defaults to the agendaUrl of the meeting' }),
    additionalInstructions: z.string().min(1).optional()
        .meta({ description: 'summarize only: free-text guidance for the summary, e.g. what to pay attention to' }),
}).superRefine((args, ctx) => {
    // An option of another step would be dropped without a word,
    // and the caller would believe it was used.
    const belongsTo = { videoUrl: 'transcribe', agendaUrl: 'processAgenda', additionalInstructions: 'summarize' } as const;
    for (const [option, step] of Object.entries(belongsTo)) {
        if (args[option as keyof typeof belongsTo] !== undefined && args.type !== step) {
            ctx.addIssue({ code: 'custom', path: [option], message: `${option} applies to ${step} only` });
        }
    }
});
export type StartTaskToolArgs = z.output<typeof startTaskToolInput>;

export const createCityToolInput = z.object({
    id: cityIdSchema.meta({ description: 'URL slug: lowercase letters a-z and dashes only, e.g. "chania"' }),
    name: baseCityFields.name.meta({ description: 'City name in its own language, e.g. "Χανιά"' }),
    name_en: baseCityFields.name_en.meta({ description: 'City name in English, e.g. "Chania"' }),
    name_municipality: baseCityFields.name_municipality.meta({ description: 'Official name, e.g. "Δήμος Χανίων"' }),
    name_municipality_en: baseCityFields.name_municipality_en
        .meta({ description: 'Official name in English, e.g. "Municipality of Chania"' }),
    timezone: baseCityFields.timezone.meta({ description: 'IANA time zone, e.g. "Europe/Athens"' }),
    authorityType: baseCityFields.authorityType.default(AuthorityType.municipality),
    language: baseCityFields.language.optional()
        .meta({ description: 'The language the council speaks in its meetings. Omit for the default language of the realm; required in a realm whose UI is English' }),
    realm: z.enum(Realm).optional()
        .meta({ description: 'The realm (country) of the city. Omit for the realm of this domain' }),
});
export type CreateCityToolArgs = z.output<typeof createCityToolInput>;

// The fields and rules of the topic form of /admin/topics.
const topicFields = createTopicSchema.shape;
export const MAX_TOPICS_PER_CALL = 50;

export const createTopicsToolInput = z.object({
    realm: topicFields.realm.meta({ description: 'The realm (country) whose taxonomy gets the topics. See list_realms' }),
    topics: z.array(z.object({
        name: topicFields.name.meta({ description: 'The name in the language of the realm\'s councils. '
            + 'processAgenda and summarize choose a topic for each subject by this name' }),
        name_en: topicFields.name_en.meta({ description: 'The name in English, for the English interface' }),
        colorHex: topicFields.colorHex.meta({ description: 'Colour as "#rrggbb", distinct from the other topics of the realm' }),
        icon: topicFields.icon.meta({ description: 'A lucide icon name, e.g. "landmark", "bus", "leaf"' }),
        description: topicFields.description.meta({ description: 'What the topic covers, with the local institutions and terms. '
            + 'The model reads it to choose a topic' }),
    })).min(1).max(MAX_TOPICS_PER_CALL).superRefine((topics, ctx) => refuseDuplicateKeys(ctx, topics, {
        path: [], field: 'name', keysOf: topicLabelKeys,
        message: (topic, first) => `"${topic.name}" (${topic.name_en}) shares a name or English name with topics[${first}]. `
            + 'The search finds a topic by either, so each must be different',
    })),
});
export type CreateTopicsToolArgs = z.output<typeof createTopicsToolInput>;

export const inspectMediaToolInput = z.object({ url: webUrl() });
export type InspectMediaToolArgs = z.output<typeof inspectMediaToolInput>;
