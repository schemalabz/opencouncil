import { Subject } from "../apiTypes";

/**
 * Categorize incoming subjects against existing ones for upsert operations.
 *
 * Matching runs in three passes, because an existing row's id is public — it
 * is in shared URLs, in the search index, and in notification links already
 * delivered — so the goal is to keep each id on the SAME subject:
 *
 *  0. By id, when the caller names the row. summarize is given each row's id
 *     and hands it back (issue 366); processAgenda has none to give. This is
 *     what survives both renumbering and rewording at once.
 *  1. By name, when that name is unambiguous on both sides. This is what
 *     survives renumbering: an item that moves from θέμα 3 to θέμα 2 because
 *     an earlier item was withdrawn keeps its own id.
 *  2. By agenda position, for whatever the earlier passes did not claim. This
 *     is what survives rewording: the same slot, new text. The slot is the
 *     pair (section, number): sections number their items independently, so
 *     the number alone repeats (issue 366). An incoming subject without a
 *     section compares on the number alone. An incoming subject with a
 *     section falls back to the number alone only while no stored row
 *     carries a section, which is what lets rows written before sections
 *     existed match on the first re-run after the change.
 *
 * Matching position-first would hand a remaining subject's id to a DIFFERENT
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
    /** Absent reads as null: a one-list agenda, or a row that predates sections. */
    agendaSectionIndex?: number | null;
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

function positionKey(section: number, index: number): string {
    return `${section}:${index}`;
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

    // Pass 0 — the row itself, when the caller names it.
    const byId = new Map(candidates.map((e) => [e.id, e]));
    for (const subject of incomingSubjects) {
        if (typeof subject.agendaItemIndex !== "number" || !subject.id) continue;
        const existing = byId.get(subject.id);
        if (!existing || claimed.has(existing.id)) continue;
        claimed.add(existing.id);
        matches.set(subject, existing.id);
    }

    const namedOnce = unambiguousNames(candidates.map((e) => e.name));
    const incomingNamedOnce = unambiguousNames(incomingSubjects.map((s) => s.name));
    const byName = new Map<string, ExistingSubjectRow>();
    for (const existing of candidates) {
        const key = normalizeName(existing.name);
        if (namedOnce.has(key)) byName.set(key, existing);
    }

    // Pass 1 — the same text is the same subject, wherever it now sits.
    for (const subject of incomingSubjects) {
        if (matches.has(subject)) continue;
        if (typeof subject.agendaItemIndex !== "number") continue;
        const key = normalizeName(subject.name);
        if (!incomingNamedOnce.has(key)) continue;
        const existing = byName.get(key);
        if (!existing || claimed.has(existing.id)) continue;
        claimed.add(existing.id);
        matches.set(subject, existing.id);
    }

    // Pass 2 — the same slot, for whatever is left on both sides. Several rows
    // can hold the same (section, number); the sort breaks that tie on the row
    // id, which is creation order for a cuid. The outcome is therefore the same
    // on every run: the rows go to the incoming subjects one each, in id order,
    // and the rows that are left over stay unmatched.
    const unclaimed = candidates
        .filter((e) => e.agendaItemIndex !== null && !claimed.has(e.id))
        .sort((a, b) =>
            (a.agendaSectionIndex ?? 0) - (b.agendaSectionIndex ?? 0)
            || a.agendaItemIndex! - b.agendaItemIndex!
            || a.id.localeCompare(b.id));
    /** Whether this meeting predates sections: no candidate row carries one.
     *  Read off every candidate, never the unclaimed ones — once the earlier
     *  passes claim the sectioned rows, a lone section-less leftover would make
     *  a sectioned meeting look pre-section. The number-alone fallback
     *  below is for the migration only: it lets rows written before sections
     *  existed match on the first re-run after the change. Once ANY row carries
     *  a section, a section-less row is one summarize created — summarize never
     *  sends a section — and a numbered agenda item must not take it over
     *  (issue 366). */
    const storeIsPreSection = candidates.every((e) => (e.agendaSectionIndex ?? null) === null);
    const byPosition = new Map<string, ExistingSubjectRow[]>();
    const byIndexUnsectioned = new Map<number, ExistingSubjectRow[]>();
    const byIndexAny = new Map<number, ExistingSubjectRow[]>();
    const push = <K,>(map: Map<K, ExistingSubjectRow[]>, key: K, row: ExistingSubjectRow) => {
        const rows = map.get(key);
        if (rows) rows.push(row); else map.set(key, [row]);
    };
    for (const existing of unclaimed) {
        const index = existing.agendaItemIndex!;
        const section = existing.agendaSectionIndex ?? null;
        if (section !== null) {
            push(byPosition, positionKey(section, index), existing);
        } else {
            push(byIndexUnsectioned, index, existing);
        }
        push(byIndexAny, index, existing);
    }
    /** The first row of this key that nothing has claimed yet. A number that
     *  several rows share hands out one row per incoming subject, in id order,
     *  instead of giving up on the second (issue 366). */
    const firstUnclaimed = (rows: ExistingSubjectRow[] | undefined) =>
        rows?.find((row) => !claimed.has(row.id));
    for (const subject of incomingSubjects) {
        if (matches.has(subject)) continue;
        if (typeof subject.agendaItemIndex !== "number") continue;
        const index = subject.agendaItemIndex;
        const section = subject.agendaSection?.index ?? null;
        const existing = section !== null
            ? firstUnclaimed(byPosition.get(positionKey(section, index)))
              ?? (storeIsPreSection ? firstUnclaimed(byIndexUnsectioned.get(index)) : undefined)
            : firstUnclaimed(byIndexAny.get(index));
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
