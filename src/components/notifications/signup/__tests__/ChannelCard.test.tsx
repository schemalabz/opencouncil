import { fireEvent, render, screen } from '@testing-library/react';
import { ChannelCard } from '../ChannelCard';

describe('ChannelCard', () => {
    it('is a checkbox whose whole header toggles it', () => {
        const onToggle = jest.fn();
        render(<ChannelCard checked={false} onToggle={onToggle} title="WhatsApp ή SMS" badge="Προτείνεται" />);

        const box = screen.getByRole('checkbox', { name: /WhatsApp ή SMS/ });
        expect(box).toHaveAttribute('aria-checked', 'false');
        fireEvent.click(screen.getByText('Προτείνεται'));
        expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('shows its body only while it is on, so typing in a field never flips the card', () => {
        const { rerender } = render(
            <ChannelCard checked={false} onToggle={() => {}} title="WhatsApp ή SMS">
                <input aria-label="Κινητό" />
            </ChannelCard>,
        );
        expect(screen.queryByLabelText('Κινητό')).toBeNull();

        rerender(
            <ChannelCard checked onToggle={() => {}} title="WhatsApp ή SMS">
                <input aria-label="Κινητό" />
            </ChannelCard>,
        );
        expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
        const field = screen.getByLabelText('Κινητό');
        expect(field.closest('[role="checkbox"]')).toBeNull();
    });
});
