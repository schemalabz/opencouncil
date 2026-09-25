import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AuditEvidence, type AuditEvidenceProps } from '../AuditEvidence';
import type { Issue } from '@/lib/derivation/types';
import admin from '../../../../../messages/el/admin.json';

const props: AuditEvidenceProps = {
    voteResultPhrase: null,
    votes: [],
    attendance: [],
    tallyDiffs: [],
    changeTexts: [],
    issues: [],
    unmatchedNames: [],
    phraseOnly: false,
};

const renderEvidence = (over: Partial<AuditEvidenceProps> = {}) => render(
    <NextIntlClientProvider locale="el" messages={{ admin }}>
        <AuditEvidence {...props} {...over} />
    </NextIntlClientProvider>,
);

describe('AuditEvidence', () => {
    it('splits the names by where they came from instead of marking each one', () => {
        renderEvidence({
            votes: [
                { name: 'Α. Παπαδόπουλος', origin: 'stated' },
                { name: 'Β. Γεωργίου', origin: 'inferred' },
                { name: 'Γ. Νικολάου', origin: 'inferred' },
            ],
        });
        const stated = screen.getByText('Κατονομάζονται στο έγγραφο').parentElement?.parentElement as HTMLElement;
        expect(stated).toHaveTextContent('1');
        expect(stated).toHaveTextContent('Α. Παπαδόπουλος');
        const inferred = screen.getByText('Κατά τεκμήριο').parentElement?.parentElement as HTMLElement;
        expect(inferred).toHaveTextContent('2');
        expect(inferred).toHaveTextContent('Β. Γεωργίου, Γ. Νικολάου');
    });

    it('prints the document’s own sentence as the licence for the inference', () => {
        renderEvidence({
            voteResultPhrase: 'Εγκρίνεται ομόφωνα',
            votes: [{ name: 'Β. Γεωργίου', origin: 'inferred' }],
        });
        expect(screen.getByText('Όπως τυπώθηκε')).toBeInTheDocument();
        expect(screen.getByText('Εγκρίνεται ομόφωνα')).toBeInTheDocument();
    });

    it('puts the printed tally beside the derived one, with the derived number marked', () => {
        renderEvidence({ tallyDiffs: [{ type: 'FOR', printed: 8, derived: 7 }] });
        expect(screen.getByText('ΥΠΕΡ')).toBeInTheDocument();
        expect(screen.getByText('8')).toBeInTheDocument();
        expect(screen.getByText('7')).toHaveClass('text-amber-700');
    });

    it('states the issue as text rather than hiding it in a tooltip', () => {
        const issue = {
            code: 'UNMATCHED_NAME', subjectId: 's1', source: null,
            params: { name: 'Κ. Δήμου' },
        } as Issue;
        renderEvidence({ issues: [issue], unmatchedNames: ['Κ. Δήμου'] });
        const message = screen.getByText(/δεν αντιστοιχήθηκε/);
        expect(message).toBeInTheDocument();
        expect(message).not.toHaveAttribute('title');
        expect(screen.getByText('Ονόματα χωρίς αντιστοίχιση:').parentElement).toHaveTextContent('Κ. Δήμου');
    });

    it('says only once that the printed and derived counts disagree', () => {
        // The comparison above is the same two numbers the message reads out.
        const issue = {
            code: 'TALLY_MISMATCH', subjectId: 's1', source: null,
            params: { diffs: [{ type: 'FOR', printed: 8, derived: 7 }] },
        } as Issue;
        renderEvidence({ issues: [issue], tallyDiffs: [{ type: 'FOR', printed: 8, derived: 7 }] });
        expect(screen.queryByText(/Η τυπωμένη καταμέτρηση/)).not.toBeInTheDocument();
    });

    it('shows the sentence a document states an attendance change in', () => {
        renderEvidence({ changeTexts: ['Προσήλθε ο κ. Νικολάου κατά τη συζήτηση του 3ου θέματος'] });
        expect(screen.getByText(/Προσήλθε ο κ. Νικολάου/)).toBeInTheDocument();
    });
});
