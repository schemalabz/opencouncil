/**
 * The title of a meeting, from its facts: the name override, the kind and the
 * session number. The app (src/lib/meetingName.ts) and Notis both build the
 * title here, so the two cannot drift.
 *
 * This package does not depend on Prisma, so it declares the kinds itself.
 * src/lib/meetingName.ts asserts that this list equals Prisma's
 * `MeetingKind`, so a new kind fails to compile until it has words here.
 */
export const MEETING_KINDS = [
    'regular',
    'urgent',
    'accountability',
    'activityReport',
    'budget',
    'presidencyElection',
] as const;

export type MeetingKindName = (typeof MEETING_KINDS)[number];

export function asMeetingKind(value: string | null | undefined): MeetingKindName | null {
    return (MEETING_KINDS as readonly string[]).includes(value ?? '') ? (value as MeetingKindName) : null;
}

interface KindWords {
    /** After a session number: «3η Τακτική». */
    short: string;
    /** Without a number: «Τακτική Συνεδρίαση». */
    full: string;
}

/**
 * The words that municipalities print on the invitation. Only Greek and
 * English have kind words; the other locales name a meeting by the word for
 * "meeting" and the date.
 */
const KIND_WORDS = {
    el: {
        regular: { short: 'Τακτική', full: 'Τακτική Συνεδρίαση' },
        urgent: { short: 'Έκτακτη', full: 'Έκτακτη Συνεδρίαση' },
        accountability: { short: 'Ειδική Λογοδοσίας', full: 'Ειδική Συνεδρίαση Λογοδοσίας' },
        activityReport: { short: 'Ειδική Απολογισμού Πεπραγμένων', full: 'Ειδική Συνεδρίαση Απολογισμού Πεπραγμένων' },
        budget: { short: 'Ειδική Προϋπολογισμού', full: 'Ειδική Συνεδρίαση Προϋπολογισμού' },
        presidencyElection: { short: 'Ειδική Εκλογής Προεδρείου', full: 'Ειδική Συνεδρίαση Εκλογής Προεδρείου' },
    },
    en: {
        regular: { short: 'Regular', full: 'Regular Meeting' },
        urgent: { short: 'Urgent', full: 'Urgent Meeting' },
        accountability: { short: 'Special (Accountability)', full: 'Special Meeting (Accountability)' },
        activityReport: { short: 'Special (Activity Report)', full: 'Special Meeting (Activity Report)' },
        budget: { short: 'Special (Budget)', full: 'Special Meeting (Budget)' },
        presidencyElection: { short: 'Special (Presidency Election)', full: 'Special Meeting (Presidency Election)' },
    },
} as const satisfies Record<'el' | 'en', Record<MeetingKindName, KindWords>>;

/** The word for a meeting whose kind the title cannot name. Serbian Latin comes from the Cyrillic. */
const MEETING_WORD: Record<string, string> = { el: 'Συνεδρίαση', en: 'Meeting', fr: 'Séance', sr: 'Седница' };

function ordinal(n: number, locale: 'el' | 'en'): string {
    if (locale === 'el') return `${n}η`;
    const lastTwo = n % 100;
    const suffix = lastTwo >= 11 && lastTwo <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
    return `${n}${suffix}`;
}

function kindLocale(locale: string): 'el' | 'en' | null {
    return locale === 'el' || locale === 'en' ? locale : null;
}

/**
 * The title that the kind and the number give: «3η Τακτική», or «Τακτική
 * Συνεδρίαση» without a number. Null when the kind is not known or the
 * locale has no kind words.
 */
export function meetingKindTitle(
    kind: MeetingKindName | null,
    sessionNumber: number | null | undefined,
    locale: string,
): string | null {
    const words = kindLocale(locale);
    if (!words || !kind) return null;
    const kindWords = KIND_WORDS[words][kind];
    return sessionNumber ? `${ordinal(sessionNumber, words)} ${kindWords.short}` : kindWords.full;
}

/**
 * The title rule. An override that is set wins, as the admin wrote it.
 * Otherwise a known kind gives «3η Τακτική» or «Τακτική Συνεδρίαση», and an
 * unknown kind gives the word for "meeting" and the date, «Συνεδρίαση
 * 12/03/2026». `dated` says whether the title carries the date, so that a
 * label does not print it twice. `formatDate` gives the date for the locale:
 * each caller keeps its own date format.
 */
export function meetingTitle(
    facts: { override: string | null | undefined; kind: MeetingKindName | null; sessionNumber: number | null | undefined },
    locale: string,
    formatDate: () => string,
): { text: string; dated: boolean } {
    if (facts.override) return { text: facts.override, dated: false };
    const text = meetingKindTitle(facts.kind, facts.sessionNumber, locale);
    if (text) return { text, dated: false };
    const word = MEETING_WORD[locale.split('-')[0]] ?? MEETING_WORD.en;
    return { text: `${word} ${formatDate()}`.trim(), dated: true };
}
