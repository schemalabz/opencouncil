import { Subject } from "../apiTypes";

/**
 * Categorize incoming subjects against existing ones for upsert operations.
 *
 * Matching runs in two passes, because an existing row's id is public — it is
 * in shared URLs, in the search index, and in notification links already
 * delivered — so the goal is to keep each id on the SAME subject:
 *
 *  1. By name, when that name is unambiguous on both sides. This is what
 *     survives renumbering: an item that moves from θέμα 3 to θέμα 2 because
 *     an earlier item was withdrawn keeps its own id.
 *  2. By agendaItemIndex, for whatever pass 1 did not claim. This is what
 *     survives rewording: the same slot, new text.
 *
 * Matching index-first would hand a remaining subject's id to a DIFFERENT
 * subject whenever the agenda renumbers — a URL that used to open "Roads"
 * would open "Parks" — which is worse than losing the id, because it is
 * silent and it looks correct.
 *
 * BEFORE_AGENDA and OUT_OF_AGENDA subjects are never matched: they carry no
 * index, and the caller replaces them wholesale. Existing rows that nothing
 * claims are returned as `unmatched`; keeping or deleting them is the
 * caller's decision (the agenda is authoritative, a summary is not).
 */

export interface ExistingSubjectRow {
    id: string;
    agendaItemIndex: number | null;
    name: string;
    /** Set for BEFORE_AGENDA / OUT_OF_AGENDA rows, which never match. */
    nonAgendaReason?: string | null;
}

/** Names are compared on their text, not their spacing or case. */
function normalizeName(name: string): string {
    return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("el");
}

/** The names that appear exactly once in a list — the only ones that can
 *  identify a subject on their own. */
function unambiguousNames(names: string[]): Set<string> {
    const counts = new Map<string, number>();
    for (const name of names) {
        const key = normalizeName(name);
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Set([...counts].filter(([, n]) => n === 1).map(([key]) => key));
}

export function categorizeSubjectsForUpsert(
    incomingSubjects: Subject[],
    existingSubjects: ExistingSubjectRow[]
): {
    toUpdate: { incoming: Subject; existingId: string }[];
    toCreate: Subject[];
    unmatched: ExistingSubjectRow[];
} {
    // Non-agenda rows are the caller's to replace; they never take part.
    const candidates = existingSubjects.filter((e) => !e.nonAgendaReason);
    const claimed = new Set<string>();
    const matches = new Map<Subject, string>();

    const namedOnce = unambiguousNames(candidates.map((e) => e.name));
    const incomingNamedOnce = unambiguousNames(incomingSubjects.map((s) => s.name));
    const byName = new Map<string, ExistingSubjectRow>();
    for (const existing of candidates) {
        const key = normalizeName(existing.name);
        if (namedOnce.has(key)) byName.set(key, existing);
    }

    // Pass 1 — the same text is the same subject, wherever it now sits.
    for (const subject of incomingSubjects) {
        const key = normalizeName(subject.name);
        if (!incomingNamedOnce.has(key)) continue;
        const existing = byName.get(key);
        if (!existing || claimed.has(existing.id)) continue;
        claimed.add(existing.id);
        matches.set(subject, existing.id);
    }

    // Pass 2 — the same slot, for whatever is left on both sides.
    const byIndex = new Map<number, ExistingSubjectRow>();
    for (const existing of candidates) {
        if (existing.agendaItemIndex !== null && !claimed.has(existing.id)) {
            byIndex.set(existing.agendaItemIndex, existing);
        }
    }
    for (const subject of incomingSubjects) {
        if (matches.has(subject)) continue;
        if (typeof subject.agendaItemIndex !== "number") continue;
        const existing = byIndex.get(subject.agendaItemIndex);
        if (!existing || claimed.has(existing.id)) continue;
        claimed.add(existing.id);
        matches.set(subject, existing.id);
    }

    const toUpdate: { incoming: Subject; existingId: string }[] = [];
    const toCreate: Subject[] = [];
    for (const subject of incomingSubjects) {
        const existingId = matches.get(subject);
        if (existingId) toUpdate.push({ incoming: subject, existingId });
        else toCreate.push(subject);
    }

    return {
        toUpdate,
        toCreate,
        unmatched: candidates.filter((e) => !claimed.has(e.id)),
    };
}
