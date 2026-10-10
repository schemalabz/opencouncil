import * as z from 'zod';
import { AuthorityType, MeetingKind, MeetingScheduleStatus } from '@prisma/client';
import { OFFERED_FORMATS, SCHEDULE_STATUS_REASON_MAX_LENGTH, type MEETING_RECORD_INPUT_KEYS } from '@/lib/meetingLifecycleRules';
import { STARTABLE_MEETING_TASKS } from '@/lib/tasks/startableTasks';
import { baseCityFields, cityIdSchema } from '@/lib/zod-schemas/city';
import { webUrl } from '@/lib/zod-schemas/primitives';

/**
 * The input schemas of the admin tools. adminTools.ts registers them, and
 * adminData.ts takes their output types as its arguments, so a field exists in
 * one place only. They are in their own module because the tests stub
 * adminData.ts as a whole, and adminTools.ts imports adminData.ts.
 */

const isoDateTime = z.iso.datetime({ offset: true })
    .describe('ISO 8601 date and time with a UTC offset, e.g. "2026-10-05T18:00:00+03:00"');

/**
 * The record of a meeting, as the municipality announces it. Both meeting
 * tools take the same fields; the write path checks the rules of the record.
 * The link to a postponed meeting is not here: create_meeting adds it, and
 * update_meeting never changes it, because a new link changes which meetings
 * the public sees.
 */
const meetingRecordInput = {
    kind: z.enum(MeetingKind).nullable().optional()
        .describe('The kind that the invitation prints: regular (Τακτική), urgent (Έκτακτη), accountability '
            + '(Ειδική Λογοδοσίας), activityReport, budget, presidencyElection. Null (the default on create): the record states no single kind, e.g. the invitation is not read yet. '
            + 'The four special kinds (accountability, activityReport, budget, presidencyElection) belong to a council only'),
    sessionNumber: z.number().int().positive().nullable().optional()
        .describe('The session number that the invitation prints, e.g. 3 for «3η Τακτική». Never compute it'),
    scheduleStatus: z.enum(MeetingScheduleStatus).optional()
        .describe('scheduled, postponed or cancelled. A postponed or cancelled meeting stays public with its status'),
    scheduleStatusReason: z.string().max(SCHEDULE_STATUS_REASON_MAX_LENGTH).nullable().optional()
        .describe('Why the meeting was postponed or cancelled, as the municipality says it'),
    format: z.enum(OFFERED_FORMATS).nullable().optional().describe('How the meeting takes place. Null (the default on create): not stated yet, the meeting is expected as usual'),
    closedToPublic: z.boolean().optional()
        .describe('The council decided to meet behind closed doors. Readers see this fact. The meeting is still recorded and transcribed'),
    place: z.string().max(200).nullable().optional()
        .describe('Where the meeting takes place, when it is not the usual hall of the body'),
} satisfies Record<(typeof MEETING_RECORD_INPUT_KEYS)[number], z.ZodType>;

export const createMeetingToolInput = z.object({
    cityId: z.string().min(1),
    name: z.string().min(2).optional()
        .describe('Omit it: the site derives the title from the kind and the session number, '
            + 'and shows the body and the date next to it. Set it only for a meeting that needs '
            + 'a special name, in the language of the city'),
    name_en: z.string().min(2).optional()
        .describe('The English form of a special name. Omit it, as name'),
    dateTime: isoDateTime,
    youtubeUrl: webUrl().optional().describe('URL of the meeting video'),
    agendaUrl: webUrl().optional().describe('URL of the agenda PDF'),
    administrativeBodyId: z.string().min(1).optional()
        .describe('The body that meets (council, committee, community). See get_city'),
    processAgenda: z.boolean().default(false)
        .describe('Also queue the task that extracts the subjects from the agenda PDF. Needs agendaUrl'),
    ...meetingRecordInput,
    postponedFromId: z.string().min(1).optional()
        .describe('The id of the postponed meeting that this new meeting replaces. When this meeting '
            + 'is released, the postponed meeting is no longer public'),
});
export type CreateMeetingToolArgs = z.output<typeof createMeetingToolInput>;

export const updateMeetingToolInput = z.object({
    cityId: z.string().min(1),
    meetingId: z.string().min(1),
    name: z.string().min(2).nullable().optional()
        .describe('A special name that replaces the derived title, in the language of the city. '
            + 'Omit it to keep the name as it is. Never send back the name that get_meeting returns: '
            + 'that is the derived label, and the site ignores it here'),
    name_en: z.string().min(2).nullable().optional()
        .describe('The English form of a special name. Omit it, as name'),
    dateTime: isoDateTime.optional(),
    youtubeUrl: webUrl().nullable().optional(),
    agendaUrl: webUrl().nullable().optional(),
    administrativeBodyId: z.string().min(1).nullable().optional(),
    ...meetingRecordInput,
});
export type UpdateMeetingToolArgs = z.output<typeof updateMeetingToolInput>;

export const agendaUploadUrlToolInput = z.object({
    cityId: z.string().min(1),
    identifier: z.string().regex(/^[a-z0-9-]{1,40}$/)
        .describe('Names the file: the date of the meeting, e.g. "2026-10-15", or the date and the '
            + 'body, e.g. "2026-10-15-oikonomiki". Lowercase letters a-z, digits and dashes only'),
    format: z.enum(['pdf', 'docx']).default('pdf')
        .describe('The format of the file that you will upload. The answer carries the matching Content-Type'),
});
export type AgendaUploadUrlToolArgs = z.output<typeof agendaUploadUrlToolInput>;

export const startTaskToolInput = z.object({
    cityId: z.string().min(1),
    meetingId: z.string().min(1),
    type: z.enum(STARTABLE_MEETING_TASKS),
    force: z.boolean().default(false)
        .describe('Run the step again although it already succeeded or is running. On transcribe this deletes the transcript'),
    videoUrl: webUrl().optional()
        .describe('transcribe only: the video to transcribe. Defaults to the youtubeUrl of the meeting. '
            + 'A URL passed here is STORED as the youtubeUrl of the meeting, which the public page embeds'),
    agendaUrl: webUrl().optional()
        .describe('processAgenda only: the agenda PDF. Defaults to the agendaUrl of the meeting'),
    additionalInstructions: z.string().min(1).optional()
        .describe('summarize only: free-text guidance for the summary, e.g. what to pay attention to'),
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
    id: cityIdSchema.describe('URL slug: lowercase letters a-z and dashes only, e.g. "chania"'),
    name: baseCityFields.name.describe('City name in its own language, e.g. "Χανιά"'),
    name_en: baseCityFields.name_en.describe('City name in English, e.g. "Chania"'),
    name_municipality: baseCityFields.name_municipality.describe('Official name, e.g. "Δήμος Χανίων"'),
    name_municipality_en: baseCityFields.name_municipality_en
        .describe('Official name in English, e.g. "Municipality of Chania"'),
    timezone: baseCityFields.timezone.describe('IANA time zone, e.g. "Europe/Athens"'),
    authorityType: baseCityFields.authorityType.default(AuthorityType.municipality),
    language: baseCityFields.language.optional()
        .describe('Content language. Omit for the default language of this domain'),
});
export type CreateCityToolArgs = z.output<typeof createCityToolInput>;
