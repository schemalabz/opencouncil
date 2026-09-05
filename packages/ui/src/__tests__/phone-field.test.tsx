import '@testing-library/jest-dom';
import { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PhoneField, PhoneFieldValidity } from '../phone-field';

function Harness({
    initialValue = '',
    onValidityChange,
}: {
    initialValue?: string;
    onValidityChange?: (validity: PhoneFieldValidity) => void;
}) {
    const [value, setValue] = useState(initialValue);
    return (
        <PhoneField
            value={value}
            onChange={setValue}
            onValidityChange={onValidityChange}
            placeholder="Add phone"
            activePlaceholder="Your phone"
            invalidMessage="Enter a valid phone"
            notMobileMessage="Enter a mobile number"
        />
    );
}

describe('PhoneField', () => {
    it('renders the inactive placeholder input by default when value is empty', () => {
        render(<Harness />);
        const input = screen.getByPlaceholderText('Add phone');
        expect(input).toBeInTheDocument();
        expect(input).toHaveAttribute('readonly');
    });

    it('switches to PhoneInput on focus and shows the +30 country prefix', () => {
        render(<Harness />);
        fireEvent.focus(screen.getByPlaceholderText('Add phone'));
        expect(screen.getByPlaceholderText('Your phone')).toBeInTheDocument();
        // react-international-phone renders the dial code prefix when active
        expect(screen.getByText(/\+30/)).toBeInTheDocument();
    });

    it('initial validity is inactive + empty + invalid', () => {
        const onValidityChange = jest.fn();
        render(<Harness onValidityChange={onValidityChange} />);
        expect(onValidityChange).toHaveBeenLastCalledWith({ isActive: false, isEmpty: true, isValid: false, reason: null });
    });

    it('emits isValid=true once a complete GR mobile number is entered', () => {
        const onValidityChange = jest.fn();
        render(<Harness onValidityChange={onValidityChange} />);
        act(() => {
            fireEvent.focus(screen.getByPlaceholderText('Add phone'));
        });
        const activeInput = screen.getByPlaceholderText('Your phone');
        act(() => {
            fireEvent.change(activeInput, { target: { value: '+30 698 000 0000' } });
        });
        expect(onValidityChange).toHaveBeenLastCalledWith({ isActive: true, isEmpty: false, isValid: true, reason: null });
    });

    it('emits isValid=false when only an incomplete number is entered', () => {
        const onValidityChange = jest.fn();
        render(<Harness onValidityChange={onValidityChange} />);
        act(() => {
            fireEvent.focus(screen.getByPlaceholderText('Add phone'));
        });
        const activeInput = screen.getByPlaceholderText('Your phone');
        act(() => {
            fireEvent.change(activeInput, { target: { value: '+30 698' } });
        });
        expect(onValidityChange).toHaveBeenLastCalledWith({ isActive: true, isEmpty: false, isValid: false, reason: 'invalid' });
    });

    it('shows the invalid message after typing an incomplete number', () => {
        render(<Harness />);
        fireEvent.focus(screen.getByPlaceholderText('Add phone'));
        fireEvent.change(screen.getByPlaceholderText('Your phone'), { target: { value: '+30 698' } });
        expect(screen.getByText('Enter a valid phone')).toBeInTheDocument();
    });

    it('hides the invalid message once a complete valid number is entered', () => {
        render(<Harness />);
        fireEvent.focus(screen.getByPlaceholderText('Add phone'));
        fireEvent.change(screen.getByPlaceholderText('Your phone'), { target: { value: '+30 698 000 0000' } });
        expect(screen.queryByText('Enter a valid phone')).not.toBeInTheDocument();
    });

    it('X button clears the value, deactivates, and emits empty inactive validity', () => {
        const onValidityChange = jest.fn();
        render(<Harness initialValue="+306980000000" onValidityChange={onValidityChange} />);

        // started active because initial value is non-empty
        expect(screen.getByPlaceholderText('Your phone')).toBeInTheDocument();

        const clearButton = screen.getByRole('button');
        act(() => {
            fireEvent.click(clearButton);
        });

        // back to inactive placeholder
        expect(screen.getByPlaceholderText('Add phone')).toBeInTheDocument();
        expect(onValidityChange).toHaveBeenLastCalledWith({ isActive: false, isEmpty: true, isValid: false, reason: null });
    });
});

/**
 * The field applies the same rule as the server. Every rejected value below
 * reached production before the rule existed.
 */
describe('PhoneField — one rule with the server', () => {
    it('never presents a prefilled Greek mobile that lost its country code as valid', () => {
        const onValidityChange = jest.fn();
        render(<Harness initialValue="+6943472297" onValidityChange={onValidityChange} />);
        // The input cannot show a number outside a dial code: the stale value
        // is judged invalid, then rewritten onto the +30 prefix for retyping.
        const calls = onValidityChange.mock.calls.map(([validity]) => validity as PhoneFieldValidity);
        expect(calls[0]).toMatchObject({ isActive: true, isValid: false, reason: 'invalid' });
        expect(calls.at(-1)?.isValid).toBe(false);
        const activeInput = screen.getByPlaceholderText('Your phone') as HTMLInputElement;
        expect(activeInput.value.replace(/\s/g, '')).toMatch(/^\+30/);
    });

    it('flags a landline with its own message', () => {
        const onValidityChange = jest.fn();
        render(<Harness initialValue="+302106459454" onValidityChange={onValidityChange} />);
        expect(onValidityChange).toHaveBeenLastCalledWith({
            isActive: true,
            isEmpty: false,
            isValid: false,
            reason: 'landline',
        });
        expect(screen.getByText('Enter a mobile number')).toBeInTheDocument();
    });

    it('accepts a foreign mobile', () => {
        const onValidityChange = jest.fn();
        render(<Harness initialValue="+35799551412" onValidityChange={onValidityChange} />);
        expect(onValidityChange).toHaveBeenLastCalledWith({
            isActive: true,
            isEmpty: false,
            isValid: true,
            reason: null,
        });
    });

    it('does not let the dial code be deleted', () => {
        const onValidityChange = jest.fn();
        render(<Harness onValidityChange={onValidityChange} />);
        act(() => {
            fireEvent.focus(screen.getByPlaceholderText('Add phone'));
        });
        const activeInput = screen.getByPlaceholderText('Your phone') as HTMLInputElement;
        // Deleting everything, or replacing it with a national number, leaves
        // the +30 in place — the value can never begin with the reader's digits.
        act(() => {
            fireEvent.change(activeInput, { target: { value: '' } });
        });
        expect(activeInput.value.replace(/\s/g, '')).toMatch(/^\+30/);
        act(() => {
            fireEvent.change(activeInput, { target: { value: '6980000000' } });
        });
        expect(activeInput.value.replace(/\s/g, '')).toMatch(/^\+30/);
        // A bare dial code is empty, not an error.
        expect(onValidityChange).toHaveBeenLastCalledWith(
            expect.objectContaining({ isActive: true, isValid: false, reason: null }),
        );
    });
});
