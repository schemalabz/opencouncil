/** @jest-environment node */
jest.mock('@/env.mjs', () => ({
    env: {
        NEXTAUTH_URL: 'https://opencouncil.gr',
        NEXTAUTH_SECRET: 'test-secret-do-not-use-in-prod',
    },
}));

import { generateSmsContent } from '../content';

type NotificationData = Parameters<typeof generateSmsContent>[0];

const baseNotification = (subjects: NotificationData['subjects']): NotificationData => ({
    id: 'notif-1',
    userId: 'user-1',
    cityId: 'city-1',
    type: 'beforeMeeting',
    subjects,
    meeting: {
        dateTime: new Date('2026-04-20T10:00:00Z'),
        administrativeBody: { name: 'Δημοτικό Συμβούλιο' },
    },
    city: { name_municipality: 'Χανιά' },
});

describe('generateSmsContent', () => {
    it('produces a meeting announcement (no subject count) when there are no subjects', async () => {
        const sms = await generateSmsContent(baseNotification([]));

        // Issue #308: announcement-only SMS must not claim "0 νέα θέματα".
        expect(sms).not.toContain('νέα θέματα');
        expect(sms).toContain('Χανιά');
        expect(sms).toContain('Δημοτικό Συμβούλιο');
        expect(sms).toContain('https://opencouncil.gr/el/notifications/notif-1');
    });

    it('still lists subjects and the count for a meeting with subjects', async () => {
        const sms = await generateSmsContent(
            baseNotification([
                { id: 's1', name: 'Θέμα Α', description: 'desc', topic: null },
                { id: 's2', name: 'Θέμα Β', description: 'desc', topic: null },
            ])
        );

        expect(sms).toContain('2 νέα θέματα');
        expect(sms).toContain('Θέμα Α');
        expect(sms).toContain('Θέμα Β');
    });
});
