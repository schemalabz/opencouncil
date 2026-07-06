import { sortSubjectsBySpeakerContributionCount } from "@/lib/utils";
import type { Statistics } from "@/lib/statistics";

interface CategorizableSubject {
    name: string;
    nonAgendaReason: string | null;
    agendaItemIndex: number | null;
    statistics?: Statistics;
    speakerSegments?: unknown[];
    _count?: { contributions?: number };
}

export const SUBJECT_CATEGORY_KEYS = ['beforeAgenda', 'outOfAgenda', 'agenda'] as const;
export type SubjectCategoryKey = typeof SUBJECT_CATEGORY_KEYS[number];

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
 */
export function getWithdrawnLabel(subject: { nonAgendaReason: string | null }, mode: 'short' | 'long' = 'short'): string {
    if (subject.nonAgendaReason === 'outOfAgenda') {
        return mode === 'short' ? 'Δεν εγκρίθηκε' : 'Το θέμα δεν εγκρίθηκε ως έκτακτο.';
    }
    return mode === 'short' ? 'Αποσύρθηκε' : 'Το θέμα αποσύρθηκε και δεν συζητήθηκε.';
}

