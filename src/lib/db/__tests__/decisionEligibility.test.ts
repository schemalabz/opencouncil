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

    it('rejects a before-agenda item that also carries an agenda index', () => {
        // A superadmin PATCH sets nonAgendaReason without clearing the index. The body
        // raised the subject before the agenda, so Diavgeia publishes no decision for it
        // and the poller must not consider it. No such row existed in production when
        // this rule was tightened (0 of 12,391 on 2026-09-17).
        expect(isDecisionEligibleSubject(subject({ agendaItemIndex: 3, nonAgendaReason: 'beforeAgenda' }))).toBe(false);
    });

    it('accepts an out-of-agenda item that also carries an agenda index', () => {
        expect(isDecisionEligibleSubject(subject({ agendaItemIndex: 3, nonAgendaReason: 'outOfAgenda' }))).toBe(true);
    });

    it('rejects a subject with no agenda index and no reason', () => {
        expect(isDecisionEligibleSubject(subject())).toBe(false);
    });
});

// MeetingDecisionsPage keeps its own split, so each group sorts on its own terms. It
// filters that split with the shared predicate. The swap is safe only while the
// predicate reduces to `!withdrawn` over the split's members, and the split itself
// must now select exactly what the shared rule selects.
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

    it('now agrees with the shared rule on every combination', () => {
        for (const agendaItemIndex of indices) {
            for (const nonAgendaReason of reasons) {
                const s = { agendaItemIndex, nonAgendaReason, withdrawn: false };
                const displayed =
                    (agendaItemIndex !== null && nonAgendaReason === null) ||
                    nonAgendaReason === 'outOfAgenda';
                expect(isDecisionEligibleSubject(s)).toBe(displayed);
            }
        }
    });
});

