/** @jest-environment node */

const mockUserFindUnique = jest.fn();
const mockUserFindMany = jest.fn();
const mockUserCount = jest.fn();
const mockPartyFindMany = jest.fn();
const mockPersonFindMany = jest.fn();
const mockCityFindUnique = jest.fn();
const mockMeetingFindUnique = jest.fn();
const mockBodyFindUnique = jest.fn();

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
        city: { findUnique: (...args: unknown[]) => mockCityFindUnique(...args) },
        councilMeeting: { findUnique: (...args: unknown[]) => mockMeetingFindUnique(...args) },
        administrativeBody: { findUnique: (...args: unknown[]) => mockBodyFindUnique(...args) },
    },
}));

// Collaborators that do the writes. Each one reaches far into the app (the
// session, Discord, the calendar), and none of that is under test here.
jest.mock('../../cache/afterResponse', () => ({ revalidateAfterResponse: jest.fn() }));
jest.mock('../../db/subject', () => ({ landingSubjectsTag: (realm: string) => `realm:${realm}:landing-subjects` }));
jest.mock('../../db/citiesAdmin', () => ({ createCityDirect: jest.fn(), countCitiesByRealmAndStatus: jest.fn(), applyCityUpdateDirect: jest.fn() }));
jest.mock('../../db/topicsAdmin', () => ({ createRealmTopicsDirect: jest.fn(), countActiveTopicsByRealm: jest.fn().mockResolvedValue([]) }));
jest.mock('../../meetingWrites', () => ({ createMeetingWithEffects: jest.fn(), updateMeetingWithEffects: jest.fn() }));
jest.mock('../../db/meetings', () => ({ setMeetingReleaseDirect: jest.fn() }));
jest.mock('../../notifications/meetingNotifications', () => ({ getReleaseOutlook: jest.fn() }));
jest.mock('../realmGuards', () => ({
    assertCitiesInRealm: jest.fn(),
    requireRealmCity: jest.fn(),
    requireCityBodies: jest.fn(),
}));
jest.mock('../data', () => ({ projectCityProfile: jest.fn() }));
jest.mock('../gate', () => ({ requireVisibleMeeting: jest.fn() }));
jest.mock('../../tasks/startMeetingTask', () => ({ startMeetingTask: jest.fn() }));
// The upload service signs against the bucket; its own tests cover it.
jest.mock('../../uploads', () => ({ startUpload: jest.fn(), completeUpload: jest.fn() }));

jest.mock('@/env.mjs', () => ({ env: { TASK_API_URL: 'https://tasks.test', TASK_API_KEY: 'secret' } }));

import { projectCityProfile } from '../data';
import { cityProfile } from './cityProfileFixture';
import { Prisma, Realm } from '@prisma/client';
import {
    mcpInspectMedia, mcpCompleteUpload, mcpCreateCity, mcpCreateMeeting, mcpCreateTopics, mcpCreateUploadUrl, mcpListRealms, mcpPopulateCity, mcpUpdateCity, mcpStartTask,
    mcpUpdateMeeting,
} from '../adminData';
import type { McpAdminAccess } from '../adminAccess';
import { mcpRealmStore, requestContext } from '../realm-context';
import { cityPopulationSchema, type CityPopulationInput } from '../../zod-schemas/cityPopulation';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../api/errors';
import { countCitiesByRealmAndStatus, createCityDirect, applyCityUpdateDirect } from '../../db/citiesAdmin';
import { revalidateAfterResponse } from '../../cache/afterResponse';
import { countActiveTopicsByRealm, createRealmTopicsDirect } from '../../db/topicsAdmin';
import { createTopicsToolInput } from '../adminToolSchemas';
import { populateCity } from '../../db/cityPopulate';
import { createMeetingWithEffects, updateMeetingWithEffects } from '../../meetingWrites';
import { requireRealmCity } from '../realmGuards';
import { requireVisibleMeeting } from '../gate';
import { startMeetingTask } from '../../tasks/startMeetingTask';
import { setMeetingReleaseDirect } from '../../db/meetings';
import { getReleaseOutlook } from '../../notifications/meetingNotifications';
import { LifecycleRuleError } from '../../meetingLifecycleRules';
import { completeUpload, startUpload } from '../../uploads';
import * as cityPopulate from '../../db/cityPopulate';

const ADMIN_TOKEN = { userId: 'u1' } as const;
// The token of a superadmin account; the route resolved its access.
const SUPERADMIN_TOKEN = { userId: 'bot' } as const;

const asCityAdmin = (...cityIds: string[]) =>
    mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false, administers: cityIds.map(cityId => ({ cityId })) });
// An admin of one body of a city, and of nothing else.
const asBodyAdmin = (bodyId: string, cityId: string) =>
    mockUserFindUnique.mockResolvedValue({
        isSuperAdmin: false,
        administers: [{ cityId: null, administrativeBodyId: bodyId, administrativeBody: { cityId } }],
    });

const SUPERADMIN: McpAdminAccess = { superadmin: true, cityIds: new Set(), bodyIds: new Set() };
// Outside a request scope the guards read the rights from the database.
const asSuperadmin = () => mockUserFindUnique.mockResolvedValue({ isSuperAdmin: true, administers: [] });

// The bodies of argos, and its meetings: m1 is the council's, m2 the
// committee's, m3 has no body. requireVisibleMeeting is mocked, so it answers
// from the same table.
const BODIES: Record<string, { cityId: string }> = { council: { cityId: 'argos' }, committee: { cityId: 'argos' } };
const MEETINGS: Record<string, { administrativeBodyId: string | null }> = {
    m1: { administrativeBodyId: 'council' }, m2: { administrativeBodyId: 'committee' }, m3: { administrativeBodyId: null },
};

// A request scope with the access the route handler would have resolved.
const inRealm = <T>(realm: Realm, fn: () => Promise<T>, adminAccess: McpAdminAccess = SUPERADMIN) =>
    mcpRealmStore.run(requestContext(realm, null, SUPERADMIN_TOKEN, { adminAccess }), fn);


const MEETING = { cityId: 'argos', dateTime: '2026-10-05T18:00:00+03:00', processAgenda: false };

beforeEach(() => {
    jest.clearAllMocks();
    (applyCityUpdateDirect as jest.Mock).mockResolvedValue({ before: { status: 'pending', boundary: null }, after: { status: 'demo', boundary: { geometryType: 'Polygon', polygonCount: 1 } }, changed: true, city: { id: 'laholm' } });
    (projectCityProfile as jest.Mock).mockResolvedValue(cityProfile);
    mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false, administers: [] });
    mockPartyFindMany.mockResolvedValue([]);
    mockPersonFindMany.mockResolvedValue([]);
    mockCityFindUnique.mockResolvedValue({ timezone: 'Europe/Athens' });
    mockBodyFindUnique.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(BODIES[where.id] ?? null));
    mockMeetingFindUnique.mockImplementation(({ where }: { where: { cityId_id: { id: string } } }) =>
        Promise.resolve(MEETINGS[where.cityId_id.id] ?? null));
    (requireVisibleMeeting as jest.Mock).mockImplementation((_cityId: string, meetingId: string) =>
        Promise.resolve({ released: false, administrativeBodyId: MEETINGS[meetingId]?.administrativeBodyId ?? null, editor: true, locale: 'el' }));
    (requireRealmCity as jest.Mock).mockResolvedValue('greece');
});

describe('meeting tools authorize before they write', () => {
    it('refuses to create a meeting in a city that the caller does not administer', async () => {
        asCityAdmin('athens');
        await expect(mcpCreateMeeting(ADMIN_TOKEN, MEETING)).rejects.toThrow(ForbiddenError);
        expect(createMeetingWithEffects).not.toHaveBeenCalled();
    });

    it('refuses to update one as well', async () => {
        asCityAdmin('athens');
        await expect(mcpUpdateMeeting(ADMIN_TOKEN, { cityId: 'argos', meetingId: 'm1', sessionNumber: 4 }))
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

    it('creates a meeting with no name, and returns the derived name', async () => {
        asCityAdmin('argos');
        (createMeetingWithEffects as jest.Mock).mockResolvedValue({ meeting: {
            id: 'oct05_2026', cityId: 'argos', name: null, name_en: null, kind: 'ordinary', urgent: false,
            dateTime: new Date('2026-10-05T15:00:00Z'), released: false,
            administrativeBody: { name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council' },
        } });
        const result = await mcpCreateMeeting(ADMIN_TOKEN, { cityId: 'argos', dateTime: '2026-10-05T18:00:00+03:00', processAgenda: false });
        expect((createMeetingWithEffects as jest.Mock).mock.calls[0][1]).not.toHaveProperty('name');
        expect((createMeetingWithEffects as jest.Mock).mock.calls[0][1]).not.toHaveProperty('name_en');
        expect(result.name).toBe('Δημοτικό Συμβούλιο · Τακτική Συνεδρίαση · 05/10/2026');
        expect(result.title).toBe('Τακτική Συνεδρίαση');
        // A draft notifies nobody: the agent must not promise the user an email.
        expect(result.next).toMatch(/no subscriber is notified until it is released/);
    });

    it('names a new meeting in the UI language of the realm of its city', async () => {
        asCityAdmin('krakow');
        (requireRealmCity as jest.Mock).mockResolvedValue('poland');
        mockCityFindUnique.mockResolvedValue({ timezone: 'Europe/Warsaw' });
        (createMeetingWithEffects as jest.Mock).mockResolvedValue({ meeting: {
            id: 'oct20_2026', cityId: 'krakow', name: null, name_en: null, kind: null, urgent: false,
            dateTime: new Date('2026-10-20T15:00:00Z'), released: false,
            administrativeBody: { name: 'Rada Miasta Krakowa', name_en: 'Kraków City Council' },
        } });
        const result = await mcpCreateMeeting(ADMIN_TOKEN, { cityId: 'krakow', dateTime: '2026-10-20T17:00:00+02:00', processAgenda: false });
        expect(result.name).toBe('Kraków City Council · Meeting 20/10/2026');
        expect(result.title).toBe('Meeting 20/10/2026');
    });

    it('names an updated meeting in the locale that the gate gives', async () => {
        asCityAdmin('krakow');
        (requireVisibleMeeting as jest.Mock).mockResolvedValue({ released: false, administrativeBodyId: null, editor: true, locale: 'en' });
        (updateMeetingWithEffects as jest.Mock).mockResolvedValue({
            id: 'm1', cityId: 'krakow', name: null, name_en: null, kind: 'ordinary', urgent: false,
            dateTime: new Date('2026-10-20T15:00:00Z'), youtubeUrl: null, agendaUrl: null, released: false,
            administrativeBody: { name: 'Rada Miasta Krakowa', name_en: 'Kraków City Council' },
        });
        mockCityFindUnique.mockResolvedValue({ timezone: 'Europe/Warsaw' });
        const result = await mcpUpdateMeeting(ADMIN_TOKEN, { cityId: 'krakow', meetingId: 'm1', sessionNumber: 3 });
        expect(result.name).toBe(result.name_en);
        expect(result.name).toMatch(/^Kraków City Council · /);
    });

    it('returns the derived names after an update', async () => {
        asCityAdmin('argos');
        (updateMeetingWithEffects as jest.Mock).mockResolvedValue({
            id: 'm1', cityId: 'argos', name: null, name_en: null, kind: 'ordinary', urgent: true,
            dateTime: new Date('2026-10-05T15:00:00Z'), youtubeUrl: null, agendaUrl: null, released: false,
            administrativeBody: { name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council' },
        });
        const result = await mcpUpdateMeeting(ADMIN_TOKEN, { cityId: 'argos', meetingId: 'm1', urgent: true });
        expect(updateMeetingWithEffects).toHaveBeenCalledWith('argos', 'm1', { urgent: true });
        expect(result.name).toBe('Δημοτικό Συμβούλιο · Έκτακτη Συνεδρίαση · 05/10/2026');
        expect(result.name_en).toBe('Municipal Council · Urgent Meeting · 05/10/2026');
    });

    it('rejects an update with no field to change', async () => {
        asCityAdmin('argos');
        await expect(mcpUpdateMeeting(ADMIN_TOKEN, { cityId: 'argos', meetingId: 'm1' })).rejects.toThrow(BadRequestError);
    });
});

describe('an administrator of one body', () => {
    beforeEach(() => {
        asBodyAdmin('council', 'argos');
        (createMeetingWithEffects as jest.Mock).mockResolvedValue({
            meeting: { id: 'new', cityId: 'argos', name: 'n', dateTime: new Date(), administrativeBody: { name: 'Council' }, released: false },
            processAgendaStatus: null,
        });
        (updateMeetingWithEffects as jest.Mock).mockResolvedValue({
            id: 'm1', cityId: 'argos', name: 'n', name_en: 'n', dateTime: new Date(), youtubeUrl: null,
            agendaUrl: null, administrativeBody: { name: 'Council' }, released: false,
        });
        (startMeetingTask as jest.Mock).mockResolvedValue({
            id: 't1', type: 'transcribe', status: 'pending', stage: null, percentComplete: null,
            createdAt: new Date(), updatedAt: new Date(), version: null,
        });
    });

    it('creates a meeting of their body, and not of another body or with no body', async () => {
        await expect(mcpCreateMeeting(ADMIN_TOKEN, { ...MEETING, administrativeBodyId: 'council' })).resolves.toMatchObject({ id: 'new' });
        await expect(mcpCreateMeeting(ADMIN_TOKEN, { ...MEETING, administrativeBodyId: 'committee' })).rejects.toThrow(ForbiddenError);
        await expect(mcpCreateMeeting(ADMIN_TOKEN, MEETING)).rejects.toThrow(ForbiddenError);
        expect(createMeetingWithEffects).toHaveBeenCalledTimes(1);
    });

    it('updates a meeting of their body, and not another meeting', async () => {
        await expect(mcpUpdateMeeting(ADMIN_TOKEN, { cityId: 'argos', meetingId: 'm1', place: 'Νέα αίθουσα' })).resolves.toMatchObject({ id: 'm1' });
        await expect(mcpUpdateMeeting(ADMIN_TOKEN, { cityId: 'argos', meetingId: 'm2', place: 'Νέα αίθουσα' })).rejects.toThrow(ForbiddenError);
        await expect(mcpUpdateMeeting(ADMIN_TOKEN, { cityId: 'argos', meetingId: 'm3', place: 'Νέα αίθουσα' })).rejects.toThrow(ForbiddenError);
        expect(updateMeetingWithEffects).toHaveBeenCalledTimes(1);
    });

    it('may keep the body of their meeting, but not move it to another body or clear it', async () => {
        await expect(mcpUpdateMeeting(ADMIN_TOKEN, { cityId: 'argos', meetingId: 'm1', administrativeBodyId: 'council' })).resolves.toMatchObject({ id: 'm1' });
        await expect(mcpUpdateMeeting(ADMIN_TOKEN, { cityId: 'argos', meetingId: 'm1', administrativeBodyId: 'committee' })).rejects.toThrow(ForbiddenError);
        await expect(mcpUpdateMeeting(ADMIN_TOKEN, { cityId: 'argos', meetingId: 'm1', administrativeBodyId: null })).rejects.toThrow(ForbiddenError);
        expect(updateMeetingWithEffects).toHaveBeenCalledTimes(1);
    });

    it('starts a task on a meeting of their body, and not on another meeting', async () => {
        await expect(mcpStartTask(ADMIN_TOKEN, { cityId: 'argos', meetingId: 'm1', type: 'transcribe', force: false })).resolves.toMatchObject({ id: 't1' });
        await expect(mcpStartTask(ADMIN_TOKEN, { cityId: 'argos', meetingId: 'm2', type: 'transcribe', force: false })).rejects.toThrow(ForbiddenError);
        expect(startMeetingTask).toHaveBeenCalledTimes(1);
    });

    it('is refused the city tools', async () => {
        await expect(mcpCreateCity(ADMIN_TOKEN, {
            id: 'lyon', name: 'Lyon', name_en: 'Lyon', name_municipality: 'Ville de Lyon',
            name_municipality_en: 'City of Lyon', timezone: 'Europe/Paris', authorityType: 'municipality',
        })).rejects.toThrow(ForbiddenError);
        expect(createCityDirect).not.toHaveBeenCalled();
    });
});

describe('a city administrator and the body of a meeting', () => {
    it('moves a meeting to another body and clears the body', async () => {
        asCityAdmin('argos');
        (updateMeetingWithEffects as jest.Mock).mockResolvedValue({
            id: 'm1', cityId: 'argos', name: 'n', name_en: 'n', dateTime: new Date(), youtubeUrl: null,
            agendaUrl: null, administrativeBody: null, released: false,
        });
        await mcpUpdateMeeting(ADMIN_TOKEN, { cityId: 'argos', meetingId: 'm1', administrativeBodyId: 'committee' });
        await mcpUpdateMeeting(ADMIN_TOKEN, { cityId: 'argos', meetingId: 'm1', administrativeBodyId: null });
        expect(updateMeetingWithEffects).toHaveBeenCalledTimes(2);
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
        await inRealm(Realm.france, () => mcpCreateCity(SUPERADMIN_TOKEN, CITY));
        expect(createCityDirect).toHaveBeenCalledWith(expect.objectContaining({
            id: 'lyon', realm: 'france', language: 'fr', status: 'pending', logoImage: null,
        }));
    });

    it('asks for the language on a realm that serves the English UI', async () => {
        await expect(inRealm(Realm.germany, () => mcpCreateCity(SUPERADMIN_TOKEN, CITY))).rejects.toThrow(BadRequestError);
        expect(createCityDirect).not.toHaveBeenCalled();
    });

    it('creates the city in the realm a superadmin names, with a link on that realm\'s domain', async () => {
        (createCityDirect as jest.Mock).mockImplementation(async data => data);
        const result = await inRealm(Realm.greece, () =>
            mcpCreateCity(SUPERADMIN_TOKEN, { ...CITY, id: 'krakow', realm: Realm.poland, language: 'pl' }));
        expect(createCityDirect).toHaveBeenCalledWith(expect.objectContaining({ id: 'krakow', realm: 'poland', language: 'pl' }));
        expect(result.url).toBe('https://opencouncil.pl/krakow');
    });

    it('names the realm when it has no default language', async () => {
        await expect(inRealm(Realm.greece, () => mcpCreateCity(SUPERADMIN_TOKEN, { ...CITY, realm: Realm.spain })))
            .rejects.toThrow('The spain realm has no default content language.');
    });

    it('creates the city on such a realm in the language it is given', async () => {
        (createCityDirect as jest.Mock).mockImplementation(async data => data);
        await inRealm(Realm.belgium, () => mcpCreateCity(SUPERADMIN_TOKEN, { ...CITY, language: 'fr' }));
        expect(createCityDirect).toHaveBeenCalledWith(expect.objectContaining({ realm: 'belgium', language: 'fr' }));
    });

    it('reports a taken id as a conflict, from the unique index', async () => {
        asSuperadmin();
        (createCityDirect as jest.Mock).mockRejectedValue(
            new Prisma.PrismaClientKnownRequestError('taken', { code: 'P2002', clientVersion: 'test' })
        );
        await expect(mcpCreateCity(SUPERADMIN_TOKEN, CITY)).rejects.toThrow(ConflictError);
    });

    it('lets any other database error through as is', async () => {
        asSuperadmin();
        (createCityDirect as jest.Mock).mockRejectedValue(new Error('connection lost'));
        await expect(mcpCreateCity(SUPERADMIN_TOKEN, CITY)).rejects.toThrow('connection lost');
    });
});

describe('update_city realm guard', () => {
    it.each([
        { cityId: 'missing', status: 'demo' as const },
        { cityId: 'missing', geojson: '{}' },
    ])('refuses an unknown city before either write (%j)', async args => {
        asSuperadmin();
        (requireRealmCity as jest.Mock).mockRejectedValueOnce(new NotFoundError('Unknown municipality'));
        await expect(mcpUpdateCity(SUPERADMIN_TOKEN, args)).rejects.toThrow(NotFoundError);
        expect(applyCityUpdateDirect).not.toHaveBeenCalled();
        expect(revalidateAfterResponse).not.toHaveBeenCalled();
    });
});

describe('update_city demo publication', () => {
    it('returns the current profile without invalidating caches for a no-op', async () => {
        asSuperadmin();
        (applyCityUpdateDirect as jest.Mock).mockResolvedValue({ before: { status: 'demo', boundary: null }, after: { status: 'demo', boundary: null }, changed: false, city: { id: 'laholm' } });
        expect(await mcpUpdateCity(SUPERADMIN_TOKEN, { cityId: 'laholm', status: 'demo' }))
            .toEqual({ city: cityProfile, changed: false, changes: {} });
        expect(revalidateAfterResponse).not.toHaveBeenCalled();
    });

    it('promotes across realms, invalidates discovery and returns the city realm URL', async () => {
        (requireRealmCity as jest.Mock).mockResolvedValue('germany');
        (projectCityProfile as jest.Mock).mockResolvedValue({ ...cityProfile, id: 'mannheim', realm: 'germany', url: 'https://opencouncil.de/mannheim' });
        const result = await inRealm(Realm.greece, () => mcpUpdateCity(SUPERADMIN_TOKEN, { cityId: 'mannheim', status: 'demo' }));
        expect(requireRealmCity).toHaveBeenCalledWith('mannheim');
        expect(applyCityUpdateDirect).toHaveBeenCalledWith('mannheim', { status: 'demo' });
        expect(result).toMatchObject({ city: { id: 'mannheim', status: 'demo', realm: 'germany', url: 'https://opencouncil.de/mannheim' }, changed: true, changes: { status: { before: 'pending', after: 'demo' } } });
        expect(revalidateAfterResponse).toHaveBeenCalledWith({ blockingTags: ['city', 'cities:all', 'city:mannheim', 'realm:germany:landing-subjects'] });
    });

    it.each([null, ADMIN_TOKEN])('refuses callers without superadmin rights before writing (%j)', async identity => {
        await expect(mcpUpdateCity(identity, { cityId: 'mannheim', status: 'demo' })).rejects.toThrow();
        expect(applyCityUpdateDirect).not.toHaveBeenCalled();
    });

    it('reports a missing or ineligible city instead of changing official support', async () => {
        asSuperadmin();
        (applyCityUpdateDirect as jest.Mock).mockRejectedValue(new Prisma.PrismaClientKnownRequestError('no eligible city', { code: 'P2025', clientVersion: 'test' }));
        await expect(mcpUpdateCity(SUPERADMIN_TOKEN, { cityId: 'mannheim', status: 'demo' })).rejects.toThrow(ConflictError);
    });
});

describe('update_city boundary', () => {
    const polygon = { type: 'Polygon', coordinates: [[[18.3, 43.8], [18.4, 43.8], [18.4, 43.9]]] };

    it('normalizes an exported collection through the existing parser and refreshes discovery', async () => {
        (requireRealmCity as jest.Mock).mockResolvedValue('bosnia');
        const result = await inRealm(Realm.greece, () => mcpUpdateCity(SUPERADMIN_TOKEN, {
            cityId: 'sarajevo', geojson: JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { source: 'official' }, geometry: polygon }] }),
        }));
        expect(applyCityUpdateDirect).toHaveBeenCalledWith('sarajevo', { geometry: {
            ...polygon, coordinates: [[[18.3, 43.8], [18.4, 43.8], [18.4, 43.9], [18.3, 43.8]]],
        } });
        expect(result).toMatchObject({ changed: true, changes: { boundary: { before: null, after: { geometryType: 'Polygon', polygonCount: 1 } } } });
        expect(revalidateAfterResponse).toHaveBeenCalledWith({ blockingTags: ['city', 'cities:all', 'city:sarajevo', 'realm:bosnia:landing-subjects'] });
        expect(revalidateAfterResponse).toHaveBeenCalledWith({ blockingTags: ['city:sarajevo:geometry'] });
    });

    it.each([
        '{', JSON.stringify({ type: 'Point', coordinates: [18.3, 43.8] }),
        JSON.stringify({ type: 'Polygon', coordinates: [[[500000, 4000000], [500100, 4000000], [500000, 4000100]]] }),
    ])('refuses malformed, non-polygonal or projected coordinates before writing', async geojson => {
        asSuperadmin();
        await expect(mcpUpdateCity(SUPERADMIN_TOKEN, { cityId: 'sarajevo', geojson })).rejects.toThrow(BadRequestError);
        expect(applyCityUpdateDirect).not.toHaveBeenCalled();
    });

    it('does not invalidate caches or report success when the database rejects the boundary', async () => {
        asSuperadmin();
        (applyCityUpdateDirect as jest.Mock).mockRejectedValueOnce(new Error('Invalid geometry'));
        await expect(mcpUpdateCity(SUPERADMIN_TOKEN, { cityId: 'sarajevo', geojson: JSON.stringify(polygon) })).rejects.toThrow('Invalid geometry');
        expect(revalidateAfterResponse).not.toHaveBeenCalled();
    });
});

describe('list_realms', () => {
    it('lists every realm with its domain, site language, stage and cities per status', async () => {
        (countCitiesByRealmAndStatus as jest.Mock).mockResolvedValue([
            { realm: 'greece', status: 'supported', _count: { _all: 13 } },
            { realm: 'poland', status: 'pending', _count: { _all: 1 } },
        ]);
        (countActiveTopicsByRealm as jest.Mock).mockResolvedValue([{ realm: 'greece', _count: { _all: 15 } }]);
        const { realms } = await inRealm(Realm.greece, () => mcpListRealms(SUPERADMIN_TOKEN));

        expect(realms).toHaveLength(Object.values(Realm).length);
        expect(realms.find((r) => r.realm === 'bosnia')).toMatchObject({
            country: 'BA', domain: 'ba.opencouncil.eu', uiLanguage: 'en', stage: 'pending',
        });
        expect(realms.find((r) => r.realm === 'greece')).toMatchObject({ domain: 'opencouncil.gr', thisConnection: true, cities: { supported: 13, pending: 0 }, topics: 15 });
        expect(realms.find((r) => r.realm === 'poland')).toMatchObject({
            country: 'PL', countryName: 'Poland', domain: 'opencouncil.pl', uiLanguage: 'en', stage: 'pending',
            thisConnection: false, cities: { supported: 0, demo: 0, pending: 1 }, topics: 0,
        });
    });

    it('is refused to a city administrator', async () => {
        asCityAdmin('athens');
        await expect(mcpListRealms(ADMIN_TOKEN)).rejects.toThrow(ForbiddenError);
    });
});

describe('create_topics', () => {
    // The SDK parses a call with createTopicsToolInput before the handler runs.
    const args = createTopicsToolInput.parse({
        realm: 'canada',
        topics: [
            { name: ' Habitation ', name_en: 'Housing', colorHex: '#c2410c', icon: 'house', description: 'Logement social.' },
            { name: 'Animaux', name_en: 'Animals', colorHex: '#e548ab', description: 'Contrôle animalier.' },
        ],
    });

    it('is refused to a city administrator', async () => {
        asCityAdmin('athens');
        await expect(mcpCreateTopics(ADMIN_TOKEN, args)).rejects.toThrow(ForbiddenError);
        expect(createRealmTopicsDirect).not.toHaveBeenCalled();
    });

    it('adds the parsed topics to the realm it names, and reports the names that it skipped', async () => {
        asSuperadmin();
        (createRealmTopicsDirect as jest.Mock).mockResolvedValue({
            created: [{ id: 't1', name: 'Habitation', name_en: 'Housing' }],
            skipped: [{ name: 'Animaux', existing: { id: 't0', name: 'Animaux', name_en: 'Animals', deprecated: true } }],
        });
        const result = await inRealm(Realm.greece, () => mcpCreateTopics(SUPERADMIN_TOKEN, args));

        expect(createRealmTopicsDirect).toHaveBeenCalledWith('canada', [
            { name: 'Habitation', name_en: 'Housing', colorHex: '#c2410c', icon: 'house', description: 'Logement social.' },
            { name: 'Animaux', name_en: 'Animals', colorHex: '#e548ab', icon: null, description: 'Contrôle animalier.' },
        ]);
        expect(result).toMatchObject({ realm: 'canada', created: [{ id: 't1', name: 'Habitation' }], skipped: [{ name: 'Animaux', existing: { id: 't0', deprecated: true } }] });
        expect(result.next).toContain('un-deprecate');
    });

    it('says nothing of un-deprecating when every skipped topic is active', async () => {
        asSuperadmin();
        (createRealmTopicsDirect as jest.Mock).mockResolvedValue({
            created: [],
            skipped: [{ name: 'Animaux', existing: { id: 't0', name: 'Animaux', name_en: 'Animals', deprecated: false } }],
        });
        const result = await inRealm(Realm.greece, () => mcpCreateTopics(SUPERADMIN_TOKEN, args));

        expect(result.next).not.toContain('un-deprecate');
        expect(revalidateAfterResponse).toHaveBeenCalledWith({ paths: [{ path: '/admin/topics' }] });
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

    it('saves a call whose roles all resolve', async () => {
        asSuperadmin();
        const populate = jest.spyOn(cityPopulate, 'populateCity')
            .mockResolvedValue({ partiesCount: 1, peopleCount: 1, rolesCount: 2, adminBodiesCount: 1 });
        const data = parsed([
            { type: 'party', partyName: 'Κόμμα' },
            { type: 'adminBody', administrativeBodyName: 'Δημοτικό Συμβούλιο' },
        ]);
        await expect(mcpPopulateCity(SUPERADMIN_TOKEN, data)).resolves.toMatchObject({ cityId: 'lyon', rolesCount: 2 });
        expect(populate).toHaveBeenCalledWith(data);
    });
});

describe('start_task', () => {
    it('is refused for a city that the caller does not administer', async () => {
        asCityAdmin('athens');
        await expect(mcpStartTask(ADMIN_TOKEN, { cityId: 'argos', meetingId: 'm1', type: 'transcribe', force: false })).rejects.toThrow(ForbiddenError);
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
        // transcribe notifies nobody, so the result says nothing about notifications.
        expect(result).not.toHaveProperty('notifications');
    });

    it('tells the agent, without a read after the start, when processAgenda and summarize notify', async () => {
        asCityAdmin('argos');
        (startMeetingTask as jest.Mock).mockResolvedValue({
            id: 't2', type: 'processAgenda', status: 'pending', stage: null, percentComplete: null,
            createdAt: new Date('2026-09-23T10:00:00Z'), updatedAt: new Date('2026-09-23T10:00:00Z'), version: null,
        });

        const result = await mcpStartTask(ADMIN_TOKEN, { cityId: 'argos', meetingId: 'm1', type: 'processAgenda', force: false });

        expect(result).toMatchObject({ id: 't2', status: 'pending' });
        expect(result.notifications).toMatch(/only for a released meeting that is still news/);
        expect(result.notifications).toMatch(/get_meeting/);
    });
});

describe('create_upload_url', () => {
    const PLAN = {
        key: 'uploads/argos_2026-10-15_agenda_0a1b2c3d.pdf', publicUrl: 'https://bucket.test/k', method: 'PUT',
        headers: { 'Content-Type': 'application/pdf', 'x-amz-acl': 'public-read' }, partSize: 300_000,
        parts: [{ partNumber: 1, uploadUrl: 'https://bucket.test/put' }], expiresIn: 300, completion: null,
    };

    it('starts the upload under the city, the identifier and the kind, and answers with the plan', async () => {
        asCityAdmin('argos');
        (startUpload as jest.Mock).mockResolvedValue(PLAN);
        const result = await mcpCreateUploadUrl(ADMIN_TOKEN, {
            cityId: 'argos', kind: 'agenda', identifier: '2026-10-15', format: 'pdf', sizeBytes: 300_000,
        });

        expect(startUpload).toHaveBeenCalledWith({ cityId: 'argos', kind: 'agenda', identifier: '2026-10-15' }, 'pdf', 300_000);
        expect(result).toMatchObject(PLAN);
        expect(result.next).toMatch(/exactly these headers/);
        expect(result.next).toMatch(/agendaUrl to create_meeting/);
    });

    it('tells how to send the parts and to complete them, when the file goes up in parts', async () => {
        asCityAdmin('argos');
        (startUpload as jest.Mock).mockResolvedValue({ ...PLAN, headers: {}, completion: { uploadId: 'u1', token: 't' } });
        const result = await mcpCreateUploadUrl(ADMIN_TOKEN, {
            cityId: 'argos', kind: 'recording', identifier: '2026-10-15', format: 'mp4', sizeBytes: 12_300_000_000,
        });

        expect(result.next).toMatch(/split -b <partSize>/);
        expect(result.next).toMatch(/complete_upload/);
        expect(result.next).toMatch(/youtubeUrl/);
    });
});

describe('complete_upload', () => {
    const ARGS = { cityId: 'argos', key: 'uploads/argos_2026-10-15_recording_0a1b2c3d.mp4', uploadId: 'u1', token: 't', sizeBytes: 2e9 };

    it('completes an upload of the city', async () => {
        asCityAdmin('argos');
        (completeUpload as jest.Mock).mockResolvedValue({ key: ARGS.key, publicUrl: 'https://bucket.test/k', sizeBytes: 2e9 });
        const result = await mcpCompleteUpload(ADMIN_TOKEN, ARGS);

        expect(completeUpload).toHaveBeenCalledWith(ARGS);
        expect(result).toMatchObject({ publicUrl: 'https://bucket.test/k', sizeBytes: 2e9 });
    });

    it('refuses a key of another city, even to an admin of both', async () => {
        asCityAdmin('argos', 'athens');
        await expect(mcpCompleteUpload(ADMIN_TOKEN, { ...ARGS, cityId: 'athens' })).rejects.toThrow(BadRequestError);
        expect(completeUpload).not.toHaveBeenCalled();
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
        update_meeting: (id: McpIdentityArg) => mcpUpdateMeeting(id, { cityId: 'argos', meetingId: 'm1', sessionNumber: 4 }),
        start_task: (id: McpIdentityArg) => mcpStartTask(id, { cityId: 'argos', meetingId: 'm1', type: 'transcribe', force: false }),
        create_upload_url: (id: McpIdentityArg) => mcpCreateUploadUrl(id, {
            cityId: 'argos', kind: 'agenda', identifier: '2026-10-15', format: 'pdf', sizeBytes: 1000,
        }),
        complete_upload: (id: McpIdentityArg) => mcpCompleteUpload(id, {
            cityId: 'argos', key: 'uploads/argos_x_recording_0a1b2c3d.mp4', uploadId: 'u1', token: 't', sizeBytes: 2e9,
        }),
    };
    const superadminOnly = {
        create_city: (id: McpIdentityArg) => mcpCreateCity(id, CITY),
        populate_city: (id: McpIdentityArg) => mcpPopulateCity(id, COUNCIL),
        update_city_demo: (id: McpIdentityArg) => mcpUpdateCity(id, { cityId: 'argos', status: 'demo' }),
        update_city_boundary: (id: McpIdentityArg) => mcpUpdateCity(id, { cityId: 'argos', geojson: '{}' }),
    };
    type McpIdentityArg = Parameters<typeof mcpCreateMeeting>[0];
    const writes = () => [
        createMeetingWithEffects, updateMeetingWithEffects, startMeetingTask, createCityDirect, populateCity, applyCityUpdateDirect, startUpload,
        completeUpload,
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

// A body admin may move a meeting between two bodies that they both hold.
describe('an administrator of two bodies', () => {
    beforeEach(() => {
        mockUserFindUnique.mockResolvedValue({
            isSuperAdmin: false,
            administers: [
                { cityId: null, administrativeBodyId: 'council', administrativeBody: { cityId: 'argos' } },
                { cityId: null, administrativeBodyId: 'committee', administrativeBody: { cityId: 'argos' } },
            ],
        });
        (updateMeetingWithEffects as jest.Mock).mockResolvedValue({
            id: 'm1', cityId: 'argos', name: 'n', name_en: 'n', dateTime: new Date(), youtubeUrl: null,
            agendaUrl: null, administrativeBody: { name: 'Committee' }, released: false,
        });
    });

    it('moves a meeting from one of their bodies to the other, and not to no body', async () => {
        await expect(mcpUpdateMeeting(ADMIN_TOKEN, { cityId: 'argos', meetingId: 'm1', administrativeBodyId: 'committee' }))
            .resolves.toMatchObject({ id: 'm1' });
        await expect(mcpUpdateMeeting(ADMIN_TOKEN, { cityId: 'argos', meetingId: 'm1', administrativeBodyId: null }))
            .rejects.toThrow(ForbiddenError);
        expect(updateMeetingWithEffects).toHaveBeenCalledTimes(1);
    });
});


describe('inspect_media', () => {
    const source = { kind: 'yt-dlp', title: 'Council' };
    beforeEach(() => { global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ supported: true, source }) }); });
    it.each(['city', 'body', 'superadmin'])('allows a %s admin without any meeting', async role => {
        if (role === 'city') asCityAdmin('argos');
        else if (role === 'body') asBodyAdmin('committee', 'argos');
        else asSuperadmin();
        await expect(mcpInspectMedia(ADMIN_TOKEN, { url: 'https://example.org/video' })).resolves.toEqual({ supported: true, source });
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(mockMeetingFindUnique).not.toHaveBeenCalled();
    });
    it('refuses anonymous and ordinary users before fetching', async () => {
        await expect(mcpInspectMedia(null, { url: 'https://example.org/video' })).rejects.toThrow(UnauthorizedError);
        await expect(mcpInspectMedia(ADMIN_TOKEN, { url: 'https://example.org/video' })).rejects.toThrow(ForbiddenError);
        expect(fetch).not.toHaveBeenCalled();
    });
    it.each(['bad-url', 'file:///etc/passwd', 'javascript:alert(1)'])('refuses %s without fetching', async url => {
        asSuperadmin();
        await expect(mcpInspectMedia(ADMIN_TOKEN, { url })).rejects.toThrow();
        expect(fetch).not.toHaveBeenCalled();
    });
});


it('start_task starts directly without an inspection preflight', async () => {
    asCityAdmin('argos');
    global.fetch = jest.fn();
    (startMeetingTask as jest.Mock).mockResolvedValue({ id: 'accepted', type: 'transcribe', status: 'pending', stage: null, percentComplete: null, version: 6, createdAt: new Date(), updatedAt: new Date(), error: null });
    await mcpStartTask(ADMIN_TOKEN, { cityId: 'argos', meetingId: 'm1', type: 'transcribe', force: false });
    expect(startMeetingTask).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
});


describe('release a meeting through the token rights', () => {
    const args = { cityId: 'argos', meetingId: 'm1', released: true, dryRun: false };
    const outlook = { notis: { phase: null, reason: 'archive' }, email: { phase: null, outcome: { kind: 'none', reason: 'archive' }, recipients: 0 } };
    beforeEach(() => {
        (getReleaseOutlook as jest.Mock).mockReset().mockResolvedValue(outlook);
        (setMeetingReleaseDirect as jest.Mock).mockReset().mockResolvedValue({ meeting: { id: 'm1', cityId: 'argos', released: true }, changed: true });
    });
    it.each([null, ADMIN_TOKEN])('refuses a caller without meeting rights (%s)', async identity => {
        await expect(mcpUpdateMeeting(identity, args)).rejects.toThrow();
        expect(setMeetingReleaseDirect).not.toHaveBeenCalled();
        expect(getReleaseOutlook).not.toHaveBeenCalled();
    });
    it('refuses an administrator of another body', async () => {
        asBodyAdmin('committee', 'argos');
        await expect(mcpUpdateMeeting(ADMIN_TOKEN, args)).rejects.toThrow(ForbiddenError);
        expect(setMeetingReleaseDirect).not.toHaveBeenCalled();
    });
    it('allows the administrator of the meeting body', async () => {
        asBodyAdmin('council', 'argos');
        expect(await mcpUpdateMeeting(ADMIN_TOKEN, args)).toMatchObject({ released: true, changed: true, notifications: outlook });
        expect(setMeetingReleaseDirect).toHaveBeenCalledWith('argos', 'm1', true);
    });
    it('checks realm visibility before reading notification recipients or writing', async () => {
        asCityAdmin('argos');
        (requireVisibleMeeting as jest.Mock).mockRejectedValueOnce(new NotFoundError('Meeting not found'));
        await expect(mcpUpdateMeeting(ADMIN_TOKEN, args)).rejects.toThrow(NotFoundError);
        expect(setMeetingReleaseDirect).not.toHaveBeenCalled();
        expect(getReleaseOutlook).not.toHaveBeenCalled();
    });
    it('previews notifications without releasing the draft', async () => {
        asCityAdmin('argos');
        expect(await mcpUpdateMeeting(ADMIN_TOKEN, { ...args, dryRun: true })).toMatchObject({ dryRun: true, released: false, changed: false, notifications: outlook });
        expect(setMeetingReleaseDirect).not.toHaveBeenCalled();
    });
    it('reports an already released meeting without claiming a new change', async () => {
        asSuperadmin();
        (setMeetingReleaseDirect as jest.Mock).mockResolvedValueOnce({ meeting: { id: 'm1', cityId: 'argos', released: true }, changed: false });
        expect(await inRealm('sweden', () => mcpUpdateMeeting(SUPERADMIN_TOKEN, args))).toMatchObject({ released: true, changed: false, url: 'https://se.opencouncil.eu/argos/m1' });
    });
    it.each([true, false])('reports no notification effects for an already released meeting (dryRun=%s)', async dryRun => {
        asCityAdmin('argos');
        (requireVisibleMeeting as jest.Mock).mockResolvedValueOnce({ released: true, administrativeBodyId: 'council', locale: 'el' });
        (getReleaseOutlook as jest.Mock).mockResolvedValueOnce({ email: { outcome: { kind: 'sends' }, recipients: 5 } });
        (setMeetingReleaseDirect as jest.Mock).mockResolvedValueOnce({ meeting: { released: true }, changed: false });
        expect(await mcpUpdateMeeting(ADMIN_TOKEN, { ...args, dryRun })).toMatchObject({ released: true, changed: false, notifications: null });
        expect(getReleaseOutlook).not.toHaveBeenCalled();
    });
    it('preserves a lifecycle refusal for the tool error handler', async () => {
        asCityAdmin('argos');
        (setMeetingReleaseDirect as jest.Mock).mockRejectedValueOnce(new LifecycleRuleError('laterMeetingReleased', 'A later meeting is public'));
        await expect(mcpUpdateMeeting(ADMIN_TOKEN, args)).rejects.toMatchObject({ code: 'laterMeetingReleased' });
    });
});


describe('unrelease through update_meeting', () => {
    const args = { cityId: 'argos', meetingId: 'm1', released: false };
    beforeEach(() => {
        asCityAdmin('argos');
        (requireVisibleMeeting as jest.Mock).mockResolvedValue({ released: true, administrativeBodyId: 'council', locale: 'el' });
        (setMeetingReleaseDirect as jest.Mock).mockReset().mockResolvedValue({ meeting: { released: false }, changed: true });
        (getReleaseOutlook as jest.Mock).mockReset();
    });
    it('uses the existing unrelease lifecycle without requesting a release notification outlook', async () => {
        expect(await mcpUpdateMeeting(ADMIN_TOKEN, args)).toMatchObject({ released: false, changed: true, notifications: null });
        expect(setMeetingReleaseDirect).toHaveBeenCalledWith('argos', 'm1', false);
        expect(getReleaseOutlook).not.toHaveBeenCalled();
    });
    it('previews an unrelease without hiding the meeting', async () => {
        expect(await mcpUpdateMeeting(ADMIN_TOKEN, { ...args, dryRun: true })).toMatchObject({ released: true, changed: false, notifications: null });
        expect(setMeetingReleaseDirect).not.toHaveBeenCalled();
    });
});
