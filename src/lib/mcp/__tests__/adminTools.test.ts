/** @jest-environment node */

// The handlers are stubs: this file tests what the SDK hands to them, after
// it validates a call with the input schema of the tool.
jest.mock('../adminData', () => ({
    mcpCreateAgendaUploadUrl: jest.fn().mockResolvedValue({}),
    mcpCreateCity: jest.fn().mockResolvedValue({}),
    mcpCreateMeeting: jest.fn(),
    mcpPopulateCity: jest.fn().mockResolvedValue({}),
    mcpStartTask: jest.fn(),
    mcpUpdateMeeting: jest.fn(),
}));
// auth.ts reaches Prisma, and through it env.mjs, which jest does not transform.
jest.mock('../../db/prisma', () => ({ __esModule: true, default: {} }));

import { InMemoryTransport, LATEST_PROTOCOL_VERSION, McpServer, type JSONRPCMessage } from '@modelcontextprotocol/server';
import { registerAdminTools } from '../adminTools';
import { mcpCreateAgendaUploadUrl, mcpCreateCity, mcpPopulateCity } from '../adminData';

type Response = { id: number; result?: Record<string, unknown>; error?: { message: string } };
type CallResult = { isError?: boolean; content: { text: string }[] };

/**
 * A real McpServer with the tools of a superadmin, and a client end that
 * sends raw JSON-RPC. Only the handlers are stubs.
 */
async function connect() {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerAdminTools(server, { superadmin: true, cityIds: new Set(), bodyIds: new Set() });
    const [client, serverEnd] = InMemoryTransport.createLinkedPair();
    const pending = new Map<number, (response: Response) => void>();
    client.onmessage = (message: JSONRPCMessage) => {
        const response = message as unknown as Response;
        pending.get(response.id)?.(response);
    };
    await server.connect(serverEnd);
    await client.start();

    let nextId = 1;
    const request = (method: string, params: Record<string, unknown>) => new Promise<Response>(resolve => {
        const id = nextId++;
        pending.set(id, resolve);
        void client.send({ jsonrpc: '2.0', id, method, params });
    });
    await request('initialize', {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'jest', version: '0.0.0' },
    });
    await client.send({ jsonrpc: '2.0', method: 'notifications/initialized' });

    const call = async (name: string, args: Record<string, unknown>) =>
        (await request('tools/call', { name, arguments: args })).result as CallResult;
    const listTools = async () =>
        (await request('tools/list', {})).result?.tools as { name: string; inputSchema: Record<string, unknown> }[];
    return { call, listTools, close: () => server.close() };
}

const COUNCIL = {
    cityId: 'thessaloniki',
    parties: [{ name: 'Κόμμα', name_en: 'Party', name_short: 'ΚΜ', name_short_en: 'PT', colorHex: '#112233' }],
    administrativeBodies: [{ name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council', type: 'council' }],
    people: [{
        name: 'Άννα Αλεξίου', name_en: 'Anna Alexiou', name_short: 'Α. Αλεξίου', name_short_en: 'A. Alexiou',
        partyName: 'Κόμμα',
        roles: [{
            type: 'adminBody', administrativeBodyName: 'Δημοτικό Συμβούλιο',
            startDate: '2024-01-01', endDate: '2028-12-31', electedOrder: 2,
        }],
    }],
};

const CITY = {
    id: 'thessaloniki', name: 'Θεσσαλονίκη', name_en: 'Thessaloniki', name_municipality: 'Δήμος Θεσσαλονίκης',
    name_municipality_en: 'Municipality of Thessaloniki', timezone: 'Europe/Athens',
};

let mcp: Awaited<ReturnType<typeof connect>>;
beforeEach(async () => {
    jest.clearAllMocks();
    mcp = await connect();
});
afterEach(() => mcp.close());

describe('populate_city through the SDK', () => {
    it('hands the role dates, the elected order and the party of a person to the handler', async () => {
        const result = await mcp.call('populate_city', COUNCIL);
        expect(result.isError).toBeFalsy();

        const data = (mcpPopulateCity as jest.Mock).mock.calls[0][1];
        expect(data.people[0].partyName).toBe('Κόμμα');
        expect(data.people[0].roles[0]).toMatchObject({
            startDate: new Date('2024-01-01'),
            endDate: new Date('2028-12-31'),
            electedOrder: 2,
        });
    });

    it('refuses a role that ends before it starts, as the City Creator does', async () => {
        const people = [{ ...COUNCIL.people[0], roles: [{ ...COUNCIL.people[0].roles[0], startDate: '2028-01-01', endDate: '2024-01-01' }] }];
        const result = await mcp.call('populate_city', { ...COUNCIL, people });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toMatch(/end date must not be before the start date/);
        expect(mcpPopulateCity).not.toHaveBeenCalled();
    });

    it('refuses a city without an administrative body', async () => {
        const result = await mcp.call('populate_city', { ...COUNCIL, administrativeBodies: [], people: [] });
        expect(result.isError).toBe(true);
        expect(mcpPopulateCity).not.toHaveBeenCalled();
    });

    it('advertises every field of the shared schema, with no dangling reference', async () => {
        const tool = (await mcp.listTools()).find(t => t.name === 'populate_city');
        const text = JSON.stringify(tool?.inputSchema);
        expect(tool?.inputSchema.type).toBe('object');
        for (const field of ['startDate', 'endDate', 'electedOrder', 'administrativeBodyName']) {
            expect(text).toContain(`"${field}"`);
        }
        expect(text).not.toContain('$ref');
    });
});

describe('create_city through the SDK', () => {
    it('refuses a time zone that Intl does not know', async () => {
        const result = await mcp.call('create_city', { ...CITY, timezone: 'Athens' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toMatch(/IANA/);
        expect(mcpCreateCity).not.toHaveBeenCalled();
    });

    it('refuses an id that is not a URL slug', async () => {
        const result = await mcp.call('create_city', { ...CITY, id: 'Thessaloniki' });
        expect(result.isError).toBe(true);
        expect(mcpCreateCity).not.toHaveBeenCalled();
    });

    it('fills in the authority type and hands a valid city to the handler', async () => {
        const result = await mcp.call('create_city', CITY);
        expect(result.isError).toBeFalsy();
        expect(mcpCreateCity).toHaveBeenCalledWith(null, { ...CITY, authorityType: 'municipality' });
    });
});

describe('create_agenda_upload_url through the SDK', () => {
    it('refuses an identifier that is not a file name slug', async () => {
        const result = await mcp.call('create_agenda_upload_url', { cityId: 'chania', identifier: '15/10/2026' });
        expect(result.isError).toBe(true);
        expect(mcpCreateAgendaUploadUrl).not.toHaveBeenCalled();
    });

    it('refuses a format other than pdf and docx', async () => {
        const result = await mcp.call('create_agenda_upload_url', { cityId: 'chania', identifier: '2026-10-15', format: 'doc' });
        expect(result.isError).toBe(true);
        expect(mcpCreateAgendaUploadUrl).not.toHaveBeenCalled();
    });

    it('fills in the pdf format and hands the city and the identifier to the handler', async () => {
        const result = await mcp.call('create_agenda_upload_url', { cityId: 'chania', identifier: '2026-10-15' });
        expect(result.isError).toBeFalsy();
        expect(mcpCreateAgendaUploadUrl).toHaveBeenCalledWith(null, { cityId: 'chania', identifier: '2026-10-15', format: 'pdf' });
    });

    it('forwards a docx format', async () => {
        await mcp.call('create_agenda_upload_url', { cityId: 'chania', identifier: '2026-10-15', format: 'docx' });
        expect(mcpCreateAgendaUploadUrl).toHaveBeenCalledWith(null, expect.objectContaining({ format: 'docx' }));
    });
});
