import { AdministrativeBody, AdministrativeBodyType } from '@prisma/client';
import { PersonWithRelations } from '../../db/people';
import {
    getAdministrativeBodyTypesForMeetings,
    getAdministrativeBodyTypesForPeople,
    getBodiesOfTypeFromMeetings,
    getBodiesOfTypeFromPeople,
    filterPersonByAdminBodyTypes,
    ADMIN_BODY_TYPE_ORDER,
    isAdministrativeBodyType,
    toAdministrativeBodyType,
    getBodyOptions,
    personSitsOnBody,
} from '../administrativeBodies';

function makeAdminBody(overrides: Partial<AdministrativeBody> = {}): AdministrativeBody {
    return {
        id: 'ab-1',
        cityId: 'city-1',
        name: 'Test Body',
        name_en: 'Test Body',
        type: 'council',
        notificationBehavior: 'NOTIFICATIONS_APPROVAL',
        showUnreviewedTranscript: true,
        youtubeChannelUrl: null,
        diavgeiaUnitIds: [],
        decisionConventions: null,
        place: null,
        createdAt: new Date('2020-01-01'),
        updatedAt: new Date('2020-01-01'),
        ...overrides,
    };
}

function makeMeeting(adminBody: AdministrativeBody | null = null) {
    return { administrativeBody: adminBody };
}

function makePerson(roles: { administrativeBody: AdministrativeBody | null; cityId?: string | null; startDate?: Date | null; endDate?: Date | null }[]): PersonWithRelations {
    return {
        id: 'person-1',
        cityId: 'city-1',
        name: 'Test Person',
        name_en: 'Test Person',
        image: null,
        profileUrl: null,
        createdAt: new Date('2020-01-01'),
        updatedAt: new Date('2020-01-01'),
        roles: roles.map((r, i) => ({
            id: `role-${i}`,
            personId: 'person-1',
            cityId: r.cityId ?? null,
            partyId: null,
            administrativeBodyId: r.administrativeBody?.id ?? null,
            administrativeBody: r.administrativeBody,
            party: null,
            city: null,
            isHead: false,
            name: null,
            name_en: null,
            electedOrder: null,
            startDate: r.startDate !== undefined ? r.startDate : new Date('2020-01-01'),
            endDate: r.endDate !== undefined ? r.endDate : null,
            createdAt: new Date('2020-01-01'),
            updatedAt: new Date('2020-01-01'),
        })),
    } as PersonWithRelations;
}

const mockT = (key: string) => key;

const councilBody = makeAdminBody({ id: 'council-1', name: 'Δημοτικό Συμβούλιο', type: 'council' });
const committeeBody = makeAdminBody({ id: 'committee-1', name: 'Επιτροπή Α', type: 'committee' });
const communityBodyA = makeAdminBody({ id: 'community-1', name: 'Κοινότητα Β', type: 'community' });
const communityBodyB = makeAdminBody({ id: 'community-2', name: 'Κοινότητα Α', type: 'community' });

// --- getAdministrativeBodyTypes ---

describe('getAdministrativeBodyTypesForMeetings', () => {
    it('returns types in canonical order (council, committee, community)', () => {
        const meetings = [
            makeMeeting(communityBodyA),
            makeMeeting(councilBody),
            makeMeeting(committeeBody),
        ];
        const result = getAdministrativeBodyTypesForMeetings(meetings, mockT);
        expect(result.map(r => r.value)).toEqual(['council', 'committee', 'community']);
    });

    it('deduplicates types', () => {
        const meetings = [
            makeMeeting(councilBody),
            makeMeeting(councilBody),
        ];
        const result = getAdministrativeBodyTypesForMeetings(meetings, mockT);
        expect(result).toHaveLength(1);
    });

    it('skips meetings with no admin body', () => {
        const meetings = [makeMeeting(null), makeMeeting(councilBody)];
        const result = getAdministrativeBodyTypesForMeetings(meetings, mockT);
        expect(result).toHaveLength(1);
        expect(result[0].value).toBe('council');
    });

    it('returns empty for no meetings', () => {
        expect(getAdministrativeBodyTypesForMeetings([], mockT)).toEqual([]);
    });
});

describe('getAdministrativeBodyTypesForPeople', () => {
    it('extracts types from people roles', () => {
        const people = [
            makePerson([{ administrativeBody: councilBody }, { administrativeBody: communityBodyA }]),
        ];
        const result = getAdministrativeBodyTypesForPeople(people, mockT);
        expect(result.map(r => r.value)).toEqual(['council', 'community']);
    });

    it('deduplicates across people', () => {
        const people = [
            makePerson([{ administrativeBody: councilBody }]),
            makePerson([{ administrativeBody: councilBody }]),
        ];
        const result = getAdministrativeBodyTypesForPeople(people, mockT);
        expect(result).toHaveLength(1);
    });
});

// --- getBodiesOfType ---

describe('getBodiesOfTypeFromMeetings', () => {
    it('returns bodies of the specified type sorted alphabetically', () => {
        const meetings = [
            makeMeeting(communityBodyA),  // "Κοινότητα Β"
            makeMeeting(communityBodyB),  // "Κοινότητα Α"
            makeMeeting(councilBody),     // different type, should be excluded
        ];
        const result = getBodiesOfTypeFromMeetings(meetings, 'community');
        expect(result).toHaveLength(2);
        expect(result[0].label).toBe('Κοινότητα Α');
        expect(result[1].label).toBe('Κοινότητα Β');
    });

    it('deduplicates bodies', () => {
        const meetings = [makeMeeting(communityBodyA), makeMeeting(communityBodyA)];
        const result = getBodiesOfTypeFromMeetings(meetings, 'community');
        expect(result).toHaveLength(1);
    });

    it('returns empty when no bodies match the type', () => {
        const meetings = [makeMeeting(councilBody)];
        expect(getBodiesOfTypeFromMeetings(meetings, 'community')).toEqual([]);
    });
});

describe('getBodiesOfTypeFromPeople', () => {
    it('returns bodies of the specified type from roles', () => {
        const people = [
            makePerson([{ administrativeBody: communityBodyA }, { administrativeBody: communityBodyB }]),
        ];
        const result = getBodiesOfTypeFromPeople(people, 'community');
        expect(result).toHaveLength(2);
        expect(result[0].label).toBe('Κοινότητα Α');
    });
});

// --- Filters ---

describe('filterPersonByAdminBodyTypes', () => {
    it('returns true when selectedTypes is empty (show all)', () => {
        const person = makePerson([{ administrativeBody: councilBody }]);
        expect(filterPersonByAdminBodyTypes(person, [])).toBe(true);
    });

    it('returns true when person has matching role type', () => {
        const person = makePerson([{ administrativeBody: councilBody }]);
        expect(filterPersonByAdminBodyTypes(person, ['council'])).toBe(true);
    });

    it('returns false when person has no matching role type', () => {
        const person = makePerson([{ administrativeBody: councilBody }]);
        expect(filterPersonByAdminBodyTypes(person, ['community'])).toBe(false);
    });

    it('includes mayors (city-level roles) when council is selected', () => {
        const person = makePerson([{ administrativeBody: null, cityId: 'city-1' }]);
        expect(filterPersonByAdminBodyTypes(person, ['council'])).toBe(true);
    });

    it('excludes mayors when council is not selected', () => {
        const person = makePerson([{ administrativeBody: null, cityId: 'city-1' }]);
        expect(filterPersonByAdminBodyTypes(person, ['community'])).toBe(false);
    });

    it('excludes a person whose committee role has ended', () => {
        const person = makePerson([{
            administrativeBody: committeeBody,
            startDate: new Date('2020-01-01'),
            endDate: new Date('2021-01-01'),
        }]);
        expect(filterPersonByAdminBodyTypes(person, ['committee'])).toBe(false);
    });

    it('includes a person whose committee role is still active', () => {
        const person = makePerson([{
            administrativeBody: committeeBody,
            startDate: new Date('2020-01-01'),
            endDate: null,
        }]);
        expect(filterPersonByAdminBodyTypes(person, ['committee'])).toBe(true);
    });

    it('excludes a person whose only matching role for the type has ended, even if another type is active', () => {
        const person = makePerson([
            { administrativeBody: committeeBody, endDate: new Date('2021-01-01') },
            { administrativeBody: councilBody, endDate: null },
        ]);
        expect(filterPersonByAdminBodyTypes(person, ['committee'])).toBe(false);
        expect(filterPersonByAdminBodyTypes(person, ['council'])).toBe(true);
    });
});

describe('administrative body type guards', () => {
    it('accepts every type of the Prisma enum and nothing else', () => {
        for (const type of Object.values(AdministrativeBodyType)) {
            expect(isAdministrativeBodyType(type)).toBe(true);
            expect(toAdministrativeBodyType(type)).toBe(type);
        }
        expect(isAdministrativeBodyType('κοινότητα')).toBe(false);
        expect(isAdministrativeBodyType(undefined)).toBe(false);
        expect(toAdministrativeBodyType('')).toBeUndefined();
    });

    // A type added to the enum (a youth body, say) must also get a place in
    // the order every list of bodies uses, or it sorts after "no seat".
    it('orders every type of the Prisma enum', () => {
        expect([...ADMIN_BODY_TYPE_ORDER].sort()).toEqual([...Object.values(AdministrativeBodyType)].sort());
    });
});

describe('getBodyOptions', () => {
    it('lists each body once, council first, then by type and by name', () => {
        expect(getBodyOptions([communityBodyA, councilBody, null, communityBodyB, committeeBody, councilBody])).toEqual([
            { value: 'council-1', label: 'Δημοτικό Συμβούλιο' },
            { value: 'committee-1', label: 'Επιτροπή Α' },
            { value: 'community-2', label: 'Κοινότητα Α' },
            { value: 'community-1', label: 'Κοινότητα Β' },
        ]);
    });
});

describe('personSitsOnBody', () => {
    it('takes the active seat on that body only', () => {
        const member = makePerson([{ administrativeBody: communityBodyA }]);
        expect(personSitsOnBody(member, communityBodyA)).toBe(true);
        expect(personSitsOnBody(member, communityBodyB)).toBe(false);
        const former = makePerson([{ administrativeBody: communityBodyA, endDate: new Date('2021-01-01') }]);
        expect(personSitsOnBody(former, communityBodyA)).toBe(false);
    });

    it('seats a city-level role with the council and nowhere else', () => {
        const deputyMayor = makePerson([{ administrativeBody: null, cityId: 'city-1' }]);
        expect(personSitsOnBody(deputyMayor, councilBody)).toBe(true);
        expect(personSitsOnBody(deputyMayor, committeeBody)).toBe(false);
    });

    // One council rule for both filters: the page's body chip and the city
    // page's type chip must agree on who is in the council's view.
    it('agrees with the type filter on the council', () => {
        const people = [
            makePerson([{ administrativeBody: councilBody }]),
            makePerson([{ administrativeBody: null, cityId: 'city-1' }]),
            makePerson([{ administrativeBody: committeeBody }]),
            makePerson([{ administrativeBody: councilBody, endDate: new Date('2021-01-01') }]),
            makePerson([{ administrativeBody: communityBodyA }]),
        ];
        for (const person of people) {
            expect(personSitsOnBody(person, councilBody)).toBe(filterPersonByAdminBodyTypes(person, ['council']));
        }
    });
});
