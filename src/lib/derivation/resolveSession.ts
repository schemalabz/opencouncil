import type { AttendanceTiming } from '@prisma/client';
import type { DecisionConventions } from '@/lib/decisionConventions';
import type { DerivationInput, DocumentFacts, EventRow, Issue, RollCallRow, StatedChange } from './types';

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
export function resolveRollCall(input: Pick<DerivationInput, 'documents' | 'conventions' | 'cityMayorPersonId'>): Pick<ResolvedSession, 'rollCall' | 'issues' | 'missing'> {
    const issues: Issue[] = [];
    const withRollCall = usablePages(input.documents).filter(hasRollCall);
    for (const d of withRollCall) {
        const absent = new Set(d.rollCallAbsentIds ?? []);
        for (const personId of new Set(d.rollCallPresentIds ?? [])) {
            if (absent.has(personId)) issues.push({ code: 'PERSON_IN_BOTH_LISTS', subjectId: d.subjectId, decisionId: d.decisionId, personId, source: 'decision', params: {} });
        }
    }
    if (withRollCall.length === 0) return { rollCall: [], issues, missing: 'noRollCall' };

    let winners: DocumentFacts[];
    if (input.conventions?.presentListMeaning === 'per_decision') {
        winners = [withRollCall[0]];
    } else {
        const groups = new Map<string, DocumentFacts[]>();
        for (const d of withRollCall) {
            const key = rollCallKey(d);
            groups.set(key, [...(groups.get(key) ?? []), d]);
        }
        const best = [...groups.values()].reduce((x, y) => (y.length > x.length ? y : x));
        if (best.length * 2 <= withRollCall.length) return { rollCall: [], issues, missing: 'noMajority' };
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
    return { rollCall, issues, missing: null };
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
 * The session's arrivals and departures. A change pinned to a page's own
 * decision always counts. A change pinned elsewhere counts where the pages carry
 * their own list (`pagesCarryOwnList`: those lists then show whether it happened,
 * and the replay reports a list that contradicts it) and, in every other body,
 * when more than half of the pages state it. Those bodies repeat the session on
 * every page, so a change most pages leave out is probably a misread: it is
 * reported, not applied. A page that states one change twice counts once.
 *
 * Order is part of the result: the replay settles a contradiction with "first
 * wins". Session changes come in the order of the first page that states them,
 * then the per-page changes in page order. Ids are deterministic so the minutes,
 * which read the stored events ordered by `createdAt, id`, see this order.
 */
export function resolveEvents(input: Pick<DerivationInput, 'cityId' | 'meetingId' | 'documents' | 'conventions'>): Pick<ResolvedSession, 'events' | 'issues'> {
    const pages = usablePages(input.documents);
    const total = pages.length;
    const everyStatedChangeCounts = pagesCarryOwnList(input.conventions, pages);
    const groups = new Map<string, { change: StatedChange; pages: DocumentFacts[]; timings: Map<AttendanceTiming | null, number> }>();
    const own: StatedChange[] = [];
    for (const d of pages) {
        for (const c of d.statedChanges) {
            if (c.anchorKind === 'SUBJECT') { own.push(c); continue; }
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
    for (const c of own) events.push({ ...c, id: id(), reportingDocuments: 1, totalDocuments: total, source: 'decision' });
    return { events, issues };
}

/** The roll call, the events and their issues for one meeting. */
export function resolveSession(input: DerivationInput): ResolvedSession {
    const roll = resolveRollCall(input);
    const ev = resolveEvents(input);
    return { rollCall: roll.rollCall, events: ev.events, missing: roll.missing, issues: [...roll.issues, ...ev.issues] };
}
