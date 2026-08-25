import { sortSubjectsBySpeakerContributionCount } from "@/lib/utils";
import type { Statistics } from "@/lib/statistics";

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
type Translate = (key: string) => string;

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
            subjects.filter(s => s.nonAgendaReason === 'beforeAgenda' && s.agendaItemIndex === null)
        ),
        outOfAgenda: sortSubjectsBySpeakerContributionCount(
            subjects.filter(s => s.nonAgendaReason === 'outOfAgenda' && s.agendaItemIndex === null)
        ),
        agenda: subjects.filter(s => s.agendaItemIndex !== null),
    };
}

export function getNonAgendaLabel(t: Translate, reason: 'beforeAgenda' | 'outOfAgenda'): string {
    return t(`categories.${reason}.shortLabel`);
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
 * The floor for a discussion-time bar, as a percentage. A subject that was
 * discussed for seconds still gets a visible mark: a hairline reads as a
 * rendering fault rather than as "barely discussed".
 */
const HOT_TOPIC_BAR_MIN_PCT = 6;

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
    if (maxSeconds <= 0) return HOT_TOPIC_BAR_MIN_PCT;
    const pct = (100 * Math.max(0, seconds)) / maxSeconds;
    return Math.min(100, Math.max(HOT_TOPIC_BAR_MIN_PCT, pct));
}

