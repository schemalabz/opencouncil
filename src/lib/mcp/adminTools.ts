import type { McpServer, ServerContext } from '@modelcontextprotocol/server';
import { identityFromContext } from './auth';
import type { McpAdminAccess } from './adminAccess';
import {
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
import {
    agendaUploadUrlToolInput,
    createCityToolInput,
    createMeetingToolInput,
    documentUploadUrlToolInput,
    listTranscriptEditsToolInput,
    revertTranscriptEditToolInput,
    startTaskToolInput,
    updateMeetingToolInput,
} from './adminToolSchemas';
import { category, run } from './toolSupport';
import { cityPopulationSchema } from '@/lib/zod-schemas/cityPopulation';

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
                + 'draft (unreleased), so the public does not see it, and a draft notifies no subscriber: '
                + 'an admin releases it from the admin page, and the release notifies them. It also creates the calendar event. '
                + 'Call list_meetings first with the same date: a second call creates a second meeting. '
                + 'Pass administrativeBodyId (see get_city): the meeting list of the site shows the council '
                + 'by default and hides a meeting that has no body. The meeting has no name to set: the site '
                + 'derives its title from the kind and the session number. To backfill a past meeting from the '
                + "municipality's own verbatim minutes, pass municipalMinutesUrl with the recording: the transcript "
                + 'is then corrected from the minutes and the meeting needs no human review. '
                + 'Confirm the details with the user before you call.',
            inputSchema: createMeetingToolInput,
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
            inputSchema: updateMeetingToolInput,
        },
        (args, ctx: ServerContext) => run(() => mcpUpdateMeeting(identityFromContext(ctx), args))
    );

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
            inputSchema: documentUploadUrlToolInput,
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
            inputSchema: agendaUploadUrlToolInput,
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
            inputSchema: listTranscriptEditsToolInput,
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
            inputSchema: revertTranscriptEditToolInput,
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
                + 'explicit confirmation. processAgenda and summarize email the subscribers when they succeed, '
                + 'but only for a released meeting that is still news, and an AUTO body sends at once. For an '
                + 'administrator, get_meeting\'s `notifications` says what each of them would do now: tell the '
                + 'user before you start it.',
            inputSchema: startTaskToolInput,
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
            inputSchema: createCityToolInput,
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
            inputSchema: cityPopulationSchema,
        },
        (args, ctx: ServerContext) => run(() => mcpPopulateCity(identityFromContext(ctx), args))
    );
}
