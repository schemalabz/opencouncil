import { render, screen, fireEvent } from '@testing-library/react';
import { PresenceCard } from '../PresenceCard';
import type { RollCall } from '../../timeline';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, params?: Record<string, unknown>) =>
        params ? `${key}${JSON.stringify(params)}` : key,
}));

const rollCall = (o: Partial<RollCall> = {}): RollCall => ({
    count: { present: 27, absent: 3 },
    absentNames: ['Α', 'Β', 'Γ'],
    presentNames: ['Δ', 'Ε'],
    ...o,
});

describe('PresenceCard', () => {
    it('renders nothing when the count is null', () => {
        const { container } = render(<PresenceCard rollCall={rollCall({ count: null })} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows the headline with present and total', () => {
        render(<PresenceCard rollCall={rollCall()} />);
        expect(screen.getByText('presenceHeadline{"present":27,"total":30}')).toBeInTheDocument();
    });

    it('shows the absent count inline followed by the absent names', () => {
        render(<PresenceCard rollCall={rollCall()} />);
        expect(screen.getByText('presenceAbsentInline{"n":3}')).toBeInTheDocument();
        expect(screen.getByText('Α, Β, Γ')).toBeInTheDocument();
    });

    it('hides the present list until showMore is clicked', () => {
        render(<PresenceCard rollCall={rollCall()} />);
        expect(screen.queryByText('presencePresentList{"n":27}')).not.toBeInTheDocument();
        fireEvent.click(screen.getByText('showMore'));
        expect(screen.getByText('presencePresentList{"n":27}')).toBeInTheDocument();
        expect(screen.getByText('Δ, Ε')).toBeInTheDocument();
    });

    it('collapses the present list again on showLess', () => {
        render(<PresenceCard rollCall={rollCall()} />);
        fireEvent.click(screen.getByText('showMore'));
        fireEvent.click(screen.getByText('showLess'));
        expect(screen.queryByText('presencePresentList{"n":27}')).not.toBeInTheDocument();
    });
});
