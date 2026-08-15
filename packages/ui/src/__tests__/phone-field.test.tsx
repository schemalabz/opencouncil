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
        expect(onValidityChange).toHaveBeenLastCalledWith({ isActive: false, isEmpty: true, isValid: false });
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
        expect(onValidityChange).toHaveBeenLastCalledWith({ isActive: true, isEmpty: false, isValid: true });
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
        expect(onValidityChange).toHaveBeenLastCalledWith({ isActive: true, isEmpty: false, isValid: false });
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
        expect(onValidityChange).toHaveBeenLastCalledWith({ isActive: false, isEmpty: true, isValid: false });
    });
});
