import { render, screen, fireEvent } from '@testing-library/react';
import { IssuesCard, groupIssuesByCode } from '../IssuesCard';
import type { Issue } from '@/lib/derivation/types';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, params?: Record<string, unknown>) =>
        params ? `${key}${JSON.stringify(params)}` : key,
}));

const issue = (o: Partial<Issue>): Issue => ({
    code: 'UNMATCHED_NAME', severity: 'warning', params: { name: 'm' }, source: 'decision', ...o,
} as Issue);

describe('IssuesCard', () => {
    it('shows the empty state when the derivation raised nothing', () => {
        render(<IssuesCard issues={[]} />);
        expect(screen.getByText('issues.none')).toBeInTheDocument();
    });

    it('counts the rows of each code', () => {
        render(<IssuesCard issues={[issue({ subjectId: 'a' }), issue({ subjectId: 'b' })]} />);
        expect(screen.getByText('issues.codes.UNMATCHED_NAME')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('lists a code\'s rows only once it is expanded, naming each row\'s subject', () => {
        render(
            <IssuesCard
                issues={[issue({ subjectId: 's1' })]}
                subjectName={id => (id === 's1' ? 'Item one' : undefined)}
            />,
        );
        expect(screen.queryByText('Item one')).not.toBeInTheDocument();
        fireEvent.click(screen.getByText('issues.codes.UNMATCHED_NAME'));
        expect(screen.getByText('Item one')).toBeInTheDocument();
    });

    it('shows a row\'s message and the document\'s own words as text, not as a tooltip', () => {
        const { container } = render(
            <IssuesCard issues={[issue({ code: 'NO_ROLL_CALL', severity: 'error', params: {}, rawText: 'απόντες ουδείς' })]} />,
        );
        fireEvent.click(screen.getByText('issues.codes.NO_ROLL_CALL'));
        expect(screen.getByText('issues.messages.NO_ROLL_CALL{}')).toBeInTheDocument();
        expect(screen.getByText('«απόντες ουδείς»')).toBeInTheDocument();
        expect(container.querySelector('[title]')).toBeNull();
    });

    it('states a code\'s severity and every step that raises it, from the catalogue', () => {
        // The rows say `info`; NO_ROLL_CALL is an error raised at two steps,
        // and the catalogue is where both facts are stated once.
        render(<IssuesCard issues={[issue({ code: 'NO_ROLL_CALL', severity: 'info', params: {} })]} />);
        fireEvent.click(screen.getByText('issues.codes.NO_ROLL_CALL'));
        expect(screen.getByText('issues.severity.error')).toBeInTheDocument();
        expect(screen.getByText(/issues\.raisedIn\.presence .* issues\.raisedIn\.write/)).toBeInTheDocument();
    });

    it('offers the derivation only when the page passed a way to open it', () => {
        const { rerender } = render(<IssuesCard issues={[]} />);
        expect(screen.queryByText(/issues\.howDerived/)).not.toBeInTheDocument();

        const onExplainDerivation = jest.fn();
        rerender(<IssuesCard issues={[]} onExplainDerivation={onExplainDerivation} />);
        fireEvent.click(screen.getByText(/issues\.howDerived/));
        expect(onExplainDerivation).toHaveBeenCalled();
    });
});

describe('groupIssuesByCode', () => {
    it('puts the worst severity first, then the biggest group', () => {
        const groups = groupIssuesByCode([
            issue({ code: 'IMPLIED_CHANGE', severity: 'info' }),
            issue({ code: 'IMPLIED_CHANGE', severity: 'info' }),
            issue({ code: 'UNMATCHED_NAME', severity: 'warning' }),
            issue({ code: 'INCOMPLETE_READ', severity: 'error' }),
        ]);
        expect(groups.map(g => g.code)).toEqual(['INCOMPLETE_READ', 'UNMATCHED_NAME', 'IMPLIED_CHANGE']);
        expect(groups.map(g => g.issues.length)).toEqual([1, 1, 2]);
    });

    it('takes the worst severity a code carries as the group\'s own', () => {
        const groups = groupIssuesByCode([
            issue({ code: 'SOURCES_DISAGREE', severity: 'info' }),
            issue({ code: 'SOURCES_DISAGREE', severity: 'warning' }),
        ]);
        expect(groups[0].severity).toBe('warning');
    });
});
