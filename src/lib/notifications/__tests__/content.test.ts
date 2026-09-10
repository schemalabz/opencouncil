/** @jest-environment node */
jest.mock('@/env.mjs', () => ({
    env: {
        NEXTAUTH_SECRET: 'test-secret-do-not-use-in-prod',
        NEXTAUTH_URL: 'https://opencouncil.gr',
    },
}));

jest.mock('@react-email/render', () => ({ render: jest.fn().mockResolvedValue('<html/>') }));
const notificationEmail = jest.fn().mockReturnValue(null);
jest.mock('@/lib/email/templates/NotificationEmail', () => ({
    NotificationEmail: (props: unknown) => notificationEmail(props),
}));

import { generateSmsContent, generateEmailContent } from '../content';

const notification = {
    id: 'n-1',
    userId: 'u-1',
    cityId: 'rennes',
    type: 'beforeMeeting' as const,
    subjects: [{ id: 's-1', name: 'Budget', description: 'Budget 2026' }],
    meeting: { dateTime: new Date('2026-09-08T18:00:00Z'), administrativeBody: { name: 'Conseil' } },
    city: { name_municipality: 'Rennes', realm: 'france' as const },
};

describe('generateSmsContent', () => {
    it("links to the city realm's domain, in that realm's language", async () => {
        expect(await generateSmsContent(notification))
            .toContain('https://opencouncil.fr/fr/notifications/n-1');
    });

    it('keeps a Greek city on the Greek domain', async () => {
        const greek = { ...notification, cityId: 'athens', city: { ...notification.city, realm: 'greece' as const } };
        expect(await generateSmsContent(greek))
            .toContain('https://opencouncil.gr/el/notifications/n-1');
    });
});

describe('generateEmailContent', () => {
    /** The props handed to the email template for `notification`. */
    const propsFor = async (n: Parameters<typeof generateEmailContent>[0]) => {
        notificationEmail.mockClear();
        await generateEmailContent(n);
        return notificationEmail.mock.calls[0][0] as { notificationUrl: string; unsubscribeUrl: string };
    };

    it("links to the city realm's domain, in that realm's language", async () => {
        const props = await propsFor(notification);
        expect(props.notificationUrl).toBe('https://opencouncil.fr/fr/notifications/n-1');
        expect(props.unsubscribeUrl.startsWith('https://opencouncil.fr/fr/unsubscribe?token=')).toBe(true);
    });

    it('keeps a Greek city on the Greek domain', async () => {
        const greek = { ...notification, cityId: 'athens', city: { ...notification.city, realm: 'greece' as const } };
        const props = await propsFor(greek);
        expect(props.notificationUrl).toBe('https://opencouncil.gr/el/notifications/n-1');
        expect(props.unsubscribeUrl.startsWith('https://opencouncil.gr/el/unsubscribe?token=')).toBe(true);
    });
});
