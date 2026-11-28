import type { PublicAdministrativeBody } from '@/lib/db/types';
import { parseCollectionParams } from '@/lib/utils/filterURL';
import { meetingBodyFilter, meetingsTabFilters, meetingsTabHrefForBody } from '../meetingsTab';

const body = (id: string, type: PublicAdministrativeBody['type'], name: string): PublicAdministrativeBody => ({
    id, type, tier: type === 'youthCouncil' ? 'secondary' : 'primary', name, name_en: name, cityId: 'c', place: null, youtubeChannelUrl: null,
});

const bodies = [
    body('council', 'council', 'Δημοτικό Συμβούλιο'),
    body('committee', 'committee', 'Δημοτική Επιτροπή'),
    body('community-b', 'community', '2η Δημοτική Κοινότητα'),
    body('community-a', 'community', '1η Δημοτική Κοινότητα'),
];
const t = (key: string) => key;
const city = { id: 'c', authorityType: 'municipality' as const };
const region = { id: 'r', authorityType: 'region' as const };

describe('meetingsTabFilters', () => {
    it('offers the types present, defaults to the council, and offers the bodies of every type', () => {
        const { filterOptions, defaultFilterValues, bodyOptionsFor } = meetingsTabFilters(bodies, city, t);
        expect(filterOptions.map(o => o.value)).toEqual(['council', 'committee', 'community']);
        expect(defaultFilterValues).toEqual(['council']);
        expect(bodyOptionsFor('council').map(o => o.value)).toEqual(['council']);
        expect(bodyOptionsFor('community').map(o => o.value)).toEqual(['community-a', 'community-b']);
    });

    it('has no default when the city has no council', () => {
        expect(meetingsTabFilters(bodies.slice(1), city, t).defaultFilterValues).toBeUndefined();
    });
});

describe('the meetings tab of a region (#993)', () => {
    const regionBodies = [body('council', 'council', 'Περιφερειακό Συμβούλιο'), body('committee', 'committee', 'Περιφερειακή Επιτροπή')];

    it('names the body types after the region', () => {
        expect(meetingsTabFilters(regionBodies, region, t).filterOptions).toEqual([
            { value: 'council', label: 'regionBodyType_council' },
            { value: 'committee', label: 'regionBodyType_committee' },
        ]);
    });

    it('links to a body with the label that the tab parses', () => {
        const params = new URL(meetingsTabHrefForBody(region, regionBodies[1], t), 'https://example.test').searchParams;
        expect(params.get('filters')).toBe('regionBodyType_committee');
        const view = parseCollectionParams(params, meetingsTabFilters(regionBodies, region, t));
        expect(view.selectedFilters).toEqual(['committee']);
    });
});

describe('meetingBodyFilter', () => {
    it('selects one body by id', () => {
        expect(meetingBodyFilter({ selectedFilters: ['community'], selectedBody: 'community-a' }, bodies)).toEqual({ ids: ['community-a'] });
    });

    it('turns selected types into the ids of every body of those types', () => {
        expect(meetingBodyFilter({ selectedFilters: ['community'], selectedBody: null }, bodies)).toEqual({ ids: ['community-b', 'community-a'] });
    });

    it('applies no body filter for "all"', () => {
        expect(meetingBodyFilter({ selectedFilters: [], selectedBody: null }, bodies)).toEqual({});
    });

    it('matches nothing, never everything, when a selected type has no body in the list', () => {
        expect(meetingBodyFilter({ selectedFilters: ['community'], selectedBody: null }, bodies.slice(0, 2))).toBeNull();
    });
});

describe('meetingsTabHrefForBody', () => {
    const paramsOf = (href: string) => new URL(href, 'https://example.test').searchParams;

    it('names a body the way the tab parses it, and widens the tier for a secondary body (#829)', () => {
        const youth = body('youth', 'youthCouncil', 'Δημοτικό Συμβούλιο Νέων');
        const href = meetingsTabHrefForBody(city, youth, t);
        expect(href.startsWith('/c/meetings?')).toBe(true);
        const params = paramsOf(href);
        expect(params.get('tier')).toBe('all');
        const view = parseCollectionParams(params, meetingsTabFilters([...bodies, youth], city, t, { widened: true }));
        expect(view.selectedFilters).toEqual(['youthCouncil']);
        expect(view.selectedBody).toBe('youth');
    });

    it('names a council by its body, and keeps the tier of the tab', () => {
        const params = paramsOf(meetingsTabHrefForBody(city, bodies[0], t));
        expect(params.get('tier')).toBeNull();
        const view = parseCollectionParams(params, meetingsTabFilters(bodies, city, t));
        expect(view.selectedFilters).toEqual(['council']);
        expect(view.selectedBody).toBe('council');
    });

    it('names a secondary body of type council by its body, so the main council stays off the list (#829)', () => {
        const company = { ...body('company', 'council', 'Ζήρεια Α.Ε.'), tier: 'secondary' as const };
        const params = paramsOf(meetingsTabHrefForBody(city, company, t));
        expect(params.get('tier')).toBe('all');
        const view = parseCollectionParams(params, meetingsTabFilters([...bodies, company], city, t, { widened: true }));
        expect(view.selectedFilters).toEqual(['council']);
        expect(view.selectedBody).toBe('company');
        expect(meetingBodyFilter(view, [...bodies, company])).toEqual({ ids: ['company'] });
    });
});
