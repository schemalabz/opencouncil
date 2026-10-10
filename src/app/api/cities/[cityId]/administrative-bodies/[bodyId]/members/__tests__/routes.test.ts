/** @jest-environment node */
import type { NextRequest } from 'next/server';

/**
 * The roster routes (#829) refresh the cached roster of the city, not only
 * the people page: `getPeopleForCityCached` feeds the meeting pages and the
 * overview too, and its entry has no expiry.
 */
jest.mock('next/cache', () => ({ revalidatePath: jest.fn(), revalidateTag: jest.fn() }));
jest.mock('@/lib/db/bodyMembers', () => ({
    importBodyMembers: jest.fn().mockResolvedValue({ created: 1, joined: 0, skipped: 0 }),
    startNewTerm: jest.fn().mockResolvedValue({ ended: 3 }),
    endBodyMembership: jest.fn().mockResolvedValue({ ended: 1 }),
}));

import { revalidatePath, revalidateTag } from 'next/cache';
import { importBodyMembers } from '@/lib/db/bodyMembers';
import { POST as importMembers } from '../route';
import { POST as newTerm } from '../new-term/route';
import { POST as endMembership } from '../[personId]/end/route';

const params = <T extends Record<string, string>>(extra: T) => ({ params: Promise.resolve({ cityId: 'chania', bodyId: 'youth', ...extra }) });
const request = (body: unknown) => ({ json: async () => body } as unknown as NextRequest);
const entry = { name: 'Ελένη Νέα', name_en: 'Eleni Nea', name_short: 'Ε. Νέα', name_short_en: 'E. Nea' };

beforeEach(() => jest.clearAllMocks());

describe('the roster routes refresh the cached roster', () => {
    it('import: the people tag, the city row that carries the roster counts, and the people page', async () => {
        const response = await importMembers(request({ entries: [entry] }), params({}));
        expect(response.status).toBe(201);
        expect(importBodyMembers).toHaveBeenCalledWith('chania', 'youth', [expect.objectContaining({ name: 'Ελένη Νέα' })], { startDate: null });
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
