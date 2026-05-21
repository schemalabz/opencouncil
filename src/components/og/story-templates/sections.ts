import type { PreviewSubject } from "./types";

export function splitSubjects(subjects: PreviewSubject[]) {
    const preAgenda = subjects.filter((s) => s.nonAgendaReason === "beforeAgenda");
    const outOfAgenda = subjects.filter((s) => s.nonAgendaReason === "outOfAgenda");
    const agenda = subjects.filter((s) => s.nonAgendaReason === null);
    return { preAgenda, outOfAgenda, agenda };
}

/**
 * Bucket subjects into pre-agenda / agenda / out-of-agenda and apply per-section
 * display limits, returning both the visible slice and the remainder count for each.
 */
export function getSubjectSections(
    subjects: PreviewSubject[],
    limits: { preAgenda: number; agenda: number },
) {
    const split = splitSubjects(subjects);
    const preAgendaShown = split.preAgenda.slice(0, limits.preAgenda);
    const agendaShown = split.agenda.slice(0, limits.agenda);
    return {
        ...split,
        preAgendaShown,
        agendaShown,
        preAgendaRemaining: Math.max(0, split.preAgenda.length - preAgendaShown.length),
        agendaRemaining: Math.max(0, split.agenda.length - agendaShown.length),
    };
}
