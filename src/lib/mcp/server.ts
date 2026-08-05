import { z } from 'zod4';
import type { McpServer, ServerContext, CallToolResult } from '@modelcontextprotocol/server';
import { ApiError } from '@/lib/api/errors';
import { identityFromContext } from './auth';
import {
    mcpCreateHighlight,
    mcpFetch,
    mcpGenerateHighlightVideo,
    mcpGetHighlight,
    mcpGetCity,
    mcpGetMeeting,
    mcpGetParty,
    mcpGetPerson,
    mcpGetSubject,
    mcpGetSubjectTranscript,
    mcpGetTranscript,
    mcpListCities,
    mcpListHighlights,
    mcpListHotSubjects,
    mcpSetHighlightShowcase,
    mcpListMeetings,
    mcpListPeople,
    mcpSearch,
} from './data';

function json(data: unknown): CallToolResult {
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

function errorResult(message: string): CallToolResult {
    return { isError: true, content: [{ type: 'text', text: message }] };
}

/**
 * Wrap a tool implementation so ApiErrors surface as readable tool errors and
 * anything unexpected stays generic (no stack traces to clients).
 */
async function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
    try {
        return json(await fn());
    } catch (error) {
        if (error instanceof ApiError) {
            return errorResult(error.message);
        }
        console.error('MCP tool error:', error);
        return errorResult('Internal error');
    }
}

const paginationShape = {
    page: z.number().int().min(1).default(1).describe('Page number, starting at 1'),
};

export function registerOpenCouncilServer(server: McpServer) {
    server.registerTool(
        'search',
        {
            title: 'Search subjects',
            description:
                'Full-text and semantic search over council meeting subjects (agenda items). ' +
                'Filter by city, person, party, topic or date range. Omit the query to list ' +
                'everything matching the filters, newest first — e.g. all subjects a person ' +
                'spoke about, or all subjects in a date range. Returns compact results with URLs; ' +
                'use get_subject / get_subject_transcript with a result id for details.',
            inputSchema: z.object({
                query: z.string().optional().describe('Search query (Greek works best). Omit for a filter-only listing sorted by date'),
                cityIds: z.array(z.string()).optional().describe('Restrict to these city IDs (see list_cities)'),
                personIds: z.array(z.string()).optional().describe('Restrict to subjects a person spoke about'),
                partyIds: z.array(z.string()).optional().describe('Restrict to subjects a party spoke about'),
                topics: z.array(z.string()).optional()
                    .describe('Restrict to these topic labels, as returned in results (e.g. "Παιδεία", "Συγκοινωνίες"). An unknown label answers with the full list'),
                dateFrom: z.string().optional().describe('ISO date, inclusive'),
                dateTo: z.string().optional().describe('ISO date, inclusive'),
                pageSize: z.number().int().min(1).max(20).default(10),
                ...paginationShape,
            }),
        },
        (args, ctx: ServerContext) => run(() => mcpSearch(args, identityFromContext(ctx)))
    );

    server.registerTool(
        'list_hot_subjects',
        {
            title: 'List hot subjects',
            description:
                'The most-discussed subjects across all municipalities over a recent period, ranked ' +
                'by debate time — start here for "what is happening in the councils", a weekly ' +
                'roundup, or picking topics worth clipping. Covers every municipality at once (no ' +
                'city id needed) and does not depend on the search index.',
            inputSchema: z.object({
                daysBack: z.number().int().min(1).max(365).default(7)
                    .describe('How far back to look, in days'),
                cityIds: z.array(z.string()).optional()
                    .describe('Restrict to these municipalities (omit for all of them)'),
                topics: z.array(z.string()).optional().describe('Restrict to these topic labels'),
                limit: z.number().int().min(1).max(50).default(10),
            }),
        },
        args => run(() => mcpListHotSubjects(args))
    );

    server.registerTool(
        'fetch',
        {
            title: 'Fetch a record',
            description:
                'Fetch the full content of a single record by id. Accepts a subject id (default), or ' +
                'prefixed ids: "city:{cityId}", "person:{personId}", "party:{partyId}", "meeting:{cityId}/{meetingId}".',
            inputSchema: z.object({
                id: z.string().min(1),
            }),
        },
        (args, ctx: ServerContext) => run(() => mcpFetch(args.id, identityFromContext(ctx)))
    );

    server.registerTool(
        'list_cities',
        {
            title: 'List municipalities',
            description: 'List the municipalities available on OpenCouncil, with ids and counts.',
            inputSchema: z.object({}),
        },
        () => run(() => mcpListCities())
    );

    server.registerTool(
        'get_city',
        {
            title: 'Get municipality',
            description: 'Get a municipality profile, including its political parties.',
            inputSchema: z.object({ cityId: z.string().min(1) }),
        },
        args => run(() => mcpGetCity(args.cityId))
    );

    server.registerTool(
        'list_people',
        {
            title: 'List council members',
            description: 'List the people (councillors, mayor, etc.) of a municipality with their roles and party.',
            inputSchema: z.object({
                cityId: z.string().min(1),
                activeOnly: z.boolean().default(true).describe('Only people with currently active roles'),
            }),
        },
        args => run(() => mcpListPeople(args.cityId, args.activeOnly))
    );

    server.registerTool(
        'get_person',
        {
            title: 'Get person',
            description: 'Get a person profile with all their roles. Use search with personIds to find what they discussed.',
            inputSchema: z.object({ personId: z.string().min(1) }),
        },
        args => run(() => mcpGetPerson(args.personId))
    );

    server.registerTool(
        'get_party',
        {
            title: 'Get party',
            description: 'Get a political party with its members.',
            inputSchema: z.object({ partyId: z.string().min(1) }),
        },
        args => run(() => mcpGetParty(args.partyId))
    );

    server.registerTool(
        'list_meetings',
        {
            title: 'List meetings',
            description: 'List a municipality\'s council meetings, newest first (or soonest first for upcoming).',
            inputSchema: z.object({
                cityId: z.string().min(1),
                from: z.string().optional().describe('ISO date, inclusive'),
                to: z.string().optional().describe('ISO date, inclusive'),
                timeFilter: z.enum(['upcoming', 'past']).optional(),
                pageSize: z.number().int().min(1).max(50).default(10),
                ...paginationShape,
            }),
        },
        (args, ctx: ServerContext) =>
            run(() =>
                mcpListMeetings(
                    args.cityId,
                    { page: args.page, pageSize: args.pageSize, from: args.from, to: args.to, timeFilter: args.timeFilter },
                    identityFromContext(ctx)
                )
            )
    );

    server.registerTool(
        'get_meeting',
        {
            title: 'Get meeting',
            description:
                'Get a council meeting with its agenda. Each subject carries discussionSeconds — how ' +
                'long it was actually debated, the best proxy for which subjects mattered, since ' +
                'agenda order does not reflect weight. Subjects are returned in agenda order.',
            inputSchema: z.object({
                cityId: z.string().min(1),
                meetingId: z.string().min(1),
            }),
        },
        (args, ctx: ServerContext) => run(() => mcpGetMeeting(args.cityId, args.meetingId, identityFromContext(ctx)))
    );

    server.registerTool(
        'get_subject',
        {
            title: 'Get subject',
            description:
                'Get a subject (agenda item) in detail: description, per-speaker contribution summaries, ' +
                'decision, votes. For the verbatim discussion use get_subject_transcript.',
            inputSchema: z.object({ subjectId: z.string().min(1) }),
        },
        (args, ctx: ServerContext) => run(() => mcpGetSubject(args.subjectId, identityFromContext(ctx)))
    );

    server.registerTool(
        'get_subject_transcript',
        {
            title: 'Get subject transcript',
            description:
                'The verbatim transcript of everything said about one subject, as utterances with ids, ' +
                'speaker names and timestamps. Utterance ids from here are what create_highlight needs.',
            inputSchema: z.object({
                subjectId: z.string().min(1),
                ...paginationShape,
            }),
        },
        (args, ctx: ServerContext) =>
            run(() => mcpGetSubjectTranscript(args.subjectId, args.page, identityFromContext(ctx)))
    );

    server.registerTool(
        'get_transcript',
        {
            title: 'Get meeting transcript',
            description:
                'The full transcript of a meeting as speaker segments, paginated. Long — prefer ' +
                'get_subject_transcript when you care about one subject. Pass personId for ' +
                'everything one councillor said in the meeting (the way to gather their own ' +
                'moments). Set includeUtteranceIds to get utterance ids for highlight creation.',
            inputSchema: z.object({
                cityId: z.string().min(1),
                meetingId: z.string().min(1),
                personId: z.string().optional()
                    .describe('Only this person\'s segments (see list_people)'),
                segmentsPerPage: z.number().int().min(1).max(100).default(40),
                includeUtteranceIds: z.boolean().default(false),
                ...paginationShape,
            }),
        },
        (args, ctx: ServerContext) =>
            run(() =>
                mcpGetTranscript(
                    args.cityId,
                    args.meetingId,
                    {
                        page: args.page,
                        segmentsPerPage: args.segmentsPerPage,
                        includeUtteranceIds: args.includeUtteranceIds,
                        personId: args.personId,
                    },
                    identityFromContext(ctx)
                )
            )
    );

    server.registerTool(
        'create_highlight',
        {
            title: 'Create highlight',
            description:
                'Create a highlight from a selection of a meeting\'s utterances (get utterance ids ' +
                'from get_subject_transcript). The utterances need not be consecutive — skip filler ' +
                'and interruptions, or cut together moments like a question and its answer; playback ' +
                'is always in meeting order. Requires a personal MCP URL or bearer token from ' +
                'https://opencouncil.gr/mcp. Confirm the selection with the user before calling. ' +
                'A shareable video can then be rendered with generate_highlight_video.',
            inputSchema: z.object({
                cityId: z.string().min(1),
                meetingId: z.string().min(1),
                name: z.string().min(1).describe('Short human-readable title for the highlight'),
                utteranceIds: z.array(z.string()).min(1).describe('Utterance ids, in order'),
                subjectId: z.string().optional().describe('Subject to attach the highlight to'),
            }),
        },
        (args, ctx: ServerContext) => run(() => mcpCreateHighlight(identityFromContext(ctx), args))
    );

    server.registerTool(
        'generate_highlight_video',
        {
            title: 'Generate highlight video',
            description:
                'Start rendering a highlight into a shareable video clip, in landscape or vertical ' +
                '(9:16) format, with optional burnt-in subtitles and speaker name/party overlays — ' +
                'the same options the website offers. Generation is asynchronous and takes a few ' +
                'minutes: poll get_highlight for the result. Calling this again with different ' +
                'options re-renders the clip in the new format; calling it with the same options ' +
                'returns the existing video. Requires the same authentication as create_highlight; ' +
                'ask the user before starting a render.',
            inputSchema: z.object({
                highlightId: z.string().min(1),
                aspectRatio: z.enum(['default', 'social-9x16']).default('default')
                    .describe('"default" is landscape (16:9); "social-9x16" is vertical, for Reels/TikTok/Stories'),
                includeCaptions: z.boolean().default(true).describe('Burn subtitles into the video'),
                includeSpeakerOverlay: z.boolean().default(true)
                    .describe('Show the speaker\'s name, role and party on screen'),
            }),
        },
        (args, ctx: ServerContext) =>
            run(() =>
                mcpGenerateHighlightVideo(identityFromContext(ctx), args.highlightId, {
                    aspectRatio: args.aspectRatio,
                    includeCaptions: args.includeCaptions,
                    includeSpeakerOverlay: args.includeSpeakerOverlay,
                })
            )
    );

    server.registerTool(
        'list_highlights',
        {
            title: 'List highlights',
            description:
                'The highlights you can manage, newest first — your own, plus every highlight in ' +
                'municipalities you administer. Use it to pick up work from a previous session ' +
                'instead of needing an id you no longer have.',
            inputSchema: z.object({
                cityId: z.string().optional(),
                meetingId: z.string().optional(),
                limit: z.number().int().min(1).max(100).default(20),
            }),
        },
        (args, ctx: ServerContext) => run(() => mcpListHighlights(identityFromContext(ctx), args))
    );

    server.registerTool(
        'set_highlight_showcase',
        {
            title: 'Showcase a highlight',
            description:
                'Publish (or unpublish) a rendered highlight on the municipality\'s pages on ' +
                'opencouncil.gr. Needs a rendered video and city-administrator rights. Ask the ' +
                'user before publishing.',
            inputSchema: z.object({
                highlightId: z.string().min(1),
                showcased: z.boolean().default(true).describe('false unpublishes it again'),
            }),
        },
        (args, ctx: ServerContext) =>
            run(() => mcpSetHighlightShowcase(identityFromContext(ctx), args.highlightId, args.showcased))
    );

    server.registerTool(
        'get_highlight',
        {
            title: 'Get highlight',
            description:
                'Get a highlight and the status of its video: not_generated, generating (with progress), ' +
                'failed, or ready with the final video URL and the format it was rendered in. Use this ' +
                'to poll after generate_highlight_video.',
            inputSchema: z.object({
                highlightId: z.string().min(1),
            }),
        },
        (args, ctx: ServerContext) => run(() => mcpGetHighlight(identityFromContext(ctx), args.highlightId))
    );

    // --- Prompts ----------------------------------------------------------

    server.registerPrompt(
        'weekly_roundup',
        {
            title: 'Weekly topics roundup',
            description: 'Summarize the key topics discussed in an area\'s municipalities recently, with a draft social post.',
            argsSchema: z.object({
                area: z.string().optional().describe('Area or municipality name, e.g. "Αττική" or "Athens"'),
                days: z.string().optional().describe('How many days back to look (default 7)'),
            }),
        },
        ({ area, days }) => ({
            messages: [
                {
                    role: 'user' as const,
                    content: {
                        type: 'text' as const,
                        text:
                            `Give me a roundup of the key topics discussed in ${area || 'Greek'} municipal councils ` +
                            `in the last ${days || '7'} days. Use list_cities to find relevant municipalities, then search ` +
                            `with dateFrom/dateTo and cityIds. Group by theme, name the municipalities and key speakers, ` +
                            `cite subject URLs, and end with a draft social media post (Greek) highlighting the most ` +
                            `important contributions with participant names.`,
                    },
                },
            ],
        })
    );

    server.registerPrompt(
        'councillor_profile',
        {
            title: 'Councillor activity profile',
            description: 'Profile a municipal councillor: the key subjects they have participated in and their positions.',
            argsSchema: z.object({
                personName: z.string().describe('The councillor\'s name'),
                cityName: z.string().optional().describe('Municipality name, to disambiguate'),
            }),
        },
        ({ personName, cityName }) => ({
            messages: [
                {
                    role: 'user' as const,
                    content: {
                        type: 'text' as const,
                        text:
                            `Build an activity profile for councillor "${personName}"${cityName ? ` of ${cityName}` : ''}. ` +
                            `Find them with list_cities + list_people, then search with their personId to find the key ` +
                            `subjects they participated in. Read the most important ones with get_subject. Summarize their ` +
                            `main themes and positions, citing subject URLs and quoting short verbatim excerpts.`,
                    },
                },
            ],
        })
    );

    server.registerPrompt(
        'create_meeting_highlights',
        {
            title: 'Create meeting highlights',
            description: 'Find the most important subjects of a meeting and create highlights for them (requires auth).',
            argsSchema: z.object({
                cityName: z.string().describe('Municipality name'),
                meetingHint: z.string().optional().describe('Which meeting (e.g. "latest", a date, or a meeting id)'),
            }),
        },
        ({ cityName, meetingHint }) => ({
            messages: [
                {
                    role: 'user' as const,
                    content: {
                        type: 'text' as const,
                        text:
                            `For the ${meetingHint || 'latest'} council meeting of ${cityName}: find the meeting ` +
                            `(list_cities, list_meetings), pick the 3 most important subjects from get_meeting — rank them ` +
                            `by discussionSeconds, not agenda order — and for each ` +
                            `use get_subject_transcript to select the utterances that best capture ` +
                            `the moment. Show me your proposed highlights (subject, speakers, quoted text) and, once I ` +
                            `confirm, create them with create_highlight.`,
                    },
                },
            ],
        })
    );
}
