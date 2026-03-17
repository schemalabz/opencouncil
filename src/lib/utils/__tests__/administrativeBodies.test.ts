import { AdministrativeBody, AdministrativeBodyType } from '@prisma/client';
import { PersonWithRelations } from '../../db/people';
import {
    getAdministrativeBodyTypesForMeetings,
    getAdministrativeBodyTypesForPeople,
    getBodiesOfTypeFromMeetings,
    getBodiesOfTypeFromPeople,
    filterMeetingByAdminBodyTypes,
    filterPersonByAdminBodyTypes,
} from '../administrativeBodies';

function makeAdminBody(overrides: Partial<AdministrativeBody> = {}): AdministrativeBody {
    return {
        id: 'ab-1',
        cityId: 'city-1',
        name: 'Test Body',
        name_en: 'Test Body',
        type: 'council',
        notificationBehavior: 'NOTIFICATIONS_APPROVAL',
        youtubeChannelUrl: null,
        contactEmails: [],
        diavgeiaUnitIds: [],
        createdAt: new Date('2020-01-01'),
        updatedAt: new Date('2020-01-01'),
        ...overrides,
    };
}

function makeMeeting(adminBody: AdministrativeBody | null = null) {
    return { administrativeBody: adminBody };
}

function makePerson(roles: { administrativeBody: AdministrativeBody | null; cityId?: string | null }[]): PersonWithRelations {
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
            rank: null,
            startDate: new Date('2020-01-01'),
            endDate: null,
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

describe('filterMeetingByAdminBodyTypes', () => {
    it('returns true when selectedTypes is empty (show all)', () => {
        expect(filterMeetingByAdminBodyTypes(makeMeeting(councilBody), [])).toBe(true);
    });

    it('returns false for a meeting with no admin body', () => {
        expect(filterMeetingByAdminBodyTypes(makeMeeting(null), ['council'])).toBe(false);
    });

    it('returns true when meeting type matches', () => {
        expect(filterMeetingByAdminBodyTypes(makeMeeting(councilBody), ['council'])).toBe(true);
    });

    it('returns false when meeting type does not match', () => {
        expect(filterMeetingByAdminBodyTypes(makeMeeting(councilBody), ['community'])).toBe(false);
    });
});

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
});
