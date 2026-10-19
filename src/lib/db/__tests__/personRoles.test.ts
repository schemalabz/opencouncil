jest.mock('@/lib/db/parties', () => ({ getPartiesForCity: jest.fn().mockResolvedValue([{ id: 'party1' }]) }));
jest.mock('@/lib/db/administrativeBodies', () => ({ getPublicAdministrativeBodiesForCity: jest.fn().mockResolvedValue([{ id: 'youth' }, { id: 'culture' }]) }));

import { validatePersonRoles } from '@/lib/db/personRoles';
import type { PersonRoleOutput } from '@/lib/zod-schemas/person';

const role = (fields: Pick<PersonRoleOutput, 'partyId' | 'administrativeBodyId'>): PersonRoleOutput => ({
    name: null, name_en: null, startDate: null, endDate: null, ...fields,
});

describe('validatePersonRoles', () => {
    it('passes the roles on a party and a body of the city', async () => {
        await expect(validatePersonRoles('athens', [role({ partyId: 'party1' }), role({ administrativeBodyId: 'youth' })], null)).resolves.toBeNull();
    });

    it('refuses a body of another city', async () => {
        await expect(validatePersonRoles('athens', [role({ administrativeBodyId: 'argosYouth' })], null)).resolves.toHaveProperty('error');
    });

    it('refuses a body admin a role on a body outside their limit', async () => {
        await expect(validatePersonRoles('athens', [role({ administrativeBodyId: 'culture' })], new Set(['youth'])))
            .resolves.toEqual({ error: 'Every role must be on an administrative body you administer.' });
        await expect(validatePersonRoles('athens', [role({ administrativeBodyId: 'youth' })], new Set(['youth']))).resolves.toBeNull();
    });
});
