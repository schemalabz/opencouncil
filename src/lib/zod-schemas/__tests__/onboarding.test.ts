import { saveNotificationPreferencesSchema } from '../onboarding';

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
