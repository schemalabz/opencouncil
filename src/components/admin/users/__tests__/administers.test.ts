import type { UserWithAdministers } from '@/lib/db/types';
import { mapAdministersToGrants } from '../administers';

type Row = UserWithAdministers['administers'][number];

const createdAt = new Date('2026-10-01T10:00:00Z');
const acceptedAt = new Date('2026-10-02T10:00:00Z');
const base = {
    id: 'adm1', role: 'admin', realm: null, createdAt, acceptedAt, revokedAt: null, claimedAt: null,
    city: { id: 'athens', name: 'Athens' }, party: null, person: null, administrativeBody: null,
    grantedBy: { id: 'u0', name: 'Anna', email: 'anna@example.com' },
} as unknown as Row;

describe('mapAdministersToGrants', () => {
    it('carries the history of the row: when it took effect, and who gave it', () => {
        const [grant] = mapAdministersToGrants([base]);
        expect(grant.key).toBe('city:athens:admin');
        expect(grant.entity.displayName).toBe('Athens');
        expect(grant.history).toEqual({ createdAt, acceptedAt, grantedBy: 'Anna' });
    });

    it('falls back to the email of the inviter, and to nothing for a claim', () => {
        const byEmail = { ...base, grantedBy: { id: 'u0', name: null, email: 'anna@example.com' } } as Row;
        const claim = { ...base, grantedBy: null } as Row;
        expect(mapAdministersToGrants([byEmail])[0].history?.grantedBy).toBe('anna@example.com');
        expect(mapAdministersToGrants([claim])[0].history?.grantedBy).toBeNull();
    });

    it('keeps a pending invite, with no acceptedAt, as an entry', () => {
        const [grant] = mapAdministersToGrants([{ ...base, acceptedAt: null } as Row]);
        expect(grant.history?.acceptedAt).toBeNull();
    });

    it('reads the dates of a row that crossed a JSON fetch', () => {
        const fetched = { ...base, createdAt: createdAt.toISOString(), acceptedAt: acceptedAt.toISOString() } as unknown as Row;
        expect(mapAdministersToGrants([fetched])[0].history).toEqual({ createdAt, acceptedAt, grantedBy: 'Anna' });
    });

    it('drops a row whose scope is gone', () => {
        expect(mapAdministersToGrants([{ ...base, city: null } as Row])).toEqual([]);
    });
});
