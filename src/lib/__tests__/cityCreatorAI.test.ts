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

    it('returns an answer that breaks field rules, with a warning for each field', async () => {
        const result = aiAnswer();
        result.parties[0].name_short = 'Λ';
        result.parties[0].colorHex = 'red';
        result.people[0].name_short_en = '';
        answer(result);
        const generated = await generateCityDataWithAI('testcity', 'Test City');
        expect(generated).toMatchObject({ success: true, data: result });
        expect(generated.warnings).toEqual([
            'parties.0.name_short: Short name must be at least 2 characters.',
            'parties.0.colorHex: Color must be a hex code such as #1A73E8.',
            'people.0.name_short_en: Short name (English) must be at least 2 characters.',
        ]);
    });

    it('sets a link that is not http(s) to null and keeps the answer, with a warning for each link', async () => {
        const result = aiAnswer();
        (result.parties[0] as Record<string, unknown>).logo = 'www.x.gr/logo.png';
        (result.people[0] as Record<string, unknown>).image = 'www.x.gr/a.jpg';
        (result.people[0] as Record<string, unknown>).profileUrl = 'https://www.x.gr/people/1';
        answer(result);
        const generated = await generateCityDataWithAI('testcity', 'Test City');
        expect(generated.success).toBe(true);
        expect(generated.data.parties[0].logo).toBeNull();
        expect(generated.data.people[0].image).toBeNull();
        expect(generated.data.people[0].profileUrl).toBe('https://www.x.gr/people/1');
        expect(generated.warnings).toEqual([
            'parties.0.logo: "www.x.gr/logo.png" is not an http(s) URL, so it was removed.',
            'people.0.image: "www.x.gr/a.jpg" is not an http(s) URL, so it was removed.',
        ]);
    });

    it('tells the model that a link is an absolute http(s) URL or null', async () => {
        answer(aiAnswer());
        await generateCityDataWithAI('testcity', 'Test City');
        expect(mockedAiChat.mock.calls[0][0]).toContain('must be absolute http(s) URLs');
    });

    it('has no warnings for a valid answer', async () => {
        answer(aiAnswer());
        expect((await generateCityDataWithAI('testcity', 'Test City')).warnings).toBeUndefined();
    });

    // The editor has no date field, so a person could not fix these.
    it.each([
        ['a role date without a time zone', { endDate: '2026-09-24T21:00:00' }],
        ['role dates out of order', { startDate: '2026-09-25', endDate: '2026-09-24' }],
    ])('rejects %s', async (_, dates) => {
        const result = aiAnswer();
        Object.assign(result.people[0].roles[2], dates);
        answer(result);
        const generated = await generateCityDataWithAI('testcity', 'Test City');
        expect(generated.success).toBe(false);
        expect(generated.errors?.[1]).toMatch(/^people\.0\.roles\.2\.endDate: /);
    });

    it('rejects an answer with a missing name', async () => {
        const result = aiAnswer();
        const { name_en: _missing, ...person } = result.people[0];
        answer({ ...result, people: [person] });
        const generated = await generateCityDataWithAI('testcity', 'Test City');
        expect(generated.success).toBe(false);
        expect(generated.errors?.[1]).toMatch(/^people\.0\.name_en: /);
    });

    it('still applies the business rules to an answer with warnings', async () => {
        const result = aiAnswer();
        result.parties[0].name_short = 'Λ';
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
