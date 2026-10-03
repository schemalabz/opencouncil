import type { PublicAdministrativeBody } from '@/lib/db/types';
import { clampPage, meetingBodyFilter, meetingsTabFilters } from '../meetingsTab';

const body = (id: string, type: PublicAdministrativeBody['type'], name: string): PublicAdministrativeBody => ({
    id, type, name, name_en: name, cityId: 'c', place: null, youtubeChannelUrl: null,
});

const bodies = [
    body('council', 'council', 'Δημοτικό Συμβούλιο'),
    body('committee', 'committee', 'Δημοτική Επιτροπή'),
    body('community-b', 'community', '2η Δημοτική Κοινότητα'),
    body('community-a', 'community', '1η Δημοτική Κοινότητα'),
];
const t = (key: string) => key;

describe('meetingsTabFilters', () => {
    it('offers the types present, defaults to the council, and gives the council no body picker', () => {
        const { filterOptions, defaultFilterValues, bodyOptionsFor } = meetingsTabFilters(bodies, t);
        expect(filterOptions.map(o => o.value)).toEqual(['council', 'committee', 'community']);
        expect(defaultFilterValues).toEqual(['council']);
        expect(bodyOptionsFor('council')).toEqual([]);
        expect(bodyOptionsFor('community').map(o => o.value)).toEqual(['community-a', 'community-b']);
    });

    it('has no default when the city has no council', () => {
        expect(meetingsTabFilters(bodies.slice(1), t).defaultFilterValues).toBeUndefined();
    });
});

describe('meetingBodyFilter', () => {
    it('selects one body by id', () => {
        expect(meetingBodyFilter({ selectedFilters: ['community'], selectedBody: 'community-a' }, bodies)).toEqual({ administrativeBodyIds: ['community-a'] });
    });

    it('turns selected types into the ids of every body of those types', () => {
        expect(meetingBodyFilter({ selectedFilters: ['community'], selectedBody: null }, bodies)).toEqual({ administrativeBodyIds: ['community-b', 'community-a'] });
    });

    it('applies no body filter for "all"', () => {
        expect(meetingBodyFilter({ selectedFilters: [], selectedBody: null }, bodies)).toEqual({});
    });

    it('matches nothing, never everything, when a selected type has no body in the list', () => {
        expect(meetingBodyFilter({ selectedFilters: ['community'], selectedBody: null }, bodies.slice(0, 2))).toBeNull();
    });
});

describe('clampPage', () => {
    it('keeps a page in range, and moves a page past the end to the last page', () => {
        expect(clampPage(3, 130, 12)).toBe(3);
        expect(clampPage(99, 130, 12)).toBe(11);
        expect(clampPage(0, 130, 12)).toBe(1);
        expect(clampPage(4, 0, 12)).toBe(1);
    });
});
