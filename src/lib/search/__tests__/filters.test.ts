// filters.ts reaches the model, the database and Google Maps at module scope.
// Only the AI call matters here: these cases feed extractFilters a raw model
// response and assert what survives the boundary.
jest.mock('@/env.mjs', () => ({ env: {} }));
jest.mock('@/lib/ai', () => ({ aiChat: jest.fn() }));
jest.mock('@/lib/db/cities', () => ({
    getCities: jest.fn().mockResolvedValue([]),
    getCity: jest.fn(),
}));
jest.mock('@/lib/google-maps', () => ({
    getPlaceSuggestions: jest.fn(),
    getPlaceDetails: jest.fn(),
}));

import { aiChat } from '@/lib/ai';
import { extractFilters, NO_EXTRACTED_FILTERS } from '../filters';

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
            isLatest: null,
            locationName: 'Άργος',
        });

        expect(await extractFilters('σχολεία Άργους')).toEqual({
            cityIds: ['athens'],
            dateRange: { start: '2026-01-01', end: '2026-02-01' },
            isLatest: null,
            locationName: 'Άργος',
        });
    });

    // Regression: buildSearchQuery reads locationName as a string, and it runs
    // outside the try/catch blocks that keep a failed extraction non-fatal, so a
    // non-string here returned a 500 (and a Discord alert) for a query the
    // lexical clauses could answer.
    it('drops a locationName that is not a string', async () => {
        modelReturns({ cityIds: null, dateRange: null, isLatest: null, locationName: ['Άργος'] });

        expect((await extractFilters('πάρκα')).locationName).toBeNull();
    });

    // One bad field must not cost the extraction its good ones.
    it('keeps the fields that are well formed when one is not', async () => {
        modelReturns({
            cityIds: ['athens'],
            dateRange: 'last month',
            isLatest: true,
            locationName: 42,
        });

        expect(await extractFilters('τελευταία συνεδρίαση')).toEqual({
            cityIds: ['athens'],
            dateRange: null,
            isLatest: true,
            locationName: null,
        });
    });

    it.each([null, 'not json at all', [], 7])(
        'falls back to no filters when the response is %p',
        async (result) => {
            modelReturns(result);

            expect(await extractFilters('πάρκα')).toEqual(NO_EXTRACTED_FILTERS);
        }
    );

    it('fills in the fields the model left out', async () => {
        modelReturns({ locationName: 'Άργος' });

        expect(await extractFilters('Άργος')).toEqual({
            ...NO_EXTRACTED_FILTERS,
            locationName: 'Άργος',
        });
    });
});
