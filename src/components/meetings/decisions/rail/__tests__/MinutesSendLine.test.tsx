import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import { MinutesSendLine } from '../MinutesSendLine';
import type { DocumentState } from '@/lib/documents/status';
import elAdmin from '../../../../../../messages/el/admin.json';

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock('@/lib/actions/documentSends', () => ({ previewDocumentSend: jest.fn(), sendDocumentNow: jest.fn() }));

const minutes: DocumentState = {
    document: 'minutes',
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

function renderLine(overrides: Partial<DocumentState> = {}) {
    return render(
        <NextIntlClientProvider locale="el" messages={{ admin: elAdmin } as AbstractIntlMessages}>
            <MinutesSendLine minutes={{ ...minutes, ...overrides }} cityId="athens" meetingId="oct10_2026" timezone="Europe/Athens" />
        </NextIntlClientProvider>,
    );
}

describe('MinutesSendLine', () => {
    it('states the last send, provisional, with its date, its To address and the missing count, and offers a send', () => {
        renderLine();
        expect(screen.getByText('Πρακτικά: στάλθηκαν πρόχειρα στις 11/10/2026 σε grammateia@example.gr, 3 θέματα χωρίς απόφαση.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Αποστολή στη γραμματεία' })).toBeInTheDocument();
    });

    it('says when the minutes go out on their own while they wait for decisions', () => {
        renderLine({ state: 'waiting', waitReason: 'decisions', dueAt: new Date('2026-10-14T21:00:00Z'), sentAt: null });
        expect(screen.getByText('Πρακτικά: στέλνονται αυτόματα όταν κάθε θέμα έχει απόφαση, το αργότερο στις 15/10/2026.')).toBeInTheDocument();
    });

    it('says that nothing went out', () => {
        renderLine({ state: 'unsent', sentAt: null });
        expect(screen.getByText('Πρακτικά: δεν έχουν σταλεί.')).toBeInTheDocument();
    });

    it('names a failed resend and the earlier delivery', () => {
        renderLine({ state: 'failed', failureReason: 'rate limited', sentAt: null, earlierSentAt: new Date('2026-10-11T07:00:00Z') });
        expect(screen.getByText('Πρακτικά: η τελευταία αποστολή απέτυχε (rate limited).')).toBeInTheDocument();
        expect(screen.getByText('Μια προηγούμενη αποστολή έγινε στις 11/10/2026.')).toBeInTheDocument();
    });

    it('offers no second send while one is in flight', () => {
        renderLine({ state: 'pending', sentAt: null });
        expect(screen.getByText('Πρακτικά: η αποστολή είναι σε εξέλιξη.')).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});
