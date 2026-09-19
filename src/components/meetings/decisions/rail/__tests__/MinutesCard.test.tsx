import { render, screen, fireEvent } from '@testing-library/react';
import { MinutesCard } from '../MinutesCard';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, params?: Record<string, unknown>) =>
        params ? `${key}${JSON.stringify(params)}` : key,
}));

function renderCard(overrides: Partial<React.ComponentProps<typeof MinutesCard>> = {}) {
    return render(
        <MinutesCard
            onPreview={jest.fn()}
            onExport={jest.fn()}
            previewDisabled={false}
            subjectCount={12}
            undecidedCount={3}
            {...overrides}
        />
    );
}

describe('MinutesCard', () => {
    it('calls onPreview when the preview button is clicked', () => {
        const onPreview = jest.fn();
        renderCard({ onPreview });
        fireEvent.click(screen.getByText('previewMinutes'));
        expect(onPreview).toHaveBeenCalledTimes(1);
    });

    it('disables the preview button when previewDisabled is true', () => {
        renderCard({ previewDisabled: true });
        expect(screen.getByText('previewMinutes').closest('button')).toBeDisabled();
    });

    it('calls onExport when the export button is clicked', () => {
        const onExport = jest.fn();
        renderCard({ onExport });
        fireEvent.click(screen.getByText('exportDocx'));
        expect(onExport).toHaveBeenCalledTimes(1);
    });

    it('names the card after the document, not after its first button', () => {
        renderCard();
        expect(screen.getByText('rail.minutesTitle')).toBeInTheDocument();
    });

    it('always says where the minutes come from', () => {
        renderCard();
        expect(screen.getByText('rail.minutesProvenance')).toBeInTheDocument();
    });

    it('counts the subjects still without a decision, and says what the document will print', () => {
        renderCard({ subjectCount: 12, undecidedCount: 3 });
        expect(screen.getByText('rail.minutesUndecided{"n":3}')).toBeInTheDocument();
        expect(screen.getByText('rail.minutesUndecidedHint{"n":3}')).toBeInTheDocument();
        expect(screen.queryByText('rail.minutesAllDecided')).not.toBeInTheDocument();
    });

    it('states the count as a fact, never as an error', () => {
        const { container } = renderCard({ subjectCount: 12, undecidedCount: 3 });
        expect(screen.getByText('rail.minutesUndecided{"n":3}')).toHaveClass('text-amber-700');
        expect(container.querySelector('[class*="destructive"]')).toBeNull();
    });

    it('reports a complete record with no second line', () => {
        renderCard({ subjectCount: 12, undecidedCount: 0 });
        expect(screen.getByText('rail.minutesAllDecided')).toBeInTheDocument();
        expect(screen.queryByText(/rail\.minutesUndecided/)).not.toBeInTheDocument();
    });

    it('explains the unavailable preview when the meeting has no subjects, instead of only greying it', () => {
        renderCard({ subjectCount: 0, undecidedCount: 0 });
        expect(screen.getByText('minutes.noSubjects')).toBeInTheDocument();
        expect(screen.getByText('previewMinutes').closest('button')).toBeDisabled();
        // A readiness line over zero subjects would report a readiness nobody asked about.
        expect(screen.queryByText('rail.minutesAllDecided')).not.toBeInTheDocument();
        expect(screen.queryByText(/rail\.minutesUndecided/)).not.toBeInTheDocument();
    });
});
