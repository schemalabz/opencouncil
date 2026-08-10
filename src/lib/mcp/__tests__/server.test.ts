/** @jest-environment node */

// server.ts only closes over the data functions inside tool callbacks — it never
// calls them at registration time — so a blanket stub keeps ../data's Prisma,
// Elasticsearch and next-intl imports out of the test, without a name list that
// goes stale every time a tool is added.
jest.mock('../data', () =>
    new Proxy({ __esModule: true } as Record<string, unknown>, {
        get: (target, prop: string) => (prop in target ? target[prop] : jest.fn()),
    })
);

// auth.ts reaches Prisma (and through it env.mjs, which jest won't transform).
// Same stub gate.test.ts uses; registration never touches the client.
jest.mock('../../db/prisma', () => ({ __esModule: true, default: {} }));

import { Realm } from '@prisma/client';
import type { McpServer } from '@modelcontextprotocol/server';
import { registerOpenCouncilServer } from '../server';
import { mcpRealmStore, requestContext } from '../realm-context';
import type { McpIdentity } from '../auth';

const HIGHLIGHT_TOOLS = [
    'create_highlight', 'generate_highlight_video', 'list_highlights',
    'set_highlight_showcase', 'get_highlight',
];
const USER: McpIdentity = { type: 'user', userId: 'u1' };
const SERVICE: McpIdentity = { type: 'service', keyName: 'bot' };

/** What a connection with this identity would see in tools/list & prompts/list. */
function advertised(identity: McpIdentity, { inRequestScope = true } = {}) {
    const tools: string[] = [];
    const prompts: string[] = [];
    const recorder = {
        registerTool: (name: string) => { tools.push(name); },
        registerPrompt: (name: string) => { prompts.push(name); },
    } as unknown as McpServer;

    const register = () => registerOpenCouncilServer(recorder);
    if (inRequestScope) {
        mcpRealmStore.run(requestContext(Realm.greece, 'opencouncil.gr', identity), register);
    } else {
        register();
    }
    return { tools, prompts };
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
