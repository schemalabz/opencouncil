import { sortSubjectsBySpeakingTime } from "@/lib/utils";
import type { Statistics } from "@/lib/statistics";

interface CategorizableSubject {
    name: string;
    nonAgendaReason: string | null;
    agendaItemIndex: number | null;
    statistics?: Statistics;
    speakerSegments?: unknown[];
}

export const SUBJECT_CATEGORIES = {
    beforeAgenda: {
        label: 'Προ ημερησίας, συζήτηση και ανακοινώσεις',
        shortLabel: 'Προ ημερησίας',
        explainerText: 'Αυτά τα θέματα είναι ανακοινώσεις, ερωτήματα και συζήτηση για τα οποία δεν υπάρχει ψηφοφορία και δεν λαμβάνονται αποφάσεις, συνήθως στην αρχή της συνεδρίασης.',
    },
    outOfAgenda: {
        label: 'Εκτός ημερησίας θέματα',
        shortLabel: 'Εκτός ημερησίας',
        explainerText: 'Τα εκτός ημερησίας θέματα είναι έκτακτα θέματα που δεν πρόλαβαν να ενταχτούν στην ημερήσια διάταξη της συνεδρίασης. Ψηφίζονται από το σώμα, πρώτα για το κατ\'επείγον, και έπειτα για την ουσία του θέματος.',
    },
    agenda: {
        label: 'Θέματα ημερησίας διάταξης',
        shortLabel: 'Ημερησίας διάταξης',
        explainerText: 'Τα θέματα της ημερησίας διάταξης συζητούνται και ψηφίζονται από το σώμα και αποτελούν το κύριο μέρος της συνεδρίασης.',
    },
} as const;

/**
 * Categorize subjects into their three agenda groups.
 * beforeAgenda and outOfAgenda are sorted by speaking time.
 * agenda is returned unsorted — the consumer decides (agenda index vs speaking time).
 */
export function categorizeSubjects<T extends CategorizableSubject>(subjects: T[]) {
    return {
        beforeAgenda: sortSubjectsBySpeakingTime(
            subjects.filter(s => s.nonAgendaReason === 'beforeAgenda' && s.agendaItemIndex === null)
        ),
        outOfAgenda: sortSubjectsBySpeakingTime(
            subjects.filter(s => s.nonAgendaReason === 'outOfAgenda' && s.agendaItemIndex === null)
        ),
        agenda: subjects.filter(s => s.agendaItemIndex !== null),
    };
}

export function getNonAgendaLabel(reason: 'beforeAgenda' | 'outOfAgenda'): string {
    return SUBJECT_CATEGORIES[reason].shortLabel;
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

