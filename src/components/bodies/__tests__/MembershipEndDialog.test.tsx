import { createElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MembershipEndDialog } from '../MembershipEndDialog';
import { dayInputValue } from '@/lib/utils/rosterDates';

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

const onConfirm = jest.fn();
const onClose = jest.fn();
const dialog = (busy = false) => render(createElement(MembershipEndDialog, {
    title: 'newTerm', description: 'newTermConfirm', busy, onConfirm, onClose,
}));
const confirmButton = () => screen.getAllByRole('button', { name: 'newTerm' }).at(-1)!;

beforeEach(() => jest.clearAllMocks());

describe('MembershipEndDialog', () => {
    it('offers today, and sends no date when the admin keeps it, so the server ends the memberships now', () => {
        dialog();
        expect(screen.getByLabelText<HTMLInputElement>('endDateLabel').value).toBe(dayInputValue(new Date()));
        fireEvent.click(confirmButton());
        expect(onConfirm).toHaveBeenCalledWith(undefined);
    });

    it('offers no day after today: the end of a membership is a change that happened', () => {
        dialog();
        expect(screen.getByLabelText<HTMLInputElement>('endDateLabel').max).toBe(dayInputValue(new Date()));
    });

    it('sends the day that the admin gives', () => {
        dialog();
        fireEvent.change(screen.getByLabelText('endDateLabel'), { target: { value: '2026-09-01' } });
        fireEvent.click(confirmButton());
        expect(onConfirm).toHaveBeenCalledWith(new Date(2026, 8, 1).toISOString());
    });

    it('cannot confirm without a day', () => {
        dialog();
        fireEvent.change(screen.getByLabelText('endDateLabel'), { target: { value: '' } });
        expect(confirmButton()).toHaveProperty('disabled', true);
    });

    it('closes on cancel', () => {
        dialog();
        fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
        expect(onClose).toHaveBeenCalled();
        expect(onConfirm).not.toHaveBeenCalled();
    });
});
