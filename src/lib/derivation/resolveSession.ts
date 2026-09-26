import type { AttendanceTiming } from '@prisma/client';
import type { DecisionConventions } from '@/lib/decisionConventions';
import { rangeCoversDecision } from './anchors';
import { placeEvents } from './placeEvents';
import type { DerivationInput, DocumentFacts, EventRow, Issue, NameMatch, OrderedSubject, PerVoteAbsence, RollCallRow, StatedChange } from './types';

/**
 * What the pages of one meeting state together (spec §4.1.1). Pure: it reads
 * every page with a usable reading and the body's conventions, never a stored
 * roll call or event, so a poll that adds one page cannot remove what earlier
 * pages stated.
 */
export interface ResolvedSession {
    rollCall: RollCallRow[];
    events: EventRow[];
    issues: Issue[];
    /** Why there is no roll call, when there is none. */
    missing: 'noRollCall' | 'noMajority' | null;
    /**
     * How many usable pages printed a roll call, and how many of those agree
     * with the one the rule picked — the winning group under `majority`, the
     * one page's own under `first-page`. Only the resolver walks every page's
     * roll call to compare them, so a caller that wants this asks it rather
     * than re-grouping the pages itself.
     *
     * `strategy` says which of the two rules the body's conventions select —
     * `first-page` for `per_decision`, `majority` otherwise — so a caller does
     * not copy the resolver's own condition to relabel the same choice.
     */
    rollCallBasis: { pagesAgreeing: number; pagesWithRollCall: number; strategy: 'majority' | 'first-page' };
}

/** `hasExtraction` is `readingStatesFacts` (./load.ts): a v3 reading yields no roll call and no change. */
const usablePages = (documents: DocumentFacts[]) => documents.filter(d => d.hasExtraction);

/**
 * Whether the pages print their own list of who was present for each decision:
 * a per-decision roll call, or ΤΑ ΜΕΛΗ. A body that states ΤΑ ΜΕΛΗ by convention
 * counts only when at least one usable page of this meeting prints the list.
 * Without a list, nothing checks a misread change.
 */
export function pagesCarryOwnList(conventions: DecisionConventions | null, pages: DocumentFacts[]): boolean {
    if (conventions?.presentListMeaning === 'per_decision') return true;
    return conventions?.statesPerDecisionAttendance === true && pages.some(d => d.presentIds !== null);
}
const hasRollCall = (d: DocumentFacts) => (d.rollCallPresentIds?.length ?? 0) + (d.rollCallAbsentIds?.length ?? 0) > 0;
/** A roll call as a set of ids: the reader's order of the names varies from page to page. */
const rollCallKey = (d: DocumentFacts) =>
    `${[...new Set(d.rollCallPresentIds ?? [])].sort().join('|')};${[...new Set(d.rollCallAbsentIds ?? [])].sort().join('|')}`;

/**
 * The opening roll call. Where every page prints the same one (`opening`,
 * `cumulative`, `unknown`), the one more than half of the pages with a roll
 * call print; a tie or a scatter is none. Where each page prints its own state
 * (`per_decision`), the first page's in the derivation's subject order.
 */
export function resolveRollCall(input: Pick<DerivationInput, 'documents' | 'conventions' | 'cityMayorPersonId'>): Pick<ResolvedSession, 'rollCall' | 'issues' | 'missing' | 'rollCallBasis'> {
    const issues: Issue[] = [];
    const strategy: ResolvedSession['rollCallBasis']['strategy'] = input.conventions?.presentListMeaning === 'per_decision' ? 'first-page' : 'majority';
    const withRollCall = usablePages(input.documents).filter(hasRollCall);
    for (const d of withRollCall) {
        const absent = new Set(d.rollCallAbsentIds ?? []);
        for (const personId of new Set(d.rollCallPresentIds ?? [])) {
            if (absent.has(personId)) issues.push({ code: 'PERSON_IN_BOTH_LISTS', subjectId: d.subjectId, decisionId: d.decisionId, personId, source: 'decision', params: {} });
        }
    }
    if (withRollCall.length === 0) return { rollCall: [], issues, missing: 'noRollCall', rollCallBasis: { pagesAgreeing: 0, pagesWithRollCall: 0, strategy } };

    let winners: DocumentFacts[];
    if (strategy === 'first-page') {
        winners = [withRollCall[0]];
    } else {
        const groups = new Map<string, DocumentFacts[]>();
        for (const d of withRollCall) {
            const key = rollCallKey(d);
            groups.set(key, [...(groups.get(key) ?? []), d]);
        }
        const best = [...groups.values()].reduce((x, y) => (y.length > x.length ? y : x));
        if (best.length * 2 <= withRollCall.length) {
            return { rollCall: [], issues, missing: 'noMajority', rollCallBasis: { pagesAgreeing: best.length, pagesWithRollCall: withRollCall.length, strategy } };
        }
        winners = best;
    }

    const status = new Map<string, RollCallRow['status']>();
    for (const personId of winners[0].rollCallPresentIds ?? []) status.set(personId, 'PRESENT');
    // A page that names someone in both lists keeps them absent, as the task did.
    for (const personId of winners[0].rollCallAbsentIds ?? []) status.set(personId, 'ABSENT');

    // The mayor's row, where the lists do not name the mayor: the majority of the
    // winning pages that state the mayor's presence. A tie states none.
    const mayor = input.cityMayorPersonId;
    if (mayor && !status.has(mayor)) {
        const stated = winners.map(d => d.mayorPresent).filter((m): m is boolean => m !== null);
        const present = stated.filter(Boolean).length;
        const absent = stated.length - present;
        if (present !== absent) status.set(mayor, present > absent ? 'PRESENT' : 'ABSENT');
    }
    const rollCall = [...status].map(([personId, s]): RollCallRow => ({ personId, status: s, source: 'decision' }))
        .sort((x, y) => x.personId.localeCompare(y.personId));
    return { rollCall, issues, missing: null, rollCallBasis: { pagesAgreeing: winners.length, pagesWithRollCall: withRollCall.length, strategy } };
}

/** The point a change is pinned to. Timing is not part of it: pages that disagree on timing state one change. */
const anchorKey = (c: StatedChange) => {
    switch (c.anchorKind) {
        case 'AGENDA_ITEM': return `AI:${c.anchorAgendaItemIndex}:${c.anchorNonAgendaReason ?? ''}`;
        case 'DECISION_NUMBER': return `DN:${c.anchorDecisionNumber}`;
        case 'PHASE': return `PH:${c.anchorPhase}`;
        default: return c.anchorKind;
    }
};

/**
 * The timing most pages give. On a tie a timing wins over none, and `DURING`
 * wins over the others: the conservative reading, the person was out for that
 * item. Otherwise the first timing stated wins, as in the task.
 */
function mostStatedTiming(votes: Map<AttendanceTiming | null, number>): AttendanceTiming | null {
    let best: AttendanceTiming | null = null;
    let bestCount = 0;
    for (const [timing, count] of votes) {
        if (count > bestCount || (count === bestCount && timing !== null && (best === null || timing === 'DURING'))) {
            best = timing;
            bestCount = count;
        }
    }
    return best;
}

/**
 * A change the resolver makes from a per-vote absence: the person and the
 * sentence of the statement `a`, with the anchor given and every other anchor
 * field empty.
 */
const absenceChange = (
    a: PerVoteAbsence, kind: StatedChange['kind'],
    anchor: Pick<StatedChange, 'anchorKind' | 'timing'> & Partial<Pick<StatedChange, 'anchorDecisionNumber' | 'anchorSubjectId'>>,
): StatedChange => ({
    personId: a.personId, kind, anchorAgendaItemIndex: null, anchorNonAgendaReason: null, anchorDecisionNumber: null,
    anchorSubjectId: null, anchorPhase: null, rawText: a.rawText, ...anchor,
});

/** A per-vote absence as one page's departure before and arrival after the decisions it names: for an absence no subject of the order can hold. */
function perPageExpansion(a: PerVoteAbsence, subjectId: string): StatedChange[] {
    const at = (kind: StatedChange['kind'], decisionNumber: string | null, timing: StatedChange['timing']) => absenceChange(a, kind, decisionNumber === null
        ? { anchorKind: 'SUBJECT', anchorSubjectId: subjectId, timing }
        : { anchorKind: 'DECISION_NUMBER', anchorDecisionNumber: decisionNumber, timing });
    return [at('DEPARTURE', a.decisionNumberFrom, 'BEFORE'), at('ARRIVAL', a.decisionNumberTo, 'AFTER')];
}

/**
 * The subjects a range of decisions covers, as indices in the derivation's
 * order: every subject from the first whose decision the range includes to the
 * last. A subject between them with no decision number is covered too.
 */
function rangeSpan(subjects: OrderedSubject[], a: PerVoteAbsence): number[] {
    const matching = subjects.flatMap((s, i) => (rangeCoversDecision(a, s.decisionNumber) ? [i] : []));
    if (matching.length === 0) return [];
    const first = matching[0], last = matching[matching.length - 1];
    return Array.from({ length: last - first + 1 }, (_, k) => first + k);
}

/** One page's statement of a per-vote absence, with its position in the walk over the pages. */
interface AbsenceStatement { seq: number; page: DocumentFacts; absence: PerVoteAbsence }

/** The changes pinned to pages, in the order of the first statement of each, and the pages that state each. */
type OwnChange = { seq: number; changes: StatedChange[]; pages: DocumentFacts[] };

/**
 * The per-vote absences of the session, combined by the maintainer's rule (C5).
 * A member out for consecutive subjects in the derivation's order left once,
 * before the first, and came back once, before the first later subject whose
 * page does not state the absence; a run that reaches the last subject has no
 * return. A range of decisions covers every subject whose decision it includes,
 * so a range is one departure before its first decision and one arrival after
 * its last, and a page that states the absence of one of those decisions again
 * joins the same run. A subject with no decision number between two decisions
 * of a range is part of the range. Each run counts the pages that state it.
 *
 * A boundary that a range states is anchored at its decision number, when that
 * number places the event where the run starts or ends. Every other boundary is
 * anchored at the subject. An absence that no subject of the order holds (a
 * range with no decision in the meeting, a page off the order) keeps one
 * departure and one arrival, so the replay reports the anchor it cannot place.
 */
function perVoteAbsenceChanges(subjects: OrderedSubject[], statements: AbsenceStatement[]): OwnChange[] {
    const indexOf = new Map(subjects.map((s, i) => [s.id, i]));
    const covering = new Map<string, Map<number, AbsenceStatement[]>>();
    const out: OwnChange[] = [];
    const unplaced = new Map<string, OwnChange>();
    for (const st of statements) {
        const { absence: a, page } = st;
        const own = indexOf.get(page.subjectId);
        const covered = a.decisionNumberFrom === null
            ? (own === undefined ? [] : [own])
            : rangeSpan(subjects, a);
        if (covered.length === 0) {
            const key = `${a.personId}|${a.decisionNumberFrom ?? `own:${page.subjectId}`}|${a.decisionNumberTo ?? ''}`;
            const g = unplaced.get(key);
            if (!g) unplaced.set(key, { seq: st.seq, changes: perPageExpansion(a, page.subjectId), pages: [page] });
            else if (!g.pages.includes(page)) g.pages.push(page);
            continue;
        }
        const byIndex = covering.get(a.personId) ?? new Map<number, AbsenceStatement[]>();
        covering.set(a.personId, byIndex);
        for (const i of covered) byIndex.set(i, [...(byIndex.get(i) ?? []), st]);
    }
    out.push(...unplaced.values());

    const firstStated = (sts: AbsenceStatement[]) => sts.reduce((x, y) => (y.seq < x.seq ? y : x));
    /**
     * The range's own boundary, when it takes effect at `effectAt`; else the
     * subject there. The event keeps the sentence of the statement whose anchor it uses.
     */
    const boundary = (kind: StatedChange['kind'], sts: AbsenceStatement[], effectAt: number): StatedChange => {
        const ordered = [...sts].sort((x, y) => x.seq - y.seq);
        for (const { absence: a } of ordered) {
            if (a.decisionNumberFrom === null) continue;
            const stated = kind === 'DEPARTURE'
                ? absenceChange(a, kind, { anchorKind: 'DECISION_NUMBER', anchorDecisionNumber: a.decisionNumberFrom, timing: 'BEFORE' })
                : absenceChange(a, kind, { anchorKind: 'DECISION_NUMBER', anchorDecisionNumber: a.decisionNumberTo, timing: 'AFTER' });
            if (placeEvents(subjects, [stated]).placed[0]?.effectAt === effectAt) return stated;
        }
        return absenceChange(ordered[0].absence, kind, { anchorKind: 'SUBJECT', anchorSubjectId: subjects[effectAt].id, timing: 'BEFORE' });
    };
    for (const byIndex of covering.values()) {
        const indices = [...byIndex.keys()].sort((x, y) => x - y);
        let start = 0;
        for (let k = 0; k < indices.length; k++) {
            if (k + 1 < indices.length && indices[k + 1] === indices[k] + 1) continue;
            const first = indices[start], last = indices[k];
            start = k + 1;
            const run = indices.filter(i => i >= first && i <= last).flatMap(i => byIndex.get(i)!);
            const pages = [...new Set([...run].sort((x, y) => x.seq - y.seq).map(st => st.page))];
            const changes = [boundary('DEPARTURE', byIndex.get(first)!, first)];
            if (last + 1 < subjects.length) changes.push(boundary('ARRIVAL', byIndex.get(last)!, last + 1));
            out.push({ seq: firstStated(run).seq, changes, pages });
        }
    }
    return out;
}

/**
 * The session's arrivals and departures. A change pinned to a page's own
 * decision always counts, and so does a per-vote absence, combined across the
 * pages (`perVoteAbsenceChanges`). A change pinned elsewhere counts where the pages carry
 * their own list (`pagesCarryOwnList`: those lists then show whether it happened,
 * and the replay reports a list that contradicts it) and, in every other body,
 * when more than half of the pages state it. Those bodies repeat the session on
 * every page, so a change most pages leave out is probably a misread: it is
 * reported, not applied. A page that states one change twice counts once.
 *
 * Order is part of the result: the replay settles a contradiction with "first
 * wins". Session changes come in the order of the first page that states them,
 * then the changes pinned to pages and the per-vote absences, in the order of
 * their first statement in page order. Ids are deterministic so the minutes,
 * which read the stored events ordered by `createdAt, id`, see this order.
 */
export function resolveEvents(input: Pick<DerivationInput, 'cityId' | 'meetingId' | 'documents' | 'conventions' | 'subjects'>): Pick<ResolvedSession, 'events' | 'issues'> {
    const pages = usablePages(input.documents);
    const total = pages.length;
    const everyStatedChangeCounts = pagesCarryOwnList(input.conventions, pages);
    const groups = new Map<string, { change: StatedChange; pages: DocumentFacts[]; timings: Map<AttendanceTiming | null, number> }>();
    for (const d of pages) {
        for (const c of d.statedChanges) {
            if (c.anchorKind === 'SUBJECT') continue;
            const key = `${c.personId}|${c.kind}|${anchorKey(c)}`;
            const g = groups.get(key);
            if (!g) groups.set(key, { change: c, pages: [d], timings: new Map([[c.timing, 1]]) });
            else if (!g.pages.includes(d)) {
                g.pages.push(d);
                g.timings.set(c.timing, (g.timings.get(c.timing) ?? 0) + 1);
            }
        }
    }
    const events: EventRow[] = [];
    const issues: Issue[] = [];
    // Zero-padded: the minutes order the stored events by id, and «ev10» must not sort before «ev2».
    const id = () => `${input.cityId}:${input.meetingId}:ev${String(events.length).padStart(4, '0')}`;
    for (const g of groups.values()) {
        const stated = g.pages.length;
        if (!everyStatedChangeCounts && stated * 2 <= total) {
            issues.push({
                code: 'CHANGE_NOT_CORROBORATED', personId: g.change.personId, subjectId: g.pages[0].subjectId, decisionId: g.pages[0].decisionId,
                source: 'decision', rawText: g.change.rawText, params: { stated, total },
            });
            continue;
        }
        events.push({ ...g.change, timing: mostStatedTiming(g.timings), id: id(), reportingDocuments: stated, totalDocuments: total, source: 'decision' });
    }
    // The changes pinned to pages, in the order of their first statement in the page walk.
    let seq = 0;
    const own: OwnChange[] = [];
    const absences: AbsenceStatement[] = [];
    for (const d of pages) {
        for (const c of d.statedChanges) if (c.anchorKind === 'SUBJECT') own.push({ seq: seq++, changes: [c], pages: [d] });
        for (const a of d.perVoteAbsences) absences.push({ seq: seq++, page: d, absence: a });
    }
    own.push(...perVoteAbsenceChanges(input.subjects, absences));
    for (const o of own.sort((x, y) => x.seq - y.seq)) {
        for (const c of o.changes) events.push({ ...c, id: id(), reportingDocuments: o.pages.length, totalDocuments: total, source: 'decision' });
    }
    return { events, issues };
}

/**
 * A page of an `opening` body that lists under ΠΑΡΟΝΤΕΣ a member it says arrived
 * later: the reader moved the arrival into the list (Athens 7η jan22_2026, 4 of
 * 22 pages). The roll-call majority already settles which list stands; this names
 * the page so a person can label it. A session-start arrival is not a late
 * arrival. A return after a per-vote absence is not a stated change
 * (`DocumentFacts.perVoteAbsences`), so an arrival pinned to the page's own
 * subject is a real arrival and counts.
 */
export function lateArrivalsInOpeningList(input: Pick<DerivationInput, 'documents' | 'conventions'>): Issue[] {
    if (input.conventions?.presentListMeaning !== 'opening') return [];
    const issues: Issue[] = [];
    for (const d of usablePages(input.documents)) {
        const present = new Set(d.rollCallPresentIds ?? []);
        for (const c of d.statedChanges) {
            if (c.kind !== 'ARRIVAL' || c.anchorKind === 'SESSION_START' || !present.has(c.personId)) continue;
            issues.push({ code: 'LATE_ARRIVAL_IN_OPENING_LIST', subjectId: d.subjectId, decisionId: d.decisionId, personId: c.personId, source: 'decision', rawText: c.rawText, params: {} });
        }
    }
    return issues;
}

/**
 * Where the match step went wrong in a way the pages show (spec §4.1.13). Two
 * entries of one list with one id: a list names each member once, so one match
 * is wrong (Athens ΔΣ may29_2026, «Καββαθάς Τρύφων»). One member written two ways
 * in two places is not that — the roll call's «Κων/νος» and ΤΑ ΜΕΛΗ's «Κώστας»
 * are one person. One printed name with two ids across pages: pages of two polls
 * are matched separately. Readings without `nameMatches` say nothing. No id changes.
 */
export function nameMatchIssues(input: Pick<DerivationInput, 'documents'>): Issue[] {
    const issues: Issue[] = [];
    const idsOfName = new Map<string, Set<string>>();
    for (const d of usablePages(input.documents)) {
        if (!d.nameMatches) continue;
        const idOf = new Map(d.nameMatches.filter((m): m is NameMatch & { personId: string } => m.personId !== null).map(m => [m.name, m.personId]));
        for (const list of [d.lists.rollCallPresent, d.lists.rollCallAbsent, d.lists.decisionPresent]) {
            const nameOfId = new Map<string, string>();
            for (const name of list) {
                const personId = idOf.get(name);
                if (!personId) continue;
                const other = nameOfId.get(personId);
                if (other === undefined) nameOfId.set(personId, name);
                else if (other !== name) issues.push({ code: 'NAMES_SHARE_ID', subjectId: d.subjectId, decisionId: d.decisionId, personId, source: 'decision', params: { names: `${other}, ${name}` } });
            }
        }
        for (const m of d.nameMatches) if (m.personId) idsOfName.set(m.name, (idsOfName.get(m.name) ?? new Set()).add(m.personId));
    }
    for (const [name, ids] of idsOfName) if (ids.size > 1) issues.push({ code: 'NAME_MATCHED_TWICE', source: 'decision', params: { name } });
    return issues;
}

/** The roll call, the events and their issues for one meeting. */
export function resolveSession(input: DerivationInput): ResolvedSession {
    const roll = resolveRollCall(input);
    const ev = resolveEvents(input);
    return {
        rollCall: roll.rollCall, events: ev.events, missing: roll.missing, rollCallBasis: roll.rollCallBasis,
        issues: [...roll.issues, ...ev.issues, ...lateArrivalsInOpeningList(input), ...nameMatchIssues(input)],
    };
}
