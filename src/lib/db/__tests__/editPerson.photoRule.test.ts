/** @jest-environment node */
// editPerson is an exported function of a "use server" module, so a browser
// can call it without the PUT route. The photo rule on a role write must hold
// here too: people.roles.test and the route test mock withPersonImageKept and
// never check what it receives.
const mockPersonFindUnique = jest.fn();
const mockBodyFindMany = jest.fn();
const mockTransaction = jest.fn();
jest.mock('server-only', () => ({}));
jest.mock('../prisma', () => ({
    __esModule: true,
    default: {
        person: { findUnique: (...args: unknown[]) => mockPersonFindUnique(...args) },
        administrativeBody: { findMany: (...args: unknown[]) => mockBodyFindMany(...args) },
        $transaction: (...args: unknown[]) => mockTransaction(...args),
    },
}));
jest.mock('@/lib/auth', () => ({
    withUserAuthorizedToEdit: jest.fn(),
    getRoleLimitForCity: jest.fn().mockResolvedValue(null),
    personIsOwnedByBodyAdmin: jest.fn(),
    // A city admin: no claimed page of this person.
    getCurrentUser: jest.fn().mockResolvedValue({ isSuperAdmin: false, administers: [] }),
}));

import { editPerson } from '../people';
import { ConflictError } from '@/lib/api/errors';

const role = (administrativeBodyId: string | null, partyId: string | null = null) => ({
    cityId: null, partyId, administrativeBodyId, name: null, name_en: null, isHead: false, startDate: null, endDate: null, electedOrder: null,
});

beforeEach(() => {
    jest.clearAllMocks();
    mockBodyFindMany.mockResolvedValue([{ id: 'youth', type: 'youthCouncil' }]);
    // editPerson reads the city and the roles; the photo rule reads the photo and the body types.
    mockPersonFindUnique.mockImplementation(async ({ select }: { select: Record<string, unknown> }) => select.image
        ? { image: 'https://cdn/photo.jpg', roles: [{ administrativeBody: { type: 'youthCouncil' } }, { administrativeBody: null }] }
        : { cityId: 'chania', roles: [{ administrativeBodyId: 'youth' }, { administrativeBodyId: null }] });
});

describe('editPerson keeps the photo rule on a role write (#829)', () => {
    it('refuses to drop the party role of a person who keeps a photo set by an admin, and writes nothing', async () => {
        await expect(editPerson('p1', {
            name: 'Μαρία', name_en: 'Maria', name_short: 'Μ.', name_short_en: 'M.', profileUrl: null,
            roles: [role('youth')],
        })).rejects.toThrow(ConflictError);
        expect(mockTransaction).not.toHaveBeenCalled();
    });
});
