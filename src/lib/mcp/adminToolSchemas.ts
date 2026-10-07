import * as z from 'zod';
import { AuthorityType, MeetingKind } from '@prisma/client';
import { meetingKindTitle } from '@opencouncil/ui/lib/meeting-title';
import type { MEETING_RECORD_INPUT_KEYS } from '@/lib/meetingLifecycleRules';
import { STARTABLE_MEETING_TASKS } from '@/lib/tasks/startableTasks';
import { baseCityFields, cityIdSchema } from '@/lib/zod-schemas/city';
import { baseMeetingFields } from '@/lib/zod-schemas/meeting';
import { isoZonedDateTime } from '@/lib/zod-schemas/dates';
import { webUrl } from '@/lib/zod-schemas/primitives';

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

export const createMeetingToolInput = z.object({
    cityId: z.string().min(1),
    dateTime: meetingDateTime,
    youtubeUrl: baseMeetingFields.youtubeUrl.optional().meta({ description: 'URL of the meeting video' }),
    agendaUrl: baseMeetingFields.agendaUrl.optional().meta({ description: 'URL of the agenda PDF' }),
    administrativeBodyId: baseMeetingFields.administrativeBodyId.optional()
        .meta({ description: 'The body that meets (council, committee, community, youthCouncil). See get_city' }),
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
});
export type UpdateMeetingToolArgs = z.output<typeof updateMeetingToolInput>;

export const agendaUploadUrlToolInput = z.object({
    cityId: z.string().min(1),
    identifier: z.string().regex(/^[a-z0-9-]{1,40}$/)
        .meta({ description: 'Names the file: the date of the meeting, e.g. "2026-10-15", or the date and the '
            + 'body, e.g. "2026-10-15-oikonomiki". Lowercase letters a-z, digits and dashes only' }),
    format: z.enum(['pdf', 'docx']).default('pdf')
        .meta({ description: 'The format of the file that you will upload. The answer carries the matching Content-Type' }),
});
export type AgendaUploadUrlToolArgs = z.output<typeof agendaUploadUrlToolInput>;

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
        .meta({ description: 'Content language. Omit for the default language of this domain' }),
});
export type CreateCityToolArgs = z.output<typeof createCityToolInput>;
