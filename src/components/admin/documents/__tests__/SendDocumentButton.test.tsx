import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import { SendDocumentButton } from '../SendDocumentButton';
import enAdmin from '../../../../../messages/en/admin.json';

const mockRefresh = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }));
const mockPreview = jest.fn();
const mockSendNow = jest.fn();
jest.mock('@/lib/actions/documentSends', () => ({
    previewDocumentSend: (...a: unknown[]) => mockPreview(...a),
    sendDocumentNow: (...a: unknown[]) => mockSendNow(...a),
}));

function renderButton() {
    return render(
        <NextIntlClientProvider locale="en" messages={{ admin: enAdmin } as AbstractIntlMessages}>
            <SendDocumentButton cityId="athens" meetingId="oct10_2026" kind="minutes" isSent={false} />
        </NextIntlClientProvider>,
    );
}

async function openDialog() {
    renderButton();
    await userEvent.click(screen.getByRole('button', { name: 'Send now' }));
    return screen.findByRole('dialog');
}

beforeEach(() => {
    jest.clearAllMocks();
    mockPreview.mockResolvedValue({ recipientEmails: ['clerk@example.org', 'cc@example.org'], readiness: { state: 'complete' } });
    mockSendNow.mockResolvedValue({ success: true });
});

describe('SendDocumentButton', () => {
    it('shows the loader, not "not covered", until the preview arrives', async () => {
        let resolve: (value: unknown) => void = () => {};
        mockPreview.mockReturnValue(new Promise(r => { resolve = r; }));
        const dialog = await openDialog();
        expect(within(dialog).queryByText(enAdmin.documentSend.notCovered)).not.toBeInTheDocument();
        expect(within(dialog).getByRole('button', { name: 'Send' })).toBeDisabled();
        resolve({ recipientEmails: ['clerk@example.org'], readiness: { state: 'complete' } });
        expect(await within(dialog).findByText('clerk@example.org')).toBeInTheDocument();
        expect(mockPreview).toHaveBeenCalledWith('athens', 'oct10_2026', 'minutes');
    });

    it('says the minutes go out provisional, with the count', async () => {
        mockPreview.mockResolvedValue({ recipientEmails: ['clerk@example.org'], readiness: { state: 'incomplete', missingSubjectIds: ['s1', 's2'] } });
        const dialog = await openDialog();
        expect(await within(dialog).findByText('Provisional: 2 subjects have no decision yet.')).toBeInTheDocument();
        expect(within(dialog).getByRole('button', { name: 'Send' })).toBeEnabled();
    });

    it('says why the minutes cannot go out, and does not offer the send', async () => {
        mockPreview.mockResolvedValue({ recipientEmails: ['clerk@example.org'], readiness: { state: 'wait', reason: 'summarize', dueAt: null } });
        const dialog = await openDialog();
        expect(await within(dialog).findByText(enAdmin.documentSend.refusal.summarize)).toBeInTheDocument();
        expect(within(dialog).getByRole('button', { name: 'Send' })).toBeDisabled();
    });

    it('shows a refusal of the send inside the dialog, in words, and keeps the dialog open', async () => {
        mockSendNow.mockResolvedValue({ success: false, refusal: 'review', error: 'The minutes cannot go out now (review)' });
        const dialog = await openDialog();
        await userEvent.click(await within(dialog).findByRole('button', { name: 'Send' }));
        expect(await within(dialog).findByText(enAdmin.documentSend.refusal.review)).toBeInTheDocument();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(mockSendNow).toHaveBeenCalledWith('athens', 'oct10_2026', 'minutes');
    });

    it('shows a failed send as failed inside the dialog', async () => {
        mockSendNow.mockResolvedValue({ success: false, error: 'rate limited' });
        const dialog = await openDialog();
        await userEvent.click(await within(dialog).findByRole('button', { name: 'Send' }));
        expect(await within(dialog).findByText(enAdmin.documentSend.failed)).toBeInTheDocument();
    });

    it('closes the dialog and refreshes the page after a send', async () => {
        const dialog = await openDialog();
        await userEvent.click(await within(dialog).findByRole('button', { name: 'Send' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(mockRefresh).toHaveBeenCalled();
    });
});
