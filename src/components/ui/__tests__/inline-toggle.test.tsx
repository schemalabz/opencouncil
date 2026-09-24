import { render, screen, fireEvent } from '@testing-library/react';
import { InlineToggle } from '@/components/ui/inline-toggle';

describe('InlineToggle', () => {
    it('underlines the active option', () => {
        render(
            <InlineToggle
                value="a"
                onChange={() => {}}
                options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]}
            />,
        );
        expect(screen.getByText('A')).toHaveClass('underline');
        expect(screen.getByText('B')).not.toHaveClass('underline');
    });

    it('calls onChange with the clicked option value', () => {
        const onChange = jest.fn();
        render(
            <InlineToggle
                value="a"
                onChange={onChange}
                options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]}
            />,
        );
        fireEvent.click(screen.getByText('B'));
        expect(onChange).toHaveBeenCalledWith('b');
    });

    it('does not call onChange when a disabled option is clicked', () => {
        const onChange = jest.fn();
        render(
            <InlineToggle
                value="a"
                onChange={onChange}
                options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B', disabled: true }]}
            />,
        );
        fireEvent.click(screen.getByText('B'));
        expect(onChange).not.toHaveBeenCalled();
    });

    it('highlights no option when the value is undefined', () => {
        render(
            <InlineToggle
                value={undefined}
                onChange={() => {}}
                options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]}
            />,
        );
        const buttons = screen.getAllByRole('button');
        expect(buttons.every(b => !b.className.includes('underline'))).toBe(true);
    });
});
