import { z } from 'zod4';
import type { McpServer, ServerContext, CallToolResult } from '@modelcontextprotocol/server';
import { ApiError } from '@/lib/api/errors';
import { identityFromContext } from './auth';
import { currentMcpIdentity } from './realm-context';
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
    mcpListNearbySubjects,
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

/**
 * Tool grouping, stamped into each tool's `_meta`. Not decorative: the
 * PostHog MCP analytics SDK reads exactly `_meta.category` into
 * $mcp_tool_category, so these strings become analytics dimensions — keep
 * them stable, and keep this union the only place they are defined.
 */
type ToolCategory = 'discovery' | 'directory' | 'meetings' | 'highlights';
const category = (category: ToolCategory) => ({ category });

const paginationShape = {
    page: z.number().int().min(1).default(1).describe('Page number, starting at 1'),
};

export function registerOpenCouncilServer(server: McpServer) {
    server.registerTool(
        'search',
        {
            title: 'Search subjects',
            annotations: { readOnlyHint: true, openWorldHint: false },
            _meta: category('discovery'),
            description:
                'Full-text and semantic search over council meeting subjects (agenda items). ' +
                'Filter by city, person, party, topic or date range. Omit the query to list ' +
                'everything matching the filters, ranked by administrative body, discussion ' +
                'length and recency (not strictly newest-first) — e.g. all subjects a person ' +
                'spoke about, or all subjects in a date range. Returns compact results with URLs; ' +
                'use get_subject / get_subject_transcript with a result id for details. `total` is ' +
                'the search index\'s own match count — report it as approximate ("about N"), and ' +
                'note it is omitted entirely when results had to be withheld.',
            inputSchema: z.object({
                query: z.string().optional().describe('Search query (Greek works best). Omit for a filter-only listing, ranked rather than strictly date-sorted'),
                cityIds: z.array(z.string()).optional().describe('Restrict to these city IDs (see list_cities)'),
                personIds: z.array(z.string()).optional().describe('Restrict to subjects a person spoke about'),
                partyIds: z.array(z.string()).optional().describe('Restrict to subjects a party spoke about'),
                topics: z.array(z.string()).optional()
                    .describe('Restrict to these topic labels, as returned in results (e.g. "Παιδεία", "Συγκοινωνίες"). An unknown label answers with the full list'),
                dateFrom: z.iso.date().optional().describe('ISO date (YYYY-MM-DD), inclusive'),
                dateTo: z.iso.date().optional().describe('ISO date (YYYY-MM-DD), inclusive'),
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
            annotations: { readOnlyHint: true, openWorldHint: false },
            _meta: category('discovery'),
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
        'list_nearby_subjects',
        {
            title: 'List subjects near a location',
            annotations: { readOnlyHint: true, openWorldHint: false },
            _meta: category('discovery'),
            description:
                'Recent council subjects around a geographic point — "what has the council discussed ' +
                'about this neighborhood" (for the decision, follow up with get_subject). ' +
                'Resolves the covered municipality containing the point, then returns subjects ' +
                'pinned within the radius first, followed by recent municipality-wide subjects; each ' +
                'group is ranked by a recency/discussion blend, like the site\'s own nearby widgets. ' +
                'distanceMeters is the subject\'s distance from the point — null means a ' +
                'municipality-wide subject with no pinned location, NOT something near the point, so ' +
                'count only non-null distances when saying how much happened "nearby". Results only ' +
                'cover the municipality\'s recent meetings: meetingsScanned and oldestMeetingScanned ' +
                'bound the window, so report an empty list as "nothing since {oldestMeetingScanned}", ' +
                'never as "nothing ever".',
            inputSchema: z.object({
                lat: z.number().min(-90).max(90).describe('Latitude (WGS84)'),
                lng: z.number().min(-180).max(180).describe('Longitude (WGS84)'),
                radiusMeters: z.number().int().min(50).max(10000).default(1000)
                    .describe('Radius in meters around the point for location-pinned subjects'),
                limit: z.number().int().min(1).max(50).default(10),
            }),
        },
        args => run(() => mcpListNearbySubjects(args))
    );

    server.registerTool(
        'fetch',
        {
            title: 'Fetch a record',
            annotations: { readOnlyHint: true, openWorldHint: false },
            _meta: category('discovery'),
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
            annotations: { readOnlyHint: true, openWorldHint: false },
            _meta: category('directory'),
            description: 'List the municipalities available on OpenCouncil, with ids and counts.',
            inputSchema: z.object({}),
        },
        () => run(() => mcpListCities())
    );

    server.registerTool(
        'get_city',
        {
            title: 'Get municipality',
            annotations: { readOnlyHint: true, openWorldHint: false },
            _meta: category('directory'),
            description: 'Get a municipality profile, including its political parties.',
            inputSchema: z.object({ cityId: z.string().min(1) }),
        },
        args => run(() => mcpGetCity(args.cityId))
    );

    server.registerTool(
        'list_people',
        {
            title: 'List council members',
            annotations: { readOnlyHint: true, openWorldHint: false },
            _meta: category('directory'),
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
            annotations: { readOnlyHint: true, openWorldHint: false },
            _meta: category('directory'),
            description: 'Get a person profile with all their roles. Use search with personIds to find what they discussed.',
            inputSchema: z.object({ personId: z.string().min(1) }),
        },
        args => run(() => mcpGetPerson(args.personId))
    );

    server.registerTool(
        'get_party',
        {
            title: 'Get party',
            annotations: { readOnlyHint: true, openWorldHint: false },
            _meta: category('directory'),
            description: 'Get a political party with its members.',
            inputSchema: z.object({ partyId: z.string().min(1) }),
        },
        args => run(() => mcpGetParty(args.partyId))
    );

    server.registerTool(
        'list_meetings',
        {
            title: 'List meetings',
            annotations: { readOnlyHint: true, openWorldHint: false },
            _meta: category('meetings'),
            description: 'List a municipality\'s council meetings, newest first (or soonest first for upcoming).',
            inputSchema: z.object({
                cityId: z.string().min(1),
                from: z.iso.date().optional().describe('ISO date (YYYY-MM-DD), inclusive'),
                to: z.iso.date().optional().describe('ISO date (YYYY-MM-DD), inclusive'),
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
            annotations: { readOnlyHint: true, openWorldHint: false },
            _meta: category('meetings'),
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
            annotations: { readOnlyHint: true, openWorldHint: false },
            _meta: category('meetings'),
            description:
                'Get a subject (agenda item) in detail: description, per-speaker contribution summaries, ' +
                'decision. Carries its meeting context (meetingName, meetingDate, and ' +
                'administrativeBody — the body that met, e.g. «Δημοτική Επιτροπή», or null when the ' +
                'record names none). Speaker `role` labels are resolved as of the meeting date (get_person ' +
                'lists roles across all time). This tool does not report the vote tally; the subject page ' +
                'at `url` shows it. For the verbatim discussion use get_subject_transcript.',
            inputSchema: z.object({ subjectId: z.string().min(1) }),
        },
        (args, ctx: ServerContext) => run(() => mcpGetSubject(args.subjectId, identityFromContext(ctx)))
    );

    server.registerTool(
        'get_subject_transcript',
        {
            title: 'Get subject transcript',
            annotations: { readOnlyHint: true, openWorldHint: false },
            _meta: category('meetings'),
            description:
                'The verbatim transcript of everything said about one subject, as utterances with ids, ' +
                'speaker names, roles (resolved as of the meeting date) and timestamps. Utterance ids ' +
                'from here are what highlight creation needs (available on authenticated connections).',
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
            annotations: { readOnlyHint: true, openWorldHint: false },
            _meta: category('meetings'),
            description:
                'The full transcript of a meeting as speaker segments, paginated. Speaker roles are ' +
                'resolved as of the meeting date. Long — prefer ' +
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

    // Highlight tools (and their prompt) require authentication end to end,
    // so anonymous connections don't get them advertised at all —
    // MCP_INSTRUCTIONS still tells those users how to create a personal URL.
    // Registration runs per request (a fresh server per POST), which is what
    // makes per-caller advertisement possible. Registered last so the base
    // tool and prompt orders are identical for every caller, merely extended.
    if (currentMcpIdentity()) {
        registerHighlightTools(server);
    }
}

/**
 * The highlight suite: creation, rendering, listing, showcasing. Every one
 * of these requires an identity (mcp_ or sk_ token), so they are only
 * registered — and therefore only advertised — on authenticated connections.
 */
function registerHighlightTools(server: McpServer) {
    server.registerTool(
        'create_highlight',
        {
            title: 'Create highlight',
            annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
            _meta: category('highlights'),
            description:
                'Create a highlight from a selection of a meeting\'s utterances (get utterance ids ' +
                'from get_subject_transcript). The utterances need not be consecutive — skip filler ' +
                'and interruptions, or cut together moments like a question and its answer; playback ' +
                'is always in meeting order. Requires a personal MCP URL or bearer token, created on ' +
                "this site's /mcp page. Confirm the selection with the user before calling. " +
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
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
            _meta: category('highlights'),
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
            annotations: { readOnlyHint: true, openWorldHint: false },
            _meta: category('highlights'),
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
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
            _meta: category('highlights'),
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
            annotations: { readOnlyHint: true, openWorldHint: false },
            _meta: category('highlights'),
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
