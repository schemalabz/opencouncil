import { partyFormSchema } from '../party';

const validParty = {
    name: 'Λαϊκή Συσπείρωση',
    name_en: 'Laiki Syspirosi',
    name_short: 'ΛΑΣ',
    name_short_en: 'LAS',
    colorHex: '#D32F2F',
};

describe('partyFormSchema', () => {
    it('accepts a valid party', () => {
        expect(partyFormSchema.safeParse(validParty).success).toBe(true);
    });

    it.each(['D32F2F', '#FFF', 'red', '#D32F2G'])('rejects the color %s', (colorHex) => {
        expect(partyFormSchema.safeParse({ ...validParty, colorHex }).success).toBe(false);
    });

    it('rejects a name shorter than 2 characters', () => {
        expect(partyFormSchema.safeParse({ ...validParty, name_short: 'Λ' }).success).toBe(false);
    });
});
