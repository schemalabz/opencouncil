import { aiChat } from '../ai';
import { cityPopulationJsonSchema, generateCityDataWithAI } from '../cityCreatorAI';

jest.mock('../ai', () => ({ aiChat: jest.fn() }));

const mockedAiChat = aiChat as jest.MockedFunction<typeof aiChat>;

// The shape the model returns: nulls for anything it could not find.
const aiAnswer = () => ({
    cityId: 'testcity',
    parties: [
        { name: 'Λαϊκή Συσπείρωση', name_en: 'Laiki Syspirosi', name_short: 'ΛΑΣ', name_short_en: 'LAS', colorHex: '#d32f2f', logo: null },
    ],
    administrativeBodies: [{ name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council', type: 'council' }],
    people: [{
        name: 'Έφη Σπυροπούλου',
        name_en: 'Efi Spyropoulou',
        name_short: 'Ε. Σπυροπούλου',
        name_short_en: 'E. Spyropoulou',
        image: null,
        activeFrom: null,
        activeTo: null,
        profileUrl: null,
        partyName: null,
        roles: [
            { type: 'adminBody', name: null, name_en: null, isHead: false, partyName: null, administrativeBodyName: 'Δημοτικό Συμβούλιο' },
            { type: 'party', name: null, name_en: null, partyName: 'Λαϊκή Συσπείρωση', administrativeBodyName: null },
            { type: 'city', name: 'Αντιδήμαρχος', name_en: 'Deputy Mayor', startDate: '2023-12-31', endDate: null, electedOrder: null },
        ],
    }],
});

function answer(result: unknown) {
    mockedAiChat.mockResolvedValueOnce({ result, usage: {} } as Awaited<ReturnType<typeof aiChat>>);
}

describe('generateCityDataWithAI', () => {
    beforeEach(() => {
        mockedAiChat.mockReset();
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('accepts a typical answer with nulls for missing data', async () => {
        const result = aiAnswer();
        answer(result);
        const generated = await generateCityDataWithAI('testcity', 'Test City');
        expect(generated.errors).toBeUndefined();
        expect(generated).toMatchObject({ success: true, data: result });
    });

    it('rejects an answer whose shape is wrong, with the path of each issue', async () => {
        answer({ ...aiAnswer(), administrativeBodies: [{ name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council', type: 'parliament' }] });
        const generated = await generateCityDataWithAI('testcity', 'Test City');
        expect(generated.success).toBe(false);
        expect(generated.errors?.[1]).toMatch(/^administrativeBodies\.0\.type: /);
    });

    it('rejects a role that names a party missing from the answer', async () => {
        const result = aiAnswer();
        result.people[0].roles[1].partyName = 'Άγνωστη Παράταξη';
        answer(result);
        const generated = await generateCityDataWithAI('testcity', 'Test City');
        expect(generated.success).toBe(false);
        expect(generated.errors).toContain("Person 1, Role 2: Invalid party reference 'Άγνωστη Παράταξη'");
    });

    it('rejects an answer without a council', async () => {
        answer({ ...aiAnswer(), administrativeBodies: [{ name: 'Δημοτική Επιτροπή', name_en: 'Municipal Committee', type: 'committee' }], people: [] });
        const generated = await generateCityDataWithAI('testcity', 'Test City');
        expect(generated.errors).toEqual(expect.arrayContaining([
            'Must have at least one council-type administrative body',
            'Must have at least one person',
        ]));
    });
});

describe('cityPopulationJsonSchema', () => {
    it('gives the model the role fields of the city import', () => {
        const json = JSON.stringify(cityPopulationJsonSchema());
        for (const field of ['partyName', 'administrativeBodyName', 'isHead', 'colorHex', 'startDate', 'endDate', 'electedOrder']) {
            expect(json).toContain(`"${field}"`);
        }
        expect(json).toContain('^#[0-9a-fA-F]{6}$');
    });

    it('puts the schema in the prompt', async () => {
        answer(aiAnswer());
        await generateCityDataWithAI('testcity', 'Test City');
        const systemPrompt = mockedAiChat.mock.calls[0][0];
        expect(systemPrompt).toContain(JSON.stringify(cityPopulationJsonSchema(), null, 2));
    });
});
