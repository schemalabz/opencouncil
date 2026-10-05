/** @jest-environment node */

const mockPersonFindMany = jest.fn();

jest.mock('../prisma', () => ({
  __esModule: true,
  default: { person: { findMany: (...args: unknown[]) => mockPersonFindMany(...args) } },
}));
jest.mock('../../auth', () => ({ withUserAuthorizedToEdit: jest.fn() }));

import { getPeopleForMeeting, getPeopleWhoMaySpeak, PersonWithRelations } from '../people';

type Role = PersonWithRelations['roles'][number];
type BodyType = NonNullable<Role['administrativeBody']>['type'];

const MEETING_DATE = new Date('2026-09-14T07:30:00Z');

const role = (over: Partial<Role>): Role => ({
  id: 'role', personId: 'p', cityId: null, partyId: null, administrativeBodyId: null, isHead: false,
  name: null, name_en: null, electedOrder: null, startDate: null, endDate: null,
  createdAt: new Date(0), updatedAt: new Date(0), party: null, administrativeBody: null, city: null,
  ...over,
} as Role);

const inBody = (id: string, type: BodyType, over: Partial<Role> = {}) =>
  role({ administrativeBodyId: id, administrativeBody: { id, name: id, type } as Role['administrativeBody'], ...over });
const cityLevel = (name: string, over: Partial<Role> = {}) => role({ cityId: 'city-1', name, ...over });
const inParty = () => role({ partyId: 'party', party: { id: 'party', name: 'Party' } as Role['party'] });

const person = (id: string, roles: Role[]) => ({ id, name: id, roles } as PersonWithRelations);

const CITY = [
  person('mayor', [cityLevel('Δήμαρχος', { isHead: true })]),
  person('general-secretary', [cityLevel('Γενικός Γραμματέας')]),
  person('former-deputy-mayor', [cityLevel('Αντιδήμαρχος', { endDate: new Date('2025-12-31') }), inBody('community-a', 'community')]),
  person('councillor', [inBody('council', 'council'), inParty()]),
  person('councillor-on-committee', [inBody('council', 'council'), inBody('committee', 'committee')]),
  person('committee-only-member', [inBody('committee', 'committee')]),
  person('community-a-head', [inBody('community-a', 'community', { isHead: true })]),
  person('community-a-member', [inBody('community-a', 'community')]),
  person('community-b-member', [inBody('community-b', 'community')]),
  person('party-only', [inParty()]),
  person('no-roles', []),
];

const idsOf = (people: PersonWithRelations[]) => people.map(p => p.id).sort();

beforeEach(() => {
  jest.clearAllMocks();
  mockPersonFindMany.mockResolvedValue(CITY);
});

describe('getPeopleWhoMaySpeak', () => {
  // The council, the city-level roles, the community heads and the people with no body, whatever is meeting.
  const everywhere = ['community-a-head', 'councillor', 'councillor-on-committee', 'general-secretary', 'mayor', 'no-roles', 'party-only'];

  it('at a council meeting: the council, city-level roles, community heads, and people with no body', async () => {
    expect(idsOf(await getPeopleWhoMaySpeak('city-1', 'council', MEETING_DATE))).toEqual(everywhere);
  });

  it('at a committee meeting: the same people, and the committee\'s own members', async () => {
    expect(idsOf(await getPeopleWhoMaySpeak('city-1', 'committee', MEETING_DATE)))
      .toEqual([...everywhere, 'committee-only-member'].sort());
  });

  it('at a community meeting: the same people, and that community\'s members, not another\'s', async () => {
    expect(idsOf(await getPeopleWhoMaySpeak('city-1', 'community-a', MEETING_DATE)))
      .toEqual([...everywhere, 'community-a-member', 'former-deputy-mayor'].sort());
  });

  it('reads city-level roles on the meeting date', async () => {
    const whileDeputyMayor = await getPeopleWhoMaySpeak('city-1', 'council', new Date('2025-06-01T00:00:00Z'));
    expect(idsOf(whileDeputyMayor)).toContain('former-deputy-mayor');
  });

  it('returns the whole city for a meeting with no body', async () => {
    expect(idsOf(await getPeopleWhoMaySpeak('city-1', null, MEETING_DATE))).toEqual(idsOf(CITY));
  });

  it('is wider than the document tasks\' list at a committee, which holds the committee\'s members only', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const prisma = jest.requireMock('../prisma').default;
    prisma.administrativeBody = { findUnique: jest.fn().mockResolvedValue({ id: 'committee', type: 'committee' }) };

    expect(idsOf(await getPeopleForMeeting('city-1', 'committee'))).toEqual(['committee-only-member', 'councillor-on-committee']);
  });
});
