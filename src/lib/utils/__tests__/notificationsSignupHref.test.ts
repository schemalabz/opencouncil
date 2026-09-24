import { notificationsSignupHref } from '../notificationsSignupHref';

describe('notificationsSignupHref', () => {
    it("leads to the municipality's signup when it offers notifications", () => {
        expect(notificationsSignupHref({ id: 'athens', supportsNotifications: true })).toBe('/athens/notifications');
    });

    it('leads to the picker without a municipality, or for one without notifications', () => {
        expect(notificationsSignupHref()).toBe('/notifications');
        expect(notificationsSignupHref(null)).toBe('/notifications');
        expect(notificationsSignupHref({ id: 'nis', supportsNotifications: false })).toBe('/notifications');
    });
});
