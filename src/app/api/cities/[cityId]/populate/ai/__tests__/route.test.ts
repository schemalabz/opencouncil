/** @jest-environment node */

jest.mock('@/lib/auth', () => ({
    getCurrentUser: jest.fn().mockResolvedValue({ isSuperAdmin: true }),
}));
jest.mock('@/lib/db/cities', () => ({
    canUseCityCreator: jest.fn().mockResolvedValue(true),
    getCity: jest.fn().mockResolvedValue({ id: 'athens', name: 'Αθήνα', language: 'el' }),
}));
jest.mock('@/lib/cityCreatorAI', () => ({
    generateCityDataWithAI: jest.fn().mockResolvedValue({
        success: true,
        data: { cityId: 'athens', parties: [], administrativeBodies: [], people: [] },
        warnings: [],
        usage: {},
    }),
}));

import { POST } from '@/app/api/cities/[cityId]/populate/ai/route';
import { generateCityDataWithAI } from '@/lib/cityCreatorAI';

function post(body: string) {
    return POST(
        new Request('http://localhost/api/cities/athens/populate/ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        }) as Parameters<typeof POST>[0],
        { params: Promise.resolve({ cityId: 'athens' }) },
    );
}

describe('POST /api/cities/[cityId]/populate/ai', () => {
    beforeEach(() => jest.clearAllMocks());

    it.each([
        ['a userProvidedText that is not a string', JSON.stringify({ userProvidedText: 42 })],
        ['a body that is not an object', JSON.stringify('text')],
        ['a body that is not JSON', 'not json'],
    ])('answers 400 ValidationError for %s and does not call the model', async (_, body) => {
        const response = await post(body);

        expect(response.status).toBe(400);
        const json = await response.json();
        expect(Array.isArray(json.error)).toBe(true);
        expect(json.error[0]).toEqual(expect.objectContaining({ code: expect.any(String), path: expect.any(Array) }));
        expect(generateCityDataWithAI).not.toHaveBeenCalled();
    });

    // What CityCreator.tsx sends: the trimmed text, or no text at all.
    it.each([
        [{ userProvidedText: '  Αποτελέσματα εκλογών  ' }, 'Αποτελέσματα εκλογών'],
        [{ userProvidedText: '   ' }, undefined],
        [{}, undefined],
    ])('streams the result for %j', async (body, expectedText) => {
        const response = await post(JSON.stringify(body));

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('text/event-stream');
        const events = await response.text();
        expect(events).toContain('"type":"complete"');
        expect(generateCityDataWithAI).toHaveBeenCalledWith('athens', 'Αθήνα', expect.objectContaining({
            userProvidedText: expectedText,
        }));
    });
});
