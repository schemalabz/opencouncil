import type { MeetingFormat, MeetingKind } from '@prisma/client';

/**
 * The detection behind the reviewed backfill of the meeting record
 * (scripts/meeting-lifecycle-report.ts). Every result is a proposal that a
 * person reviews in the report before the apply script writes it.
 */

/** Lower case, no accents: «Ακυρώθηκε» and «ΑΚΥΡΩΘΗΚΕ» read the same. */
function fold(text: string): string {
    return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

const DATE = /\b\d{1,2}\/\d{1,2}\/(?:\d{4}|\d{2})\b/g;
// \b and \w know ASCII letters only, so the Greek patterns use \p{L}.
const ORDINAL = /(?<![\d\p{L}])(\d{1,3})\s*ης?(?!\p{L})/u;

const KIND_STEMS: Array<[stem: RegExp, kind: MeetingKind]> = [
    [/λογοδοσ/, 'accountability'],
    [/εκτακτ/, 'urgent'],
    [/απολογισμ/, 'annualReport'],
    [/προυπολογισμ/, 'budget'],
    [/εκλογ\p{L}* προεδρει/u, 'presidencyElection'],
];

/** The words that a derived name says anyway: the body, the kind, «Συνεδρίαση». */
const DERIVED_WORDS = new Set([
    'συνεδριαση', 'συνεδριασης', 'τακτικη', 'ειδικη', 'εκτακτη', 'λογοδοσιας', 'λογοδοσια',
    'απολογισμου', 'προυπολογισμου', 'εκλογης', 'προεδρειου',
    'δημοτικο', 'δημοτικου', 'συμβουλιο', 'συμβουλιου', 'δημοτικη', 'δημοτικης', 'επιτροπη', 'επιτροπης',
    'του', 'της',
]);

export interface StoredNameAnalysis {
    /** The text of each `[…]` group, as stored. */
    brackets: string[];
    /** The name without brackets and with single spaces: what a kept override becomes. */
    cleanedName: string;
    proposedStatus: 'cancelled' | null;
    /** «[Διεκόπη]»: the meeting took place and was interrupted. No status. */
    interrupted: boolean;
    proposedKind: MeetingKind | null;
    /** The record holds two meetings («Λογοδοσία και Δημοτικό Συμβούλιο»). */
    combined: boolean;
    /** Nothing is lost when the stored name is cleared and the name is derived. */
    derivable: boolean;
    /** An ordinal in the name («4η»), for the numbering research. */
    ordinal: number | null;
    note: 'special-unknown' | null;
}

/**
 * Reads a stored name. The date in the name is not compared with the date of
 * the meeting: a different date or a two-digit year is a typo that the
 * derived name fixes («Δημοτικό Συμβούλιο 23/03/2025» on a 2026 meeting).
 */
export function analyzeStoredName(name: string, { bodyName }: { bodyName: string | null }): StoredNameAnalysis {
    const brackets = [...name.matchAll(/\[([^\]]*)\]/g)].map((match) => match[1].trim());
    const cleanedName = name.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
    const foldedBrackets = brackets.map(fold);
    const proposedStatus = foldedBrackets.some((b) => b.includes('ακυρωθηκε') || b.includes('δεν πραγματοποιηθηκε')) ? 'cancelled' : null;
    const interrupted = foldedBrackets.some((b) => b.includes('διεκοπη'));

    const text = fold(cleanedName);
    const combined = /\s(και|&)\s/.test(text);
    const kinds = KIND_STEMS.filter(([stem]) => stem.test(text)).map(([, kind]) => kind);
    const proposedKind = !combined && kinds.length === 1 ? kinds[0] : null;
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
    const derivable = !combined && note === null && leftover.length === 0;

    return {
        brackets,
        cleanedName,
        proposedStatus,
        interrupted,
        proposedKind,
        combined,
        derivable,
        ordinal: ordinal ? Number(ordinal[1]) : null,
        note,
    };
}

/** A sentence of the source text around a match, for the reviewer. */
function evidence(source: string, index: number): string {
    // Folding keeps one character per character for Greek and Latin text in
    // NFC, so an index into the folded text points at the same place in the source.
    return source.slice(Math.max(0, index - 60), index + 80).replace(/\s+/g, ' ').trim();
}

/**
 * The format that an invitation states. Since 29 June 2026 the invitation
 * must state it (art. 124 §1); older ones often do. Null when the text says
 * nothing about it: the default, in person, then stays.
 */
export function proposeFormat(text: string): { format: MeetingFormat; evidence: string } | null {
    const source = text.normalize('NFC');
    const folded = fold(source);
    const find = (pattern: RegExp) => folded.search(pattern);
    const circulation = find(/δια περιφορ/);
    const mixed = find(/μεικτ|μικτη συνεδρ/);
    const inPerson = find(/δια ζωσης/);
    const tele = find(/τηλεδιασκεψ|\bteams\b|\bzoom\b|\bwebex\b/);

    if (circulation >= 0) return { format: 'byCirculation', evidence: evidence(source, circulation) };
    if (mixed >= 0) return { format: 'mixed', evidence: evidence(source, mixed) };
    if (inPerson >= 0 && tele >= 0) return { format: 'mixed', evidence: evidence(source, Math.min(inPerson, tele)) };
    if (tele >= 0) return { format: 'teleconference', evidence: evidence(source, tele) };
    if (inPerson >= 0) return { format: 'inPerson', evidence: evidence(source, inPerson) };
    return null;
}

/**
 * The formats of the session number that the numbering research found
 * reliable (plans/issue-150-numbering-research.md). Other cities print an
 * invitation number (Σπάρτη) or a count of invitations of one kind
 * (Χαλάνδρι), which looks like a session number and is not one, so they get
 * no proposal.
 */
const SESSION_NUMBER_PATTERNS: Record<string, RegExp> = {
    // «στην 15η Συνεδρίαση του Σώματος», «της 14ης Ειδικής Συνεδρίασης Λογοδοσίας»
    athens: /(?:στην|της) (\d{1,3})(?:η|ης) (?:(?:ειδικ|εκτακτ|τακτικ)\p{L}* )?συνεδριασ/u,
    // «Για την 12η/2026 Τακτική Συνεδρίαση»
    vrilissia: /για την (\d{1,3})η\s*\/\s*20\d\d/,
    // «για την 11η ΕΚΤΑΚΤΗ ΔΗΜΟΣΙΑ ΣΥΝΕΔΡΙΑΣΗ», «4ης ΕΙΔΙΚΗΣ ΣΥΝΕΔΡΙΑΣΗΣ»
    samothraki: /(\d{1,3})(?:η|ης) (?:(?:τακτικ|εκτακτ|ειδικ|δημοσι)\p{L}* ){0,2}συνεδριασ/u,
    // «ΤΑΚΤΙΚΗ ΣΥΝΕΔΡΙΑΣΗ (3η)», «ΕΙΔΙΚΗ (7η) συνεδρίαση». Ζωγράφου numbers each kind separately.
    zografou: /(?:τακτικη|εκτακτη|ειδικη)(?: συνεδριαση)? \((\d{1,3})η\)/,
};

export function proposeSessionNumber(cityId: string, text: string): { number: number; evidence: string } | null {
    const pattern = SESSION_NUMBER_PATTERNS[cityId];
    if (!pattern) return null;
    const source = text.normalize('NFC').replace(/\s+/g, ' ');
    const folded = fold(source);
    const match = pattern.exec(folded);
    if (!match) return null;
    return { number: Number(match[1]), evidence: evidence(source, match.index) };
}

/**
 * The hosts that agenda PDFs come from. An editor sets `agendaUrl`, and this
 * report script runs on an operator's machine, so it fetches only https URLs on these
 * hosts. Every agenda of the archive is on the uploads bucket; --agenda-host
 * adds another one.
 */
export const DEFAULT_AGENDA_HOSTS = ['townhalls-gr.fra1.digitaloceanspaces.com'];

export function isAllowedAgendaUrl(url: string, hosts: readonly string[]): boolean {
    try {
        const parsed = new URL(url);
        // The default https port only: a stored URL must not reach another service on an allowed host.
        return parsed.protocol === 'https:' && parsed.port === '' && hosts.includes(parsed.hostname);
    } catch {
        return false;
    }
}
