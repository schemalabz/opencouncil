/** @jest-environment node */

// The handlers are stubs: this file tests what the SDK hands to them, after
// it validates a call with the input schema of the tool.
jest.mock('../adminData', () => ({
    mcpCompleteUpload: jest.fn().mockResolvedValue({}),
    mcpCreateUploadUrl: jest.fn().mockResolvedValue({}),
    mcpCreateCity: jest.fn().mockResolvedValue({}),
    mcpCreateMeeting: jest.fn(),
    mcpPopulateCity: jest.fn().mockResolvedValue({}),
    mcpStartTask: jest.fn(),
    mcpUpdateMeeting: jest.fn(),
}));
// auth.ts reaches Prisma, and through it env.mjs, which jest does not transform.
jest.mock('../../db/prisma', () => ({ __esModule: true, default: {} }));

import { McpServer } from '@modelcontextprotocol/server';
import { registerAdminTools } from '../adminTools';
import {
    mcpCompleteUpload, mcpCreateCity, mcpCreateMeeting, mcpCreateUploadUrl, mcpPopulateCity, mcpStartTask, mcpUpdateMeeting,
} from '@/lib/mcp/adminData';
import { connectInMemory } from './inMemoryClient';

/** A real McpServer with the tools of a superadmin. Only the handlers are stubs. */
function connect() {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerAdminTools(server, { superadmin: true, cityIds: new Set(), bodyIds: new Set() });
    return connectInMemory(server);
}

const COUNCIL = {
    cityId: 'thessaloniki',
    parties: [{ name: 'Κόμμα', name_en: 'Party', name_short: 'ΚΜ', name_short_en: 'PT', colorHex: '#112233' }],
    administrativeBodies: [{ name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council', type: 'council' }],
    people: [{
        name: 'Άννα Αλεξίου', name_en: 'Anna Alexiou', name_short: 'Α. Αλεξίου', name_short_en: 'A. Alexiou',
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
    it('hands the role dates and the elected order to the handler', async () => {
        const result = await mcp.call('populate_city', COUNCIL);
        expect(result.isError).toBeFalsy();

        const data = (mcpPopulateCity as jest.Mock).mock.calls[0][1];
        expect(data.people[0].roles[0]).toMatchObject({
            startDate: new Date('2024-01-01'),
            endDate: new Date('2028-12-31'),
            electedOrder: 2,
        });
    });

    it('refuses a role that names a party which is not in the call, before the handler runs', async () => {
        const people = [{ ...COUNCIL.people[0], roles: [{ type: 'party', partyName: 'Άλλο Κόμμα' }] }];
        const result = await mcp.call('populate_city', { ...COUNCIL, people });
        expect(result.isError).toBe(true);
        expect(JSON.stringify(result.content)).toContain('unknown party \\"Άλλο Κόμμα\\"');
        expect(mcpPopulateCity).not.toHaveBeenCalled();
    });

    it('refuses a role that ends before it starts', async () => {
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
        for (const field of ['startDate', 'endDate', 'electedOrder', 'administrativeBodyName', 'diavgeiaUnitIds', 'youtubeChannelUrl']) {
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

describe('create_upload_url through the SDK', () => {
    const AGENDA = { cityId: 'chania', kind: 'agenda', identifier: '2026-10-15', format: 'pdf', sizeBytes: 300000 };

    it('refuses an identifier that is not a file name slug', async () => {
        const result = await mcp.call('create_upload_url', { ...AGENDA, identifier: '15/10/2026' });
        expect(result.isError).toBe(true);
        expect(mcpCreateUploadUrl).not.toHaveBeenCalled();
    });

    it('refuses a kind that no MCP tool reads, and a format that no kind takes', async () => {
        expect((await mcp.call('create_upload_url', { ...AGENDA, kind: 'decision' })).isError).toBe(true);
        expect((await mcp.call('create_upload_url', { ...AGENDA, format: 'doc' })).isError).toBe(true);
        expect(mcpCreateUploadUrl).not.toHaveBeenCalled();
    });

    it('refuses a size that is not a whole positive number of bytes', async () => {
        expect((await mcp.call('create_upload_url', { ...AGENDA, sizeBytes: 0 })).isError).toBe(true);
        expect((await mcp.call('create_upload_url', { ...AGENDA, sizeBytes: 1.5 })).isError).toBe(true);
        const { sizeBytes: _omitted, ...withoutSize } = AGENDA;
        expect((await mcp.call('create_upload_url', withoutSize)).isError).toBe(true);
        expect(mcpCreateUploadUrl).not.toHaveBeenCalled();
    });

    it('hands a valid call to the handler', async () => {
        const result = await mcp.call('create_upload_url', { ...AGENDA, kind: 'recording', format: 'mp4', sizeBytes: 12300000000 });
        expect(result.isError).toBeFalsy();
        expect(mcpCreateUploadUrl).toHaveBeenCalledWith(null, { ...AGENDA, kind: 'recording', format: 'mp4', sizeBytes: 12300000000 });
    });
});

describe('complete_upload through the SDK', () => {
    const ARGS = { cityId: 'chania', key: 'uploads/chania_2026-10-15_recording_0a1b2c3d.mp4', uploadId: 'u1', token: 't', sizeBytes: 2000000000 };

    it('refuses a call without the completion fields', async () => {
        const { token: _omitted, ...withoutToken } = ARGS;
        expect((await mcp.call('complete_upload', withoutToken)).isError).toBe(true);
        expect(mcpCompleteUpload).not.toHaveBeenCalled();
    });

    it('hands a valid call to the handler', async () => {
        expect((await mcp.call('complete_upload', ARGS)).isError).toBeFalsy();
        expect(mcpCompleteUpload).toHaveBeenCalledWith(null, ARGS);
    });
});

describe('link inputs take http(s) only', () => {
    const MEETING = { cityId: 'chania', dateTime: '2026-10-05T18:00:00+03:00' };
    const cases: [string, string, Record<string, unknown>, jest.Mock][] = [
        ['create_meeting', 'youtubeUrl', MEETING, mcpCreateMeeting as jest.Mock],
        ['create_meeting', 'agendaUrl', MEETING, mcpCreateMeeting as jest.Mock],
        ['update_meeting', 'youtubeUrl', { cityId: 'chania', meetingId: 'm1' }, mcpUpdateMeeting as jest.Mock],
        ['update_meeting', 'agendaUrl', { cityId: 'chania', meetingId: 'm1' }, mcpUpdateMeeting as jest.Mock],
        ['start_task', 'videoUrl', { cityId: 'chania', meetingId: 'm1', type: 'transcribe' }, mcpStartTask as jest.Mock],
        ['start_task', 'agendaUrl', { cityId: 'chania', meetingId: 'm1', type: 'processAgenda' }, mcpStartTask as jest.Mock],
    ];

    it.each(cases)('%s refuses a javascript: %s', async (tool, field, args, handler) => {
        const result = await mcp.call(tool, { ...args, [field]: 'javascript:alert(1)' });
        expect(result.isError).toBe(true);
        expect(handler).not.toHaveBeenCalled();
    });

    it.each(cases)('%s takes an https %s', async (tool, field, args, handler) => {
        handler.mockResolvedValue({});
        const result = await mcp.call(tool, { ...args, [field]: 'https://example.com/file' });
        expect(result.isError).toBeFalsy();
        expect(handler).toHaveBeenCalledWith(null, expect.objectContaining({ [field]: 'https://example.com/file' }));
    });
});
