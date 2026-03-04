import { Role, Party } from '@prisma/client';
import { getSpeakerDisplayInfo } from '../roles';

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

    expect(result.cityRole).not.toBeNull();
    expect(result.cityRole!.name).toBe('Δήμαρχος');
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

    expect(result.cityRole).toBeNull();
    expect(result.party).not.toBeNull();
    expect(result.party!.name_short).toBe('TP');
    expect(result.isIndependent).toBe(false);
  });

  it('returns independent for a member with no party and no city role', () => {
    const roles = [
      makeRole({ id: 'admin-role', administrativeBodyId: 'ab-1', name: 'Δημοτικός Σύμβουλος' }),
    ];

    const result = getSpeakerDisplayInfo(roles, meetingDate);

    expect(result.cityRole).toBeNull();
    expect(result.party).toBeNull();
    expect(result.isIndependent).toBe(true);
  });

  it('returns independent for a person with no roles', () => {
    const result = getSpeakerDisplayInfo([], meetingDate);

    expect(result.cityRole).toBeNull();
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

    expect(result.cityRole).toBeNull();
    expect(result.party).toBeNull();
    expect(result.isIndependent).toBe(true);
  });

  it('does not return admin body role as city role', () => {
    const roles = [
      makeRole({ id: 'admin-role', administrativeBodyId: 'ab-1', cityId: 'city-1', name: 'Δημοτικός Σύμβουλος' }),
    ];

    const result = getSpeakerDisplayInfo(roles, meetingDate);

    expect(result.cityRole).toBeNull();
    expect(result.isIndependent).toBe(true);
  });

  it('returns city role for deputy mayor without party', () => {
    const roles = [
      makeRole({ id: 'city-role', cityId: 'city-1', name: 'Αντιδήμαρχος' }),
    ];

    const result = getSpeakerDisplayInfo(roles, meetingDate);

    expect(result.cityRole).not.toBeNull();
    expect(result.cityRole!.name).toBe('Αντιδήμαρχος');
    expect(result.party).toBeNull();
    expect(result.isIndependent).toBe(false);
  });
});
