import type { MeetingKind, MeetingScheduleStatus } from '@prisma/client';

/**
 * The reading of stored names behind the reviewed backfill of the meeting
 * record (scripts/meeting-lifecycle-report.ts). The kind, the urgency, the
 * session number and the format come from the invitation, which processAgenda
 * reads; the name gives the cancellations and postponements, a fallback kind, and what it says
 * beyond the facts. The backfill writes no name (#150): the names stay as the
 * legacy fallback until a later migration drops them, after a check of what
 * each still says that no column holds.
 */

/** Lower case, no accents: «Ακυρώθηκε» and «ΑΚΥΡΩΘΗΚΕ» read the same. */
function fold(text: string): string {
    return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

const DATE = /\b\d{1,2}\/\d{1,2}\/(?:\d{4}|\d{2})\b/g;
// \b and \w know ASCII letters only, so the Greek patterns use \p{L}.
const ORDINAL = /(?<![\d\p{L}])(\d{1,3})\s*ης?(?!\p{L})/u;

// A bare «απολογισμός» says no kind: the Code also calls the financial
// accounts that (art. 515). A bare «ειδική» says none either: the archive
// names budget votes and presidency elections «Ειδική Συνεδρίαση».
const KIND_STEMS: Array<[stem: RegExp, kind: MeetingKind]> = [
    [/λογοδοσ/, 'accountability'],
    [/απολογισμ\p{L}* πεπραγμεν/u, 'activityReport'],
    [/προυπολογισμ/, 'budget'],
    [/εκλογ\p{L}* προεδρει/u, 'presidencyElection'],
    [/ισολογισμ|οικονομικ\p{L}* καταστασ/u, 'financialAccounts'],
];

/** Urgency is not a kind: «Έκτακτη Συνεδρίαση», «κατεπείγουσα». */
const URGENT = /εκτακτ|κατεπειγ/;

/** The words that a derived name says anyway: the body, the kind, «Συνεδρίαση». */
const DERIVED_WORDS = new Set([
    'συνεδριαση', 'συνεδριασης', 'τακτικη', 'ειδικη', 'εκτακτη', 'κατεπειγουσα', 'λογοδοσιας', 'λογοδοσια',
    'απολογισμου', 'πεπραγμενων', 'προυπολογισμου', 'εκλογης', 'προεδρειου', 'οικονομικων', 'καταστασεων',
    'δημοτικο', 'δημοτικου', 'συμβουλιο', 'συμβουλιου', 'δημοτικη', 'δημοτικης', 'επιτροπη', 'επιτροπης',
    'του', 'της',
]);

export interface StoredNameAnalysis {
    /** The text of each `[…]` group, as stored. */
    brackets: string[];
    /** The brackets that no column holds: the derived name does not say them. */
    unmappedBrackets: string[];
    proposedStatus: 'cancelled' | 'postponed' | null;
    /** «[Διεκόπη]»: the meeting took place and was interrupted. No status. */
    interrupted: boolean;
    /** The kind that the words of the name say, when they say one. */
    proposedKind: MeetingKind | null;
    /** The name says «Έκτακτη». */
    urgent: boolean;
    /** The record holds two meetings («Λογοδοσία και Δημοτικό Συμβούλιο»). */
    combined: boolean;
    /** The words that are not the body, a kind, «Συνεδρίαση», a date or an ordinal. */
    leftover: string[];
    /** An ordinal in the name («4η»). */
    ordinal: number | null;
    note: 'special-unknown' | null;
}

/**
 * The status that a bracket says. «Ματαιώθηκε» is the word of the law for a
 * cancellation (art. 124 §5). «Δεν πραγματοποιήθηκε» reads as a cancellation
 * too: a meeting without a quorum is cancelled and convened anew. Whether it
 * was postponed instead, the report tells from the next meeting.
 */
function statusOfBracket(foldedBracket: string): 'cancelled' | 'postponed' | null {
    if (['ακυρωθηκε', 'δεν πραγματοποιηθηκε', 'ματαιωθηκε'].some((word) => foldedBracket.includes(word))) return 'cancelled';
    if (/αναβολη|αναβληθηκε/.test(foldedBracket)) return 'postponed';
    return null;
}

/**
 * What an invitation says about a postponement: «ΑΠΟ ΑΝΑΒΟΛΗ», «ΕΞ ΑΝΑΒΟΛΗΣ»
 * convene the new meeting after one (`after`); «Αναβολή συνεδρίασης …»
 * announces that this meeting is postponed (`notice`).
 */
export function postponementInInvitation(text: string): 'after' | 'notice' | null {
    const folded = fold(text);
    if (/(?:απο|εξ)\s*(?:\d+\s*η\s*)?αναβολ/.test(folded)) return 'after';
    if (/αναβολ/.test(folded)) return 'notice';
    return null;
}

/**
 * Reads a stored name. The date in the name is not compared with the date of
 * the meeting: a different date or a two-digit year is a typo that the
 * derived name fixes («Δημοτικό Συμβούλιο 23/03/2025» on a 2026 meeting).
 */
export function analyzeStoredName(name: string, { bodyName }: { bodyName: string | null }): StoredNameAnalysis {
    const brackets = [...name.matchAll(/\[([^\]]*)\]/g)].map((match) => match[1].trim());
    const foldedBrackets = brackets.map(fold);
    const statuses = foldedBrackets.map(statusOfBracket);
    const proposedStatus = statuses.find((status) => status !== null) ?? null;
    const interrupted = foldedBrackets.some((b) => b.includes('διεκοπη'));
    const unmappedBrackets = brackets.filter((_, i) => statuses[i] === null);

    // The words outside every bracket; an unmapped bracket counts on its own.
    const text = fold(name.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim());
    const combined = /\s(και|&)\s/.test(text);
    const kinds = KIND_STEMS.filter(([stem]) => stem.test(text)).map(([, kind]) => kind);
    const proposedKind = !combined && kinds.length === 1 ? kinds[0] : null;
    const urgent = !combined && URGENT.test(text);
    const special = /ειδικ/.test(text);
    const note = special && kinds.length === 0 ? 'special-unknown' : null;
    const ordinal = text.match(ORDINAL);

    const bodyWords = new Set(bodyName ? fold(bodyName).split(/\s+/) : []);
    const leftover = text
        .replace(DATE, ' ')
        .replace(new RegExp(ORDINAL.source, 'gu'), ' ')
        .replace(/[-–—·.,:;()&/]/g, ' ')
        .split(/\s+/)
        .filter((word) => word && !DERIVED_WORDS.has(word) && !bodyWords.has(word));

    return {
        brackets,
        unmappedBrackets,
        proposedStatus,
        interrupted,
        proposedKind,
        urgent,
        combined,
        leftover,
        ordinal: ordinal ? Number(ordinal[1]) : null,
        note,
    };
}

/**
 * What a stored name says that the derived name of the record does not:
 * the check to run before a migration drops the names (#150). Null when the
 * derived name loses nothing: the name says only the body, the kind, the
 * urgency, the number and the status that the record holds, and a date. A name that says
 * only the body and the date loses nothing even without a kind, as the label
 * prints both around «Συνεδρίαση <date>».
 */
export function storedNameLoss(
    analysis: StoredNameAnalysis,
    record: { kind: MeetingKind | null; urgent: boolean; sessionNumber: number | null; scheduleStatus: MeetingScheduleStatus },
): string | null {
    if (analysis.combined) return 'two meetings in one record';
    if (analysis.proposedStatus && analysis.proposedStatus !== record.scheduleStatus) return `the name says ${analysis.proposedStatus}, the record ${record.scheduleStatus}`;
    if (analysis.unmappedBrackets.length > 0) return `bracket no column holds: ${analysis.unmappedBrackets.join(', ')}`;
    if (analysis.leftover.length > 0) return `words beyond body, kind and date: ${analysis.leftover.join(' ')}`;
    if (analysis.note === 'special-unknown' && (record.kind === null || record.kind === 'ordinary')) return 'a special meeting whose kind is unknown';
    if (analysis.proposedKind && analysis.proposedKind !== record.kind) return `the name says ${analysis.proposedKind}, the record ${record.kind ?? 'none'}`;
    if (analysis.urgent && !record.urgent) return 'the name says urgent, the record does not';
    if (analysis.ordinal !== null && analysis.ordinal !== record.sessionNumber) {
        return `the name says number ${analysis.ordinal}, the record ${record.sessionNumber ?? 'none'}`;
    }
    return null;
}
