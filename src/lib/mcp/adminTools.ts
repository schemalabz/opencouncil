import type { McpServer, ServerContext } from '@modelcontextprotocol/server';
import { identityFromContext } from './auth';
import type { McpAdminAccess } from './adminAccess';
import {
    mcpCreateAgendaUploadUrl,
    mcpCreateCity,
    mcpCreateMeeting,
    mcpPopulateCity,
    mcpStartTask,
    mcpUpdateMeeting,
} from './adminData';
import {
    agendaUploadUrlToolInput,
    createCityToolInput,
    createMeetingToolInput,
    startTaskToolInput,
    updateMeetingToolInput,
} from './adminToolSchemas';
import { category, run } from './toolSupport';
import { cityPopulationSchema } from '@/lib/zod-schemas/cityPopulation';

/**
 * The admin suite. The access decides what is registered, and so what is
 * advertised: meeting tools for anyone with admin access, city tools for a
 * superadmin only. The access comes from the route handler and is a
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
                'Create a council meeting in a municipality that you administer. The meeting is saved as a '
                + 'draft (unreleased), so the public does not see it. It also creates the calendar event. '
                + 'Call list_meetings first with the same date: a second call creates a second meeting. '
                + 'Pass administrativeBodyId (see get_city): the meeting list of the site shows the council '
                + 'by default and hides a meeting that has no body. Confirm the details with the user before you call.',
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
                'Change the details of a meeting in a municipality that you administer: name, date, video URL, '
                + 'agenda URL, administrative body, kind, session number, status, format or place. A field that '
                + 'you omit stays as it is. Pass null to clear youtubeUrl, agendaUrl or administrativeBodyId, and '
                + 'to clear a special name (both languages), so that the site derives the name again. Mark a '
                + 'meeting postponed or cancelled with scheduleStatus. It cannot link a meeting to a postponed '
                + 'meeting, it cannot release a meeting and it cannot delete one. Confirm the change with the '
                + 'user before you call.',
            inputSchema: updateMeetingToolInput,
        },
        (args, ctx: ServerContext) => run(() => mcpUpdateMeeting(identityFromContext(ctx), args))
    );

    server.registerTool(
        'create_agenda_upload_url',
        {
            title: 'Create agenda upload URL',
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
            _meta: category('admin'),
            description:
                'Get a short-lived URL to upload the agenda of a meeting to the file storage of OpenCouncil, '
                + 'in a municipality that you administer. Use it when the file has no stable public URL: an email '
                + 'attachment, a chat attachment, a download link that expires. Send the file with a PUT to '
                + '`uploadUrl`, with the returned `headers`, within `expiresIn` seconds. The file is then public '
                + 'at `publicUrl`: pass it as agendaUrl to create_meeting or update_meeting. A PDF or a .docx '
                + 'file: the agenda processing reads these two formats only.',
            inputSchema: agendaUploadUrlToolInput,
        },
        (args, ctx: ServerContext) => run(() => mcpCreateAgendaUploadUrl(identityFromContext(ctx), args))
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
                'Start one step of the processing pipeline for a meeting in a municipality that you administer, '
                + 'as the admin page of the meeting does. The steps, in order: `processAgenda` reads the subjects '
                + 'from the agenda PDF; `transcribe` turns the video into a transcript (and starts fixTranscript '
                + 'on its own when it finishes); `fixTranscript` corrects the transcript; `summarize` writes the '
                + 'subjects and summaries from the transcript. Each step spends real money on the task server and '
                + 'takes minutes: confirm with the user before you call, and read get_meeting first — its `tasks` '
                + 'list shows what ran, what is running and what failed. A step that is running is refused: wait '
                + 'for it. A step that already succeeded is refused unless `force` is passed. `force` on '
                + 'transcribe DELETES the existing transcript and its highlights: say so to the user and get an '
                + 'explicit confirmation.',
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
