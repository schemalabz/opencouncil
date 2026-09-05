import { sortSubjectsBySpeakerContributionCount } from "@/lib/utils";
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
 * The one agenda-category predicate. An assigned agendaItemIndex wins over a
 * lingering nonAgendaReason, exactly as categorizeSubjects has always
 * bucketed — every surface (TOC, chapter rail) must agree on this.
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
 * The floor for a measured bar, as a percentage. A subject that was discussed for
 * seconds still gets a visible mark: a hairline reads as a rendering fault rather
 * than as "barely discussed".
 */
const BAR_MIN_PCT = 6;

/**
 * Width of a bar drawn against the largest value beside it, as a percentage.
 *
 * The one place the geometry of a measured bar lives — the hot-topic rows and the
 * rail cards both draw through it. Total over every ratio a caller can arrive at,
 * including the ones a division produces on the way: `0 / 0` is NaN and `n / 0` is
 * Infinity, and both mean "there is nothing to compare against yet", which is the
 * floor rather than a bar of NaN pixels or one wider than its own track.
 */
export function meterBarWidth(ratio: number): number {
    if (!Number.isFinite(ratio)) return BAR_MIN_PCT;
    return Math.min(100, Math.max(BAR_MIN_PCT, 100 * ratio));
}

/**
 * Width of a subject's discussion-time bar, as a percentage of the most-discussed
 * subject in the same list. Ranking is relative by design — the bar answers "how
 * does this compare with the one at the top", not "how long in absolute terms",
 * which the minutes label already says.
 *
 * `maxSeconds <= 0` means nothing in the list has been transcribed yet, so there is
 * no ratio to draw; every bar sits at the floor.
 */
export function hotTopicBarWidth(seconds: number, maxSeconds: number): number {
    if (maxSeconds <= 0) return BAR_MIN_PCT;
    return meterBarWidth(Math.max(0, seconds) / maxSeconds);
}

