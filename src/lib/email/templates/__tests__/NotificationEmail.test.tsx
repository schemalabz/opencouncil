/** @jest-environment node */
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NotificationEmail } from '../NotificationEmail';

// Render the template synchronously with react-dom/server to avoid @react-email/render's
// dynamic import (which requires --experimental-vm-modules under Jest). We only assert on
// the visible text branches, which are identical in both renderers.
const render = (element: React.ReactElement) => Promise.resolve(renderToStaticMarkup(element));

const baseProps = {
    type: 'beforeMeeting' as const,
    meetingDate: new Date('2026-04-20T10:00:00Z'),
    administrativeBodyName: 'Δημοτικό Συμβούλιο',
    cityName: 'Χανιά',
    notificationUrl: 'https://opencouncil.gr/el/notifications/notif-1',
    unsubscribeUrl: 'https://opencouncil.gr/el/unsubscribe?token=x',
};

describe('NotificationEmail', () => {
    it('renders an announcement (no subject-list heading) when there are no subjects', async () => {
        const html = await render(NotificationEmail({ ...baseProps, subjects: [] }));

        // Issue #308: announcement email must not show the "topics for you" heading.
        expect(html).not.toContain('Θέματα που σας αφορούν');
        expect(html).toContain('Η ημερήσια διάταξη δεν περιλαμβάνει συγκεκριμένα θέματα');
        expect(html).toContain('Χανιά');
        expect(html).toContain('Δημοτικό Συμβούλιο');
    });

    it('renders the subject list when subjects are present', async () => {
        const html = await render(
            NotificationEmail({
                ...baseProps,
                subjects: [{ id: 's1', name: 'Θέμα Α', description: 'Περιγραφή', topic: null }],
            })
        );

        expect(html).toContain('Θέματα που σας αφορούν');
        expect(html).toContain('Θέμα Α');
        expect(html).not.toContain('Η ημερήσια διάταξη δεν περιλαμβάνει συγκεκριμένα θέματα');
    });
});
