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

// MeetingDecisionsPage keeps its own split, because an outOfAgenda subject may also
// carry an agendaItemIndex. It now filters that split with the shared predicate. That
// swap is safe only while the predicate reduces to `!withdrawn` over the split's members.
describe('the MeetingDecisionsPage display split', () => {
    const indices = [null, 0, 3];
    const reasons = [null, 'beforeAgenda', 'outOfAgenda'];

    it('leaves the predicate equal to !withdrawn for every subject it displays', () => {
        for (const agendaItemIndex of indices) {
            for (const nonAgendaReason of reasons) {
                for (const withdrawn of [false, true]) {
                    const s = { agendaItemIndex, nonAgendaReason, withdrawn };
                    const displayed =
                        (agendaItemIndex !== null && nonAgendaReason === null) ||
                        nonAgendaReason === 'outOfAgenda';
                    if (!displayed) continue;
                    expect(isDecisionEligibleSubject(s)).toBe(!withdrawn);
                }
            }
        }
    });

    it('drops one case the shared rule keeps: a before-agenda subject that carries an index', () => {
        const s = { agendaItemIndex: 3, nonAgendaReason: 'beforeAgenda', withdrawn: false };
        expect(isDecisionEligibleSubject(s)).toBe(true);
        const displayed = (s.agendaItemIndex !== null && s.nonAgendaReason === null)
            || (s.nonAgendaReason as string) === 'outOfAgenda';
        expect(displayed).toBe(false);
    });
});

