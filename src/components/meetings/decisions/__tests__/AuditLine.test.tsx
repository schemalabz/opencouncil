import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { AuditLine } from '../AuditLine';
import type { AuditSignal } from '../auditSignal';
import type { Issue } from '@/lib/derivation/types';
import admin from '../../../../../messages/el/admin.json';

/**
 * Expectations read the Greek from the same catalogue the component renders
 * from. Spelling it out here made these tests fail when the copy was reworded
 * («συμβάσεις» → «κανόνες ανάγνωσης») though nothing about the behaviour they
 * check had changed — a test that breaks on an edit it does not govern teaches
 * people to edit the test.
 */
const el = admin.decisionsPage;

/** An ICU string's literal head, up to its first placeholder. */
const literalHead = (icu: string) => icu.split('{')[0].trim();

const issue = (over: Partial<Issue> = {}): Issue => ({
    code: 'LAYOUT_DISAGREES', subjectId: 's1', source: 'decision',
    params: { expected: 'composition_and_absent', found: 'present_and_absent' },
    ...over,
} as Issue);

const signal = (over: Partial<AuditSignal> = {}): AuditSignal => ({
    severity: 'warning', kind: 'issues', code: 'LAYOUT_DISAGREES',
    issues: [{ issue: issue(), person: null }],
    extraIssues: 0, inferred: 0, derivedVotes: 0, needsCheck: true, ...over,
});

const renderLine = (over: Partial<AuditSignal> = {}, props: { open?: boolean; onOpen?: () => void } = {}) => render(
    <NextIntlClientProvider locale="el" messages={{ admin }}>
        <AuditLine signal={signal(over)} open={props.open ?? false} onOpen={props.onOpen ?? (() => undefined)} controls="issues-s1" />
    </NextIntlClientProvider>,
);

describe('AuditLine', () => {
    it('names the worst issue and opens the subject\'s issues when the name is pressed', async () => {
        const onOpen = jest.fn();
        renderLine({}, { onOpen });
        const phrase = screen.getByRole('button', { name: el.issues.codes.LAYOUT_DISAGREES });
        expect(phrase).toHaveAttribute('aria-expanded', 'false');
        expect(phrase).toHaveAttribute('aria-controls', 'issues-s1');
        await userEvent.click(phrase);
        expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('never states the message inside the line: the row under the subject does', () => {
        renderLine({}, { open: true });
        expect(screen.getByRole('button', { name: el.issues.codes.LAYOUT_DISAGREES })).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByLabelText('Έλεγχος')).not.toHaveTextContent(literalHead(el.issues.messages.LAYOUT_DISAGREES));
    });

    it('makes «+X ακόμη» a control that opens the same row', async () => {
        const onOpen = jest.fn();
        renderLine({ extraIssues: 11 }, { onOpen });
        const more = screen.getByRole('button', { name: new RegExp(el.audit.moreIssuesAction) });
        expect(more).toHaveTextContent('+11 ακόμη');
        expect(more).toHaveAttribute('aria-controls', 'issues-s1');
        await userEvent.click(more);
        expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('colours the dot by the signal\'s severity', () => {
        renderLine({ severity: 'error', code: 'INCOMPLETE_READ', issues: [{ issue: issue({ code: 'INCOMPLETE_READ', params: {} }), person: null }] });
        expect(screen.getByLabelText('Έλεγχος').querySelector('.bg-red-600')).not.toBeNull();
    });

    it('leaves a line with no issue behind it as plain text, so every underline is a real offer', () => {
        renderLine({ severity: 'info', kind: 'inferredVotes', code: null, issues: [], inferred: 3, derivedVotes: 4 });
        expect(screen.getByLabelText('Έλεγχος')).toHaveTextContent(`${el.audit.inferredVotes} 3 από τις 4 ψήφους`);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});
