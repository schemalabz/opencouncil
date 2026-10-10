/** @jest-environment node */

// The data functions run only inside tool callbacks, and tools/list never
// calls one. A blanket stub keeps Prisma, Elasticsearch and next-intl out.
jest.mock('@/lib/mcp/data', () =>
    new Proxy({ __esModule: true } as Record<string, unknown>, {
        get: (target, prop: string) => (target[prop] ??= jest.fn()),
    })
);
jest.mock('@/lib/mcp/adminData', () =>
    new Proxy({ __esModule: true } as Record<string, unknown>, {
        get: (target, prop: string) => (target[prop] ??= jest.fn()),
    })
);
// auth.ts reaches Prisma, and through it env.mjs, which jest does not transform.
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: {} }));

import { Realm } from '@prisma/client';
import { McpServer } from '@modelcontextprotocol/server';
import { registerOpenCouncilServer } from '@/lib/mcp/server';
import { mcpRealmStore, requestContext } from '@/lib/mcp/realm-context';
import type { McpIdentity } from '@/lib/mcp/auth';
import type { McpAdminAccess } from '@/lib/mcp/adminAccess';
import { connectInMemory, type ListedTool } from './inMemoryClient';

/**
 * tools/list as a client sees it, through the SDK, for every kind of caller
 * that the route tells apart. The SDK converts each input and output schema to
 * JSON Schema while it answers. One schema that has no JSON Schema form (a
 * z.date(), a transform output, a bigint) fails the whole list with -32603,
 * so every connector of that caller loses every tool. The other MCP tests
 * either record the registrations or list a part of the tools, and cannot
 * see this.
 */

const PUBLIC_TOOLS = [
    'search', 'fetch', 'list_cities', 'get_city', 'list_meetings', 'get_meeting', 'get_subject',
    'get_subject_transcript', 'list_hot_subjects', 'list_nearby_subjects', 'list_people', 'get_person',
    'get_party', 'get_transcript',
];
const HIGHLIGHT_TOOLS = ['create_highlight', 'generate_highlight_video', 'list_highlights', 'set_highlight_showcase', 'get_highlight'];
const MEETING_ADMIN_TOOLS = ['create_meeting', 'update_meeting', 'create_agenda_upload_url', 'start_task'];
const SUPERADMIN_TOOLS = ['create_city', 'populate_city'];

const USER: McpIdentity = { type: 'user', userId: 'u1' };

const CALLERS: { caller: string; identity: McpIdentity; adminAccess: McpAdminAccess | null; tools: string[] }[] = [
    { caller: 'an anonymous caller', identity: null, adminAccess: null, tools: PUBLIC_TOOLS },
    { caller: 'a signed-in user', identity: USER, adminAccess: null, tools: [...PUBLIC_TOOLS, ...HIGHLIGHT_TOOLS] },
    {
        caller: 'a city administrator',
        identity: USER,
        adminAccess: { superadmin: false, cityIds: new Set(['athens']) },
        tools: [...PUBLIC_TOOLS, ...HIGHLIGHT_TOOLS, ...MEETING_ADMIN_TOOLS],
    },
    {
        caller: 'a superadmin',
        identity: USER,
        adminAccess: { superadmin: true, cityIds: new Set() },
        tools: [...PUBLIC_TOOLS, ...HIGHLIGHT_TOOLS, ...MEETING_ADMIN_TOOLS, ...SUPERADMIN_TOOLS],
    },
];

/** The server that the route builds for this caller: registration reads the request context. */
function serverFor(identity: McpIdentity, adminAccess: McpAdminAccess | null) {
    const server = new McpServer({ name: 'opencouncil', version: '1.0.0' });
    mcpRealmStore.run(
        requestContext(Realm.greece, 'opencouncil.gr', identity, { adminAccess }),
        () => registerOpenCouncilServer(server),
    );
    return server;
}

describe.each(CALLERS)('tools/list for $caller', ({ identity, adminAccess, tools }) => {
    let mcp: Awaited<ReturnType<typeof connectInMemory>>;
    beforeEach(async () => {
        mcp = await connectInMemory(serverFor(identity, adminAccess));
    });
    afterEach(() => mcp.close());

    it('lists every tool of the caller, with an object schema for each input and output', async () => {
        const response = await mcp.request('tools/list', {});
        expect(response.error).toBeUndefined();

        const listed = response.result?.tools as ListedTool[];
        expect(listed.map(tool => tool.name).sort()).toEqual([...tools].sort());
        expect(listed.filter(tool => tool.inputSchema.type !== 'object').map(tool => tool.name)).toEqual([]);
        expect(listed.filter(tool => tool.outputSchema !== undefined && tool.outputSchema.type !== 'object').map(tool => tool.name)).toEqual([]);
    });
});
