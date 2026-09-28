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
});
