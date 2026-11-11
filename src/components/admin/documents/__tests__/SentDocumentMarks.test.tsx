import { render, screen } from '@testing-library/react';
import { SentDocumentMarks, sentDetails } from '../SentDocumentMarks';
import type { DocumentSendSummary } from '@/lib/db/types';

function send(overrides: Partial<DocumentSendSummary>): DocumentSendSummary {
    return {
        id: 's1', kind: 'minutes', status: 'sent', trigger: 'threshold',
        recipientEmails: ['grammateia@example.gr', 'cc@example.gr'], _count: { missingSubjects: 0 },
        sentAt: new Date('2026-10-11T07:00:00Z'), failureReason: null, createdAt: new Date('2026-10-11T07:00:00Z'),
        ...overrides,
    };
}

describe('SentDocumentMarks', () => {
    it('marks each document that went out, transcript first, whichever went out first', () => {
        render(<SentDocumentMarks sends={[send({}), send({ id: 's2', kind: 'transcript', trigger: 'review' })]} />);
        expect(screen.getAllByText(/^(Transcript|Minutes)$/).map(element => element.textContent)).toEqual(['Transcript', 'Minutes']);
    });

    it('marks nothing for a meeting with no send', () => {
        const { container } = render(<SentDocumentMarks sends={[]} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('marks a complete send green, with no count', () => {
        render(<SentDocumentMarks sends={[send({ trigger: 'complete' })]} />);
        const mark = screen.getByText('Minutes');
        expect(mark).not.toHaveClass('text-amber-700');
        expect(mark.querySelector('svg')).toHaveClass('text-green-600');
        expect(mark.textContent).toBe('Minutes');
    });

    it('marks a provisional send amber, with the count of the subjects it lacked', () => {
        render(<SentDocumentMarks sends={[send({ _count: { missingSubjects: 3 } })]} />);
        const mark = screen.getByText('Minutes');
        expect(mark).toHaveClass('text-amber-700');
        expect(mark.querySelector('svg')).toHaveClass('text-amber-600');
        expect(mark.textContent).toBe('Minutes(3)');
    });

    it('details a send: when (Athens time) and why, what it lacked, and to whom', () => {
        expect(sentDetails(send({ _count: { missingSubjects: 2 } }))).toEqual([
            'Minutes sent 11/10/2026 10:00 (deadline).',
            'Provisional: 2 subjects had no decision.',
            'To: grammateia@example.gr · CC: cc@example.gr',
        ]);
        expect(sentDetails(send({ _count: { missingSubjects: 1 }, recipientEmails: ['a@example.gr'] }))).toEqual([
            'Minutes sent 11/10/2026 10:00 (deadline).',
            'Provisional: 1 subject had no decision.',
            'To: a@example.gr',
        ]);
    });

    it.each([
        ['review', 'after the review'],
        ['complete', 'all decisions in'],
        ['threshold', 'deadline'],
        ['manual', 'by hand'],
    ] as const)('words the %s trigger as «%s»', (trigger, words) => {
        expect(sentDetails(send({ trigger, recipientEmails: [] }))[0]).toBe(`Minutes sent 11/10/2026 10:00 (${words}).`);
    });
});
