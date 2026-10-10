import * as z from 'zod';

/** The convention fields and their values; each value has `label`, `description` and `hint` under messages/<locale>/admin.json → conventions. */
export const CONVENTION_FIELDS = {
    rollCallLayout: ['composition_and_absent', 'present_and_absent', 'present_only', 'mixed'],
    presentListMeaning: ['opening', 'cumulative', 'per_decision', 'unknown'],
    attendanceChangeAnchors: ['agenda_item', 'decision_number', 'phase', 'subject'],
    namedVoters: ['none', 'dissenters_only', 'all', 'all_when_split'],
} as const;
export const CONVENTION_FLAGS = ['statesPerDecisionAttendance', 'statesPerVoteAbsence', 'usesSubstitutes', 'mayorStatedSeparately', 'listOmitsSecretary'] as const;
export type RollCallLayout = (typeof CONVENTION_FIELDS.rollCallLayout)[number];
export type PresentListMeaning = (typeof CONVENTION_FIELDS.presentListMeaning)[number];
export type AttendanceChangeAnchor = (typeof CONVENTION_FIELDS.attendanceChangeAnchors)[number];
/**
 * Whom a page names with their vote. `all_when_split` names every voter, those
 * in favour included, on a split vote only, and nobody under «Ομόφωνα» (Athens
 * 2η and 7η, Vrilissia ΔΣ, Xylokastro).
 */
export type NamedVoters = (typeof CONVENTION_FIELDS.namedVoters)[number];

/**
 * A stored or posted value as a conventions record, or null when it is not one
 * in full.
 *
 * The record is written by the import and by the admin form, read by the
 * derivation and pasted verbatim into the extraction prompt, so a half-shaped
 * one is a crash in three places rather than a bad hint. The result is the
 * parsed record, not the value: a row with legacy anchor names comes back with
 * the current names, which the admin form and the prompt require.
 */
export function parseDecisionConventions(v: unknown): DecisionConventions | null {
    return decisionConventionsSchema.safeParse(v).data ?? null;
}

/**
 * Whether a person has stated these conventions. Their statement outranks a
 * profile, so the seed import and the admin form both ask the question here
 * rather than each reaching into `provenance` its own way. The record must parse
 * first: a half-shaped one saying `manual` is not a statement anyone made.
 */
export function isConfirmedByPerson(v: unknown): boolean {
    return parseDecisionConventions(v)?.provenance.source === 'manual';
}

/** Anchor names written before the vocabulary settled (rows imported on 2026-09-14). */
const LEGACY_ANCHOR: Record<string, AttendanceChangeAnchor | null> = { session_phase: 'phase', this_document: 'subject', clock_time: null };
export function normalizeAnchors(anchors: readonly string[]): AttendanceChangeAnchor[] {
    const out = new Set<AttendanceChangeAnchor>();
    for (const a of anchors) {
        const v = a in LEGACY_ANCHOR ? LEGACY_ANCHOR[a] : (a as AttendanceChangeAnchor);
        if (v && (CONVENTION_FIELDS.attendanceChangeAnchors as readonly string[]).includes(v)) out.add(v);
    }
    return [...out];
}

const conventionsRecordFields = {
    version: z.literal(1),
    rollCallLayout: z.enum(CONVENTION_FIELDS.rollCallLayout),
    /** The decisive axis: does the present list include late arrivals, or is it the opening roll call only? */
    presentListMeaning: z.enum(CONVENTION_FIELDS.presentListMeaning),
    attendanceChangeAnchors: z.array(z.enum(CONVENTION_FIELDS.attendanceChangeAnchors)),
    /** The document names who was present for this decision (Argos ΑΠΟΧΩΡΗΣΑΝΤΕΣ, Chalandri ΔΣ). */
    statesPerDecisionAttendance: z.boolean(),
    /** «Κατά τη διαδικασία της ψηφοφορίας απουσίαζε…» printed after the decision. */
    statesPerVoteAbsence: z.boolean(),
    usesSubstitutes: z.boolean(),
    namedVoters: z.enum(CONVENTION_FIELDS.namedVoters),
    mayorStatedSeparately: z.boolean(),
    /** ΤΑ ΜΕΛΗ leaves the body's secretary out, as every body's leaves out whoever presides. Absent on records written before 2026-09-22. */
    listOmitsSecretary: z.boolean().optional(),
    notes: z.string().optional(),
    provenance: z.object({
        source: z.enum(['profile', 'manual']),
        profiledAt: z.string().optional(),
        documentsSampled: z.number().optional(),
        confirmedBy: z.string().optional(),
        confirmedAt: z.string().optional(),
    }),
};

/**
 * A conventions record already in the current vocabulary, as the admin form
 * holds it after it parsed the stored one.
 */
export const decisionConventionsRecordSchema = z.object(conventionsRecordFields);

/**
 * The conventions record as a schema, built from the same value lists the form
 * and the prompt read. Parsing (rather than type-asserting) is what keeps an
 * unknown key out of the stored JSON and a missing `provenance` or
 * `attendanceChangeAnchors` out of the derivation, which dereferences both.
 *
 * Anchors are normalised, so a row imported under the pre-2026-09-14
 * vocabulary («session_phase») still validates, and a name outside the
 * vocabulary is dropped.
 */
export const decisionConventionsSchema = z.object({
    ...conventionsRecordFields,
    /** What the documents pin arrivals and departures to; empty when they state none. */
    attendanceChangeAnchors: z.array(z.string()).transform(normalizeAnchors),
});

/**
 * What an administrative body's decision documents state, and how. Extraction
 * reads it to know what the page will look like; the minutes read it to know
 * which facts can be derived and which cannot. Stored on
 * AdministrativeBody.decisionConventions, written by a person in admin or by the
 * import of fixtures/body-conventions.json.
 */
export type DecisionConventions = z.output<typeof decisionConventionsSchema>;
