/**
 * The title of a meeting, from its facts: the kind, the urgency and the
 * session number, or the legacy stored name of a meeting without a kind. The app (src/lib/meetingName.ts) and Notis both build the
 * title here, so the two cannot drift.
 *
 * This package does not depend on Prisma, so it declares the kinds itself.
 * src/lib/meetingName.ts asserts that this list equals Prisma's
 * `MeetingKind`, so a new kind fails to compile until it has words here.
 */
export const MEETING_KINDS = [
    'ordinary',
    'special',
    'accountability',
    'activityReport',
    'budget',
    'presidencyElection',
    'financialAccounts',
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
        ordinary: { short: 'Τακτική', full: 'Τακτική Συνεδρίαση' },
        special: { short: 'Ειδική', full: 'Ειδική Συνεδρίαση' },
        accountability: { short: 'Ειδική Λογοδοσίας', full: 'Ειδική Συνεδρίαση Λογοδοσίας' },
        activityReport: { short: 'Ειδική Απολογισμού Πεπραγμένων', full: 'Ειδική Συνεδρίαση Απολογισμού Πεπραγμένων' },
        budget: { short: 'Ειδική Προϋπολογισμού', full: 'Ειδική Συνεδρίαση Προϋπολογισμού' },
        presidencyElection: { short: 'Ειδική Εκλογής Προεδρείου', full: 'Ειδική Συνεδρίαση Εκλογής Προεδρείου' },
        financialAccounts: { short: 'Ειδική Οικονομικών Καταστάσεων', full: 'Ειδική Συνεδρίαση Οικονομικών Καταστάσεων' },
    },
    en: {
        ordinary: { short: 'Regular', full: 'Regular Meeting' },
        special: { short: 'Special', full: 'Special Meeting' },
        accountability: { short: 'Special Accountability', full: 'Special Accountability Meeting' },
        activityReport: { short: 'Special Activity Report', full: 'Special Activity Report Meeting' },
        budget: { short: 'Special Budget', full: 'Special Budget Meeting' },
        presidencyElection: { short: 'Special Presidency Election', full: 'Special Presidency Election Meeting' },
        financialAccounts: { short: 'Special Financial Accounts', full: 'Special Financial Accounts Meeting' },
    },
} as const satisfies Record<'el' | 'en', Record<MeetingKindName, KindWords>>;

/**
 * The words of an urgent meeting. An urgent ordinary meeting is «Έκτακτη»
 * alone: «2η Έκτακτη», «Έκτακτη Συνεδρίαση». Any other kind keeps its words
 * after the urgency: «2η Έκτακτη Ειδική Προϋπολογισμού». The law says
 * «κατεπείγουσα», but municipalities print «έκτακτη».
 */
const URGENT_WORDS = {
    el: { prefix: 'Έκτακτη', ordinary: { short: 'Έκτακτη', full: 'Έκτακτη Συνεδρίαση' } },
    en: { prefix: 'Urgent', ordinary: { short: 'Urgent', full: 'Urgent Meeting' } },
} as const satisfies Record<'el' | 'en', { prefix: string; ordinary: KindWords }>;

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
 * The title that the kind, the urgency and the number give: «3η Τακτική»,
 * «2η Έκτακτη», «Έκτακτη Ειδική Προϋπολογισμού», or «Τακτική Συνεδρίαση»
 * without a number. Null when the kind is not known or the locale has no
 * kind words.
 */
export function meetingKindTitle(
    kind: MeetingKindName | null,
    sessionNumber: number | null | undefined,
    locale: string,
    urgent = false,
): string | null {
    const words = kindLocale(locale);
    if (!words || !kind) return null;
    const number = sessionNumber ? `${ordinal(sessionNumber, words)} ` : '';
    if (urgent && kind === 'ordinary') {
        const urgentWords = URGENT_WORDS[words].ordinary;
        return number ? `${number}${urgentWords.short}` : urgentWords.full;
    }
    const kindWords = KIND_WORDS[words][kind];
    if (urgent) return `${number}${URGENT_WORDS[words].prefix} ${kindWords.short}`;
    return number ? `${number}${kindWords.short}` : kindWords.full;
}

/**
 * The title rule. A known kind gives «3η Τακτική» or «Τακτική Συνεδρίαση»,
 * and a stored name is ignored. A meeting without a kind falls back to its
 * legacy stored name: that name already says the body and the date
 * («Δημοτικό Συμβούλιο 11/03/26»), so it is the title and the whole label
 * (`wholeLabel`). Without a kind and without a stored name, the title is the
 * word for "meeting" and the date, «Συνεδρίαση 12/03/2026»: the number and
 * the urgency need a kind. `dated` says whether the title carries the date,
 * so that a label does not print it twice. `formatDate` gives the date for
 * the locale: each caller keeps its own date format. The caller picks the
 * stored name in the language of the locale.
 */
export function meetingTitle(
    facts: {
        storedName: string | null | undefined;
        kind: MeetingKindName | null;
        sessionNumber: number | null | undefined;
        urgent?: boolean;
    },
    locale: string,
    formatDate: () => string,
): { text: string; dated: boolean; wholeLabel: boolean } {
    if (facts.kind) {
        const text = meetingKindTitle(facts.kind, facts.sessionNumber, locale, facts.urgent);
        if (text) return { text, dated: false, wholeLabel: false };
    } else if (facts.storedName) {
        return { text: facts.storedName, dated: false, wholeLabel: true };
    }
    const word = MEETING_WORD[locale.split('-')[0]] ?? MEETING_WORD.en;
    return { text: `${word} ${formatDate()}`.trim(), dated: true, wholeLabel: false };
}
