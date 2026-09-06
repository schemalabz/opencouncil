import { fireEvent, render, screen } from '@testing-library/react';
import { CardCheckbox } from '../CardCheckbox';

describe('CardCheckbox', () => {
    it('is a checkbox whose whole header toggles it', () => {
        const onToggle = jest.fn();
        render(<CardCheckbox checked={false} onToggle={onToggle} title="WhatsApp ή SMS" badge="Προτείνεται" />);

        const box = screen.getByRole('checkbox', { name: /WhatsApp ή SMS/ });
        expect(box).toHaveAttribute('aria-checked', 'false');
        fireEvent.click(screen.getByText('Προτείνεται'));
        expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('shows its body only while it is on, so typing in a field never flips the card', () => {
        const { rerender } = render(
            <CardCheckbox checked={false} onToggle={() => {}} title="WhatsApp ή SMS">
                <input aria-label="Κινητό" />
            </CardCheckbox>,
        );
        expect(screen.queryByLabelText('Κινητό')).toBeNull();

        rerender(
            <CardCheckbox checked onToggle={() => {}} title="WhatsApp ή SMS">
                <input aria-label="Κινητό" />
            </CardCheckbox>,
        );
        expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
        const field = screen.getByLabelText('Κινητό');
        expect(field.closest('[role="checkbox"]')).toBeNull();
    });
});
