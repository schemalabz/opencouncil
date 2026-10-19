/** @jest-environment node */
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: { subject: { findFirst: jest.fn() } } }));

import prisma from '@/lib/db/prisma';
import { getPublicSubjectDescription } from '../subject';
import { PUBLIC_CITY_WHERE } from '@/lib/cityStatus';

const findFirstMock = prisma.subject.findFirst as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('getPublicSubjectDescription', () => {
    // The visibility rule is the where clause the map's own queries use, so the database decides:
    // a released meeting, a public city, the request's realm.
    it('asks for the subject only where it is public on the realm', async () => {
        findFirstMock.mockResolvedValue({ description: 'Η περιγραφή' });

        expect(await getPublicSubjectDescription('s1', 'greece')).toBe('Η περιγραφή');
        expect(findFirstMock).toHaveBeenCalledWith({
            where: { id: 's1', councilMeeting: { released: true, city: { ...PUBLIC_CITY_WHERE, realm: 'greece' } } },
            select: { description: true },
        });
    });

    it('is null for a subject the clause does not match', async () => {
        findFirstMock.mockResolvedValue(null);
        expect(await getPublicSubjectDescription('hidden', 'greece')).toBeNull();
    });
});
