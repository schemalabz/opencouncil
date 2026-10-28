import { cityPopulationSchema } from '../cityPopulation';

const payload = (role: Record<string, unknown>) => ({
    cityId: 'test-city',
    parties: [],
    administrativeBodies: [{ name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council', type: 'council' }],
    people: [{
        name: 'Μαρία Παπαδοπούλου',
        name_en: 'Maria Papadopoulou',
        name_short: 'Μ. Παπαδοπούλου',
        name_short_en: 'M. Papadopoulou',
        roles: [{ type: 'adminBody', administrativeBodyName: 'Δημοτικό Συμβούλιο', ...role }],
    }],
});

const parsedRole = (role: Record<string, unknown>) =>
    cityPopulationSchema.parse(payload(role)).people[0].roles?.[0];

describe('cityPopulationSchema', () => {
    it('turns a blank role title into no title', () => {
        expect(parsedRole({ name: '  ', name_en: '' })).toMatchObject({ name: null, name_en: null });
    });

    it('applies the field rules of a party', () => {
        const withParty = (colorHex: string) => ({
            ...payload({}),
            parties: [{ name: 'Party', name_en: 'Party', name_short: 'PA', name_short_en: 'PA', colorHex }],
        });
        expect(cityPopulationSchema.safeParse(withParty('#123456')).success).toBe(true);
        expect(cityPopulationSchema.safeParse(withParty('red')).success).toBe(false);
    });

    it('accepts the Diavgeia units of a body and rejects a malformed entry', () => {
        const withUnits = (diavgeiaUnitIds: string[]) => ({
            ...payload({}),
            administrativeBodies: [{ name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council', type: 'council', diavgeiaUnitIds }],
        });
        expect(cityPopulationSchema.parse(withUnits(['83734', '84655:100010590'])).administrativeBodies[0].diavgeiaUnitIds)
            .toEqual(['83734', '84655:100010590']);
        expect(cityPopulationSchema.safeParse(withUnits(['1:2:3'])).success).toBe(false);
        expect(cityPopulationSchema.safeParse(withUnits(['83734,100086486'])).success).toBe(false);
        expect(cityPopulationSchema.safeParse(withUnits(['83734:'])).success).toBe(false);
        // null means none: a payload can write null for a missing value.
        expect(cityPopulationSchema.safeParse({ ...withUnits([]), administrativeBodies: [{ name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council', type: 'council', diavgeiaUnitIds: null, youtubeChannelUrl: null }] }).success).toBe(true);
        expect(cityPopulationSchema.safeParse(withUnits([' '])).success).toBe(false);
    });

    it('accepts a YouTube channel that livestream polling can resolve, and nothing else', () => {
        const withChannel = (youtubeChannelUrl: string) => ({
            ...payload({}),
            administrativeBodies: [{ name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council', type: 'council', youtubeChannelUrl }],
        });
        expect(cityPopulationSchema.safeParse(withChannel('https://www.youtube.com/channel/UCug6tnPtrpJoo38gIRb_OPg')).success).toBe(true);
        expect(cityPopulationSchema.safeParse(withChannel('https://www.youtube.com/@trikalacity')).success).toBe(true);
        expect(cityPopulationSchema.safeParse(withChannel('https://www.youtube.com/watch?v=s0moUuyQbHA')).success).toBe(false);
        expect(cityPopulationSchema.safeParse(withChannel('https://example.com/@trikalacity')).success).toBe(false);
    });

    it('rejects a city without an administrative body', () => {
        const result = cityPopulationSchema.safeParse({ ...payload({}), administrativeBodies: [], people: [] });
        expect(result.success).toBe(false);
    });
});

describe('cityPopulationSchema role dates and elected order', () => {
    it('keeps the dates and the elected order of a role', () => {
        expect(parsedRole({ startDate: '2023-12-31', endDate: '2026-09-24T21:00:00.000Z', electedOrder: 3 })).toMatchObject({
            startDate: new Date('2023-12-31T00:00:00.000Z'),
            endDate: new Date('2026-09-24T21:00:00.000Z'),
            electedOrder: 3,
        });
    });

    it('accepts an end date without a start date', () => {
        expect(parsedRole({ endDate: '2026-09-25' })).toMatchObject({ startDate: null, endDate: new Date('2026-09-25T00:00:00.000Z') });
    });

    it('treats missing dates and elected order as unknown', () => {
        expect(parsedRole({})).toMatchObject({ startDate: null, endDate: null });
        expect(parsedRole({ electedOrder: null })).toMatchObject({ electedOrder: null });
    });

    it('rejects an end date before the start date', () => {
        const result = cityPopulationSchema.safeParse(payload({ startDate: '2026-09-25', endDate: '2026-09-24' }));
        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toEqual(['people', 0, 'roles', 0, 'endDate']);
        expect(result.error?.issues[0].message).toBe('The end date must not be before the start date.');
    });

    it('rejects a date-time without a time zone, which would parse in the server zone', () => {
        expect(cityPopulationSchema.safeParse(payload({ endDate: '2026-09-24T21:00:00' })).success).toBe(false);
    });

    it('rejects a negative or fractional elected order', () => {
        expect(cityPopulationSchema.safeParse(payload({ electedOrder: -1 })).success).toBe(false);
        expect(cityPopulationSchema.safeParse(payload({ electedOrder: 1.5 })).success).toBe(false);
    });
});

describe('cityPopulationSchema role references', () => {
    it('refuses each role whose party or body is not in the payload, at the field that names it', () => {
        const body = payload({ administrativeBodyName: 'Δημοτική Επιτροπή' });
        body.parties = [{ name: 'Party', name_en: 'Party', name_short: 'PA', name_short_en: 'PA', colorHex: '#123456' }] as never[];
        body.people[0].roles.push({ type: 'party', partyName: 'Other' } as never);
        const result = cityPopulationSchema.safeParse(body);
        expect(result.success).toBe(false);
        expect(result.error?.issues.map(i => [i.path.join('.'), i.message])).toEqual([
            ['people.0.roles.0.administrativeBodyName', expect.stringContaining('adminBody role names the unknown body "Δημοτική Επιτροπή"')],
            ['people.0.roles.1.partyName', expect.stringContaining('party role names the unknown party "Other"')],
        ]);
    });

    it('accepts a payload whose every name matches', () => {
        expect(cityPopulationSchema.safeParse(payload({})).success).toBe(true);
    });
});

describe('cityPopulationSchema unique names', () => {
    const party = (name: string) => ({ name, name_en: name, name_short: 'PA', name_short_en: 'PA', colorHex: '#123456' });
    const body = (name: string) => ({ name, name_en: name, type: 'council' });

    it('refuses a second party with the same name, at the name of the second one', () => {
        const result = cityPopulationSchema.safeParse({ ...payload({}), parties: [party('Party'), party('Other'), party('Party')] });
        expect(result.success).toBe(false);
        expect(result.error?.issues.map(i => [i.path.join('.'), i.message])).toEqual([
            ['parties.2.name', 'The party name "Party" is also the name of parties[0]. Roles name a party by its `name`, so each party needs a different one.'],
        ]);
    });

    it('refuses a second administrative body with the same name, at the name of the second one', () => {
        const result = cityPopulationSchema.safeParse({ ...payload({}), administrativeBodies: [body('Δημοτικό Συμβούλιο'), body('Δημοτικό Συμβούλιο')] });
        expect(result.success).toBe(false);
        expect(result.error?.issues.map(i => [i.path.join('.'), i.message])).toEqual([
            ['administrativeBodies.1.name', expect.stringContaining('The body name "Δημοτικό Συμβούλιο" is also the name of administrativeBodies[0].')],
        ]);
    });

    it('accepts parties and bodies whose names all differ', () => {
        expect(cityPopulationSchema.safeParse({
            ...payload({}),
            parties: [party('Party'), party('Other')],
            administrativeBodies: [body('Δημοτικό Συμβούλιο'), body('Δημοτική Επιτροπή')],
        }).success).toBe(true);
    });
});

describe('cityPopulationSchema head city roles', () => {
    const person = (name: string, ...roles: Record<string, unknown>[]) => ({
        name, name_en: name, name_short: name, name_short_en: name,
        roles: roles.map(role => ({ type: 'city', isHead: true, name: 'Mayor', name_en: 'Mayor', ...role })),
    });
    const withPeople = (...people: ReturnType<typeof person>[]) => ({ ...payload({}), people });

    it('accepts a mayor who follows an ended mayor, as in the Kraków payload', () => {
        expect(cityPopulationSchema.safeParse(withPeople(
            person('Aleksander Miszalski', { startDate: '2024-05-07', endDate: '2026-05-26' }),
            person('Nowy Prezydent', { startDate: '2026-10-20', endDate: null }),
        )).success).toBe(true);
    });

    it('accepts a mayor who starts on the day the earlier mayor ends', () => {
        expect(cityPopulationSchema.safeParse(withPeople(
            person('Anna Nowak', { startDate: null, endDate: '2026-05-26' }),
            person('Jan Kowalski', { startDate: '2026-05-26', endDate: null }),
        )).success).toBe(true);
    });

    it('refuses two current mayors, at the isHead of the second one', () => {
        const result = cityPopulationSchema.safeParse(withPeople(person('Anna Nowak', {}), person('Jan Kowalski', { startDate: '2026-10-20' })));
        expect(result.success).toBe(false);
        expect(result.error?.issues.map(i => [i.path.join('.'), i.message])).toEqual([
            ['people.1.roles.0.isHead', 'Jan Kowalski: this head city role (2026-10-20T00:00:00.000Z to no end date) holds at the same time as the head city role at people[0].roles[0] of Anna Nowak (no start date to no end date). The app reads every head city role as the mayor. End one role on or before the startDate of the other, or remove isHead from one of them.'],
        ]);
    });

    it('refuses head city roles whose date ranges overlap, also on one person', () => {
        const result = cityPopulationSchema.safeParse(withPeople(
            person('Anna Nowak', { startDate: '2024-01-01', endDate: '2026-06-01' }, { startDate: '2026-05-01', endDate: null }),
        ));
        expect(result.success).toBe(false);
        expect(result.error?.issues.map(i => i.path.join('.'))).toEqual(['people.0.roles.1.isHead']);
    });

    it('ignores city roles without isHead and head roles of a body or a party', () => {
        const body = payload({ isHead: true });
        expect(cityPopulationSchema.safeParse({
            ...body,
            people: [...body.people, person('Anna Nowak', {}), person('Jan Kowalski', { isHead: false }), person('Ewa Lis', { isHead: undefined })],
        }).success).toBe(true);
    });
});
