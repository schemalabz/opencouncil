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
    it('records a consent for a person with none, then refreshes the page', async () => {
        mockedRecord.mockResolvedValue(undefined);
        control(null);
        fireEvent.click(screen.getByText('buttonNone'));
        expect(screen.getByText('none')).toBeTruthy();
        expect(screen.getByText('recordHint')).toBeTruthy();
        fireEvent.click(screen.getByText('record'));
        await waitFor(() => expect(mockedRecord).toHaveBeenCalledWith('person-1', true));
        await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    });

    it('says who recorded a consent and when, and withdraws it', async () => {
        mockedRecord.mockResolvedValue(undefined);
        control({ source: 'ADMIN', userId: 'admin-1', givenAt, user: { name: 'Δ. Λ.', email: 'd@opencouncil.gr' } });
        fireEvent.click(screen.getByText('buttonGiven'));
        expect(screen.getByText(/^byAdmin .*Δ\. Λ\./)).toBeTruthy();
        fireEvent.click(screen.getByText('withdraw'));
        await waitFor(() => expect(mockedRecord).toHaveBeenCalledWith('person-1', false));
    });

    it("tells a consent the person gave from one that a superadmin recorded", () => {
        control({ source: 'PERSON', userId: 'user-1', givenAt, user: { name: 'Α. Μ.', email: 'a@b.gr' } });
        fireEvent.click(screen.getByText('buttonGiven'));
        expect(screen.getByText(/^byPerson /)).toBeTruthy();
    });

    it('stays open with an error when the save fails', async () => {
        mockedRecord.mockRejectedValue(new Error('down'));
        control(null);
        fireEvent.click(screen.getByText('buttonNone'));
        fireEvent.click(screen.getByText('record'));
        expect(await screen.findByText('error')).toBeTruthy();
        expect(mockRefresh).not.toHaveBeenCalled();
    });
});
