import { render, screen, fireEvent, within } from '@testing-library/react';
import { IssuesCard } from '../IssuesCard';
import type { Issue } from '@/lib/derivation/types';

jest.mock('@/i18n/routing', () => ({
    Link: ({ children, prefetch, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
        <a {...props}>{children}</a>
    ),
}));

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, params?: Record<string, unknown>) =>
        params ? `${key}${JSON.stringify(params)}` : key,
}));

const issue = (o: Partial<Issue>): Issue => ({
    code: 'UNMATCHED_NAME', params: { name: 'm' }, source: 'decision', ...o,
} as Issue);

const conventions = issue({ code: 'CONVENTIONS_UNCONFIRMED', params: {}, source: null });

describe('IssuesCard', () => {
    it('shows the empty state when the derivation raised nothing', () => {
        render(<IssuesCard issues={[]} />);
        expect(screen.getByText('issues.none')).toBeInTheDocument();
        expect(screen.queryByText('issues.meetingTitle')).not.toBeInTheDocument();
    });

    it('states a meeting-wide issue in full in its own section, with its severity and steps', () => {
        const { container } = render(
            <IssuesCard issues={[issue({ code: 'NO_ROLL_CALL', params: { reason: 'noRollCall' }, source: null, rawText: 'απόντες ουδείς' })]} />,
        );
        const section = screen.getByRole('region', { name: 'issues.meetingTitle' });
        expect(within(section).getByText('issues.meetingHint')).toBeInTheDocument();
        expect(within(section).getByText('issues.codes.NO_ROLL_CALL')).toBeInTheDocument();
        expect(within(section).getByText('issues.messages.NO_ROLL_CALL{"reason":"noRollCall"}')).toBeInTheDocument();
        expect(within(section).getByText('«απόντες ουδείς»')).toBeInTheDocument();
        expect(within(section).getByText('issues.severity.error')).toBeInTheDocument();
        expect(within(section).getByText(/issues\.raisedIn\.write/)).toBeInTheDocument();
        // As text: a tooltip is out of reach on a touch screen.
        expect(container.querySelector('[title]')).toBeNull();
        expect(screen.getByText('issues.subjectsNone')).toBeInTheDocument();
    });

    it('gives each code of the subjects one line with a count, and no message: the table states those', () => {
        render(<IssuesCard issues={[
            issue({ subjectId: 'a', params: { name: 'x' } }), issue({ subjectId: 'b', params: { name: 'y' } }), issue({ subjectId: 'b', params: { name: 'z' } }),
            conventions,
        ]} onSelectSubject={jest.fn()} />);
        const section = screen.getByRole('region', { name: 'issues.subjectsTitle' });
        const line = within(section).getByRole('button', { name: /issues\.codes\.UNMATCHED_NAME/ });
        expect(line).toHaveTextContent('issues.codeInSubjects{"subjects":2}');
        expect(screen.queryByText(/issues\.messages\.UNMATCHED_NAME/)).not.toBeInTheDocument();
        // The meeting-wide one is in the other section, not a line here.
        expect(within(section).queryByText('issues.codes.CONVENTIONS_UNCONFIRMED')).not.toBeInTheDocument();
    });

    it('sends the page to the first subject with the code, in the table\'s order, and to the next one on the next press', () => {
        const onSelectSubject = jest.fn();
        const issues = [issue({ subjectId: 'b' }), issue({ subjectId: 'a' }), issue({ subjectId: 'c' })];
        const props = { issues, subjectOrder: ['a', 'b', 'c'], subjectName: (id: string) => `Θέμα ${id}`, onSelectSubject };
        const { rerender } = render(<IssuesCard {...props} />);
        const line = () => screen.getByRole('button', { name: /issues\.codes\.UNMATCHED_NAME/ });
        expect(line()).toHaveTextContent('issues.goToSubject{"subject":"Θέμα a"}');
        fireEvent.click(line());
        rerender(<IssuesCard {...props} openSubjectId="a" />);
        expect(line()).toHaveTextContent('issues.goToSubject{"subject":"Θέμα b"}');
        fireEvent.click(line());
        rerender(<IssuesCard {...props} openSubjectId="c" />);
        fireEvent.click(line());
        expect(onSelectSubject.mock.calls).toEqual([['a'], ['b'], ['a']]);
    });

    it('says when one of the two sections has nothing', () => {
        render(<IssuesCard issues={[issue({ subjectId: 'a' })]} />);
        expect(screen.getByText('issues.meetingNone')).toBeInTheDocument();
    });

    it('links an utterance the page can place to the recording, and prints one it cannot', () => {
        render(
            <IssuesCard
                issues={[
                    issue({ code: 'UNPLACEABLE_VOTE', source: 'transcript', params: {}, evidence: { utteranceId: 'u1' } }),
                    issue({ code: 'UNPLACEABLE_VOTE', source: 'transcript', params: {}, evidence: { utteranceId: 'u2' } }),
                ]}
                evidenceLinks={{ recordingHref: (id: string) => (id === 'u1' ? '/athens/m1?t=90' : undefined) }}
            />,
        );
        expect(screen.getByText('issues.evidence.openRecording').closest('a')).toHaveAttribute('href', '/athens/m1?t=90');
        expect(screen.getByText('issues.evidence.utterance{"id":"u2"}')).toBeInTheDocument();
    });

    it('names the sheet line an issue was read from', () => {
        const { rerender } = render(<IssuesCard issues={[issue({ source: 'sheet', evidence: { line: 7 } })]} />);
        expect(screen.getByText('issues.evidence.sheetLine{"line":7}')).toBeInTheDocument();
        // With the sheet uploaded, the line opens it.
        rerender(<IssuesCard issues={[issue({ source: 'sheet', evidence: { line: 7 } })]} evidenceLinks={{ sheetHref: '/api/cities/c/meetings/m/sheet?file=1' }} />);
        expect(screen.getByText('issues.evidence.sheetLine{"line":7}').closest('a')).toHaveAttribute('href', '/api/cities/c/meetings/m/sheet?file=1');
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
