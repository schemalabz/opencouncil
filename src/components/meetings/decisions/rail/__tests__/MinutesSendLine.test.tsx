import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import { MinutesSendLine } from '../MinutesSendLine';
import type { DocumentState } from '@/lib/documents/status';
import elAdmin from '../../../../../../messages/el/admin.json';

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock('@/lib/actions/documentSends', () => ({ previewDocumentSend: jest.fn(), sendDocumentNow: jest.fn() }));
// The strip is a styled div; a test id makes the back-of-house wrapper visible to the test
jest.mock('@/components/admin/AdminStrip', () => ({
    ...jest.requireActual('@/components/admin/AdminStrip'),
    AdminStrip: ({ children }: { children: ReactNode }) => <div data-testid="admin-strip">{children}</div>,
}));

const minutes: DocumentState = {
    state: 'sentIncomplete',
    missingCount: 3,
    recipientEmails: ['grammateia@example.gr', 'cc@example.gr'],
    sentAt: new Date('2026-10-11T07:00:00Z'),
    trigger: 'threshold',
    waitReason: null,
    dueAt: null,
    failureReason: null,
    earlierSentAt: null,
};

const sendButton = { name: 'Αποστολή στη γραμματεία' };

function renderLine(overrides: Partial<DocumentState> = {}, { isSuperAdmin = true, timezone = 'Europe/Athens' } = {}) {
    return render(
        <NextIntlClientProvider locale="el" messages={{ admin: elAdmin } as AbstractIntlMessages}>
            <MinutesSendLine minutes={{ ...minutes, ...overrides }} cityId="athens" meetingId="oct10_2026" timezone={timezone} isSuperAdmin={isSuperAdmin} />
        </NextIntlClientProvider>,
    );
}

describe('MinutesSendLine', () => {
    it('states the last send, provisional, with its date, its To address and the missing count', () => {
        renderLine();
        expect(screen.getByText('Πρακτικά: στάλθηκαν πρόχειρα στις 11/10/2026 σε grammateia@example.gr, 3 θέματα χωρίς απόφαση.')).toBeInTheDocument();
    });

    it('offers a superadmin the send, inside the back-of-house strip', () => {
        renderLine();
        const button = screen.getByRole('button', sendButton);
        expect(screen.getByTestId('admin-strip')).toContainElement(button);
    });

    it('offers no send, and no strip, to anyone else', () => {
        renderLine({}, { isSuperAdmin: false });
        expect(screen.getByText(/στάλθηκαν πρόχειρα/)).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        expect(screen.queryByTestId('admin-strip')).not.toBeInTheDocument();
    });

    it('dates the line in the timezone of the city', () => {
        // 22:30 UTC on 11 Oct is 12 Oct in Athens, and still 11 Oct in Montréal
        renderLine({ state: 'sent', sentAt: new Date('2026-10-11T22:30:00Z') }, { timezone: 'America/Toronto' });
        expect(screen.getByText('Πρακτικά: στάλθηκαν στις 11/10/2026 σε grammateia@example.gr.')).toBeInTheDocument();
    });

    it('says when the minutes go out on their own while they wait for decisions', () => {
        renderLine({ state: 'waiting', waitReason: 'decisions', dueAt: new Date('2026-10-14T21:00:00Z'), sentAt: null });
        expect(screen.getByText('Πρακτικά: στέλνονται αυτόματα όταν κάθε θέμα έχει απόφαση, το αργότερο στις 15/10/2026.')).toBeInTheDocument();
    });

    it.each([
        ['review', 'Πρακτικά: στέλνονται αυτόματα όταν ολοκληρωθεί ο έλεγχος της απομαγνητοφώνησης.'],
        ['summarize', 'Πρακτικά: στέλνονται αυτόματα όταν ολοκληρωθεί η σύνοψη της συνεδρίασης.'],
        ['poll', 'Πρακτικά: στέλνονται αυτόματα μετά από έναν ακόμη έλεγχο για τις αποφάσεις τους στη Διαύγεια.'],
        ['agenda', 'Πρακτικά: στέλνονται αυτόματα όταν καταχωριστούν τα θέματα της συνεδρίασης.'],
    ] as const)('says what the minutes wait for: %s', (waitReason, text) => {
        renderLine({ state: 'waiting', waitReason, sentAt: null });
        expect(screen.getByText(text)).toBeInTheDocument();
    });

    it('says that nothing went out', () => {
        renderLine({ state: 'unsent', sentAt: null });
        expect(screen.getByText('Πρακτικά: δεν έχουν σταλεί.')).toBeInTheDocument();
    });

    it('names a failed resend, keeps its raw reason for the hover, and names the earlier delivery', () => {
        renderLine({ state: 'failed', failureReason: 'rate limited', sentAt: null, earlierSentAt: new Date('2026-10-11T07:00:00Z') });
        expect(screen.getByText('Πρακτικά: η τελευταία αποστολή απέτυχε.')).toHaveAttribute('title', 'rate limited');
        expect(screen.getByText('Μια προηγούμενη αποστολή έγινε στις 11/10/2026.')).toBeInTheDocument();
    });

    it('offers no second send while one is in flight', () => {
        renderLine({ state: 'pending', sentAt: null });
        expect(screen.getByText('Πρακτικά: η αποστολή είναι σε εξέλιξη.')).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});
