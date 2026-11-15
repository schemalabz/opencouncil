/** @jest-environment node */

// Real route, real mcp-handler and real @posthog/mcp: only the PostHog client
// that receives the events, the data layer and the database are stubs.
jest.mock('@/env.mjs', () => ({ env: { NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: 'phc_test' } }));
jest.mock('@/lib/realm.server', () => ({ getRealm: jest.fn().mockResolvedValue('greece') }));
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@/lib/db/mcpTokens', () => ({ validateUserMcpToken: jest.fn() }));
jest.mock('@/lib/db/highlights-core', () => ({ getUserCityRights: jest.fn(), meetingHasBodyIn: jest.fn() }));
jest.mock('@/lib/mcp/data', () => ({
    mcpListCities: jest.fn(), mcpGetCity: jest.fn(), mcpListPeople: jest.fn(), mcpGetPerson: jest.fn(),
    mcpGetParty: jest.fn(), mcpListMeetings: jest.fn(), mcpGetMeeting: jest.fn(), mcpGetSubject: jest.fn(),
    mcpGetSubjectTranscript: jest.fn(), mcpGetTranscript: jest.fn(), mcpListHotSubjects: jest.fn(),
    mcpListNearbySubjects: jest.fn(), mcpSearch: jest.fn(), mcpFetch: jest.fn(), mcpCreateHighlight: jest.fn(),
    mcpListHighlights: jest.fn(), mcpSetHighlightShowcase: jest.fn(), mcpGetHighlight: jest.fn(),
    mcpGenerateHighlightVideo: jest.fn(),
}));
jest.mock('@/lib/mcp/adminData', () => ({
    mcpCreateMeeting: jest.fn(), mcpUpdateMeeting: jest.fn(), mcpStartTask: jest.fn(),
    mcpCreateUploadUrl: jest.fn(), mcpCompleteUpload: jest.fn(), mcpCreateCity: jest.fn(), mcpPopulateCity: jest.fn(),
}));

type Captured = { distinctId: string; event: string; properties: Record<string, unknown> };
const captured: Captured[] = [];
jest.mock('posthog-node', () => ({
    PostHog: class {
        capture(message: Captured) {
            captured.push(message);
        }
    },
}));

import { POST } from '../route';

const CLIENT = { name: 'session-token-test', version: '1.2.3' };

async function send(method: string, params: Record<string, unknown>, sessionId?: string) {
    const headers: Record<string, string> = {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        host: 'localhost:3000',
        'mcp-protocol-version': '2025-06-18',
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;
    const response = await POST(
        new Request('http://localhost:3000/api/mcp', {
            method: 'POST',
            headers,
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        }),
        { params: Promise.resolve({ token: undefined }) }
    );
    expect(response.status).toBe(200);
    await response.text();
    return response;
}

const initialize = () => send('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: CLIENT });

/** Capture is asynchronous after the response; wait until `count` events of `event` land. */
async function eventsOf(event: string, count: number): Promise<Captured[]> {
    for (let i = 0; i < 100 && captured.filter(e => e.event === event).length < count; i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    return captured.filter(e => e.event === event);
}

beforeEach(() => {
    captured.length = 0;
    // The SDK warns on every anonymous request that identify returned null.
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('MCP session token', () => {
    it('answers initialize with a session id', async () => {
        const response = await initialize();
        expect(response.headers.get('mcp-session-id')).toBeTruthy();
    });

    it('keeps the session and the client name across the requests of one session', async () => {
        const sessionId = (await initialize()).headers.get('mcp-session-id')!;
        await send('tools/list', {}, sessionId);
        await send('tools/call', { name: 'no_such_tool', arguments: {} }, sessionId);

        const [init] = await eventsOf('$mcp_initialize', 1);
        const [list] = await eventsOf('$mcp_tools_list', 1);
        const [unknown] = await eventsOf('$mcp_unknown_tool', 1);
        for (const event of [init, list, unknown]) {
            expect(event.properties.$mcp_client_name).toBe(CLIENT.name);
            expect(event.properties.$mcp_client_version).toBe(CLIENT.version);
            expect(event.properties.$session_id).toBe(init.properties.$session_id);
        }
    });

    it('gives two sessions two session ids', async () => {
        const first = (await initialize()).headers.get('mcp-session-id')!;
        const second = (await initialize()).headers.get('mcp-session-id')!;
        expect(first).not.toBe(second);
        await send('tools/list', {}, first);
        await send('tools/list', {}, second);
        const lists = await eventsOf('$mcp_tools_list', 2);
        expect(lists[0].properties.$session_id).not.toBe(lists[1].properties.$session_id);
    });

    it('does not mint a token for a request that is not an initialize', async () => {
        const response = await send('tools/list', {});
        expect(response.headers.get('mcp-session-id')).toBeNull();
    });
});
