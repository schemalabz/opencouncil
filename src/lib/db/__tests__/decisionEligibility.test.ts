import { isDecisionEligibleSubject } from '../decisionEligibility';

const subject = (overrides: Partial<Parameters<typeof isDecisionEligibleSubject>[0]> = {}) => ({
    agendaItemIndex: null,
    nonAgendaReason: null,
    withdrawn: false,
    ...overrides,
});

describe('isDecisionEligibleSubject', () => {
    it('accepts an agenda item', () => {
        expect(isDecisionEligibleSubject(subject({ agendaItemIndex: 3 }))).toBe(true);
    });

    it('accepts an out-of-agenda item the body approved as urgent', () => {
        expect(isDecisionEligibleSubject(subject({ nonAgendaReason: 'outOfAgenda' }))).toBe(true);
    });

    it('rejects an out-of-agenda item the body rejected', () => {
        expect(isDecisionEligibleSubject(subject({ nonAgendaReason: 'outOfAgenda', withdrawn: true }))).toBe(false);
    });

    it('rejects a withdrawn agenda item', () => {
        expect(isDecisionEligibleSubject(subject({ agendaItemIndex: 3, withdrawn: true }))).toBe(false);
    });

    it('rejects a before-agenda item', () => {
        expect(isDecisionEligibleSubject(subject({ nonAgendaReason: 'beforeAgenda' }))).toBe(false);
    });

    it('rejects a subject with no agenda index and no reason', () => {
        expect(isDecisionEligibleSubject(subject())).toBe(false);
    });
});
