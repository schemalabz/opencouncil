import { sortSubjectsBySpeakerContributionCount, sortSubjectsByImportance } from "@/lib/utils";
import type { Statistics } from "@/lib/statistics";

/**
 * How many agenda items a meeting card previews.
 *
 * Lives here rather than beside the query that honours it: `src/lib/db/meetings.ts`
 * is a "use server" module, which may export nothing but async functions.
 */
export const SUBJECT_PREVIEW_COUNT = 3;

interface CategorizableSubject {
    name: string;
    nonAgendaReason: string | null;
    agendaItemIndex: number | null;
    statistics?: Statistics;
    _count?: { contributions?: number };
}

export const SUBJECT_CATEGORY_KEYS = ['beforeAgenda', 'outOfAgenda', 'agenda'] as const;
export type SubjectCategoryKey = typeof SUBJECT_CATEGORY_KEYS[number];

/**
 * The translator every helper here takes.
 *
 * @translationNamespace Subject
 */
export type Translate = (key: string) => string;

/**
 * Translated labels for the three agenda categories. Pass a translator scoped to
 * the `Subject` namespace (e.g. `useTranslations('Subject')`).
 */
export function getSubjectCategories(
    t: Translate,
): Record<SubjectCategoryKey, { label: string; shortLabel: string; explainerText: string }> {
    return {
        beforeAgenda: {
            label: t('categories.beforeAgenda.label'),
            shortLabel: t('categories.beforeAgenda.shortLabel'),
            explainerText: t('categories.beforeAgenda.explainerText'),
        },
        outOfAgenda: {
            label: t('categories.outOfAgenda.label'),
            shortLabel: t('categories.outOfAgenda.shortLabel'),
            explainerText: t('categories.outOfAgenda.explainerText'),
        },
        agenda: {
            label: t('categories.agenda.label'),
            shortLabel: t('categories.agenda.shortLabel'),
            explainerText: t('categories.agenda.explainerText'),
        },
    };
}

/**
 * Categorize subjects into their three agenda groups.
 * beforeAgenda and outOfAgenda are sorted by speaker contribution count.
 * agenda is returned unsorted — the consumer decides (agenda index vs contribution count).
 */
export function categorizeSubjects<T extends CategorizableSubject>(subjects: T[]) {
    return {
        beforeAgenda: sortSubjectsBySpeakerContributionCount(
            subjects.filter(s => subjectCategory(s) === 'beforeAgenda')
        ),
        outOfAgenda: sortSubjectsBySpeakerContributionCount(
            subjects.filter(s => subjectCategory(s) === 'outOfAgenda')
        ),
        agenda: subjects.filter(s => subjectCategory(s) === 'agenda'),
    };
}

/**
 * The agenda category of a subject, index first: an assigned `agendaItemIndex`
 * wins over a `nonAgendaReason` of `outOfAgenda`, so a subject that carries both
 * counts as a regular agenda item. The public meeting page and its sidebar read
 * this, through `categorizeSubjects` — the TOC and the chapter rail included.
 *
 * `recordSection` below states the opposite precedence, reason first, and the
 * meeting record (the decisions page, the minutes) reads that one. The two
 * rules disagree on purpose. Do not change one to match the other: either edit
 * moves subjects between the blocks of a live page. The TODO in
 * `src/lib/tasks/pollDecisions.ts` holds the decision to unify them.
 */
export function subjectCategory(subject: {
    nonAgendaReason: string | null;
    agendaItemIndex: number | null;
}): SubjectCategoryKey | null {
    if (subject.agendaItemIndex !== null) return 'agenda';
    if (subject.nonAgendaReason === 'beforeAgenda' || subject.nonAgendaReason === 'outOfAgenda') {
        return subject.nonAgendaReason;
    }
    return null;
}

export function getNonAgendaLabel(t: Translate, reason: 'beforeAgenda' | 'outOfAgenda'): string {
    return t(`categories.${reason}.shortLabel`);
}

/**
 * Whether a subject belongs to the meeting's record — the minutes and the
 * decisions page must agree on this, or a subject shows on one and not the
 * other.
 *
 * A subject belongs when it has an agenda position (`agendaItemIndex != null`,
 * so item 0 counts) or it was taken up out of the agenda. A `beforeAgenda`
 * subject never belongs, whatever index the agenda PDF gave it.
 */
export function isRecordSubject(subject: { agendaItemIndex: number | null; nonAgendaReason: string | null }): boolean {
    if (subject.nonAgendaReason === 'beforeAgenda') return false;
    return subject.agendaItemIndex != null || subject.nonAgendaReason === 'outOfAgenda';
}

/** The two registers the meeting's record subjects are listed under. */
export type RecordSection = 'agenda' | 'outOfAgenda';

/**
 * Which register a record subject is listed under, reason first: this reads
 * `nonAgendaReason` and never the index, because an out-of-agenda subject can
 * carry an `agendaItemIndex` the agenda PDF gave it, and bucketing on the index
 * alone files it as a regular agenda item. The decisions page and the minutes
 * read this. Every surface that splits the two blocks or labels them must call
 * it — a list bucketed one way and labelled the other puts the wrong heading
 * over the wrong rows.
 *
 * `subjectCategory` above states the opposite precedence, index first, and the
 * public meeting page reads that one. The two rules disagree on purpose. The
 * TODO in `src/lib/tasks/pollDecisions.ts` holds the decision to unify them.
 */
export function recordSection(subject: { nonAgendaReason: string | null }): RecordSection {
    return subject.nonAgendaReason === 'outOfAgenda' ? 'outOfAgenda' : 'agenda';
}

/**
 * The section heading a row opens, or null when it continues the section above it.
 *
 * Both blocks carry one. A rule that only ever opened the out-of-agenda block
 * labelled whichever block followed it, which is what agenda order does now that
 * it starts with the out-of-agenda rows instead of ending with them.
 */
export function sectionHeadingAt(
    section: ReadonlyArray<{ nonAgendaReason: string | null }>,
    index: number,
): RecordSection | null {
    const row = section[index];
    if (!row) return null;
    const here = recordSection(row);
    if (index === 0) return here;
    return recordSection(section[index - 1]) === here ? null : here;
}

/**
 * The agenda marker with its register named: "Ημερησίας διάταξης #24" for an
 * agenda item, the προ/εκτός shortLabel otherwise. Three surfaces compose this
 * (meeting timeline, subject rows, contribution cards) — a bare "#24" told a
 * reader nothing.
 */
export function getAgendaFullLabel(t: Translate, subject: { agendaItemIndex: number | null; nonAgendaReason: string | null }): string | null {
    const label = getAgendaLabel(t, subject);
    if (label === null) return null;
    return subject.agendaItemIndex ? `${t('categories.agenda.shortLabel')} ${label}` : label;
}

/** The agenda marker shown on a subject card: "#index", the non-agenda label, or none. */
export function getAgendaLabel(t: Translate, subject: { agendaItemIndex: number | null; nonAgendaReason: string | null }): string | null {
    if (subject.agendaItemIndex) return `#${subject.agendaItemIndex}`;
    if (subject.nonAgendaReason === 'beforeAgenda' || subject.nonAgendaReason === 'outOfAgenda') {
        return getNonAgendaLabel(t, subject.nonAgendaReason);
    }
    return null;
}

/**
 * Returns the withdrawn label for a subject based on whether it's an IN_AGENDA
 * item that was withdrawn/postponed, or an OUT_OF_AGENDA item that was rejected.
 * "short" for compact UI (cards, TOC), "long" for detail pages with full sentence.
 * Pass a translator scoped to the `Subject` namespace (e.g. `useTranslations('Subject')`).
 */
export function getWithdrawnLabel(t: Translate, subject: { nonAgendaReason: string | null }, mode: 'short' | 'long' = 'short'): string {
    if (subject.nonAgendaReason === 'outOfAgenda') {
        return mode === 'short' ? t('notApprovedShort') : t('notApprovedLong');
    }
    return mode === 'short' ? t('withdrawnShort') : t('withdrawnLong');
}

/**
 * The subjects a block of the meeting summary widget shows: the `max` most
 * discussed ones, most discussed first — the same ranking as the meetings widget.
 */
export function pickSummarySubjects<T extends { name: string; _count?: { contributions?: number } }>(subjects: T[], max: number): T[] {
    return sortSubjectsByImportance(subjects, 'importance').slice(0, max);
}

/**
 * The title the minutes print and the decision matcher reads: the item as written
 * on the official agenda when processAgenda kept it, else the summary name (#616).
 * The web pages keep showing `name`. A blank stored title reads as no title.
 */
export function agendaItemTitleOrName(subject: { name: string; agendaItemTitle: string | null }): string {
    return subject.agendaItemTitle?.trim() ? subject.agendaItemTitle : subject.name;
}

/**
 * The floor for a measured bar, as a percentage. A subject that was discussed for
 * seconds still gets a visible mark: a hairline reads as a rendering fault rather
 * than as "barely discussed".
 */
const BAR_MIN_PCT = 6;

/**
 * Width of a bar drawn against the largest value beside it, as a percentage.
 *
 * The one place the geometry of a measured bar lives — the rail cards draw
 * through it. Total over every ratio a caller can arrive at, including the ones
 * a division produces on the way: `0 / 0` is NaN and `n / 0` is Infinity, and
 * both mean "there is nothing to compare against yet", which is the floor rather
 * than a bar of NaN pixels or one wider than its own track.
 */
export function meterBarWidth(ratio: number): number {
    if (!Number.isFinite(ratio)) return BAR_MIN_PCT;
    return Math.min(100, Math.max(BAR_MIN_PCT, 100 * ratio));
}

