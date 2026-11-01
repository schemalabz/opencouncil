import { render, screen } from '@testing-library/react';
import { SentDocumentMarks, sentDetails } from '../SentDocumentMarks';
import type { DocumentSendSummary } from '@/lib/db/types';

function send(overrides: Partial<DocumentSendSummary>): DocumentSendSummary {
    return {
        id: 's1', document: 'minutes', status: 'sent', trigger: 'threshold', automatic: true,
        recipientEmails: ['grammateia@example.gr', 'cc@example.gr'], complete: true, missingSubjectIds: [],
        sentAt: new Date('2026-10-11T07:00:00Z'), failureReason: null, createdAt: new Date('2026-10-11T07:00:00Z'),
        ...overrides,
    };
}

describe('SentDocumentMarks', () => {
    it('marks each document that went out, transcript first', () => {
        render(<SentDocumentMarks sends={[send({}), send({ id: 's2', document: 'transcript', trigger: 'review' })]} />);
        expect(screen.getAllByText(/Transcript|Minutes/).map(element => element.textContent)).toEqual(['Transcript', 'Minutes']);
    });

    it('marks nothing for a meeting with no send', () => {
        const { container } = render(<SentDocumentMarks sends={[]} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('details a send: when and why, what it lacked, and to whom', () => {
        expect(sentDetails(send({ complete: false, missingSubjectIds: ['a', 'b'] }))).toEqual([
            'Minutes sent 11/10/2026 10:00 (threshold).',
            'Provisional: 2 subjects had no decision.',
            'To: grammateia@example.gr · CC: cc@example.gr',
        ]);
    });
});
