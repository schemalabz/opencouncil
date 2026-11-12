/**
 * Deleting a person, a party or an administrative body removes roles,
 * attendance, votes and voiceprints with it, so only a superadmin may do it.
 * Scoped admins keep their edit rights.
 */
const mockAuth = jest.fn();
jest.mock('@/auth', () => ({ auth: () => mockAuth() }));

const mockPrisma = {
    user: { findUnique: jest.fn() },
    person: { findUnique: jest.fn(), delete: jest.fn() },
    party: { findUnique: jest.fn(), delete: jest.fn() },
    administrativeBody: { findUnique: jest.fn(), delete: jest.fn() },
};
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: mockPrisma }));

import { isUserAuthorizedToEdit } from '@/lib/auth';
import { deletePerson } from '@/lib/db/people';
import { deleteParty } from '@/lib/db/parties';
import { deleteAdministrativeBody } from '@/lib/db/administrativeBodies';

const CITY = 'zografou';
const PERSON = 'person-1';
const PARTY = 'party-1';
const BODY = 'body-1';

type Administers = { cityId: string | null; partyId: string | null; personId: string | null };

function signInAs(isSuperAdmin: boolean, administers: Administers[] = []) {
    mockAuth.mockResolvedValue({ user: { email: 'admin@example.com' } });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'admin@example.com', isSuperAdmin, administers });
}

const admins: Array<[string, Administers]> = [
    ['person admin', { cityId: null, partyId: null, personId: PERSON }],
    ['party admin', { cityId: null, partyId: PARTY, personId: null }],
    ['city admin', { cityId: CITY, partyId: null, personId: null }],
];

beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.person.findUnique.mockResolvedValue({ cityId: CITY });
    mockPrisma.party.findUnique.mockResolvedValue({ cityId: CITY });
    mockPrisma.administrativeBody.findUnique.mockResolvedValue({ cityId: CITY });
});

describe.each(admins)('a %s', (_label, scope) => {
    it('cannot delete a person', async () => {
        signInAs(false, [scope]);
        await expect(deletePerson(PERSON)).rejects.toThrow('Not authorized');
        expect(mockPrisma.person.delete).not.toHaveBeenCalled();
    });

    it('cannot delete a party', async () => {
        signInAs(false, [scope]);
        await expect(deleteParty(PARTY)).rejects.toThrow('Not authorized');
        expect(mockPrisma.party.delete).not.toHaveBeenCalled();
    });

    it('cannot delete an administrative body', async () => {
        signInAs(false, [scope]);
        await expect(deleteAdministrativeBody(BODY)).rejects.toThrow('Not authorized');
        expect(mockPrisma.administrativeBody.delete).not.toHaveBeenCalled();
    });
});

describe('a superadmin', () => {
    it('can delete a person, a party and an administrative body', async () => {
        signInAs(true);
        await deletePerson(PERSON);
        await deleteParty(PARTY);
        await deleteAdministrativeBody(BODY);
        expect(mockPrisma.administrativeBody.delete).toHaveBeenCalledWith({ where: { id: BODY } });
        expect(mockPrisma.person.delete).toHaveBeenCalledWith({ where: { id: PERSON } });
        expect(mockPrisma.party.delete).toHaveBeenCalledWith({ where: { id: PARTY } });
    });
});

describe('edit rights stay as they were', () => {
    it('a person admin can still edit their own person', async () => {
        signInAs(false, [admins[0][1]]);
        await expect(isUserAuthorizedToEdit({ personId: PERSON })).resolves.toBe(true);
    });

    it('a party admin can still edit their own party', async () => {
        signInAs(false, [admins[1][1]]);
        await expect(isUserAuthorizedToEdit({ partyId: PARTY })).resolves.toBe(true);
    });

    it('a city admin can still edit the city, and a person and a party in it', async () => {
        signInAs(false, [admins[2][1]]);
        await expect(isUserAuthorizedToEdit({ cityId: CITY })).resolves.toBe(true);
        await expect(isUserAuthorizedToEdit({ personId: PERSON })).resolves.toBe(true);
        await expect(isUserAuthorizedToEdit({ partyId: PARTY })).resolves.toBe(true);
    });
});
