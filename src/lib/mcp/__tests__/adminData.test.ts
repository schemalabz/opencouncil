/** @jest-environment node */

const mockUserFindUnique = jest.fn();
const mockUserFindMany = jest.fn();
const mockUserCount = jest.fn();
const mockPartyFindMany = jest.fn();
const mockPersonFindMany = jest.fn();

jest.mock('../../db/prisma', () => ({
    __esModule: true,
    default: {
        user: {
            findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
            findMany: (...args: unknown[]) => mockUserFindMany(...args),
            count: (...args: unknown[]) => mockUserCount(...args),
        },
        party: { findMany: (...args: unknown[]) => mockPartyFindMany(...args) },
        person: { findMany: (...args: unknown[]) => mockPersonFindMany(...args) },
    },
}));

// Collaborators that do the writes. Each one reaches far into the app (the
// session, Discord, the calendar), and none of that is under test here.
jest.mock('../../cache/afterResponse', () => ({ revalidateAfterResponse: jest.fn() }));
jest.mock('../../db/cities', () => ({ canUseCityCreator: jest.fn(), getCity: jest.fn() }));
jest.mock('../../db/citiesAdmin', () => ({ createCityDirect: jest.fn() }));
jest.mock('../../meetingWrites', () => ({ createMeetingWithEffects: jest.fn(), updateMeetingWithEffects: jest.fn() }));
jest.mock('../realmGuards', () => ({
    assertCitiesInRealm: jest.fn(),
    requireRealmCity: jest.fn(),
    requireCityBodies: jest.fn(),
}));
jest.mock('../gate', () => ({ requireVisibleMeeting: jest.fn() }));
jest.mock('../../tasks/startMeetingTask', () => ({ startMeetingTask: jest.fn() }));
// s3.ts builds its client from env.mjs at import time.
jest.mock('../../s3', () => ({
    generatePresignedUrl: jest.fn(),
    constructPublicUrl: jest.fn((bucket: string, key: string) => `https://${bucket}.test/${key}`),
}));
jest.mock('@/env.mjs', () => ({ env: { DO_SPACES_BUCKET: 'bucket' } }));

import { Prisma, Realm } from '@prisma/client';
import {
    mcpCreateAgendaUploadUrl, mcpCreateCity, mcpCreateMeeting, mcpPopulateCity, mcpStartTask, mcpUpdateMeeting,
} from '../adminData';
import type { McpAdminAccess } from '../adminAccess';
import { mcpRealmStore, requestContext } from '../realm-context';
import { cityPopulationSchema, type CityPopulationInput } from '../../zod-schemas/cityPopulation';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../api/errors';
import { createCityDirect } from '../../db/citiesAdmin';
import { populateCity } from '../../db/cityPopulate';
import { createMeetingWithEffects, updateMeetingWithEffects } from '../../meetingWrites';
import { requireRealmCity } from '../realmGuards';
import { startMeetingTask } from '../../tasks/startMeetingTask';
import { generatePresignedUrl } from '../../s3';
import * as cityPopulate from '../../db/cityPopulate';

const ADMIN_TOKEN = { type: 'user', userId: 'u1' } as const;
const SERVICE = { type: 'service', keyName: 'bot' } as const;

const asCityAdmin = (...cityIds: string[]) =>
    mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false, administers: cityIds.map(cityId => ({ cityId })) });

const SUPERADMIN: McpAdminAccess = { superadmin: true, cityIds: new Set() };

// A request scope with the access the route handler would have resolved.
const inRealm = <T>(realm: Realm, fn: () => Promise<T>, adminAccess: McpAdminAccess = SUPERADMIN) =>
    mcpRealmStore.run(requestContext(realm, null, SERVICE, { adminAccess }), fn);


const MEETING = { cityId: 'argos', name: 'Συνεδρίαση', name_en: 'Meeting', dateTime: '2026-10-05T18:00:00+03:00', processAgenda: false };

beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false, administers: [] });
    mockPartyFindMany.mockResolvedValue([]);
    mockPersonFindMany.mockResolvedValue([]);
});

describe('meeting tools authorize before they write', () => {
    it('refuses to create a meeting in a city that the caller does not administer', async () => {
        asCityAdmin('athens');
        await expect(mcpCreateMeeting(ADMIN_TOKEN, MEETING)).rejects.toThrow(ForbiddenError);
        expect(createMeetingWithEffects).not.toHaveBeenCalled();
    });

    it('refuses to update one as well', async () => {
        asCityAdmin('athens');
        await expect(mcpUpdateMeeting(ADMIN_TOKEN, { cityId: 'argos', meetingId: 'm1', name: 'Νέο όνομα' }))
            .rejects.toThrow(ForbiddenError);
        expect(updateMeetingWithEffects).not.toHaveBeenCalled();
    });

    it('sends only the fields that the caller passed, and keeps an explicit null', async () => {
        asCityAdmin('argos');
        (updateMeetingWithEffects as jest.Mock).mockResolvedValue({
            id: 'm1', cityId: 'argos', name: 'n', name_en: 'n', dateTime: new Date(), youtubeUrl: null,
            agendaUrl: null, administrativeBody: null, released: false,
        });
        await mcpUpdateMeeting(ADMIN_TOKEN, { cityId: 'argos', meetingId: 'm1', agendaUrl: null });
        expect(updateMeetingWithEffects).toHaveBeenCalledWith('argos', 'm1', { agendaUrl: null });
    });

    it('rejects an update with no field to change', async () => {
        asCityAdmin('argos');
        await expect(mcpUpdateMeeting(ADMIN_TOKEN, { cityId: 'argos', meetingId: 'm1' })).rejects.toThrow(BadRequestError);
    });
});

describe('create_city', () => {
    const CITY = {
        id: 'lyon', name: 'Lyon', name_en: 'Lyon', name_municipality: 'Ville de Lyon',
        name_municipality_en: 'City of Lyon', timezone: 'Europe/Paris', authorityType: 'municipality' as const,
    };

    it('is refused to a city administrator', async () => {
        asCityAdmin('athens');
        await expect(mcpCreateCity(ADMIN_TOKEN, CITY)).rejects.toThrow(ForbiddenError);
        expect(createCityDirect).not.toHaveBeenCalled();
    });

    it('creates a pending city in the realm of the connector, in the language of that realm', async () => {
        (createCityDirect as jest.Mock).mockImplementation(async data => data);
        await inRealm(Realm.france, () => mcpCreateCity(SERVICE, CITY));
        expect(createCityDirect).toHaveBeenCalledWith(expect.objectContaining({
            id: 'lyon', realm: 'france', language: 'fr', status: 'pending', logoImage: null,
        }));
    });

    it('reports a taken id as a conflict, from the unique index', async () => {
        (createCityDirect as jest.Mock).mockRejectedValue(
            new Prisma.PrismaClientKnownRequestError('taken', { code: 'P2002', clientVersion: 'test' })
        );
        await expect(mcpCreateCity(SERVICE, CITY)).rejects.toThrow(ConflictError);
    });

    it('lets any other database error through as is', async () => {
        (createCityDirect as jest.Mock).mockRejectedValue(new Error('connection lost'));
        await expect(mcpCreateCity(SERVICE, CITY)).rejects.toThrow('connection lost');
    });
});

describe('populate_city', () => {
    // The SDK validates a call with cityPopulationSchema before the handler
    // runs (see server.test.ts), so the handler receives the parsed data.
    type Roles = NonNullable<CityPopulationInput['people'][number]['roles']>;
    const person = (roles: Roles) => ({ name: 'Άννα Αλεξίου', name_en: 'Anna Alexiou', name_short: 'Α. Αλεξίου', name_short_en: 'A. Alexiou', roles });
    const parsed = (roles: Roles) => cityPopulationSchema.parse({
        cityId: 'lyon',
        parties: [{ name: 'Κόμμα', name_en: 'Party', name_short: 'ΚΜ', name_short_en: 'PT', colorHex: '#112233' }],
        administrativeBodies: [{ name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council', type: 'council' }],
        people: [person(roles)],
    });

    it('rejects a role that names a party which is not in the call', async () => {
        const populate = jest.spyOn(cityPopulate, 'populateCity');
        const data = parsed([{ type: 'party', partyName: 'Αλλο Κόμμα' }]);
        await expect(mcpPopulateCity(SERVICE, data)).rejects.toThrow(/unknown party "Αλλο Κόμμα"/);
        expect(populate).not.toHaveBeenCalled();
    });

    it('saves a call whose roles all resolve', async () => {
        const populate = jest.spyOn(cityPopulate, 'populateCity')
            .mockResolvedValue({ partiesCount: 1, peopleCount: 1, rolesCount: 2, adminBodiesCount: 1 });
        const data = parsed([
            { type: 'party', partyName: 'Κόμμα' },
            { type: 'adminBody', administrativeBodyName: 'Δημοτικό Συμβούλιο' },
        ]);
        await expect(mcpPopulateCity(SERVICE, data)).resolves.toMatchObject({ cityId: 'lyon', rolesCount: 2 });
        expect(populate).toHaveBeenCalledWith('lyon', data);
    });
});

describe('start_task', () => {
    it('is refused for a city that the caller does not administer', async () => {
        asCityAdmin('athens');
        await expect(mcpStartTask(ADMIN_TOKEN, { cityId: 'argos', meetingId: 'm1', type: 'transcribe' })).rejects.toThrow(ForbiddenError);
        expect(startMeetingTask).not.toHaveBeenCalled();
    });

    it('forwards the step and its options, and answers with the task and a poll hint', async () => {
        asCityAdmin('argos');
        (startMeetingTask as jest.Mock).mockResolvedValue({
            id: 't1', type: 'transcribe', status: 'pending', stage: null, percentComplete: null,
            createdAt: new Date('2026-09-23T10:00:00Z'), updatedAt: new Date('2026-09-23T10:00:00Z'), version: null,
        });
        const result = await mcpStartTask(ADMIN_TOKEN, { cityId: 'argos', meetingId: 'm1', type: 'transcribe', force: true, videoUrl: 'https://youtu.be/x' });
        expect(startMeetingTask).toHaveBeenCalledWith('argos', 'm1', { type: 'transcribe', force: true, videoUrl: 'https://youtu.be/x' });
        expect(result).toMatchObject({ id: 't1', type: 'transcribe', status: 'pending', startedAt: '2026-09-23T10:00:00.000Z', meetingId: 'm1' });
        expect(result).not.toHaveProperty('finishedAt');
        expect(result.next).toMatch(/get_meeting/);
    });
});

describe('create_agenda_upload_url', () => {
    it('signs a readable key under uploads/ and answers with the public URL and the PUT headers', async () => {
        asCityAdmin('argos');
        (generatePresignedUrl as jest.Mock).mockResolvedValue('https://bucket.test/signed');
        const result = await mcpCreateAgendaUploadUrl(ADMIN_TOKEN, { cityId: 'argos', identifier: '2026-10-15', format: 'pdf' });

        const key = (generatePresignedUrl as jest.Mock).mock.calls[0][0];
        expect(key).toMatch(/^uploads\/argos_2026-10-15_agenda_[0-9a-f]{8}\.pdf$/);
        expect(generatePresignedUrl).toHaveBeenCalledWith(key, 'application/pdf', 300);
        expect(result).toMatchObject({
            uploadUrl: 'https://bucket.test/signed',
            method: 'PUT',
            headers: { 'Content-Type': 'application/pdf', 'x-amz-acl': 'public-read' },
            expiresIn: 300,
            publicUrl: `https://bucket.test/${key}`,
        });
        expect(result.next).toMatch(/create_meeting/);
    });

    it('gives each call its own key', async () => {
        asCityAdmin('argos');
        (generatePresignedUrl as jest.Mock).mockResolvedValue('https://bucket.test/signed');
        const args = { cityId: 'argos', identifier: '2026-10-15', format: 'pdf' as const };
        const first = await mcpCreateAgendaUploadUrl(ADMIN_TOKEN, args);
        const second = await mcpCreateAgendaUploadUrl(ADMIN_TOKEN, args);
        expect(first.publicUrl).not.toBe(second.publicUrl);
    });

    it('names a .docx file by its extension and signs its content type', async () => {
        asCityAdmin('argos');
        (generatePresignedUrl as jest.Mock).mockResolvedValue('https://bucket.test/signed');
        const result = await mcpCreateAgendaUploadUrl(ADMIN_TOKEN, { cityId: 'argos', identifier: '2026-10-15', format: 'docx' });

        const key = (generatePresignedUrl as jest.Mock).mock.calls[0][0];
        expect(key).toMatch(/^uploads\/argos_2026-10-15_agenda_[0-9a-f]{8}\.docx$/);
        const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        expect(generatePresignedUrl).toHaveBeenCalledWith(key, docx, 300);
        expect(result.headers['Content-Type']).toBe(docx);
    });
});

/**
 * The permission matrix, in one place: which caller each admin function
 * refuses before it touches anything. The write collaborators are mocked, so
 * a refusal that came after a write would show as a call on them.
 */
describe('permission matrix', () => {
    const CITY = {
        id: 'lyon', name: 'Lyon', name_en: 'Lyon', name_municipality: 'Ville de Lyon',
        name_municipality_en: 'City of Lyon', timezone: 'Europe/Paris', authorityType: 'municipality' as const,
    };
    const COUNCIL = cityPopulationSchema.parse({
        cityId: 'argos', parties: [], administrativeBodies: [{ name: 'Συμβούλιο', name_en: 'Council', type: 'council' }], people: [],
    });

    const cityScoped = {
        create_meeting: (id: McpIdentityArg) => mcpCreateMeeting(id, MEETING),
        update_meeting: (id: McpIdentityArg) => mcpUpdateMeeting(id, { cityId: 'argos', meetingId: 'm1', name: 'Νέο' }),
        start_task: (id: McpIdentityArg) => mcpStartTask(id, { cityId: 'argos', meetingId: 'm1', type: 'transcribe' }),
        create_agenda_upload_url: (id: McpIdentityArg) => mcpCreateAgendaUploadUrl(id, { cityId: 'argos', identifier: '2026-10-15', format: 'pdf' }),
    };
    const superadminOnly = {
        create_city: (id: McpIdentityArg) => mcpCreateCity(id, CITY),
        populate_city: (id: McpIdentityArg) => mcpPopulateCity(id, COUNCIL),
    };
    type McpIdentityArg = Parameters<typeof mcpCreateMeeting>[0];
    const writes = () => [
        createMeetingWithEffects, updateMeetingWithEffects, startMeetingTask, createCityDirect, populateCity, generatePresignedUrl,
    ].map(fn => (fn as jest.Mock).mock.calls.length).reduce((a, b) => a + b, 0);

    const all = { ...cityScoped, ...superadminOnly };

    it.each(Object.keys(all))('%s refuses an anonymous caller', async name => {
        await expect(all[name as keyof typeof all](null)).rejects.toThrow(UnauthorizedError);
        expect(writes()).toBe(0);
    });

    it.each(Object.keys(all))('%s refuses a token whose owner administers nothing', async name => {
        mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false, administers: [{ cityId: null }] });
        await expect(all[name as keyof typeof all](ADMIN_TOKEN)).rejects.toThrow(ForbiddenError);
        expect(writes()).toBe(0);
    });

    it.each(Object.keys(cityScoped))('%s refuses the administrator of another city', async name => {
        asCityAdmin('athens');
        await expect(cityScoped[name as keyof typeof cityScoped](ADMIN_TOKEN)).rejects.toThrow(ForbiddenError);
        expect(writes()).toBe(0);
    });

    it.each(Object.keys(superadminOnly))('%s refuses a city administrator', async name => {
        asCityAdmin('argos');
        await expect(superadminOnly[name as keyof typeof superadminOnly](ADMIN_TOKEN)).rejects.toThrow(ForbiddenError);
        expect(writes()).toBe(0);
    });
});
