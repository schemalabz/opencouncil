import { z } from 'zod';
/**
 * What an administrative body's decision documents state, and how. Extraction
 * reads it to know what the page will look like; the minutes read it to know
 * which facts can be derived and which cannot. Stored on
 * AdministrativeBody.decisionConventions, written by the profiling step in
 * opencouncil-tasks (`body-facts`) and confirmed by a person in admin.
 */
export type RollCallLayout = 'composition_and_absent' | 'present_and_absent' | 'present_only' | 'mixed';
export type PresentListMeaning = 'opening' | 'cumulative' | 'unknown';
export type AttendanceChangeAnchor = 'agenda_item' | 'decision_number' | 'phase' | 'subject';
export type NamedVoters = 'none' | 'dissenters_only' | 'all';

export interface DecisionConventions {
    version: 1;
    rollCallLayout: RollCallLayout;
    /** The decisive axis: does the present list include late arrivals, or is it the opening roll call only? */
    presentListMeaning: PresentListMeaning;
    /** What the documents pin arrivals and departures to; empty when they state none. */
    attendanceChangeAnchors: AttendanceChangeAnchor[];
    /** The document names who was present for this decision (Argos ΑΠΟΧΩΡΗΣΑΝΤΕΣ, Chalandri ΔΣ). */
    statesPerDecisionAttendance: boolean;
    /** «Κατά τη διαδικασία της ψηφοφορίας απουσίαζε…» printed after the decision. */
    statesPerVoteAbsence: boolean;
    usesSubstitutes: boolean;
    namedVoters: NamedVoters;
    mayorStatedSeparately: boolean;
    notes?: string;
    provenance: {
        source: 'profile' | 'manual';
        profiledAt?: string;
        documentsSampled?: number;
        confirmedBy?: string;
        confirmedAt?: string;
    };
}

/**
 * Whether a stored or posted value is a conventions record, in full.
 *
 * The record is written by a task callback and by the admin form, read by the
 * derivation and pasted verbatim into the extraction prompt, so a half-shaped
 * one is a crash in three places rather than a bad hint. `decisionConventions`
 * below is the shape; this is the guard over it.
 */
export function isDecisionConventions(v: unknown): v is DecisionConventions {
    return decisionConventionsSchema.safeParse(v).success;
}

/**
 * Whether a person has stated these conventions. Their statement outranks a
 * profile, so the seed import, the profiling callback and the admin form all ask
 * the question here rather than each reaching into `provenance` its own way. The
 * record must parse first: a half-shaped one saying `manual` is not a statement
 * anyone made.
 */
export function isConfirmedByPerson(v: unknown): boolean {
    return isDecisionConventions(v) && v.provenance.source === 'manual';
}

/** The convention fields and their values; each value has `label`, `description` and `hint` under messages/<locale>/admin.json → conventions. */
export const CONVENTION_FIELDS = {
    rollCallLayout: ['composition_and_absent', 'present_and_absent', 'present_only', 'mixed'],
    presentListMeaning: ['opening', 'cumulative', 'unknown'],
    attendanceChangeAnchors: ['agenda_item', 'decision_number', 'phase', 'subject'],
    namedVoters: ['none', 'dissenters_only', 'all'],
} as const;
export const CONVENTION_FLAGS = ['statesPerDecisionAttendance', 'statesPerVoteAbsence', 'usesSubstitutes', 'mayorStatedSeparately'] as const;

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

/**
 * The conventions record as a schema, built from the same value lists the form
 * and the prompt read. Parsing (rather than type-asserting) is what keeps an
 * unknown key out of the stored JSON and a missing `provenance` or
 * `attendanceChangeAnchors` out of the derivation, which dereferences both.
 *
 * Anchors are normalised before they are checked, so a row imported under the
 * pre-2026-09-14 vocabulary («session_phase») still validates.
 */
export const decisionConventionsSchema = z.object({
    version: z.literal(1),
    rollCallLayout: z.enum(CONVENTION_FIELDS.rollCallLayout),
    presentListMeaning: z.enum(CONVENTION_FIELDS.presentListMeaning),
    attendanceChangeAnchors: z.preprocess(
        v => (Array.isArray(v) && v.every(a => typeof a === 'string') ? normalizeAnchors(v as string[]) : v),
        z.array(z.enum(CONVENTION_FIELDS.attendanceChangeAnchors)),
    ),
    statesPerDecisionAttendance: z.boolean(),
    statesPerVoteAbsence: z.boolean(),
    usesSubstitutes: z.boolean(),
    namedVoters: z.enum(CONVENTION_FIELDS.namedVoters),
    mayorStatedSeparately: z.boolean(),
    notes: z.string().optional(),
    provenance: z.object({
        source: z.enum(['profile', 'manual']),
        profiledAt: z.string().optional(),
        documentsSampled: z.number().optional(),
        confirmedBy: z.string().optional(),
        confirmedAt: z.string().optional(),
    }),
});

/** The schema and the type state one shape; either drifting from the other stops compiling here. */
type Exact<A, B> = A extends B ? (B extends A ? true : never) : never;
const _schemaMatchesType: Exact<z.infer<typeof decisionConventionsSchema>, DecisionConventions> = true;
void _schemaMatchesType;
