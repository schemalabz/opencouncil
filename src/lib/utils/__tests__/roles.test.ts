import { Role, Party } from '@prisma/client';
import { getSpeakerDisplayInfo, getPartyFromRoles, isRoleActiveAt, sortRolesByPriority, getPrimaryRole, simplifyRoleName, getRoleText, getRoleLabelAt, isPartyRole, isActivePartyRole, isActivePartyMember } from '../roles';
import { RoleWithRelations } from '@/lib/db/types';

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
    electedOrder: null,
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
    expect(result.isPartyHead).toBe(false);
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
    expect(result.isPartyHead).toBe(false);
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
    expect(result.isPartyHead).toBe(true);
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
    expect(result.isPartyHead).toBe(false);
    expect(result.isIndependent).toBe(false);
  });

  describe('isPartyHead', () => {
    it('suppresses isPartyHead for the mayor (city head is always party head)', () => {
      const party = makeParty();
      const roles = [
        makeRole({ id: 'mayor', cityId: 'city-1', isHead: true, name: 'Δήμαρχος' }),
        makeRole({ id: 'party-head', partyId: party.id, party, isHead: true }),
      ];

      const result = getSpeakerDisplayInfo(roles, meetingDate);

      expect(result.role!.name).toBe('Δήμαρχος');
      expect(result.party).not.toBeNull();
      expect(result.isPartyHead).toBe(false);
    });

    it('shows isPartyHead for council president who leads party', () => {
      const party = makeParty();
      const roles = [
        makeRole({ id: 'council-president', administrativeBodyId: 'ab-1', isHead: true, name: 'Πρόεδρος' }),
        makeRole({ id: 'party-head', partyId: party.id, party, isHead: true }),
      ];

      const result = getSpeakerDisplayInfo(roles, meetingDate);

      expect(result.role!.name).toBe('Πρόεδρος');
      expect(result.party).not.toBeNull();
      expect(result.isPartyHead).toBe(true);
    });

    it('shows isPartyHead for party head with no other prominent role', () => {
      const party = makeParty();
      const roles = [
        makeRole({ id: 'party-head', partyId: party.id, party, isHead: true }),
        makeRole({ id: 'admin-role', administrativeBodyId: 'ab-1', name: 'Δημοτικός Σύμβουλος' }),
      ];

      const result = getSpeakerDisplayInfo(roles, meetingDate);

      expect(result.role).toBeNull();
      expect(result.isPartyHead).toBe(true);
    });

    it('returns false for regular party member (not head)', () => {
      const party = makeParty();
      const roles = [
        makeRole({ id: 'party-role', partyId: party.id, party, isHead: false }),
      ];

      const result = getSpeakerDisplayInfo(roles, meetingDate);

      expect(result.isPartyHead).toBe(false);
    });

    it('suppresses isPartyHead for mayor + committee chair + party head', () => {
      const party = makeParty();
      const roles = [
        makeRole({ id: 'mayor', cityId: 'city-1', isHead: true, name: 'Δήμαρχος' }),
        makeRole({ id: 'committee-chair', administrativeBodyId: 'ab-1', isHead: true, name: 'Πρόεδρος' }),
        makeRole({ id: 'party-head', partyId: party.id, party, isHead: true }),
      ];

      const result = getSpeakerDisplayInfo(roles, meetingDate);

      expect(result.role!.name).toBe('Δήμαρχος');
      expect(result.isPartyHead).toBe(false);
    });

    it('does not suppress isPartyHead for deputy mayor (not city head)', () => {
      const party = makeParty();
      const roles = [
        makeRole({ id: 'deputy', cityId: 'city-1', isHead: false, name: 'Αντιδήμαρχος' }),
        makeRole({ id: 'party-head', partyId: party.id, party, isHead: true }),
      ];

      const result = getSpeakerDisplayInfo(roles, meetingDate);

      expect(result.role!.name).toBe('Αντιδήμαρχος');
      expect(result.isPartyHead).toBe(true);
    });
  });
});

describe('getPartyFromRoles', () => {
  // Mirrors issue #309: a councilor who became independent (party role ended).
  // The timeline color must reflect affiliation as of the meeting date — old
  // meetings keep the party color, later meetings fall back to independent.
  const party = makeParty({ id: 'old-party', colorHex: '#123456' });
  const affiliationEnd = new Date('2025-11-01');
  const rolesAfterLeaving = [
    makeRole({ partyId: 'old-party', party, startDate: null, endDate: affiliationEnd }),
  ];

  it('returns the old party for a meeting before the affiliation ended', () => {
    const result = getPartyFromRoles(rolesAfterLeaving, new Date('2025-10-15'));
    expect(result?.id).toBe('old-party');
    expect(result?.colorHex).toBe('#123456');
  });

  it('returns null (independent) for a meeting after the affiliation ended', () => {
    const result = getPartyFromRoles(rolesAfterLeaving, new Date('2025-11-15'));
    expect(result).toBeNull();
  });

  it('treats the end date as exclusive (independent on the day it ends)', () => {
    const result = getPartyFromRoles(rolesAfterLeaving, affiliationEnd);
    expect(result).toBeNull();
  });

  // Guards against the Server -> Client serialization bug: meeting.dateTime
  // arrives as an ISO string, which must still compare correctly against the
  // role's dates (Date vs string comparisons would otherwise yield NaN/false).
  it('resolves correctly when the date is an ISO string (serialized)', () => {
    const before = getPartyFromRoles(rolesAfterLeaving, '2025-10-15T10:00:00.000Z' as unknown as Date);
    expect(before?.id).toBe('old-party');

    const after = getPartyFromRoles(rolesAfterLeaving, '2025-11-15T10:00:00.000Z' as unknown as Date);
    expect(after).toBeNull();
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

describe('simplifyRoleName', () => {
  it('returns null for null input', () => {
    expect(simplifyRoleName(null)).toBeNull();
  });

  it('simplifies standard deputy mayor title', () => {
    expect(simplifyRoleName('Αντιδήμαρχος Παιδείας, Νεολαίας και Επικοινωνίας'))
      .toBe('Αντιδήμαρχος');
  });

  it('preserves prefix before Αντιδήμαρχος', () => {
    expect(simplifyRoleName('Αναπληρωτής Δήμαρχος και Αντιδήμαρχος Οικονομικών Υπηρεσιών'))
      .toBe('Αναπληρωτής Δήμαρχος και Αντιδήμαρχος');
  });

  it('preserves prefix with dash separator', () => {
    expect(simplifyRoleName('Αναπληρωτής Δήμαρχος - Αντιδήμαρχος Οικονομικών Υπηρεσιών'))
      .toBe('Αναπληρωτής Δήμαρχος - Αντιδήμαρχος');
  });

  it('returns exact match when name is just Αντιδήμαρχος', () => {
    expect(simplifyRoleName('Αντιδήμαρχος')).toBe('Αντιδήμαρχος');
  });

  it('passes through unrelated role names unchanged', () => {
    expect(simplifyRoleName('Δήμαρχος')).toBe('Δήμαρχος');
    expect(simplifyRoleName('Πρόεδρος')).toBe('Πρόεδρος');
  });
});

// --- getRoleText / getRoleLabelAt (the label MCP and the badges share) ---

const roleT = (key: 'mayor' | 'president' | 'partyLeader' | 'member') =>
  ({ mayor: 'Δήμαρχος', president: 'Πρόεδρος', partyLeader: 'Επικεφαλής', member: 'Μέλος' }[key]);

function makeAdminBody(name: string) {
  return {
    id: 'body-1',
    cityId: 'city-1',
    name,
    name_en: name,
    type: 'community' as const,
    notificationBehavior: 'NOTIFICATIONS_DISABLED' as const,
    showUnreviewedTranscript: false,
    youtubeChannelUrl: null,
    contactEmails: [],
    diavgeiaUnitIds: [],
    createdAt: new Date('2020-01-01'),
    updatedAt: new Date('2020-01-01'),
  };
}

function makeFullRole(overrides: Partial<RoleWithRelations> = {}): RoleWithRelations {
  return { ...makeRole(), party: null, administrativeBody: null, city: null, ...overrides } as RoleWithRelations;
}

describe('getRoleText', () => {
  it('labels a city head as mayor', () => {
    const role = makeFullRole({ cityId: 'city-1', isHead: true });
    expect(getRoleText(role, roleT)).toBe('Δήμαρχος');
  });

  it('never labels a non-city head as mayor (admin-body chair with null name)', () => {
    const role = makeFullRole({
      administrativeBodyId: 'body-1',
      administrativeBody: makeAdminBody('6η Δημοτική Κοινότητα'),
      isHead: true,
    });
    expect(getRoleText(role, roleT)).toBe('Πρόεδρος - 6η Δημοτική Κοινότητα');
  });

  it('labels a party head with the party name and leader suffix', () => {
    const party = makeParty({ name: 'Αθήνα Ψηλά' });
    const role = makeFullRole({ partyId: party.id, party, isHead: true });
    expect(getRoleText(role, roleT)).toBe('Αθήνα Ψηλά (Επικεφαλής)');
  });

  it('labels a plain party member with the party name', () => {
    const party = makeParty({ name: 'Αθήνα Τώρα' });
    const role = makeFullRole({ partyId: party.id, party });
    expect(getRoleText(role, roleT)).toBe('Αθήνα Τώρα');
  });

  it('prefers the stored role name on a named admin-body role', () => {
    const role = makeFullRole({
      name: 'Αντιπρόεδρος',
      administrativeBodyId: 'body-1',
      administrativeBody: makeAdminBody('Δημοτική Επιτροπή'),
      isHead: true,
    });
    expect(getRoleText(role, roleT)).toBe('Αντιπρόεδρος - Δημοτική Επιτροπή');
  });
});

describe('getRoleLabelAt', () => {
  it('picks the most prominent role active at the date', () => {
    const party = makeParty({ name: 'Αθήνα Ψηλά' });
    const roles = [
      makeFullRole({ id: 'party-role', partyId: party.id, party, isHead: true }),
      makeFullRole({ id: 'chair', administrativeBodyId: 'body-1', administrativeBody: makeAdminBody('6η Δημοτική Κοινότητα'), isHead: true }),
    ];
    // admin-body head (priority 2) outranks party head (priority 3)
    expect(getRoleLabelAt(roles, roleT, meetingDate)).toBe('Πρόεδρος - 6η Δημοτική Κοινότητα');
  });

  it('ignores roles that ended before the meeting date', () => {
    const party = makeParty({ name: 'Αθήνα Τώρα' });
    const roles = [
      makeFullRole({ id: 'old-mayor', cityId: 'city-1', isHead: true, endDate: new Date('2023-12-31') }),
      makeFullRole({ id: 'party-role', partyId: party.id, party }),
    ];
    expect(getRoleLabelAt(roles, roleT, meetingDate)).toBe('Αθήνα Τώρα');
  });

  it('returns null when no role is active', () => {
    expect(getRoleLabelAt(undefined, roleT, meetingDate)).toBeNull();
    expect(getRoleLabelAt([makeFullRole({ endDate: new Date('2020-06-01') })], roleT, meetingDate)).toBeNull();
  });
});

describe('party membership predicates', () => {
  const PARTY = 'party-1';
  const ended = { startDate: null, endDate: new Date('2024-01-01') };

  /**
   * A defector: the party role ended, the council seat did not. Real roles are one
   * or the other — validateRoles forbids a role carrying both a partyId and an
   * administrativeBodyId — so leaving a παράταξη lapses only the party role, and
   * getPartiesForCity still returns the person under the party.
   */
  const defector = {
    roles: [
      makeRole({ id: 'left-party', partyId: PARTY, ...ended }),
      makeRole({ id: 'seat', administrativeBodyId: 'council' }),
    ],
  };
  const sittingMember = { roles: [makeRole({ id: 'member', partyId: PARTY })] };

  describe('isPartyRole', () => {
    it('matches a role in the party whether or not it has ended', () => {
      expect(isPartyRole(makeRole({ partyId: PARTY }), PARTY)).toBe(true);
      expect(isPartyRole(makeRole({ partyId: PARTY, ...ended }), PARTY)).toBe(true);
    });

    it('rejects a role in another party and a role in none', () => {
      expect(isPartyRole(makeRole({ partyId: 'party-2' }), PARTY)).toBe(false);
      expect(isPartyRole(makeRole({ administrativeBodyId: 'council' }), PARTY)).toBe(false);
    });
  });

  describe('isActivePartyRole', () => {
    it('rejects a party role that has ended', () => {
      expect(isActivePartyRole(makeRole({ partyId: PARTY, ...ended }), PARTY)).toBe(false);
    });

    it('rejects an active role that belongs to another party', () => {
      expect(isActivePartyRole(makeRole({ partyId: 'party-2' }), PARTY)).toBe(false);
    });

    it('accepts a party role with no end date', () => {
      expect(isActivePartyRole(makeRole({ partyId: PARTY }), PARTY)).toBe(true);
    });
  });

  describe('isActivePartyMember', () => {
    it('counts a sitting member', () => {
      expect(isActivePartyMember(sittingMember, PARTY)).toBe(true);
    });

    it('does not count a councillor who has left the party', () => {
      expect(isActivePartyMember(defector, PARTY)).toBe(false);
    });

    it('counts someone whose ended term is followed by a current one', () => {
      const reelected = {
        roles: [
          makeRole({ id: 'last-term', partyId: PARTY, ...ended }),
          makeRole({ id: 'this-term', partyId: PARTY, startDate: new Date('2024-01-01') }),
        ],
      };
      expect(isActivePartyMember(reelected, PARTY)).toBe(true);
    });
  });
});
