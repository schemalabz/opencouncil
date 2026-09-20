import { normalizeText } from '@/lib/utils';
import { isLikelyMatch } from '@/components/meetings/decisions/candidates';

/**
 * What linking this decision to this row would mean:
 * - `free`: nothing holds it, so linking costs nothing.
 * - `proposedElsewhere`: the resolver offered it to another row that has not
 *   answered; linking here takes it and that proposal goes away.
 * - `linkedElsewhere`: another row holds it, so taking it empties that row —
 *   the one case that asks for a confirmation first.
 *
 * A decision held outside this meeting is none of these: the panel leaves it
 * out entirely — see the conflict rule in {@link rowCandidates}.
 */
export type RowCandidateKind = 'free' | 'proposedElsewhere' | 'linkedElsewhere';

export interface RowCandidate<C, S> {
    kind: RowCandidateKind;
    candidate: C;
    /** The resolver proposed this one for this very row, confidently. */
    likely: boolean;
    /** The other row involved, when there is one. */
    elsewhere: S | null;
}

interface Searchable {
    decisionNumber: string | null;
    title: string | null;
    ada: string;
}

/**
 * Whether a typed query reaches this decision.
 *
 * Number first, because a clerk reads it off the minutes; title too, because a
 * number half-remembered is common and a title recognised on sight is not.
 */
export function matchesQuery(candidate: Searchable, query: string): boolean {
    const needle = normalizeText(query.trim());
    if (!needle) return true;
    return [candidate.decisionNumber, candidate.title, candidate.ada]
        .some(value => value !== null && normalizeText(value).includes(needle));
}

/** What a row's panel needs to know about a candidate beyond its searchable fields. */
interface PlaceableCandidate extends Searchable {
    id: string;
    /** The pipeline's suggested subject, if any. */
    subjectId: string | null;
    confidence: number | null;
    /** Set when a Decision already holds this ΑΔΑ, wherever that decision sits. */
    conflict: { subjectId: string } | null;
}

interface RowCandidateArgs<C extends PlaceableCandidate, S extends { id: string }> {
    subjectId: string;
    candidates: readonly C[];
    /** Which subject holds each candidate's decision, keyed by candidate id. */
    subjectByCandidate: ReadonlyMap<string, string>;
    subjects: readonly S[];
    query: string;
}

/**
 * The decisions a row's panel offers, best first.
 *
 * Order is what a person expects to have to read: what they just typed, then
 * what we think belongs here, then the rest by number. Sorting the proposal to
 * the top unconditionally would bury an exact number the person is looking at.
 */
export function rowCandidates<
    C extends PlaceableCandidate,
    S extends { id: string },
>({ subjectId, candidates, subjectByCandidate, subjects, query }: RowCandidateArgs<C, S>): RowCandidate<C, S>[] {
    const subjectById = new Map(subjects.map(s => [s.id, s]));
    const typed = normalizeText(query.trim());

    const rows: RowCandidate<C, S>[] = [];
    for (const candidate of candidates) {
        const holderId = subjectByCandidate.get(candidate.id) ?? null;
        if (holderId === subjectId) continue;
        if (!matchesQuery(candidate, query)) continue;
        // A decision whose ΑΔΑ is held by a subject of another meeting can
        // never be linked here — the assign fails on its ΑΔΑ-holder check
        // every time — and this panel has no row to name as the holder.
        // `subjectByCandidate` knows only this meeting's holders, so the
        // candidate's own conflict is what names the rest. The card above the
        // table already asks about these, which is where they get answered.
        if (holderId === null && candidate.conflict !== null) continue;

        if (holderId !== null) {
            rows.push({ kind: 'linkedElsewhere', candidate, likely: false, elsewhere: subjectById.get(holderId) ?? null });
            continue;
        }
        if (candidate.subjectId !== null && candidate.subjectId !== subjectId) {
            rows.push({ kind: 'proposedElsewhere', candidate, likely: false, elsewhere: subjectById.get(candidate.subjectId) ?? null });
            continue;
        }
        rows.push({
            kind: 'free',
            candidate,
            likely: candidate.subjectId === subjectId && isLikelyMatch(candidate),
            elsewhere: null,
        });
    }

    const rank = (row: RowCandidate<C, S>): number => {
        if (typed && row.candidate.decisionNumber !== null && normalizeText(row.candidate.decisionNumber).startsWith(typed)) return 0;
        if (row.likely) return 1;
        if (row.kind === 'free') return 2;
        return 3;
    };
    return rows.sort((a, b) => rank(a) - rank(b) || (a.candidate.decisionNumber ?? '').localeCompare(b.candidate.decisionNumber ?? ''));
}
