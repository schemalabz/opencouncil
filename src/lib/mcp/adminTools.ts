import type { McpServer, ServerContext } from '@modelcontextprotocol/server';
import * as z from 'zod';
import { identityFromContext } from './auth';
import type { McpAdminAccess } from './adminAccess';
import {
    mcpCompleteUpload,
    mcpInspectMedia,
    mcpCreateCity,
    mcpCreateMeeting,
    mcpCreateTopics,
    mcpCreateUploadUrl,
    mcpListRealms,
    mcpPopulateCity,
    mcpUpdateCity,
    mcpStartTask,
    mcpUpdateMeeting,
} from './adminData';
import {
    completeUploadToolInput,
    inspectMediaToolInput,
    createCityToolInput,
    createMeetingToolInput,
    createTopicsToolInput,
    MAX_TOPICS_PER_CALL,
    createUploadUrlToolInput,
    startTaskToolInput,
    updateMeetingToolInput,
    updateCityToolInput,
} from './adminToolSchemas';
import { category, run, runStructured } from './toolSupport';
import { updateCityResultSchema } from './citySchemas';
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
                + 'an admin releases it with update_meeting or from the admin page. The release applies the usual notification rules. It also creates the calendar event. '
                + 'Call list_meetings first with the same date: a second call creates a second meeting. '
                + 'Pass administrativeBodyId (see get_city): the meeting list of the site shows the council '
                + 'by default and hides a meeting that has no body. The meeting has no name to set: the site '
                + 'derives its title from the kind and the session number. Confirm the details with the user before you call.',
            inputSchema: createMeetingToolInput,
        },
        (args, ctx: ServerContext) => run(() => mcpCreateMeeting(identityFromContext(ctx), args))
    );

    server.registerTool(
        'update_meeting',
        {
            title: 'Update meeting',
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
            _meta: category('admin'),
            description:
                'Change the details of a meeting in a municipality, or of an administrative body, that you administer: '
                + 'date, video URL, agenda URL, administrative body, kind, urgency, session number, status, format or place. A field that '
                + 'you omit stays as it is. Pass null to clear youtubeUrl, agendaUrl or administrativeBodyId. The name '
                + 'is not a field: the site derives it from the kind and the session number. Mark a '
                + 'meeting postponed or cancelled with scheduleStatus. An administrator of a body cannot move a meeting '
                + 'to a body that they do not administer. It cannot link a meeting to a postponed '
                + 'meeting and it cannot delete one. Set released to true to publish or false to unrelease. '
                + 'Send visibility changes separately from detail edits. For visibility, use dryRun=true to preview effects, '
                + 'then confirm with the user before writing. Release can notify subscribers and hide earlier postponed meetings. '
                + 'Unrelease can restore a postponed predecessor. Repeating the same visibility schedules no new release notifications. '
                + 'This does not publish the city or mark human review complete. Unsupported fields are rejected. '
                + 'Confirm detail edits with the user before calling.',
            inputSchema: updateMeetingToolInput,
        },
        (args, ctx: ServerContext) => run(() => mcpUpdateMeeting(identityFromContext(ctx), args))
    );

    server.registerTool(
        'create_upload_url',
        {
            title: 'Create upload URLs for a meeting file',
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
            _meta: category('admin'),
            description:
                'Get short-lived URLs to upload the agenda or the recording (video or audio) of a meeting to the file '
                + 'storage of OpenCouncil, in a municipality that you administer. Use it when the file has no public '
                + 'URL that the task server can read: an email attachment, a download link that expires, a video '
                + 'joined from parts or downloaded from a player. An agenda is a PDF or a .docx, at most 20 MiB; '
                + 'a recording is a video (.mp4, .mov, .mkv) or an audio file (.mp3, .wav, .m4a, .aac), at most 40 GiB. A file of up '
                + 'to partSize bytes goes up in one PUT, and `completion` is null. A bigger file goes up in parts, '
                + 'one PUT per part, and complete_upload then joins them. The answer\'s `next` gives the steps. The '
                + 'file is then public at `publicUrl`.',
            inputSchema: createUploadUrlToolInput,
        },
        (args, ctx: ServerContext) => run(() => mcpCreateUploadUrl(identityFromContext(ctx), args))
    );

    server.registerTool(
        'complete_upload',
        {
            title: 'Complete an upload in parts',
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
            _meta: category('admin'),
            description:
                'Join the parts of an upload from create_upload_url into the file, after every part is sent. It '
                + 'checks that the parts make up exactly sizeBytes, and names the parts that are missing or have the '
                + 'wrong size: send those again, then call it again. A second call after a completed upload answers '
                + 'as the first one did.',
            inputSchema: completeUploadToolInput,
        },
        (args, ctx: ServerContext) => run(() => mcpCompleteUpload(identityFromContext(ctx), args))
    );
}

function registerTaskAdminTools(server: McpServer) {
    server.registerTool(
        'inspect_media',
        {
            title: 'Inspect a media URL',
            annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
            _meta: category('admin'),
            description: 'Optionally inspect a public media URL before creating a meeting or starting transcription. '
                + 'Any administrator can inspect without a city or meeting. No task or callback is created. '
                + 'The lookup can take up to 150 seconds. Use reason, retryable and hint to choose another URL. '
                + 'A transient error does not mean that the source is unsupported. Do not retry endlessly. '
                + 'Upload metadata does not establish the date of a council meeting.',
            inputSchema: inspectMediaToolInput,
        },
        (args, ctx: ServerContext) => run(() => mcpInspectMedia(identityFromContext(ctx), args))
    );
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
                + 'on its own when it finishes); `fixTranscript` corrects the transcript; `summarize` writes the '
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
        'update_city',
        {
            title: 'Update a city',
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
            _meta: category('admin'),
            description: 'Superadmin only. Update a city boundary with geojson, or publish a pending city with status: "demo". '
                + 'Send boundary and publication changes in separate calls; empty calls and unsupported fields are refused. '
                + 'GeoJSON uses the same normalization and storage as the city edit form and replaces the existing boundary. '
                + 'Confirm the source, municipal territorial unit and replacement before writing; never substitute a country outline or bounding box. '
                + 'Demo publication makes the city and already released meetings discoverable on its realm; draft meetings stay unreleased. '
                + 'It does not enable official support or notifications, and refuses supported cities. '
                + 'Returns the same city profile as get_city, plus changed and before/after changes. Equivalent boundaries and existing demos are no-ops. '
                + 'Read get_city and obtain publication approval first; approval to import pending is not approval to publish.',
            inputSchema: updateCityToolInput,
            outputSchema: updateCityResultSchema,
        },
        (args, ctx: ServerContext) => runStructured(() => mcpUpdateCity(identityFromContext(ctx), args)),
    );

    server.registerTool(
        'list_realms',
        {
            title: 'List realms',
            annotations: { readOnlyHint: true, openWorldHint: false },
            _meta: category('admin'),
            description:
                'Superadmin only. List the realms (one per country and domain): the country, the domain, the '
                + 'language of the site, whether the realm has paying municipalities yet, how many cities it '
                + 'has in each status and how many active topics. Call it before you add a city.',
            inputSchema: z.object({}),
        },
        (_args, ctx: ServerContext) => run(() => mcpListRealms(identityFromContext(ctx)))
    );

    server.registerTool(
        'create_topics',
        {
            title: 'Create topics',
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
            _meta: category('admin'),
            description:
                'Superadmin only. Add topics to the taxonomy of a realm. processAgenda and summarize give each '
                + 'subject one topic of its city\'s realm, so a realm needs its topics before its first meeting is '
                + 'processed. A topic with a name or English name that a topic of the realm already has, in any letter case and deprecated or not, is skipped. '
                + `At most ${MAX_TOPICS_PER_CALL} per call. Topics are shared by every `
                + 'city of the realm: name them in the language of its councils and fit them to the powers of its '
                + 'municipalities. Show the complete list to the user and get a confirmation before you call.',
            inputSchema: createTopicsToolInput,
        },
        (args, ctx: ServerContext) => run(() => mcpCreateTopics(identityFromContext(ctx), args))
    );

    server.registerTool(
        'create_city',
        {
            title: 'Create city',
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
            _meta: category('admin'),
            description:
                'Superadmin only. Create a municipality or a region in the realm of this domain, or in the realm '
                + 'you name. The city is saved as '
                + 'pending, so it is not public, and it has no logo and no boundary. Add the logo on the site '
                + 'and the verified boundary with update_city using geojson. Fill it with populate_city. The id is permanent and is part of every URL of '
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
            // The schema that populateCity takes its type from, so the tool saves what it validates.
            inputSchema: cityPopulationSchema,
        },
        (args, ctx: ServerContext) => run(() => mcpPopulateCity(identityFromContext(ctx), args))
    );
}
