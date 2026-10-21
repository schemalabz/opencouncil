import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import admin from '../../../../../messages/en/admin.json';
import notificationOutcome from '../../../../../messages/en/notificationOutcome.json';
import common from '../../../../../messages/en.json';
import type { ReleaseOutlook } from '@/lib/notifications/meetingNotifications';
import { ReleaseMeetingDialog } from '../ReleaseMeetingDialog';

const mockOutlook = jest.fn();
jest.mock('@/lib/actions/meetings', () => ({ getMeetingReleaseOutlook: (...a: unknown[]) => mockOutlook(...a) }));

function renderDialog(outlook: ReleaseOutlook) {
    mockOutlook.mockResolvedValue(outlook);
    render(
        <NextIntlClientProvider locale="en" messages={{ admin, notificationOutcome, Common: common.Common }}>
            <ReleaseMeetingDialog open onOpenChange={() => {}} cityId="athens" meetingId="m" onConfirm={async () => {}} />
        </NextIntlClientProvider>,
    );
}

const lines = async () => {
    const items = await screen.findAllByRole('listitem');
    return items.map((li) => li.textContent);
};

describe('ReleaseMeetingDialog', () => {
    it('says that an AUTO body emails at once, and that Notis may send', async () => {
        renderDialog({ notis: { phase: 'processAgenda' }, email: { phase: 'processAgenda', outcome: { kind: 'sends' }, recipients: 2 } });
        expect(await lines()).toEqual([
            'Email: 2 subscribers get a notification about the agenda at once.',
            'WhatsApp (Notis): The meeting is eligible for a Notis message about the agenda, if Notis has not sent one already.',
        ]);
    });

    it('says that an APPROVAL body leaves the notification for approval', async () => {
        renderDialog({ notis: { phase: 'summarize' }, email: { phase: 'summarize', outcome: { kind: 'waitsForApproval' }, recipients: 1 } });
        expect((await lines())[0]).toMatch(/^Email: 1 subscriber gets a notification about the summary\. It waits/);
    });

    it('says that no reader gets a new notification when all were notified before', async () => {
        renderDialog({ notis: { phase: 'processAgenda' }, email: { phase: 'processAgenda', outcome: { kind: 'sends' }, recipients: 0 } });
        expect((await lines())[0]).toBe('Email: No subscriber gets a new notification about the agenda.');
    });

    it('gives the reason and the manual way out when the meeting is not news', async () => {
        renderDialog({ notis: { phase: null, reason: 'stale' }, email: { phase: 'summarize', outcome: { kind: 'none', reason: 'stale' }, recipients: 0 } });
        expect(await lines()).toEqual([
            'Email: No notifications: the meeting is more than 15 days old.To notify the subscribers anyway, use the Notifications section of the meeting admin page.',
            'WhatsApp (Notis): No Notis message: the meeting is more than 15 days old.',
        ]);
    });

    it('offers no manual way out for a body with notifications disabled', async () => {
        renderDialog({ notis: { phase: 'processAgenda' }, email: { phase: 'processAgenda', outcome: { kind: 'none', reason: 'disabled' }, recipients: 0 } });
        expect((await lines())[0]).toBe('Email: No notifications: they are disabled for this body.');
    });
});
