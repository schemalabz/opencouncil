/**
 * Deleting a person, a party or an administrative body removes roles,
 * attendance, votes and voiceprints with it, so only an admin of the city
 * may do it. A person, a party or a body admin keeps their edit rights, and
 * no delete. The city comes from the URL: an entity of another city is not
 * found there, whoever asks.
 */
const mockAuth = jest.fn();
jest.mock('@/auth', () => ({ auth: () => mockAuth() }));

const mockPrisma = {
    user: { findUnique: jest.fn() },
    city: { findUnique: jest.fn() },
    person: { findUnique: jest.fn(), delete: jest.fn() },
    party: { findUnique: jest.fn(), delete: jest.fn() },
    administrativeBody: { findUnique: jest.fn(), delete: jest.fn() },
};
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: mockPrisma }));

import { isUserAuthorizedToEdit } from '@/lib/auth';
import { deletePerson } from '@/lib/db/people';
import { deleteParty } from '@/lib/db/parties';
import { deleteAdministrativeBody } from '@/lib/db/administrativeBodies';
import { NotFoundError } from '@/lib/api/errors';
import { bodyGrant, cityGrant, grant, realmGrant } from '@/lib/auth/__tests__/fixtures';

const CITY = 'zografou';
const PERSON = 'person-1';
const PARTY = 'party-1';
const BODY = 'body-1';

type Administers = ReturnType<typeof grant>;

function signInAs(isSuperAdmin: boolean, administers: Administers[] = []) {
    mockAuth.mockResolvedValue({ user: { email: 'admin@example.com' } });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'admin@example.com', isSuperAdmin, administers });
}

const scopedAdmins: Array<[string, Administers]> = [
    ['person admin', grant({ personId: PERSON })],
    ['party admin', grant({ partyId: PARTY })],
    ['body admin', bodyGrant(BODY, CITY)],
];

const cityAdmins: Array<[string, Administers]> = [
    ['city admin', cityGrant(CITY)],
    ['realm admin', realmGrant('greece')],
];

beforeEach(() => {
    jest.clearAllMocks();
    // The realm of the city, for the realm admin's check.
    mockPrisma.city.findUnique.mockResolvedValue({ realm: 'greece' });
    mockPrisma.person.findUnique.mockResolvedValue({ cityId: CITY, roles: [] });
    mockPrisma.party.findUnique.mockResolvedValue({ cityId: CITY });
    mockPrisma.administrativeBody.findUnique.mockResolvedValue({ cityId: CITY });
});

describe.each(scopedAdmins)('a %s', (_label, scope) => {
    it('cannot delete a person', async () => {
        signInAs(false, [scope]);
        await expect(deletePerson(PERSON, CITY)).rejects.toThrow('Not authorized');
        expect(mockPrisma.person.delete).not.toHaveBeenCalled();
    });

    it('cannot delete a party', async () => {
        signInAs(false, [scope]);
        await expect(deleteParty(PARTY, CITY)).rejects.toThrow('Not authorized');
        expect(mockPrisma.party.delete).not.toHaveBeenCalled();
    });

    it('cannot delete an administrative body', async () => {
        signInAs(false, [scope]);
        await expect(deleteAdministrativeBody(BODY, CITY)).rejects.toThrow('Not authorized');
        expect(mockPrisma.administrativeBody.delete).not.toHaveBeenCalled();
    });
});

describe.each([...cityAdmins, ['superadmin', null] as [string, null]])('a %s', (_label, scope) => {
    it('can delete a person, a party and an administrative body of the city', async () => {
        signInAs(scope === null, scope ? [scope] : []);
        await deletePerson(PERSON, CITY);
        await deleteParty(PARTY, CITY);
        await deleteAdministrativeBody(BODY, CITY);
        expect(mockPrisma.administrativeBody.delete).toHaveBeenCalledWith({ where: { id: BODY } });
        expect(mockPrisma.person.delete).toHaveBeenCalledWith({ where: { id: PERSON } });
        expect(mockPrisma.party.delete).toHaveBeenCalledWith({ where: { id: PARTY } });
    });
});

describe('an entity of another city', () => {
    it('is not found under this city, and nothing is deleted', async () => {
        signInAs(true);
        mockPrisma.person.findUnique.mockResolvedValue({ cityId: 'athens', roles: [] });
        mockPrisma.party.findUnique.mockResolvedValue({ cityId: 'athens' });
        mockPrisma.administrativeBody.findUnique.mockResolvedValue({ cityId: 'athens' });
        await expect(deletePerson(PERSON, CITY)).rejects.toBeInstanceOf(NotFoundError);
        await expect(deleteParty(PARTY, CITY)).rejects.toBeInstanceOf(NotFoundError);
        await expect(deleteAdministrativeBody(BODY, CITY)).rejects.toBeInstanceOf(NotFoundError);
        expect(mockPrisma.person.delete).not.toHaveBeenCalled();
        expect(mockPrisma.party.delete).not.toHaveBeenCalled();
        expect(mockPrisma.administrativeBody.delete).not.toHaveBeenCalled();
    });
});

describe('edit rights stay as they were', () => {
    it('a person admin can still edit their own person', async () => {
        signInAs(false, [scopedAdmins[0][1]]);
        await expect(isUserAuthorizedToEdit({ personId: PERSON })).resolves.toBe(true);
    });

    it('a party admin can still edit their own party', async () => {
        signInAs(false, [scopedAdmins[1][1]]);
        await expect(isUserAuthorizedToEdit({ partyId: PARTY })).resolves.toBe(true);
    });

    it('a city admin can still edit the city, and a person and a party in it', async () => {
        signInAs(false, [cityAdmins[0][1]]);
        await expect(isUserAuthorizedToEdit({ cityId: CITY })).resolves.toBe(true);
        await expect(isUserAuthorizedToEdit({ personId: PERSON })).resolves.toBe(true);
        await expect(isUserAuthorizedToEdit({ partyId: PARTY })).resolves.toBe(true);
    });
});
