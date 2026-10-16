import { z } from 'zod4';
import { z as z3 } from 'zod';
import { AuthorityType, MeetingKind, MeetingScheduleStatus } from '@prisma/client';
import type { McpServer, ServerContext } from '@modelcontextprotocol/server';
import { identityFromContext } from './auth';
import type { McpAdminAccess } from './adminAccess';
import {
    DOCUMENT_KINDS,
    mcpCreateAgendaUploadUrl,
    mcpCreateCity,
    mcpCreateDocumentUploadUrl,
    mcpCreateMeeting,
    mcpListTranscriptEdits,
    mcpPopulateCity,
    mcpRevertTranscriptEdit,
    mcpStartTask,
    mcpUpdateMeeting,
} from './adminData';
import { category, run, toolSchema } from './toolSupport';
import { STARTABLE_MEETING_TASKS } from '@/lib/tasks/startableTasks';
import { baseCityFields, cityIdSchema } from '@/lib/zod-schemas/city';
import { cityPopulationSchema } from '@/lib/zod-schemas/cityPopulation';
import { OFFERED_FORMATS, SCHEDULE_STATUS_REASON_MAX_LENGTH, type MEETING_RECORD_INPUT_KEYS } from '@/lib/meetingLifecycleRules';

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
        .describe('The kind that the invitation prints: ordinary (Τακτική), special (Ειδική, for another purpose), '
            + 'accountability (Ειδική Λογοδοσίας), activityReport (Ειδική Απολογισμού Πεπραγμένων), budget (Ειδική Προϋπολογισμού), '
            + 'presidencyElection (Ειδική Εκλογής Προεδρείου), financialAccounts (Οικονομικές Καταστάσεις). '
            + 'Null (the default on create): the record states no single kind, e.g. the invitation is not read yet. '
            + 'Every kind except ordinary belongs to a council only. An urgent meeting is not a kind: set urgent. '
            + 'The kind, urgent and sessionNumber are facts of a Greek city only: leave them out for a city of another realm'),
    urgent: z.boolean().optional()
        .describe('The invitation convenes the meeting urgently («Έκτακτη» or «Κατεπείγουσα»). Any kind can be urgent, '
            + 'on every body. Default on create: false'),
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

/**
 * The admin suite. The access decides what is registered, and so what is
 * advertised: meeting tools for anyone with admin access (a city or a body
 * administrator), city tools for a superadmin only. The access comes from the route handler and is a
 * display decision — each handler authorizes again in adminData.
 */
export function registerAdminTools(server: McpServer, access: McpAdminAccess) {
    registerMeetingAdminTools(server);
    registerTaskAdminTools(server);
    if (access.superadmin) {
        registerCityAdminTools(server);
    }
}

function registerMeetingAdminTools(server: McpServer) {
    server.registerTool(
        'create_meeting',
        {
            title: 'Create meeting',
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
            _meta: category('admin'),
            description:
                'Create a council meeting in a municipality, or of an administrative body, that you administer. '
                + 'An administrator of a body must pass that body. The meeting is saved as a '
                + 'draft (unreleased), so the public does not see it. It also creates the calendar event. '
                + 'Call list_meetings first with the same date: a second call creates a second meeting. '
                + 'Pass administrativeBodyId (see get_city): the meeting list of the site shows the council '
                + 'by default and hides a meeting that has no body. The meeting has no name to set: the site '
                + 'derives its title from the kind and the session number. To backfill a past meeting from the '
                + "municipality's own verbatim minutes, pass municipalMinutesUrl with the recording: the transcript "
                + 'is then corrected from the minutes and the meeting needs no human review. '
                + 'Confirm the details with the user before you call.',
            inputSchema: z.object({
                cityId: z.string().min(1),
                dateTime: isoDateTime,
                youtubeUrl: z.url().optional().describe('URL of the meeting video'),
                agendaUrl: z.url().optional().describe('URL of the agenda PDF'),
                municipalMinutesUrl: z.url().optional()
                    .describe("URL of the municipality's own verbatim minutes (πρακτικά), a PDF or a DOCX. "
                        + 'Upload one with create_document_upload_url. A meeting that has them is corrected from them '
                        + 'after fixTranscript, with no human review'),
                administrativeBodyId: z.string().min(1).optional()
                    .describe('The body that meets (council, committee, community). See get_city'),
                processAgenda: z.boolean().default(false)
                    .describe('Also queue the task that extracts the subjects from the agenda PDF. Needs agendaUrl'),
                ...meetingRecordInput,
                postponedFromId: z.string().min(1).optional()
                    .describe('The id of the postponed meeting that this new meeting replaces. When this meeting '
                        + 'is released, the postponed meeting is no longer public'),
            }),
        },
        (args, ctx: ServerContext) => run(() => mcpCreateMeeting(identityFromContext(ctx), args))
    );

    server.registerTool(
        'update_meeting',
        {
            title: 'Update meeting',
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
            _meta: category('admin'),
            description:
                'Change the details of a meeting in a municipality, or of an administrative body, that you administer: '
                + 'date, video URL, agenda URL, municipal minutes URL, administrative body, kind, urgency, session number, status, format or place. A field that '
                + 'you omit stays as it is. Pass null to clear youtubeUrl, agendaUrl, municipalMinutesUrl or administrativeBodyId. The name '
                + 'is not a field: the site derives it from the kind and the session number. Mark a '
                + 'meeting postponed or cancelled with scheduleStatus. An administrator of a body cannot move a meeting '
                + 'to a body that they do not administer. It cannot link a meeting to a postponed '
                + 'meeting, it cannot release a meeting and it cannot delete one. Confirm the change with the '
                + 'user before you call.',
            inputSchema: z.object({
                cityId: z.string().min(1),
                meetingId: z.string().min(1),
                dateTime: isoDateTime.optional(),
                youtubeUrl: z.url().nullable().optional(),
                agendaUrl: z.url().nullable().optional(),
                municipalMinutesUrl: z.url().nullable().optional()
                    .describe("The municipality's own verbatim minutes. Set it before transcribe to backfill the meeting from them"),
                administrativeBodyId: z.string().min(1).nullable().optional(),
                ...meetingRecordInput,
            }),
        },
        (args, ctx: ServerContext) => run(() => mcpUpdateMeeting(identityFromContext(ctx), args))
    );

    const documentUploadInput = {
        cityId: z.string().min(1),
        identifier: z.string().regex(/^[a-z0-9-]{1,40}$/)
            .describe('Names the file: the date of the meeting, e.g. "2026-10-15", or the date and the '
                + 'body, e.g. "2026-10-15-oikonomiki". Lowercase letters a-z, digits and dashes only'),
        format: z.enum(['pdf', 'docx']).default('pdf')
            .describe('The format of the file that you will upload. The answer carries the matching Content-Type'),
    };

    server.registerTool(
        'create_document_upload_url',
        {
            title: 'Create document upload URL',
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
            _meta: category('admin'),
            description:
                'Get a short-lived URL to upload a document of a meeting to the file storage of OpenCouncil, '
                + 'in a municipality that you administer: the agenda, or the municipality\'s own verbatim minutes. '
                + 'Use it when the file has no stable public URL: an email attachment, a chat attachment, a download '
                + 'link that expires. Send the file with a PUT to `uploadUrl`, with the returned `headers`, within '
                + '`expiresIn` seconds. The file is then public at `publicUrl`: pass it as agendaUrl or '
                + 'municipalMinutesUrl to create_meeting or update_meeting. A PDF or a .docx file: the task server '
                + 'reads these two formats only.',
            inputSchema: z.object({
                ...documentUploadInput,
                kind: z.enum(Object.keys(DOCUMENT_KINDS) as [keyof typeof DOCUMENT_KINDS, ...(keyof typeof DOCUMENT_KINDS)[]])
                    .describe('agenda: the invitation with the agenda. municipalMinutes: the verbatim minutes the municipality wrote'),
            }),
        },
        (args, ctx: ServerContext) => run(() => mcpCreateDocumentUploadUrl(identityFromContext(ctx), args))
    );

    // The name of earlier releases, kept for one release: the same call with kind agenda.
    server.registerTool(
        'create_agenda_upload_url',
        {
            title: 'Create agenda upload URL',
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
            _meta: category('admin'),
            description:
                'Get a short-lived URL to upload the agenda of a meeting. The same as create_document_upload_url '
                + 'with kind agenda; prefer that tool.',
            inputSchema: z.object(documentUploadInput),
        },
        (args, ctx: ServerContext) => run(() => mcpCreateAgendaUploadUrl(identityFromContext(ctx), args))
    );

    server.registerTool(
        'list_transcript_edits',
        {
            title: 'List transcript edits',
            annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
            _meta: category('admin'),
            description:
                'The record of every change to the transcript of a meeting in a municipality that you administer: '
                + 'the text before and after, who made it (a person, or a task run: fixTranscript or fixFromMinutes), '
                + 'and for a change from the municipal minutes, the page and the speaker label of the turn it came from. '
                + 'Each edit carries a url that opens the recording at that moment. Pass taskId (from the tasks of '
                + 'get_meeting) to see what one run changed; omit it for the whole history, oldest first. '
                + 'Use it to check a backfilled meeting and to find a wrong change to revert.',
            inputSchema: z.object({
                cityId: z.string().min(1),
                meetingId: z.string().min(1),
                taskId: z.string().min(1).optional().describe('The run whose edits to list'),
            }),
        },
        (args, ctx: ServerContext) => run(() => mcpListTranscriptEdits(identityFromContext(ctx), args))
    );

    server.registerTool(
        'revert_transcript_edit',
        {
            title: 'Revert a transcript edit',
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
            _meta: category('admin'),
            description:
                'Put the text from before one edit back, in a municipality that you administer. The utterance gets '
                + 'the beforeText of the edit, recorded as a new edit by you: nothing is deleted, and no task rewrites '
                + 'the utterance again. The speaker is unchanged. Confirm with the user before you call.',
            inputSchema: z.object({
                cityId: z.string().min(1),
                meetingId: z.string().min(1),
                editId: z.string().min(1).describe('The id of the edit, from list_transcript_edits'),
            }),
        },
        (args, ctx: ServerContext) => run(() => mcpRevertTranscriptEdit(identityFromContext(ctx), args))
    );
}

function registerTaskAdminTools(server: McpServer) {
    server.registerTool(
        'start_task',
        {
            title: 'Start a pipeline task',
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
            _meta: category('admin'),
            description:
                'Start one step of the processing pipeline for a meeting in a municipality, or of an administrative body, that you administer, '
                + 'as the admin page of the meeting does. The steps, in order: `processAgenda` reads the subjects '
                + 'from the agenda PDF; `transcribe` turns the video into a transcript (and starts fixTranscript '
                + 'on its own when it finishes); `fixTranscript` corrects the transcript; `fixFromMinutes` corrects it '
                + "from the municipality's own minutes and starts summarize on its own (it runs by itself after "
                + 'fixTranscript when the meeting has municipalMinutesUrl); `summarize` writes the '
                + 'subjects and summaries from the transcript. Each step spends real money on the task server and '
                + 'takes minutes: confirm with the user before you call, and read get_meeting first — its `tasks` '
                + 'list shows what ran, what is running and what failed. A step that is running is refused: wait '
                + 'for it. A step that already succeeded is refused unless `force` is passed. `force` on '
                + 'transcribe DELETES the existing transcript and its highlights: say so to the user and get an '
                + 'explicit confirmation.',
            inputSchema: z.object({
                cityId: z.string().min(1),
                meetingId: z.string().min(1),
                type: z.enum(STARTABLE_MEETING_TASKS),
                force: z.boolean().default(false)
                    .describe('Run the step again although it already succeeded or is running. On transcribe this deletes the transcript'),
                videoUrl: z.url().optional()
                    .describe('transcribe only: the video to transcribe. Defaults to the youtubeUrl of the meeting. '
                        + 'A URL passed here is STORED as the youtubeUrl of the meeting, which the public page embeds'),
                agendaUrl: z.url().optional()
                    .describe('processAgenda only: the agenda PDF. Defaults to the agendaUrl of the meeting'),
                municipalMinutesUrl: z.url().optional()
                    .describe("fixFromMinutes only: the municipality's minutes. Defaults to the municipalMinutesUrl of the meeting. "
                        + 'A URL passed here is STORED on the meeting'),
                additionalInstructions: z.string().min(1).optional()
                    .describe('summarize only: free-text guidance for the summary, e.g. what to pay attention to'),
            }).superRefine((args, ctx) => {
                // An option of another step would be dropped without a word,
                // and the caller would believe it was used.
                const belongsTo = { videoUrl: 'transcribe', agendaUrl: 'processAgenda', municipalMinutesUrl: 'fixFromMinutes', additionalInstructions: 'summarize' } as const;
                for (const [option, step] of Object.entries(belongsTo)) {
                    if (args[option as keyof typeof belongsTo] !== undefined && args.type !== step) {
                        ctx.addIssue({ code: 'custom', path: [option], message: `${option} applies to ${step} only` });
                    }
                }
            }),
        },
        (args, ctx: ServerContext) => run(() => mcpStartTask(identityFromContext(ctx), args))
    );
}

function registerCityAdminTools(server: McpServer) {
    server.registerTool(
        'create_city',
        {
            title: 'Create city',
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
            _meta: category('admin'),
            description:
                'Superadmin only. Create a municipality or a region on this domain. The city is saved as '
                + 'pending, so it is not public, and it has no logo and no boundary: those are added on the '
                + 'site. Fill it next with populate_city. The id is permanent and is part of every URL of '
                + 'the city. Confirm the id and the names with the user before you call.',
            inputSchema: toolSchema(z3.object({
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
            })),
        },
        (args, ctx: ServerContext) => run(() => mcpCreateCity(identityFromContext(ctx), args))
    );

    server.registerTool(
        'populate_city',
        {
            title: 'Populate city',
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
            _meta: category('admin'),
            description:
                'Superadmin only. Save the parties, administrative bodies, people and roles of a city in one '
                + 'call. It works only on a city that has no parties, people, roles or meetings, so it runs '
                + 'one time for each city: collect the complete council before you call. A role names its '
                + 'party or its administrative body by the exact `name` of an entry in this same call. '
                + 'Show the complete list to the user and get a confirmation before you call.',
            // The schema of the City Creator, so both paths save the same data.
            inputSchema: toolSchema(cityPopulationSchema),
        },
        (args, ctx: ServerContext) => run(() => mcpPopulateCity(identityFromContext(ctx), args))
    );
}
