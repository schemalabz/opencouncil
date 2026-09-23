import { createElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { VoicePrintConsentControl } from '../VoicePrintConsentControl';
import { recordVoicePrintConsent } from '@/lib/actions/personConsent';

const mockRefresh = jest.fn();
jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, values?: Record<string, string | number>) =>
        values ? `${key} ${Object.values(values).join(' ')}` : key,
    useLocale: () => 'el',
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }));
jest.mock('@/lib/actions/personConsent', () => ({ recordVoicePrintConsent: jest.fn() }));

const mockedRecord = recordVoicePrintConsent as jest.MockedFunction<typeof recordVoicePrintConsent>;
const givenAt = new Date('2026-09-10T10:00:00Z');
const control = (status: Parameters<typeof VoicePrintConsentControl>[0]['status']) =>
    render(createElement(VoicePrintConsentControl, { personId: 'person-1', personName: 'Αδάμ Μπούτζουκας', status }));

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('VoicePrintConsentControl', () => {
    // The label is one noun now, so the border is the only place the row
    // shows the state. These pin it, as the old "yes"/"no" labels did.
    it('marks the trigger when a consent is in force', () => {
        control({ personId: 'person-1', source: 'PERSON', userId: 'user-1', givenAt, user: { name: 'Α. Μ.', email: 'a@example.com' } });
        expect(screen.getByRole('button', { name: 'button' }).className).toContain('border-blue-300');
    });

    it('leaves the trigger plain when no consent is in force', () => {
        control(null);
        expect(screen.getByRole('button', { name: 'button' }).className).not.toContain('border-blue-300');
    });

    it('records a consent for a person with none, then refreshes the page', async () => {
        mockedRecord.mockResolvedValue(undefined);
        control(null);
        fireEvent.click(screen.getByText('button'));
        expect(screen.getByText('none')).toBeTruthy();
        expect(screen.getByText('recordHint')).toBeTruthy();
        fireEvent.click(screen.getByText('record'));
        await waitFor(() => expect(mockedRecord).toHaveBeenCalledWith('person-1', true));
        await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    });

    it('says who recorded a consent and when, and withdraws it', async () => {
        mockedRecord.mockResolvedValue(undefined);
        control({ personId: 'person-1', source: 'ADMIN', userId: 'admin-1', givenAt, user: { name: 'Δ. Λ.', email: 'd@opencouncil.gr' } });
        fireEvent.click(screen.getByText('button'));
        expect(screen.getByText(/^byAdmin .*Δ\. Λ\./)).toBeTruthy();
        fireEvent.click(screen.getByText('withdraw'));
        await waitFor(() => expect(mockedRecord).toHaveBeenCalledWith('person-1', false));
    });

    it('offers to record a paper consent over one given in the app, and to withdraw it', async () => {
        mockedRecord.mockResolvedValue(undefined);
        control({ personId: 'person-1', source: 'PERSON', userId: 'user-1', givenAt, user: { name: 'Α. Μ.', email: 'a@b.gr' } });
        fireEvent.click(screen.getByText('button'));
        expect(screen.getByText(/^byPerson .*Α\. Μ\./)).toBeTruthy();
        expect(screen.getByText('recordHint')).toBeTruthy();
        expect(screen.getByText('withdraw')).toBeTruthy();
        fireEvent.click(screen.getByText('record'));
        await waitFor(() => expect(mockedRecord).toHaveBeenCalledWith('person-1', true));
    });

    it('offers only a withdrawal for a recorded consent', () => {
        control({ personId: 'person-1', source: 'ADMIN', userId: 'admin-1', givenAt, user: null });
        fireEvent.click(screen.getByText('button'));
        expect(screen.getByText(/^byAdmin .*unknownAccount/)).toBeTruthy();
        expect(screen.getByText('withdrawHint')).toBeTruthy();
        expect(screen.queryByText('record')).toBeNull();
    });

    it('stays open with an error when the save fails', async () => {
        mockedRecord.mockRejectedValue(new Error('down'));
        control(null);
        fireEvent.click(screen.getByText('button'));
        fireEvent.click(screen.getByText('record'));
        expect(await screen.findByText('error')).toBeTruthy();
        expect(mockRefresh).not.toHaveBeenCalled();
    });
});
