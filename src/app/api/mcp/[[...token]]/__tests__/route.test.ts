/** @jest-environment node */

// The route is the only code that runs mcp-handler: createMcpHandler turns an
// HTTP request into MCP messages, and withMcpAuth passes the verified token to
// the tools. This file sends real HTTP requests through both. Only the data
// layer and the database are stubs.
jest.mock('@/lib/realm.server', () => ({ getRealm: jest.fn().mockResolvedValue('greece') }));
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@/lib/db/mcpTokens', () => ({ validateUserMcpToken: jest.fn() }));
jest.mock('@/lib/db/apiKeys', () => ({ validateServiceApiKey: jest.fn() }));
jest.mock('@/lib/db/highlights-core', () => ({ getUserCityRights: jest.fn(), meetingHasBodyIn: jest.fn() }));
jest.mock('@/lib/mcp/analytics', () => ({ instrumentMcpAnalytics: jest.fn() }));
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
    mcpCreateAgendaUploadUrl: jest.fn(), mcpCreateCity: jest.fn(), mcpPopulateCity: jest.fn(),
}));

import { POST } from '../route';
import { mcpListCities } from '@/lib/mcp/data';
import { validateServiceApiKey } from '@/lib/db/apiKeys';
import { validateUserMcpToken } from '@/lib/db/mcpTokens';
import { currentMcpIdentity, currentRealm } from '@/lib/mcp/realm-context';

const mockListCities = mcpListCities as jest.MockedFunction<typeof mcpListCities>;
const mockServiceKey = validateServiceApiKey as jest.MockedFunction<typeof validateServiceApiKey>;
const mockUserToken = validateUserMcpToken as jest.MockedFunction<typeof validateUserMcpToken>;

// A 2025-era client: mcp-handler answers it with stateless Streamable HTTP.
const PROTOCOL_VERSION = '2025-06-18';

type JsonRpcResponse = { id: number; result?: Record<string, unknown>; error?: { code: number; message: string } };

async function send(
    method: string,
    params: Record<string, unknown>,
    { path = '/api/mcp', authorization }: { path?: string; authorization?: string } = {}
) {
    const segments = path.split('/').slice(3);
    const headers: Record<string, string> = {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        host: 'localhost:3000',
        'mcp-protocol-version': PROTOCOL_VERSION,
    };
    if (authorization) headers.authorization = authorization;
    const response = await POST(
        new Request(`http://localhost:3000${path}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        }),
        { params: Promise.resolve({ token: segments.length ? segments : undefined }) }
    );
    return response;
}

/** The JSON-RPC response, whether the handler answered with JSON or with an event stream. */
async function rpc(response: Response): Promise<JsonRpcResponse> {
    const text = await response.text();
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
        const data = text.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim());
        return JSON.parse(data[data.length - 1]);
    }
    return JSON.parse(text);
}

async function toolNames(options?: { path?: string; authorization?: string }) {
    const response = await send('tools/list', {}, options);
    expect(response.status).toBe(200);
    const tools = (await rpc(response)).result?.tools as { name: string }[];
    return tools.map(tool => tool.name);
}

describe('/api/mcp route (mcp-handler)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('answers initialize with the server info and the instructions', async () => {
        const response = await send('initialize', {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: 'jest', version: '0.0.0' },
        });

        expect(response.status).toBe(200);
        const { result } = await rpc(response);
        expect(result?.serverInfo).toMatchObject({ name: 'opencouncil' });
        expect(typeof result?.instructions).toBe('string');
    });

    it('lists only the public tools to an anonymous caller', async () => {
        const names = await toolNames();

        expect(names).toEqual(expect.arrayContaining(['search', 'list_cities', 'get_meeting']));
        expect(names).not.toContain('create_highlight');
        expect(names).not.toContain('create_city');
    });

    it('runs a tool inside the request context of the route', async () => {
        let seen: { realm: string; identity: unknown } | undefined;
        mockListCities.mockImplementation(async () => {
            seen = { realm: currentRealm(), identity: currentMcpIdentity() };
            return { cities: [] };
        });

        const response = await send('tools/call', { name: 'list_cities', arguments: {} });

        expect(response.status).toBe(200);
        const { result } = await rpc(response);
        expect(result?.isError).toBeFalsy();
        expect(mockListCities).toHaveBeenCalledTimes(1);
        expect(seen).toEqual({ realm: 'greece', identity: null });
    });

    it('takes the token from the URL path and passes the identity to the tools', async () => {
        mockServiceKey.mockResolvedValue({ id: 'key1', name: 'admin panel' } as Awaited<ReturnType<typeof validateServiceApiKey>>);

        const names = await toolNames({ path: '/api/mcp/sk_test123' });

        expect(mockServiceKey).toHaveBeenCalledWith('sk_test123');
        expect(names).toEqual(expect.arrayContaining(['create_highlight', 'create_city']));
    });

    it('takes the token from the Authorization header', async () => {
        mockServiceKey.mockResolvedValue({ id: 'key1', name: 'admin panel' } as Awaited<ReturnType<typeof validateServiceApiKey>>);

        const names = await toolNames({ authorization: 'Bearer sk_test123' });

        expect(names).toContain('create_city');
    });

    it('rejects an invalid token with 401 instead of serving it as anonymous', async () => {
        mockUserToken.mockResolvedValue(null);
        // withMcpAuth logs the rejected token.
        jest.spyOn(console, 'error').mockImplementation(() => {});

        const response = await send('tools/list', {}, { authorization: 'Bearer mcp_revoked' });

        expect(response.status).toBe(401);
    });

    it('answers 404 for a path that is not a token', async () => {
        const response = await send('tools/list', {}, { path: '/api/mcp/not-a-token' });

        expect(response.status).toBe(404);
    });
});
