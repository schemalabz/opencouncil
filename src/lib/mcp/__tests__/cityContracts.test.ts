/** @jest-environment node */
jest.mock('../data', () => new Proxy({ __esModule: true } as Record<string, unknown>, {
    get: (target, prop: string) => (target[prop] ??= jest.fn()),
}));
jest.mock('../adminData', () => new Proxy({ __esModule: true } as Record<string, unknown>, {
    get: (target, prop: string) => (target[prop] ??= jest.fn()),
}));
jest.mock('../../db/prisma', () => ({ __esModule: true, default: {} }));

import { McpServer } from '@modelcontextprotocol/server';
import { registerOpenCouncilServer } from '../server';
import { mcpGetCity } from '../data';
import { mcpUpdateCity } from '../adminData';
import { connectInMemory } from './inMemoryClient';
import { mcpRealmStore, requestContext } from '../realm-context';
import { Realm } from '@prisma/client';
import { BadRequestError } from '@/lib/api/errors';
import { McpClient } from '../../../../services/notis/src/lib/mcp-client';

import { cityProfile } from './cityProfileFixture';

async function connect() {
    const server = new McpServer({ name: 'test', version: '1' });
    mcpRealmStore.run(requestContext(Realm.sweden, null, { userId: 'bot' }, {
        adminAccess: { superadmin: true, cityIds: new Set(), bodyIds: new Set() },
    }), () => registerOpenCouncilServer(server));
    return connectInMemory(server);
}

beforeEach(() => jest.clearAllMocks());

it('advertises the same city profile in read and update output contracts', async () => {
    const mcp = await connect();
    try {
        const tools = await mcp.listTools();
        const read = tools.find(tool => tool.name === 'get_city')!;
        const update = tools.find(tool => tool.name === 'update_city')!;
        expect(JSON.stringify(read.outputSchema)).toContain('timezone');
        expect(JSON.stringify(update.outputSchema)).toContain('timezone');
        expect(JSON.stringify(update.outputSchema)).toContain('changes');
    } finally { await mcp.close(); }
});

it.each(['get_city', 'update_city'])('returns structured data and identical legacy JSON for %s', async name => {
    const payload = name === 'get_city' ? cityProfile : { city: cityProfile, changed: false, changes: {} };
    (mcpGetCity as jest.Mock).mockResolvedValue(cityProfile);
    (mcpUpdateCity as jest.Mock).mockResolvedValue(payload);
    const mcp = await connect();
    try {
        const response = await mcp.request('tools/call', { name, arguments: { cityId: 'laholm', ...(name === 'update_city' ? { status: 'demo' } : {}) } });
        expect(response.error).toBeUndefined();
        expect(response.result?.structuredContent).toEqual(payload);
        expect(JSON.parse((response.result?.content as { text: string }[])[0].text)).toEqual(payload);
    } finally { await mcp.close(); }
});

it('rejects malformed successful output through the SDK', async () => {
    (mcpGetCity as jest.Mock).mockResolvedValue({ ...cityProfile, status: 'invented' });
    const mcp = await connect();
    try {
        const response = await mcp.request('tools/call', { name: 'get_city', arguments: { cityId: 'laholm' } });
        expect(JSON.stringify(response)).toContain('Output validation error');
    } finally { await mcp.close(); }
});

it('keeps actionable tool errors outside the successful output contract', async () => {
    (mcpUpdateCity as jest.Mock).mockRejectedValue(new BadRequestError('Invalid boundary GeoJSON'));
    const mcp = await connect();
    try {
        const result = await mcp.call('update_city', { cityId: 'laholm', geojson: '{' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe('Invalid boundary GeoJSON');
    } finally { await mcp.close(); }
});

it('feeds a validated city result through the actual Notis HTTP consumer', async () => {
    (mcpGetCity as jest.Mock).mockResolvedValue(cityProfile);
    const mcp = await connect();
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async (_input, init) => {
        const request = JSON.parse(init!.body as string);
        if (request.method === 'notifications/initialized') return new Response(null, { status: 202 });
        const response = request.method === 'tools/call'
            ? await mcp.request('tools/call', request.params)
            : { jsonrpc: '2.0', id: request.id, result: { capabilities: {} } };
        return new Response(JSON.stringify(response), { headers: { 'content-type': 'application/json' } });
    });
    try {
        expect(await new McpClient('http://mcp.test').call('get_city', { cityId: 'laholm' })).toEqual(cityProfile);
    } finally {
        global.fetch = originalFetch;
        await mcp.close();
    }
});
