import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateRangePill } from '../controls';
import { EMPTY_FILTERS } from '@/lib/landing/landingCore';

jest.mock('../conceptShared', () => ({ FilterBar: () => null }));
jest.mock('@/lib/landing/analytics', () => ({ captureLandingAction: jest.fn() }));
jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, values?: Record<string, string>) =>
        values ? `${key}:${Object.values(values).join('|')}` : key,
    useLocale: () => 'el',
}));

describe('DateRangePill', () => {
    it('names the quick range when no explicit date is set', () => {
        render(<DateRangePill value="14d" onChange={() => {}} filters={EMPTY_FILTERS} onClearDates={() => {}} />);

        expect(screen.getByRole('button')).toHaveTextContent('dateRange.14d');
    });

    // The explicit dates replace the quick range in every request, so the pill
    // must not show a range it is not applying.
    it('names the explicit dates instead of a quick range they replace', () => {
        render(
            <DateRangePill
                value="14d"
                onChange={() => {}}
                filters={{ dateFrom: '2026-02-01', dateTo: '2026-02-28' }}
                onClearDates={() => {}}
            />,
        );

        expect(screen.getByRole('button')).toHaveTextContent('datesPill.between:1 Φεβ 2026|28 Φεβ 2026');
    });

    it('names one explicit bound alone', () => {
        const { rerender } = render(
            <DateRangePill value="14d" onChange={() => {}} filters={{ dateFrom: '2026-02-01', dateTo: null }} onClearDates={() => {}} />,
        );
        expect(screen.getByRole('button')).toHaveTextContent('datesPill.from:1 Φεβ 2026');

        rerender(
            <DateRangePill value="14d" onChange={() => {}} filters={{ dateFrom: null, dateTo: '2026-02-28' }} onClearDates={() => {}} />,
        );
        expect(screen.getByRole('button')).toHaveTextContent('datesPill.to:28 Φεβ 2026');
    });

    it('offers to clear the explicit dates and holds the quick ranges until then', async () => {
        const user = userEvent.setup();
        const onClearDates = jest.fn();
        const onChange = jest.fn();
        render(
            <DateRangePill
                value="14d"
                onChange={onChange}
                filters={{ dateFrom: '2026-02-01', dateTo: null }}
                onClearDates={onClearDates}
            />,
        );

        await user.click(screen.getByRole('button'));
        expect(screen.getByRole('menuitem', { name: 'dateRangeMenu.14d' })).toHaveAttribute('aria-disabled', 'true');

        await user.click(screen.getByRole('menuitem', { name: 'datesPill.clear' }));
        expect(onClearDates).toHaveBeenCalledTimes(1);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('changes the quick range when no explicit date is set', async () => {
        const user = userEvent.setup();
        const onChange = jest.fn();
        render(<DateRangePill value="14d" onChange={onChange} filters={EMPTY_FILTERS} onClearDates={() => {}} />);

        await user.click(screen.getByRole('button'));
        await user.click(screen.getByRole('menuitem', { name: 'dateRangeMenu.3m' }));

        expect(onChange).toHaveBeenCalledWith('3m');
    });
});
