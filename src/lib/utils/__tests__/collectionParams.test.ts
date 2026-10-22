import {
    parseCollectionParams,
    withBodySelection,
    withFilterSelection,
    withPage,
    withSearchQuery,
    toURLSearchParams,
    type CollectionFilterConfig,
    type FilterOption,
} from '../filterURL';

type BodyType = 'council' | 'committee' | 'community';

const filterOptions: FilterOption<BodyType>[] = [
    { value: 'council', label: 'Δημοτικό Συμβούλιο' },
    { value: 'committee', label: 'Δημοτική Επιτροπή' },
    { value: 'community', label: 'Κοινότητες' },
];
const communities: FilterOption<string>[] = [
    { value: 'body-a', label: '1η Δημοτική Κοινότητα' },
    { value: 'body-b', label: '2η Δημοτική Κοινότητα' },
];
const bodyOptionsFor = (type: BodyType) => (type === 'community' ? communities : []);
const meetingsConfig: CollectionFilterConfig<BodyType> = { filterOptions, defaultFilterValues: ['council'], bodyOptionsFor };

const parse = (query: string, config: CollectionFilterConfig<BodyType> = meetingsConfig) => parseCollectionParams(new URLSearchParams(query), config);

describe('parseCollectionParams', () => {
    it('applies the default filter when the URL names none', () => {
        expect(parse('').selectedFilters).toEqual(['council']);
    });

    it('reads `*` as an explicit "all"', () => {
        expect(parse('filters=*').selectedFilters).toEqual([]);
    });

    it('turns labels into values and drops unknown labels', () => {
        expect(parse('filters=Δημοτική Επιτροπή,Άγνωστο').selectedFilters).toEqual(['committee']);
    });

    it('without defaults, an unset filter selects none, which means all', () => {
        expect(parse('', { filterOptions }).selectedFilters).toEqual([]);
    });

    it('resolves the body label within the one selected type', () => {
        expect(parse('filters=Κοινότητες&body=2η Δημοτική Κοινότητα').selectedBody).toBe('body-b');
    });

    it('ignores the body when the selected type offers no body picker, or when two types are selected', () => {
        expect(parse('body=2η Δημοτική Κοινότητα').selectedBody).toBeNull();
        expect(parse('filters=Κοινότητες,Δημοτική Επιτροπή&body=2η Δημοτική Κοινότητα').selectedBody).toBeNull();
    });

    it('reads the search text and the page, with 1 for a missing or bad page', () => {
        expect(parse('search=λογοδοσια&page=3')).toMatchObject({ query: 'λογοδοσια', page: 3 });
        expect(parse('page=abc').page).toBe(1);
        expect(parse('page=0').page).toBe(1);
        expect(parse('page=2abc').page).toBe(1);
        expect(parse('page=1.5').page).toBe(1);
        expect(parse('page=').page).toBe(1);
        expect(parse('').page).toBe(1);
    });

    it('reads an empty `filters` as no filter, which applies the defaults', () => {
        expect(parse('filters=').selectedFilters).toEqual(['council']);
        expect(parse('filters=Δημοτική Επιτροπή,').selectedFilters).toEqual(['committee']);
    });
});

describe('URL builders', () => {
    const base = () => new URLSearchParams('filters=Κοινότητες&body=1η Δημοτική Κοινότητα&page=4&search=x');

    it('withFilterSelection removes the param for the default and clears body and page', () => {
        const next = withFilterSelection(base(), ['council'], filterOptions, ['council']);
        expect(next.get('filters')).toBeNull();
        expect(next.get('body')).toBeNull();
        expect(next.get('page')).toBeNull();
        expect(next.get('search')).toBe('x');
    });

    it('withFilterSelection writes `*` for "all" when a default exists, and labels otherwise', () => {
        expect(withFilterSelection(base(), [], filterOptions, ['council']).get('filters')).toBe('*');
        expect(withFilterSelection(base(), ['committee'], filterOptions, ['council']).get('filters')).toBe('Δημοτική Επιτροπή');
    });

    it('withFilterSelection without defaults removes the param for none and for all', () => {
        expect(withFilterSelection(base(), [], filterOptions, undefined).get('filters')).toBeNull();
        expect(withFilterSelection(base(), ['council', 'committee', 'community'], filterOptions, undefined).get('filters')).toBeNull();
    });

    it('withBodySelection writes the label, clears it for null, and clears the page', () => {
        expect(withBodySelection(base(), 'body-b', communities).get('body')).toBe('2η Δημοτική Κοινότητα');
        expect(withBodySelection(base(), null, communities).get('body')).toBeNull();
        expect(withBodySelection(base(), 'body-b', communities).get('page')).toBeNull();
    });

    it('withSearchQuery sets or clears the search and clears the page', () => {
        expect(withSearchQuery(base(), 'νέο').get('search')).toBe('νέο');
        expect(withSearchQuery(base(), '').get('search')).toBeNull();
        expect(withSearchQuery(base(), 'νέο').get('page')).toBeNull();
    });

    it('withPage writes pages after the first and clears page 1', () => {
        expect(withPage(base(), 2).get('page')).toBe('2');
        expect(withPage(base(), 1).get('page')).toBeNull();
    });

    it('never changes the params it receives', () => {
        const params = base();
        withPage(params, 2);
        withSearchQuery(params, '');
        expect(params.toString()).toBe(base().toString());
    });

    it('withBodySelection clears the body for an id that the options do not hold', () => {
        expect(withBodySelection(base(), 'body-z', communities).get('body')).toBeNull();
    });

    it('withFilterSelection and withBodySelection never change the params they receive', () => {
        const params = base();
        withFilterSelection(params, ['committee'], filterOptions, ['council']);
        withBodySelection(params, 'body-b', communities);
        expect(params.toString()).toBe(base().toString());
    });
});

describe('toURLSearchParams', () => {
    it('keeps every value and skips the missing ones', () => {
        expect(toURLSearchParams({ filters: '*', page: '2', search: undefined, tag: ['a', 'b'] }).toString()).toBe('filters=*&page=2&tag=a&tag=b');
    });
});
