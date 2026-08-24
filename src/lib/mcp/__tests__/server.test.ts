/** @jest-environment node */

// server.ts only closes over the data functions inside tool callbacks — it never
// calls them at registration time — so a blanket stub keeps ../data's Prisma,
// Elasticsearch and next-intl imports out of the test, without a name list that
// goes stale every time a tool is added.
jest.mock('../data', () =>
    new Proxy({ __esModule: true } as Record<string, unknown>, {
        // Memoized, not a fresh mock per access: the forwarding tests below
        // assert on the same function object the tool callback closed over.
        get: (target, prop: string) => (target[prop] ??= jest.fn()),
    })
);

// auth.ts reaches Prisma (and through it env.mjs, which jest won't transform).
// Same stub gate.test.ts uses; registration never touches the client.
jest.mock('../../db/prisma', () => ({ __esModule: true, default: {} }));

import { Realm } from '@prisma/client';
import type { McpServer, ServerContext } from '@modelcontextprotocol/server';
import { registerOpenCouncilServer } from '../server';
import { mcpRealmStore, requestContext } from '../realm-context';
import type { McpIdentity } from '../auth';
import * as data from '../data';

const HIGHLIGHT_TOOLS = [
    'create_highlight', 'generate_highlight_video', 'list_highlights',
    'set_highlight_showcase', 'get_highlight',
];
const USER: McpIdentity = { type: 'user', userId: 'u1' };
const SERVICE: McpIdentity = { type: 'service', keyName: 'bot' };

const CATEGORIES = ['discovery', 'directory', 'meetings', 'highlights'];

type RecordedToolConfig = {
    annotations?: { readOnlyHint?: boolean };
    _meta?: { category?: string };
    inputSchema?: { parse: (value: unknown) => unknown };
};
type ToolHandler = (args: never, ctx: ServerContext) => Promise<unknown>;

/** A tool context carrying the identity verifyMcpToken would have attached. */
const ctxFor = (identity: McpIdentity) =>
    ({ http: { authInfo: { extra: { identity } } } }) as unknown as ServerContext;

/** What a connection with this identity would see in tools/list & prompts/list. */
function advertised(identity: McpIdentity, { inRequestScope = true } = {}) {
    const tools: string[] = [];
    const prompts: string[] = [];
    const meta: Record<string, RecordedToolConfig> = {};
    const handlers: Record<string, ToolHandler> = {};
    const recorder = {
        registerTool: (name: string, config: RecordedToolConfig, handler: ToolHandler) => {
            tools.push(name);
            meta[name] = config;
            handlers[name] = handler;
        },
        registerPrompt: (name: string) => { prompts.push(name); },
    } as unknown as McpServer;

    const register = () => registerOpenCouncilServer(recorder);
    if (inRequestScope) {
        mcpRealmStore.run(requestContext(Realm.greece, 'opencouncil.gr', identity), register);
    } else {
        register();
    }
    return { tools, prompts, meta, handlers };
}

describe('highlight tools are advertised only on authenticated connections', () => {
    it('withholds exactly the highlight suite from anonymous callers', () => {
        const anon = advertised(null);
        const authed = advertised(USER);

        // Asserting the *difference*, not an inventory: adding a public tool
        // needs no test edit, but a tool crossing the boundary in either
        // direction fails here.
        expect(authed.tools.filter((n) => !anon.tools.includes(n))).toEqual(HIGHLIGHT_TOOLS);
        expect(anon.tools).toEqual(authed.tools.filter((n) => !HIGHLIGHT_TOOLS.includes(n)));
        expect(authed.prompts.filter((n) => !anon.prompts.includes(n)))
            .toEqual(['create_meeting_highlights']);
    });

    it('withholds every highlight-named tool, including ones added later', () => {
        expect(advertised(null).tools.filter((n) => n.includes('highlight'))).toEqual([]);
    });

    it('advertises the suite to service keys as well as user tokens', () => {
        // Guards a later `identity?.type === 'user'` narrowing quietly stripping
        // the suite from admin-panel sk_ keys.
        expect(advertised(SERVICE).tools).toEqual(advertised(USER).tools);
        expect(advertised(SERVICE).prompts).toEqual(advertised(USER).prompts);
    });

    it('fails closed when there is no request scope at all', () => {
        expect(advertised(null, { inRequestScope: false }).tools)
            .toEqual(advertised(null).tools);
    });
});

describe('tool metadata', () => {
    // An invariant, not an inventory: adding a tool needs no test edit, but a
    // tool registered without annotations (which would land in the client's
    // "Other" permissions bucket) or with a category outside the known set
    // (which would mint a stray $mcp_tool_category value in PostHog) fails
    // here. Nothing else in the repo reads these fields, so this is the only
    // place that can notice. Filtering into an array makes Jest name the
    // offending tool.
    it('gives every tool a readOnlyHint and a known category', () => {
        const { tools, meta } = advertised(USER);
        expect(tools.filter(name =>
            typeof meta[name].annotations?.readOnlyHint !== 'boolean'
            || !CATEGORIES.includes(meta[name]._meta?.category ?? '')
        )).toEqual([]);
    });
});

describe('administrative-body filtering', () => {
    // Regression guard for a real incident: an assistant asked "when did the
    // 3rd κοινότητα last meet", found no body filter on list_meetings, fell
    // back to relevance-ranked search, and reported a session six months
    // stale. The filter has to reach the data layer, not just the schema.
    beforeEach(() => jest.clearAllMocks());

    it('accepts both body filters on list_meetings', () => {
        const schema = advertised(USER).meta.list_meetings.inputSchema!;
        expect(schema.parse({
            cityId: 'athens',
            administrativeBodyIds: ['body-1'],
            administrativeBodyTypes: ['community'],
        })).toMatchObject({
            administrativeBodyIds: ['body-1'],
            administrativeBodyTypes: ['community'],
        });
    });

    it('rejects a body type outside the schema enum', () => {
        const schema = advertised(USER).meta.list_meetings.inputSchema!;
        expect(() => schema.parse({ cityId: 'athens', administrativeBodyTypes: ['κοινότητα'] }))
            .toThrow();
    });

    it('rejects an empty body filter rather than listing every meeting', () => {
        // The data layer skips a zero-length filter, so `[]` would widen the
        // query to the whole city — the opposite of what passing it means.
        const schema = advertised(USER).meta.list_meetings.inputSchema!;
        expect(() => schema.parse({ cityId: 'athens', administrativeBodyIds: [] })).toThrow();
        expect(() => schema.parse({ cityId: 'athens', administrativeBodyTypes: [] })).toThrow();
    });

    it('forwards both body filters and the caller identity to the data layer', async () => {
        const { handlers } = advertised(USER);
        await handlers.list_meetings(
            {
                cityId: 'athens',
                page: 1,
                pageSize: 10,
                administrativeBodyIds: ['body-1'],
                administrativeBodyTypes: ['community'],
            } as never,
            ctxFor(USER)
        );

        expect(data.mcpListMeetings).toHaveBeenCalledWith(
            'athens',
            expect.objectContaining({
                administrativeBodyIds: ['body-1'],
                administrativeBodyTypes: ['community'],
            }),
            USER
        );
    });

    it('passes the caller identity to get_city', async () => {
        // get_city only lists draft-only bodies to a caller who can see
        // drafts, so dropping the identity would silently hide them.
        const { handlers } = advertised(USER);
        await handlers.get_city({ cityId: 'athens' } as never, ctxFor(SERVICE));

        expect(data.mcpGetCity).toHaveBeenCalledWith('athens', SERVICE);
    });
});
