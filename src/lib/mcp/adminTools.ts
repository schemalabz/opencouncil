import { z } from 'zod4';
import { z as z3 } from 'zod';
import { AuthorityType } from '@prisma/client';
import type { McpServer, ServerContext } from '@modelcontextprotocol/server';
import { identityFromContext } from './auth';
import type { McpAdminAccess } from './adminAccess';
import {
    mcpCreateCity,
    mcpCreateMeeting,
    mcpPopulateCity,
    mcpStartTask,
    mcpUpdateMeeting,
} from './adminData';
import { category, run, toolSchema } from './toolSupport';
import { STARTABLE_MEETING_TASKS } from '@/lib/tasks/startableTasks';
import { baseCityFields, cityIdSchema } from '@/lib/zod-schemas/city';
import { cityPopulationSchema } from '@/lib/zod-schemas/cityPopulation';

const AGENDA_URL_DESCRIPTION = 'URL of the agenda, a PDF or a .docx file. The server first copies the file into the '
    + 'storage of OpenCouncil and stores the URL of the copy; a web page that is not a PDF or a .docx is refused.';

const isoDateTime = z.iso.datetime({ offset: true })
    .describe('ISO 8601 date and time with a UTC offset, e.g. "2026-10-05T18:00:00+03:00"');

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
            inputSchema: z.object({
                cityId: z.string().min(1),
                name: z.string().min(2).describe('Meeting name in the language of the city'),
                name_en: z.string().min(2).describe('Meeting name in English'),
                dateTime: isoDateTime,
                youtubeUrl: z.url().optional().describe('URL of the meeting video'),
                agendaUrl: z.url().optional().describe(AGENDA_URL_DESCRIPTION),
                administrativeBodyId: z.string().min(1).optional()
                    .describe('The body that meets (council, committee, community). See get_city'),
                processAgenda: z.boolean().default(false)
                    .describe('Also queue the task that extracts the subjects from the agenda PDF. Needs agendaUrl'),
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
                'Change the details of a meeting in a municipality that you administer: name, date, video URL, '
                + 'agenda URL or administrative body. A field that you omit stays as it is. Pass null to clear '
                + 'youtubeUrl, agendaUrl or administrativeBodyId. It cannot release a meeting and it cannot '
                + 'delete one. Confirm the change with the user before you call.',
            inputSchema: z.object({
                cityId: z.string().min(1),
                meetingId: z.string().min(1),
                name: z.string().min(2).optional(),
                name_en: z.string().min(2).optional(),
                dateTime: isoDateTime.optional(),
                youtubeUrl: z.url().nullable().optional(),
                agendaUrl: z.url().nullable().optional().describe(AGENDA_URL_DESCRIPTION),
                administrativeBodyId: z.string().min(1).nullable().optional(),
            }),
        },
        (args, ctx: ServerContext) => run(() => mcpUpdateMeeting(identityFromContext(ctx), args))
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
                    .describe(`processAgenda only: ${AGENDA_URL_DESCRIPTION} Defaults to the agendaUrl of the meeting. `
                        + 'A URL passed here is STORED as the agendaUrl of the meeting'),
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
