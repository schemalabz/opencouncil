import { Subject } from "../apiTypes";

/**
 * Categorize incoming subjects against existing ones for upsert operations.
 *
 * Matching logic: incoming subjects with a numeric agendaItemIndex are matched
 * to existing subjects with the same agendaItemIndex. BEFORE_AGENDA and
 * OUT_OF_AGENDA subjects are always created as new (never matched).
 * Existing subjects not matched by any incoming subject are left untouched.
 */
export function categorizeSubjectsForUpsert(
    incomingSubjects: Subject[],
    existingSubjects: { id: string; agendaItemIndex: number | null }[]
): {
    toUpdate: { incoming: Subject; existingId: string }[];
    toCreate: Subject[];
} {
    const existingByAgendaIndex = new Map<number, { id: string }>();
    for (const existing of existingSubjects) {
        if (existing.agendaItemIndex !== null) {
            existingByAgendaIndex.set(existing.agendaItemIndex, existing);
        }
    }

    const toUpdate: { incoming: Subject; existingId: string }[] = [];
    const toCreate: Subject[] = [];

    for (const subject of incomingSubjects) {
        if (typeof subject.agendaItemIndex === 'number' && existingByAgendaIndex.has(subject.agendaItemIndex)) {
            const existing = existingByAgendaIndex.get(subject.agendaItemIndex)!;
            toUpdate.push({ incoming: subject, existingId: existing.id });
        } else {
            toCreate.push(subject);
        }
    }

    return { toUpdate, toCreate };
}
