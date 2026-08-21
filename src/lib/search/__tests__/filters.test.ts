// filters.ts reaches the model, the database and Google Maps at module scope.
// Only the AI call matters here: these cases feed extractFilters a raw model
// response and assert what survives the boundary.
jest.mock('@/env.mjs', () => ({ env: {} }));
jest.mock('@/lib/ai', () => ({ aiChat: jest.fn() }));
jest.mock('@/lib/db/cities', () => ({
    getCities: jest.fn().mockResolvedValue([]),
    getCity: jest.fn(),
    filterCityIdsByRealm: jest.fn(),
}));
jest.mock('@/lib/google-maps', () => ({
    getPlaceSuggestions: jest.fn(),
    getPlaceDetails: jest.fn(),
}));

import { aiChat } from '@/lib/ai';
import { getCity, filterCityIdsByRealm } from '@/lib/db/cities';
import { getPlaceSuggestions, getPlaceDetails } from '@/lib/google-maps';
import { extractFilters, processFilters, NO_EXTRACTED_FILTERS } from '../filters';

const aiChatMock = aiChat as jest.MockedFunction<typeof aiChat>;

// The production response shape: aiChat parses the model's JSON and casts it,
// so `result` is whatever the model wrote.
const modelReturns = (result: unknown) => {
    aiChatMock.mockResolvedValue({ result, usage: {} } as never);
};

describe('extractFilters', () => {
    beforeEach(() => aiChatMock.mockReset());

    it('passes a well-formed extraction through unchanged', async () => {
        modelReturns({
            cityIds: ['athens'],
            dateRange: { start: '2026-01-01', end: '2026-02-01' },
            locationName: 'Άργος',
        });

        expect(await extractFilters('σχολεία Άργους', 'greece')).toEqual({
            cityIds: ['athens'],
            dateRange: { start: '2026-01-01', end: '2026-02-01' },
            locationName: 'Άργος',
        });
    });

    // Regression: buildSearchQuery reads locationName as a string, and it runs
    // outside the try/catch blocks that keep a failed extraction non-fatal, so a
    // non-string here returned a 500 (and a Discord alert) for a query the
    // lexical clauses could answer.
    it('drops a locationName that is not a string', async () => {
        modelReturns({ cityIds: null, dateRange: null, locationName: ['Άργος'] });

        expect((await extractFilters('πάρκα', 'greece')).locationName).toBeNull();
    });

    // One bad field must not cost the extraction its good ones.
    it('keeps the fields that are well formed when one is not', async () => {
        modelReturns({
            cityIds: ['athens'],
            dateRange: 'last month',
            locationName: 42,
        });

        expect(await extractFilters('τελευταία συνεδρίαση', 'greece')).toEqual({
            cityIds: ['athens'],
            dateRange: null,
            locationName: null,
        });
    });

    it.each([null, 'not json at all', [], 7])(
        'falls back to no filters when the response is %p',
        async (result) => {
            modelReturns(result);

            expect(await extractFilters('πάρκα', 'greece')).toEqual(NO_EXTRACTED_FILTERS);
        }
    );

    it('fills in the fields the model left out', async () => {
        modelReturns({ locationName: 'Άργος' });

        expect(await extractFilters('Άργος', 'greece')).toEqual({
            ...NO_EXTRACTED_FILTERS,
            locationName: 'Άργος',
        });
    });
});

describe('processFilters', () => {
    const getCityMock = getCity as jest.MockedFunction<typeof getCity>;
    const suggestionsMock = getPlaceSuggestions as jest.MockedFunction<typeof getPlaceSuggestions>;
    const detailsMock = getPlaceDetails as jest.MockedFunction<typeof getPlaceDetails>;
    const filterByRealmMock = filterCityIdsByRealm as jest.MockedFunction<typeof filterCityIdsByRealm>;

    beforeEach(() => {
        jest.clearAllMocks();
        filterByRealmMock.mockImplementation(async (ids: string[]) => ids);
        getCityMock.mockImplementation(async (id: string) => ({
            id,
            name: id,
            geometry: { type: 'Point', coordinates: [0, 0] },
        }) as never);
        suggestionsMock.mockResolvedValue({ data: [{ placeId: 'p1' }], error: null } as never);
        detailsMock.mockResolvedValue({ coordinates: [23.7, 37.9] } as never);
    });

    const withLocation = (cityIds: string[] | null) => ({
        ...NO_EXTRACTED_FILTERS,
        cityIds,
        locationName: 'Πλατεία Συντάγματος',
    });

    // Each candidate costs a geometry read and two Google Places requests, so
    // the fan-out has to follow the search's own scope rather than the realm's.
    it('geocodes only against the cities the search covers', async () => {
        await processFilters(withLocation(null), 'greece', ['athens']);

        expect(getCityMock).toHaveBeenCalledTimes(1);
        expect(getCityMock).toHaveBeenCalledWith('athens', expect.anything());
    });

    it('geocodes against every candidate when the search covers the realm', async () => {
        await processFilters(withLocation(null), 'greece', ['athens', 'chania', 'argos']);

        expect(getCityMock).toHaveBeenCalledTimes(3);
    });

    it('prefers a city the query named over the candidates', async () => {
        await processFilters(withLocation(['chania']), 'greece', ['athens', 'argos']);

        expect(getCityMock).toHaveBeenCalledTimes(1);
        expect(getCityMock).toHaveBeenCalledWith('chania', expect.anything());
    });

    it('geocodes nothing when the query names no place', async () => {
        const result = await processFilters(NO_EXTRACTED_FILTERS, 'greece', ['athens']);

        expect(getCityMock).not.toHaveBeenCalled();
        expect(result.locations).toBeUndefined();
    });
});
