import { saveNotificationPreferencesSchema, savePetitionSchema } from '../onboarding';

const base = {
    cityId: 'athens',
    locations: [{ text: 'Κυψέλη', coordinates: [23.73, 37.99] as [number, number] }],
    topicIds: ['t1'],
};

describe('saveNotificationPreferencesSchema channel consent', () => {
    it('carries both channel flags when the signup sends them', () => {
        const result = saveNotificationPreferencesSchema.safeParse({
            ...base,
            notifyByPhone: true,
            notifyByEmail: false,
        });
        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({ notifyByPhone: true, notifyByEmail: false });
    });

    it('leaves the flags absent for an older caller, so the row keeps its defaults', () => {
        const result = saveNotificationPreferencesSchema.safeParse(base);
        expect(result.success).toBe(true);
        expect(result.data).not.toHaveProperty('notifyByPhone');
        expect(result.data).not.toHaveProperty('notifyByEmail');
    });

    it('rejects a flag that is not a boolean', () => {
        expect(saveNotificationPreferencesSchema.safeParse({ ...base, notifyByPhone: 'yes' }).success).toBe(false);
    });
});

describe('savePetitionSchema other relation', () => {
    const petition = { cityId: 'rhodes', isResident: false, isCitizen: false };

    it('takes the reader’s words, trimmed, and null to clear them', () => {
        expect(savePetitionSchema.safeParse({ ...petition, otherRelation: ' Είμαι παραθεριστής ' }).data).toMatchObject({
            otherRelation: 'Είμαι παραθεριστής',
        });
        expect(savePetitionSchema.safeParse({ ...petition, otherRelation: null }).success).toBe(true);
        expect(savePetitionSchema.safeParse(petition).data).not.toHaveProperty('otherRelation');
    });

    it('refuses an essay', () => {
        expect(savePetitionSchema.safeParse({ ...petition, otherRelation: 'α'.repeat(121) }).success).toBe(false);
    });
});
