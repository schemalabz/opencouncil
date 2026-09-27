import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { AuditIssueRow } from '../AuditIssueRow';
import type { AuditIssue } from '../auditSignal';
import type { Issue } from '@/lib/derivation/types';
import admin from '../../../../../messages/el/admin.json';

const el = admin.decisionsPage;

const absentVote = (personId: string, name: string, rawText?: string): AuditIssue => ({
    issue: { code: 'VOTE_BY_ABSENT_MEMBER', subjectId: 's1', personId, source: 'decision', rawText, params: { vote: 'FOR' } } as Issue,
    person: { kind: 'member', name },
});
const dropped = (personId: string, name: string): AuditIssue => ({
    issue: { code: 'LIST_DROPS_PRESENT', subjectId: 's1', personId, source: 'decision', params: {} } as Issue,
    person: { kind: 'member', name },
});

const renderRow = (issues: AuditIssue[], props: { onClose?: () => void; onExplainDerivation?: () => void } = {}) => render(
    <NextIntlClientProvider locale="el" messages={{ admin }}>
        <AuditIssueRow id="issues-s1" issues={issues} onClose={props.onClose ?? (() => undefined)} onExplainDerivation={props.onExplainDerivation} />
    </NextIntlClientProvider>,
);

describe('AuditIssueRow', () => {
    // Argos dec3_2025: one subject carried 5 × VOTE_BY_ABSENT_MEMBER and 7 × LIST_DROPS_PRESENT.
    const issues = [
        dropped('p1', 'Α. Αλεξίου'),
        absentVote('p2', 'Β. Βασιλείου', 'ΥΠΕΡ: Βασιλείου'),
        dropped('p3', 'Γ. Γεωργίου'),
        absentVote('p4', 'Δ. Δημητρίου'),
    ];

    it('counts every issue of the subject in its heading', () => {
        renderRow(issues);
        expect(screen.getByRole('region', { name: '4 ζητήματα σε αυτό το θέμα' })).toHaveAttribute('id', 'issues-s1');
    });

    it('groups the issues by code, worst first, and counts each group', () => {
        renderRow(issues);
        const groups = screen.getAllByRole('listitem').filter(li => li.dataset.code);
        expect(groups.map(g => g.dataset.code)).toEqual(['VOTE_BY_ABSENT_MEMBER', 'LIST_DROPS_PRESENT']);
        expect(within(groups[0]).getByText(el.issues.codes.VOTE_BY_ABSENT_MEMBER)).toBeInTheDocument();
        expect(within(groups[0]).getByText('2 φορές')).toBeInTheDocument();
        expect(within(groups[0]).getByText(el.issues.severity.warning)).toBeInTheDocument();
        expect(within(groups[1]).getByText(el.issues.severity.info)).toBeInTheDocument();
    });

    it('names each member, states each message, and quotes the document', () => {
        renderRow(issues);
        const group = screen.getAllByRole('listitem').find(li => li.dataset.code === 'VOTE_BY_ABSENT_MEMBER') as HTMLElement;
        expect(within(group).getByText('Μέλος: Β. Βασιλείου')).toBeInTheDocument();
        expect(within(group).getByText('Μέλος: Δ. Δημητρίου')).toBeInTheDocument();
        expect(within(group).getAllByText(/λογίζεται απόν σε αυτό το θέμα/)).toHaveLength(2);
        expect(within(group).getByText('«ΥΠΕΡ: Βασιλείου»')).toBeInTheDocument();
    });

    it('says a single issue once, with no count', () => {
        renderRow([dropped('p1', 'Α. Αλεξίου')]);
        expect(screen.getByRole('region', { name: '1 ζήτημα σε αυτό το θέμα' })).toBeInTheDocument();
        expect(screen.queryByText(/φορ(ά|ές)/)).not.toBeInTheDocument();
    });

    it('closes, and offers the derivation only when the page passed a way to open it', async () => {
        const onClose = jest.fn();
        const { unmount } = renderRow(issues, { onClose });
        expect(screen.queryByRole('button', { name: /Πώς προκύπτουν τα στοιχεία/ })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: el.audit.issueRow.close }));
        expect(onClose).toHaveBeenCalled();
        unmount();

        const onExplainDerivation = jest.fn();
        renderRow(issues, { onExplainDerivation });
        await userEvent.click(screen.getByRole('button', { name: /Πώς προκύπτουν τα στοιχεία/ }));
        expect(onExplainDerivation).toHaveBeenCalled();
    });
});
