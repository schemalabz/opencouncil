import { buildDecisionTable, type DecisionTableSubject } from '../rows';

const subject = (overrides: Partial<DecisionTableSubject> = {}): DecisionTableSubject => ({
    id: 'agenda-1',
    name: 'Summary name',
    agendaItemTitle: 'Agenda title',
    agendaItemIndex: 1,
    agendaSectionIndex: null,
    nonAgendaReason: null,
    withdrawn: false,
    outcome: null,
    decision: null,
    votes: [],
    ...overrides,
});

const decision = (overrides: Partial<NonNullable<DecisionTableSubject['decision']>> = {}) => ({
    decisionNumber: '12/2026',
    protocolNumber: '3456',
    pdfUrl: 'https://example.test/decision.pdf',
    ada: 'ΑΔΑ-1',
    summary: null,
    ...overrides,
});

describe('buildDecisionTable', () => {
    it('lists the items taken up out of the agenda first, then the agenda by section and number', () => {
        const table = buildDecisionTable([
            subject({ id: 'a3', agendaItemIndex: 3 }),
            subject({ id: 'b1', agendaItemIndex: 1, agendaSectionIndex: 2 }),
            subject({ id: 'out', agendaItemIndex: null, nonAgendaReason: 'outOfAgenda' }),
            subject({ id: 'a1', agendaItemIndex: 1 }),
        ]);
        expect(table.rows.map(r => r.subject.id)).toEqual(['out', 'a1', 'a3', 'b1']);
        expect(table.rows.map(r => r.section)).toEqual(['outOfAgenda', 'agenda', 'agenda', 'agenda']);
    });

    it('folds the subjects before the agenda into their own list, never into the rows', () => {
        const table = buildDecisionTable([
            subject({ id: 'before', agendaItemIndex: 2, nonAgendaReason: 'beforeAgenda', agendaItemTitle: null, name: 'Ερώτηση' }),
            subject({ id: 'a1' }),
        ]);
        expect(table.rows.map(r => r.subject.id)).toEqual(['a1']);
        expect(table.beforeAgenda).toEqual([{ id: 'before', name: 'Ερώτηση' }]);
    });

    it('prints the item as written on the agenda, and the summary name when there is none', () => {
        const [titled, untitled] = buildDecisionTable([
            subject({ id: 'a1', agendaItemIndex: 1 }),
            subject({ id: 'a2', agendaItemIndex: 2, agendaItemTitle: '  ' }),
        ]).rows;
        expect(titled.subject.name).toBe('Agenda title');
        expect(untitled.subject.name).toBe('Summary name');
    });

    it('marks a row with no decision as pending, whatever votes it holds', () => {
        const [row] = buildDecisionTable([subject({ votes: [{ voteType: 'FOR' }] })]).rows;
        expect(row.decision).toBeNull();
        expect(row.result).toBe('none');
        expect(row.voteCounts).toBeNull();
    });

    it('carries the decision number, or the protocol number when the document carries no number of its own', () => {
        const [numbered, protocolOnly, bare] = buildDecisionTable([
            subject({ id: 'a1', agendaItemIndex: 1, decision: decision() }),
            subject({ id: 'a2', agendaItemIndex: 2, decision: decision({ decisionNumber: null }) }),
            subject({ id: 'a3', agendaItemIndex: 3, decision: decision({ decisionNumber: null, protocolNumber: null }) }),
        ]).rows;
        expect(numbered.decision?.number).toBe('12/2026');
        expect(protocolOnly.decision?.number).toBe('3456');
        expect(bare.decision?.number).toBeNull();
        expect(bare.decision?.pdfUrl).toBe('https://example.test/decision.pdf');
    });

    it('reads the result off the votes and keeps the counts behind the word', () => {
        const [row] = buildDecisionTable([
            subject({ decision: decision(), votes: [{ voteType: 'FOR' }, { voteType: 'FOR' }, { voteType: 'AGAINST' }, { voteType: 'PRESENT' }] }),
        ]).rows;
        expect(row.result).toBe('majority');
        expect(row.voteCounts).toMatchObject({ forCount: 2, againstCount: 1, abstainCount: 0, presentCount: 1, didNotVoteCount: 0 });
    });

    it('shows no counts for a document that records no vote', () => {
        const [row] = buildDecisionTable([subject({ decision: decision() })]).rows;
        expect(row.result).toBe('noVote');
        expect(row.voteCounts).toBeNull();
    });

    it('calls a withdrawn subject withdrawn and gives it no summary', () => {
        const [row] = buildDecisionTable([
            subject({ withdrawn: true, outcome: 'Αποσύρθηκε από τον εισηγητή.', decision: decision({ summary: 'Εγκρίνει.' }) }),
        ]).rows;
        expect(row.result).toBe('withdrawn');
        expect(row.summary).toBeNull();
    });

    it('prefers the document summary over what the transcript says', () => {
        const [fromDocument, fromDiscussion, none] = buildDecisionTable([
            subject({ id: 'a1', agendaItemIndex: 1, outcome: 'Από τη συζήτηση', decision: decision({ summary: 'Από το έγγραφο' }) }),
            subject({ id: 'a2', agendaItemIndex: 2, outcome: 'Από τη συζήτηση', decision: decision({ summary: '   ' }) }),
            subject({ id: 'a3', agendaItemIndex: 3, outcome: '' }),
        ]).rows;
        expect(fromDocument.summary).toEqual({ text: 'Από το έγγραφο', source: 'document' });
        expect(fromDiscussion.summary).toEqual({ text: 'Από τη συζήτηση', source: 'discussion' });
        expect(none.summary).toBeNull();
    });
});
