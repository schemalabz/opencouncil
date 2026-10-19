/**
 * The conventions record is written by a task callback and by the admin form,
 * and read back by the derivation (`conventions.provenance.source`) and by the
 * prompt renderer (`normalizeAnchors(c.attendanceChangeAnchors)`), neither of
 * which guards the dereference. The schema is what keeps a half-shaped record
 * out of the column, so what it accepts and refuses is the contract.
 */
import { decisionConventionsSchema, normalizeAnchors, parseDecisionConventions, type DecisionConventions } from '@/lib/decisionConventions';

const VALID: DecisionConventions = {
    version: 1,
    rollCallLayout: 'present_and_absent',
    presentListMeaning: 'opening',
    attendanceChangeAnchors: ['agenda_item', 'decision_number'],
    statesPerDecisionAttendance: false,
    statesPerVoteAbsence: true,
    usesSubstitutes: false,
    namedVoters: 'dissenters_only',
    mayorStatedSeparately: true,
    notes: 'Η ΔΕ τυπώνει ΤΑ ΜΕΛΗ στο τέλος.',
    provenance: { source: 'profile', profiledAt: '2026-09-13', documentsSampled: 20 },
};

describe('decisionConventionsSchema', () => {
    it('accepts a complete record and keeps its values', () => {
        const parsed = decisionConventionsSchema.safeParse(VALID);
        expect(parsed.success).toBe(true);
        expect(parsed.success && parsed.data).toEqual(VALID);
        expect(parseDecisionConventions(VALID)).toEqual(VALID);
    });

    it('accepts a body that names every voter only on a split vote', () => {
        expect(parseDecisionConventions({ ...VALID, namedVoters: 'all_when_split' })?.namedVoters).toBe('all_when_split');
    });

    it('refuses a value outside an enum', () => {
        const parsed = decisionConventionsSchema.safeParse({ ...VALID, namedVoters: 'everyone' });
        expect(parsed.success).toBe(false);
        expect(parsed.success === false && parsed.error.issues[0].path).toEqual(['namedVoters']);
        expect(parseDecisionConventions({ ...VALID, rollCallLayout: 'whatever' })).toBeNull();
    });

    it('accepts a legacy row whose anchors use the pre-2026-09-14 vocabulary', () => {
        // Rows imported on 2026-09-14 say session_phase / this_document / clock_time.
        const legacy = { ...VALID, attendanceChangeAnchors: ['session_phase', 'this_document', 'clock_time'] };
        const parsed = decisionConventionsSchema.safeParse(legacy);
        expect(parsed.success).toBe(true);
        expect(parsed.success && parsed.data.attendanceChangeAnchors).toEqual(normalizeAnchors(legacy.attendanceChangeAnchors));
        expect(parsed.success && parsed.data.attendanceChangeAnchors).toEqual(['phase', 'subject']);
        // The parse returns the record in the current vocabulary, not the stored value.
        expect(parseDecisionConventions(legacy)?.attendanceChangeAnchors).toEqual(['phase', 'subject']);
    });

    it('refuses the shapes the old one-field guard let through, and drops unknown keys', () => {
        expect(parseDecisionConventions({ version: 1 })).toBeNull();
        expect(parseDecisionConventions({ ...VALID, provenance: undefined })).toBeNull();
        expect(parseDecisionConventions({ ...VALID, attendanceChangeAnchors: undefined })).toBeNull();
        const parsed = decisionConventionsSchema.safeParse({ ...VALID, injected: 'x' });
        expect(parsed.success && 'injected' in parsed.data).toBe(false);
    });
});
