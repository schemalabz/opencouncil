import { Role, Party } from '@prisma/client';
import { getSpeakerDisplayInfo, isRoleActiveAt, sortRolesByPriority, getPrimaryRole } from '../roles';

function makeRole(overrides: Partial<Role> & { party?: Party | null } = {}): Role & { party?: Party | null; cityId?: string | null } {
  return {
    id: 'role-1',
    personId: 'person-1',
    cityId: null,
    partyId: null,
    administrativeBodyId: null,
    isHead: false,
    name: null,
    name_en: null,
    rank: null,
    startDate: null,
    endDate: null,
    createdAt: new Date('2020-01-01'),
    updatedAt: new Date('2020-01-01'),
    ...overrides,
  };
}

function makeParty(overrides: Partial<Party> = {}): Party {
  return {
    id: 'party-1',
    cityId: 'city-1',
    name: 'Test Party',
    name_en: 'Test Party',
    name_short: 'TP',
    name_short_en: 'TP',
    colorHex: '#FF0000',
    logo: null,
    createdAt: new Date('2020-01-01'),
    updatedAt: new Date('2020-01-01'),
    ...overrides,
  };
}

const meetingDate = new Date('2025-06-15');

describe('getSpeakerDisplayInfo', () => {
  it('returns city role for a mayor who also has a party role', () => {
    const party = makeParty();
    const roles = [
      makeRole({ id: 'city-role', cityId: 'city-1', name: 'Δήμαρχος' }),
      makeRole({ id: 'party-role', partyId: party.id, party }),
    ];

    const result = getSpeakerDisplayInfo(roles, meetingDate);

    expect(result.role).not.toBeNull();
    expect(result.role!.name).toBe('Δήμαρχος');
    expect(result.party).not.toBeNull();
    expect(result.party!.name_short).toBe('TP');
    expect(result.isIndependent).toBe(false);
  });

  it('returns party for a regular party member without city role', () => {
    const party = makeParty();
    const roles = [
      makeRole({ id: 'party-role', partyId: party.id, party }),
      makeRole({ id: 'admin-role', administrativeBodyId: 'ab-1', name: 'Δημοτικός Σύμβουλος' }),
    ];

    const result = getSpeakerDisplayInfo(roles, meetingDate);

    expect(result.role).toBeNull();
    expect(result.party).not.toBeNull();
    expect(result.party!.name_short).toBe('TP');
    expect(result.isIndependent).toBe(false);
  });

  it('returns admin body role for a member with no party', () => {
    const roles = [
      makeRole({ id: 'admin-role', administrativeBodyId: 'ab-1', name: 'Δημοτικός Σύμβουλος' }),
    ];

    const result = getSpeakerDisplayInfo(roles, meetingDate);

    expect(result.role).not.toBeNull();
    expect(result.role!.name).toBe('Δημοτικός Σύμβουλος');
    expect(result.party).toBeNull();
    expect(result.isIndependent).toBe(false);
  });

  it('returns independent for a person with no roles', () => {
    const result = getSpeakerDisplayInfo([], meetingDate);

    expect(result.role).toBeNull();
    expect(result.party).toBeNull();
    expect(result.isIndependent).toBe(true);
  });

  it('ignores expired roles at the meeting date', () => {
    const party = makeParty();
    const roles = [
      makeRole({
        id: 'expired-city-role',
        cityId: 'city-1',
        name: 'Δήμαρχος',
        startDate: new Date('2020-01-01'),
        endDate: new Date('2023-12-31'),
      }),
      makeRole({
        id: 'expired-party-role',
        partyId: party.id,
        party,
        startDate: new Date('2020-01-01'),
        endDate: new Date('2023-12-31'),
      }),
    ];

    const result = getSpeakerDisplayInfo(roles, meetingDate);

    expect(result.role).toBeNull();
    expect(result.party).toBeNull();
    expect(result.isIndependent).toBe(true);
  });

  it('returns admin body role as role when it is the primary non-party role', () => {
    const roles = [
      makeRole({ id: 'admin-role', administrativeBodyId: 'ab-1', cityId: 'city-1', name: 'Δημοτικός Σύμβουλος' }),
    ];

    const result = getSpeakerDisplayInfo(roles, meetingDate);

    expect(result.role).not.toBeNull();
    expect(result.role!.name).toBe('Δημοτικός Σύμβουλος');
    expect(result.isIndependent).toBe(false);
  });

  it('returns city role for deputy mayor without party', () => {
    const roles = [
      makeRole({ id: 'city-role', cityId: 'city-1', name: 'Αντιδήμαρχος' }),
    ];

    const result = getSpeakerDisplayInfo(roles, meetingDate);

    expect(result.role).not.toBeNull();
    expect(result.role!.name).toBe('Αντιδήμαρχος');
    expect(result.party).toBeNull();
    expect(result.isIndependent).toBe(false);
  });

  it('returns council president role with party', () => {
    const party = makeParty();
    const roles = [
      makeRole({ id: 'council-president', administrativeBodyId: 'ab-1', isHead: true, name: 'Πρόεδρος' }),
      makeRole({ id: 'party-role', partyId: party.id, party }),
    ];

    const result = getSpeakerDisplayInfo(roles, meetingDate);

    expect(result.role).not.toBeNull();
    expect(result.role!.name).toBe('Πρόεδρος');
    expect(result.party).not.toBeNull();
    expect(result.party!.name_short).toBe('TP');
    expect(result.isIndependent).toBe(false);
  });

  it('returns council president role without party', () => {
    const roles = [
      makeRole({ id: 'council-president', administrativeBodyId: 'ab-1', isHead: true, name: 'Πρόεδρος' }),
    ];

    const result = getSpeakerDisplayInfo(roles, meetingDate);

    expect(result.role).not.toBeNull();
    expect(result.role!.name).toBe('Πρόεδρος');
    expect(result.party).toBeNull();
    expect(result.isIndependent).toBe(false);
  });

  it('returns mayor over council president when both present', () => {
    const party = makeParty();
    const roles = [
      makeRole({ id: 'council-president', administrativeBodyId: 'ab-1', isHead: true, name: 'Πρόεδρος' }),
      makeRole({ id: 'mayor', cityId: 'city-1', isHead: true, name: 'Δήμαρχος' }),
      makeRole({ id: 'party-role', partyId: party.id, party }),
    ];

    const result = getSpeakerDisplayInfo(roles, meetingDate);

    expect(result.role).not.toBeNull();
    expect(result.role!.name).toBe('Δήμαρχος');
  });

  it('returns deputy mayor over council president', () => {
    const roles = [
      makeRole({ id: 'council-president', administrativeBodyId: 'ab-1', isHead: true, name: 'Πρόεδρος' }),
      makeRole({ id: 'deputy', cityId: 'city-1', name: 'Αντιδήμαρχος' }),
    ];

    const result = getSpeakerDisplayInfo(roles, meetingDate);

    expect(result.role).not.toBeNull();
    expect(result.role!.name).toBe('Αντιδήμαρχος');
  });

  it('returns party without role for party head only', () => {
    const party = makeParty();
    const roles = [
      makeRole({ id: 'party-head', partyId: party.id, party, isHead: true }),
    ];

    const result = getSpeakerDisplayInfo(roles, meetingDate);

    expect(result.role).toBeNull();
    expect(result.party).not.toBeNull();
    expect(result.party!.name_short).toBe('TP');
    expect(result.isIndependent).toBe(false);
  });

  it('returns party without role for regular admin body member with party', () => {
    const party = makeParty();
    const roles = [
      makeRole({ id: 'party-role', partyId: party.id, party }),
      makeRole({ id: 'admin-role', administrativeBodyId: 'ab-1', name: 'Δημοτικός Σύμβουλος' }),
    ];

    const result = getSpeakerDisplayInfo(roles, meetingDate);

    expect(result.role).toBeNull();
    expect(result.party).not.toBeNull();
    expect(result.party!.name_short).toBe('TP');
    expect(result.isIndependent).toBe(false);
  });
});

describe('isRoleActiveAt', () => {
  const checkDate = new Date('2025-06-15');

  // These tests simulate what happens when role data passes through unstable_cache
  // (JSON serialization). TypeScript types say Date, but runtime values are ISO strings.
  // The `as unknown as Date` cast replicates this real-world type/runtime mismatch.

  it('handles startDate as ISO string (from JSON serialization)', () => {
    const role = { startDate: '2025-01-01T00:00:00.000Z' as unknown as Date, endDate: null };
    expect(isRoleActiveAt(role, checkDate)).toBe(true);
  });

  it('handles endDate as ISO string (from JSON serialization)', () => {
    const role = { startDate: null, endDate: '2025-12-31T00:00:00.000Z' as unknown as Date };
    expect(isRoleActiveAt(role, checkDate)).toBe(true);
  });

  it('handles both dates as ISO strings within range', () => {
    const role = {
      startDate: '2025-01-01T00:00:00.000Z' as unknown as Date,
      endDate: '2025-12-31T00:00:00.000Z' as unknown as Date,
    };
    expect(isRoleActiveAt(role, checkDate)).toBe(true);
  });

  it('handles both dates as ISO strings outside range', () => {
    const role = {
      startDate: '2020-01-01T00:00:00.000Z' as unknown as Date,
      endDate: '2023-12-31T00:00:00.000Z' as unknown as Date,
    };
    expect(isRoleActiveAt(role, checkDate)).toBe(false);
  });

  it('handles startDate as ISO string in the future', () => {
    const role = { startDate: '2026-01-01T00:00:00.000Z' as unknown as Date, endDate: null };
    expect(isRoleActiveAt(role, checkDate)).toBe(false);
  });

  it('returns true when both dates are null', () => {
    const role = { startDate: null, endDate: null };
    expect(isRoleActiveAt(role, checkDate)).toBe(true);
  });

  it('works with proper Date objects (no regression)', () => {
    const role = { startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31') };
    expect(isRoleActiveAt(role, checkDate)).toBe(true);
  });
});

describe('sortRolesByPriority', () => {
  it('sorts city-level head (mayor) first', () => {
    const roles = [
      makeRole({ id: 'party', partyId: 'p1' }),
      makeRole({ id: 'mayor', cityId: 'c1', isHead: true }),
      makeRole({ id: 'admin', administrativeBodyId: 'ab1' }),
    ];

    const sorted = sortRolesByPriority(roles);
    expect(sorted.map(r => r.id)).toEqual(['mayor', 'party', 'admin']);
  });

  it('sorts city-level non-head (deputy mayor) before party roles', () => {
    const roles = [
      makeRole({ id: 'party', partyId: 'p1' }),
      makeRole({ id: 'deputy', cityId: 'c1', name: 'Αντιδήμαρχος' }),
    ];

    const sorted = sortRolesByPriority(roles);
    expect(sorted.map(r => r.id)).toEqual(['deputy', 'party']);
  });

  it('sorts admin body head (council president) before party roles', () => {
    const roles = [
      makeRole({ id: 'party', partyId: 'p1' }),
      makeRole({ id: 'council-president', administrativeBodyId: 'ab1', isHead: true, name: 'Πρόεδρος' }),
    ];

    const sorted = sortRolesByPriority(roles);
    expect(sorted.map(r => r.id)).toEqual(['council-president', 'party']);
  });

  it('sorts party head before regular party role', () => {
    const roles = [
      makeRole({ id: 'regular', partyId: 'p1' }),
      makeRole({ id: 'head', partyId: 'p1', isHead: true }),
    ];

    const sorted = sortRolesByPriority(roles);
    expect(sorted.map(r => r.id)).toEqual(['head', 'regular']);
  });

  it('sorts party roles before regular admin body members', () => {
    const roles = [
      makeRole({ id: 'admin', administrativeBodyId: 'ab1' }),
      makeRole({ id: 'party', partyId: 'p1' }),
    ];

    const sorted = sortRolesByPriority(roles);
    expect(sorted.map(r => r.id)).toEqual(['party', 'admin']);
  });

  it('applies full priority order correctly', () => {
    const roles = [
      makeRole({ id: 'admin', administrativeBodyId: 'ab1' }),
      makeRole({ id: 'party', partyId: 'p1' }),
      makeRole({ id: 'admin-head', administrativeBodyId: 'ab1', isHead: true }),
      makeRole({ id: 'deputy', cityId: 'c1', name: 'Αντιδήμαρχος' }),
      makeRole({ id: 'mayor', cityId: 'c1', isHead: true }),
      makeRole({ id: 'party-head', partyId: 'p1', isHead: true }),
    ];

    const sorted = sortRolesByPriority(roles);
    expect(sorted.map(r => r.id)).toEqual([
      'mayor',       // city-level + isHead
      'deputy',      // city-level
      'admin-head',  // admin body + isHead (council president/chair)
      'party-head',  // party + isHead
      'party',       // party member
      'admin',       // regular admin body member
    ]);
  });

  it('does not mutate the input array', () => {
    const roles = [
      makeRole({ id: 'party', partyId: 'p1' }),
      makeRole({ id: 'mayor', cityId: 'c1', isHead: true }),
    ];

    const sorted = sortRolesByPriority(roles);
    expect(roles[0].id).toBe('party');
    expect(sorted[0].id).toBe('mayor');
  });
});

describe('getPrimaryRole', () => {
  it('returns the highest-priority role', () => {
    const roles = [
      makeRole({ id: 'party', partyId: 'p1' }),
      makeRole({ id: 'mayor', cityId: 'c1', isHead: true }),
    ];

    const primary = getPrimaryRole(roles);
    expect(primary).not.toBeNull();
    expect(primary!.id).toBe('mayor');
  });

  it('returns null for an empty array', () => {
    expect(getPrimaryRole([])).toBeNull();
  });

  it('returns the only role when there is one', () => {
    const roles = [makeRole({ id: 'solo', administrativeBodyId: 'ab1' })];
    const primary = getPrimaryRole(roles);
    expect(primary).not.toBeNull();
    expect(primary!.id).toBe('solo');
  });

  it('preserves the concrete type of the input', () => {
    const roles = [
      makeRole({ id: 'admin', administrativeBodyId: 'ab1', name: 'Σύμβουλος' }),
    ];

    // getPrimaryRole should return the same object reference
    const primary = getPrimaryRole(roles);
    expect(primary).toBe(roles[0]);
  });
});
