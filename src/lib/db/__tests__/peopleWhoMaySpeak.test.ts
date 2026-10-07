/** @jest-environment node */

const mockPersonFindMany = jest.fn();
const mockBodyFindUnique = jest.fn();

jest.mock('../prisma', () => ({
  __esModule: true,
  default: {
    person: { findMany: (...args: unknown[]) => mockPersonFindMany(...args) },
    administrativeBody: { findUnique: (...args: unknown[]) => mockBodyFindUnique(...args) },
  },
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
  person('youth-chair', [inBody('youth', 'youthCouncil', { isHead: true })]),
  person('youth-member', [inBody('youth', 'youthCouncil')]),
];

// The type of each body the roster above names, as the body lookup answers it.
const BODY_TYPES: Record<string, BodyType> = {
  council: 'council', committee: 'committee', 'community-a': 'community', 'community-b': 'community', youth: 'youthCouncil',
};

const idsOf = (people: PersonWithRelations[]) => people.map(p => p.id).sort();

beforeEach(() => {
  jest.clearAllMocks();
  mockPersonFindMany.mockResolvedValue(CITY);
  mockBodyFindUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(where.id in BODY_TYPES ? { id: where.id, type: BODY_TYPES[where.id] } : null));
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
    expect(mockBodyFindUnique).not.toHaveBeenCalled();
  });

  // A secondary body speaks for itself: the municipality's roster does not sit
  // there, and its members hold a body, so they are not on the council's list.
  it('at a youth council meeting: that body\'s members and nobody else', async () => {
    expect(idsOf(await getPeopleWhoMaySpeak('city-1', 'youth', MEETING_DATE))).toEqual(['youth-chair', 'youth-member']);
  });

  it('is wider than the document tasks\' list at a committee, which holds the committee\'s members only', async () => {
    expect(idsOf(await getPeopleForMeeting('city-1', 'committee'))).toEqual(['committee-only-member', 'councillor-on-committee']);
  });

  it('gives the document tasks a youth council\'s members only, too', async () => {
    expect(idsOf(await getPeopleForMeeting('city-1', 'youth'))).toEqual(['youth-chair', 'youth-member']);
  });

  it('gives the document tasks the whole city when the body is unknown', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(idsOf(await getPeopleForMeeting('city-1', 'missing'))).toEqual(idsOf(CITY));
  });
});
