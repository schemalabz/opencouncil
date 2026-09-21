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
    code: 'LAYOUT_DISAGREES', severity: 'warning', subjectId: 's1', source: 'decision',
    params: { expected: 'composition_and_absent', found: 'present_and_absent' },
    ...over,
} as Issue);

const signal = (over: Partial<AuditSignal> = {}): AuditSignal => ({
    severity: 'warning', kind: 'issues', code: 'LAYOUT_DISAGREES', issue: issue(),
    extraIssues: 0, inferred: 0, derivedVotes: 0, needsCheck: true, ...over,
});

const renderLine = (over: Partial<AuditSignal> = {}, onExplainDerivation?: () => void) => render(
    <NextIntlClientProvider locale="el" messages={{ admin }}>
        <AuditLine signal={signal(over)} onExplainDerivation={onExplainDerivation} />
    </NextIntlClientProvider>,
);

const open = async () => userEvent.click(screen.getByRole('button', { name: 'Διαφωνία διάταξης παρουσιολογίου' }));

describe('AuditLine', () => {
    it('keeps the explanation closed until the phrase is pressed', async () => {
        renderLine();
        expect(screen.queryByText(/ενώ αυτό το έγγραφο τύπωσε/)).not.toBeInTheDocument();
        await open();
        expect(screen.getByText(/ενώ αυτό το έγγραφο τύπωσε/)).toBeInTheDocument();
    });

    it('states the message as text, not as a tooltip nobody on a phone can reach', async () => {
        renderLine();
        await open();
        const line = screen.getByLabelText('Έλεγχος');
        expect(line.querySelector('[title]')).toBeNull();
        expect(line).toHaveTextContent(literalHead(el.issues.messages.LAYOUT_DISAGREES));
    });

    it('takes the severity from the catalogue, not from the row that carries the issue', async () => {
        // The row says `info`; the derivation raises INCOMPLETE_READ as an
        // error and the catalogue is where that is stated once.
        renderLine({ severity: 'info', code: 'INCOMPLETE_READ', issue: issue({ code: 'INCOMPLETE_READ', severity: 'info', params: {} }) });
        await userEvent.click(screen.getByRole('button', { name: 'Ατελής ανάγνωση' }));
        expect(screen.getByText('Σφάλμα')).toBeInTheDocument();
        expect(screen.getByLabelText('Έλεγχος').querySelector('.bg-red-600')).not.toBeNull();
    });

    it('names every step that raises a code, not just the first', async () => {
        renderLine({ severity: 'error', code: 'NO_ROLL_CALL', issue: issue({ code: 'NO_ROLL_CALL', severity: 'error', params: {} }) });
        await userEvent.click(screen.getByRole('button', { name: 'Χωρίς αρχική εκφώνηση' }));
        expect(screen.getByText('Προκύπτει στον υπολογισμό των παρόντων και στην εγγραφή των στοιχείων')).toBeInTheDocument();
    });

    it('offers the derivation only when the page passed a way to open it', async () => {
        renderLine();
        await open();
        expect(screen.queryByRole('button', { name: /Πώς προκύπτουν τα στοιχεία/ })).not.toBeInTheDocument();

        const onExplainDerivation = jest.fn();
        renderLine({}, onExplainDerivation);
        await userEvent.click(screen.getAllByRole('button', { name: 'Διαφωνία διάταξης παρουσιολογίου' })[1]);
        await userEvent.click(screen.getByRole('button', { name: /Πώς προκύπτουν τα στοιχεία/ }));
        expect(onExplainDerivation).toHaveBeenCalled();
    });

    it('leaves a line with no issue behind it as plain text, so every underline is a real offer', () => {
        renderLine({ severity: 'info', kind: 'inferredVotes', code: null, issue: null, inferred: 3, derivedVotes: 4 });
        expect(screen.getByLabelText('Έλεγχος')).toHaveTextContent(literalHead(el.audit.inferredVotes));
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});
