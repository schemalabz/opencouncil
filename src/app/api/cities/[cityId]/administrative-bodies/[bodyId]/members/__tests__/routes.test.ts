/** @jest-environment node */
import type { NextRequest } from 'next/server';

/**
 * The roster routes (#829) refresh the cached roster of the city, not only
 * the people page: the cached people of the city feed the meeting pages and the
 * overview too, and their entries have no expiry.
 */
jest.mock('next/cache', () => ({ revalidatePath: jest.fn(), revalidateTag: jest.fn() }));
jest.mock('@/lib/bodyRosterText', () => ({ parseRosterText: jest.fn(), RosterParseError: class extends Error {} }));
const BODY = { id: 'youth', city: { id: 'chania' } };
const mockRequireBody = jest.fn();
jest.mock('@/lib/db/bodyMembers', () => ({
    requireBody: (...args: unknown[]) => mockRequireBody(...args),
    importBodyMembers: jest.fn().mockResolvedValue({ created: 1, joined: 0, skipped: 0 }),
    startNewTerm: jest.fn().mockResolvedValue({ ended: 3 }),
    endBodyMembership: jest.fn().mockResolvedValue({ ended: 1 }),
    defaultImportStart: jest.fn().mockResolvedValue(new Date('2026-09-01T00:00:00.000Z')),
}));

import { revalidatePath, revalidateTag } from 'next/cache';
import { importBodyMembers, startNewTerm, endBodyMembership } from '@/lib/db/bodyMembers';
import { parseRosterText } from '@/lib/bodyRosterText';
import { UnauthorizedError } from '@/lib/api/errors';
import { POST as importMembers } from '../route';
import { POST as parseMembers } from '../parse/route';
import { POST as newTerm } from '../new-term/route';
import { POST as endMembership } from '../[personId]/end/route';

const params = <T extends Record<string, string>>(extra: T) => ({ params: Promise.resolve({ cityId: 'chania', bodyId: 'youth', ...extra }) });
const request = (body: unknown) => ({ json: async () => body } as unknown as NextRequest);
const entry = { name: 'Ελένη Νέα', name_en: 'Eleni Nea', name_short: 'Ε. Νέα', name_short_en: 'E. Nea' };

beforeEach(() => {
    jest.clearAllMocks();
    mockRequireBody.mockResolvedValue(BODY);
});

/** The gate runs before the parse, as in the admins route: a caller without rights learns nothing about the schema. */
describe('the roster routes check the caller before they read the request', () => {
    it.each([
        ['import', () => importMembers(request({ entries: 'not a list' }), params({}))],
        ['parse', () => parseMembers(request({ text: 42 }), params({}))],
        ['new term', () => newTerm(request({ endDate: 'not a date' }), params({}))],
        ['end of a membership', () => endMembership(request({ endDate: 'not a date' }), params({ personId: 'p1' }))],
    ])('%s: 401 without a session, and no write', async (_name, call) => {
        mockRequireBody.mockRejectedValue(new UnauthorizedError());
        const response = await call();
        expect(response.status).toBe(401);
        expect(mockRequireBody).toHaveBeenCalledWith('chania', 'youth');
        expect(importBodyMembers).not.toHaveBeenCalled();
        expect(startNewTerm).not.toHaveBeenCalled();
        expect(endBodyMembership).not.toHaveBeenCalled();
    });
});

describe('the roster routes refresh the cached roster', () => {
    it('import: the people tag, the city row that carries the roster counts, and the people page', async () => {
        const response = await importMembers(request({ entries: [entry] }), params({}));
        expect(response.status).toBe(201);
        expect(importBodyMembers).toHaveBeenCalledWith(BODY, [expect.objectContaining({ name: 'Ελένη Νέα' })], { startDate: null });
        expect(revalidateTag).toHaveBeenCalledWith('city:chania:people', 'max');
        expect(revalidateTag).toHaveBeenCalledWith('city:chania:basic', 'max');
        expect(revalidatePath).toHaveBeenCalledWith('/chania/people');
    });

    it('new term: the people tag and the people page', async () => {
        const response = await newTerm(request({}), params({}));
        expect(response.status).toBe(200);
        expect(revalidateTag).toHaveBeenCalledWith('city:chania:people', 'max');
        expect(revalidatePath).toHaveBeenCalledWith('/chania/people');
    });

    it('end of a membership: the people tag and the people page', async () => {
        const response = await endMembership(request({}), params({ personId: 'p1' }));
        expect(response.status).toBe(200);
        expect(revalidateTag).toHaveBeenCalledWith('city:chania:people', 'max');
        expect(revalidatePath).toHaveBeenCalledWith('/chania/people');
    });
});

describe('the dates of the roster routes', () => {
    const day = '2026-09-01T00:00:00.000Z';

    it('parse: answers the start date that the import gives when the admin sets none', async () => {
        jest.mocked(parseRosterText).mockResolvedValue([]);
        const response = await parseMembers(request({ text: 'Ελένη Νέα' }), params({}));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ entries: [], startDate: day });
    });

    it('import: passes the start date that the admin gives', async () => {
        await importMembers(request({ entries: [entry], startDate: day }), params({}));
        expect(importBodyMembers).toHaveBeenCalledWith(BODY, expect.any(Array), { startDate: new Date(day) });
    });

    it('new term: passes the end date that the admin gives', async () => {
        await newTerm(request({ endDate: day }), params({}));
        expect(startNewTerm).toHaveBeenCalledWith(BODY, new Date(day));
    });

    it('end of a membership: passes the end date that the admin gives, and none without one, so the membership ends now', async () => {
        await endMembership(request({ endDate: day }), params({ personId: 'p1' }));
        expect(endBodyMembership).toHaveBeenCalledWith(BODY, 'p1', new Date(day));
        await endMembership(request({}), params({ personId: 'p1' }));
        expect(endBodyMembership).toHaveBeenLastCalledWith(BODY, 'p1', undefined);
    });
});
