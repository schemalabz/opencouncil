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
