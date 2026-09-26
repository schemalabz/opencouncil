import { createHash } from 'crypto';
import { placeEvents } from './placeEvents';
import { rankRollCall } from './replayAttendance';
import type { DerivationInput, DerivationOutput, IssueCode } from './types';

/** Stated changes the resolution drops, or a page's own list contradicts (spec §7.1 check 4). A task that adds such a code adds it here. */
export const DROPPED_CHANGE_CODES: readonly IssueCode[] = ['IMPLIED_CHANGE', 'CHANGE_NOT_CORROBORATED'];
/** A page against its body's conventions (spec §7.1 check 6). A task that adds such a code adds it here. */
export const CONVENTION_CONTRADICTION_CODES: readonly IssueCode[] = ['LAYOUT_DISAGREES', 'LATE_ARRIVAL_IN_OPENING_LIST', 'NAMED_VOTERS_UNEXPECTED'];

export interface MeetingMeasure {
    meeting: string;
    refused: IssueCode | null;
    /** sha256 (16 hex) of the sorted attendance and vote rows; '' when refused. */
    hash: string;
    attendanceRows: number;
    voteRows: number;
    issues: Record<string, number>;
    checks: {
        /** 1: rows for a person who cannot sit on the body: the mayor on a council or a community. */
        mayorRowsOffBody: number;
        /** 2: a roll-call member absent on items though no departure of theirs is stated, no later arrival explains it, and the item's own page does not list them absent. */
        unstatedAbsences: Array<{ personId: string; absentOn: number; of: number }>;
        /** 3: pages whose own list leaves out the mayor while the roll call has the mayor present. */
        listOmitsMayor: number;
        /** 4: stated changes dropped or contradicted. */
        changesDropped: number;
        /** 5: vote rows for a member absent on that subject. */
        votesWhileAbsent: number;
        /** 6: pages that contradict their body's conventions. */
        conventionContradictions: number;
        /** 7: a roll-call list with more distinct names than ids and unmatched names: two names received one id. */
        namesCollapsed: Array<{ decisionId: string; names: number; ids: number; unmatched: number }>;
        /** 8: one printed name with two ids across the meeting's pages; null until readings carry `nameMatches`. */
        nameMatchedTwice: number | null;
        /** 9: one person in both lists of one page. */
        inBothLists: Array<{ decisionId: string; personId: string }>;
    };
}

function rowsHash(output: DerivationOutput): string {
    const rows = [
        ...output.attendance.map(a => `A ${a.subjectId} ${a.personId} ${a.status}`),
        ...output.votes.map(v => `V ${v.subjectId} ${v.personId} ${v.voteType} ${v.origin}`),
    ].sort();
    return createHash('sha256').update(rows.join('\n')).digest('hex').slice(0, 16);
}

/** One meeting against the checks of spec §7.1. `output` is null when the derivation refused. */
export function measureMeeting(key: string, input: DerivationInput, output: DerivationOutput | null, refused: IssueCode | null): MeetingMeasure {
    const issues: Record<string, number> = {};
    for (const i of output?.issues ?? []) issues[i.code] = (issues[i.code] ?? 0) + 1;
    const count = (codes: readonly string[]) => codes.reduce((n, c) => n + (issues[c] ?? 0), 0);

    const attendance = output?.attendance ?? [];
    const votes = output?.votes ?? [];
    const mayor = input.cityMayorPersonId;

    const mayorRowsOffBody = mayor && input.bodyType !== 'committee'
        ? attendance.filter(a => a.personId === mayor).length + votes.filter(v => v.personId === mayor).length
        : 0;

    // The pages' own roll call and events are the derivation's output; other sources' rows are its input.
    // The replay ranks the roll call by source, so a manual ABSENT outranks the pages' PRESENT here too.
    const rollCall = rankRollCall([...(output?.rollCall ?? []), ...input.rollCall]).rows;
    const events = [...(output?.events ?? []), ...input.events];
    const presentAtRollCall = new Set([...rollCall.values()].filter(r => r.status === 'PRESENT').map(r => r.personId));
    const departed = new Set(events.filter(e => e.kind === 'DEPARTURE').map(e => e.personId));
    // A stated arrival explains every absence before it: the member was not there
    // yet (chania/jan15_2025 «Μετά την 2/2025 προσήλθε»). The arrival is placed the
    // way the replay places it.
    const subjectIndex = new Map(input.subjects.map((s, i) => [s.id, i]));
    const lastArrival = new Map<string, number>();
    for (const p of placeEvents(input.subjects, events).placed) {
        if (p.event.kind === 'ARRIVAL') lastArrival.set(p.event.personId, Math.max(p.effectAt, lastArrival.get(p.event.personId) ?? -1));
    }
    const arrivedLater = (subjectId: string, personId: string) => (subjectIndex.get(subjectId) ?? Infinity) < (lastArrival.get(personId) ?? -1);
    // The item's own page states the absence where its list is the attendance of
    // that item, as the replay reads it: a per-decision roll call's ΑΠΟΝΤΕΣ, or a
    // ΤΑ ΜΕΛΗ that leaves the member out (papagos-cholargos/aug31_2_2026 item 9).
    const perDecisionRollCall = input.conventions?.presentListMeaning === 'per_decision';
    const perDecisionList = input.conventions?.statesPerDecisionAttendance === true;
    const pageOf = new Map(input.documents.filter(d => d.hasExtraction).map(d => [d.subjectId, d]));
    const pageStatesAbsent = (subjectId: string, personId: string) => {
        const page = pageOf.get(subjectId);
        if (!page) return false;
        return (perDecisionRollCall && page.rollCallPresentIds !== null && (page.rollCallAbsentIds ?? []).includes(personId))
            || (perDecisionList && page.presentIds !== null && !page.presentIds.includes(personId));
    };
    const absentOn = new Map<string, number>();
    for (const a of attendance) {
        if (a.status === 'ABSENT' && presentAtRollCall.has(a.personId) && !departed.has(a.personId)
            && !arrivedLater(a.subjectId, a.personId) && !pageStatesAbsent(a.subjectId, a.personId)) {
            absentOn.set(a.personId, (absentOn.get(a.personId) ?? 0) + 1);
        }
    }
    const unstatedAbsences = [...absentOn].map(([personId, n]) => ({ personId, absentOn: n, of: input.subjects.length }))
        .sort((x, y) => x.personId.localeCompare(y.personId));

    const listOmitsMayor = mayor && presentAtRollCall.has(mayor)
        ? input.documents.filter(d => d.presentIds && !d.presentIds.includes(mayor)).length
        : 0;

    const absentKey = new Set(attendance.filter(a => a.status === 'ABSENT').map(a => `${a.subjectId}|${a.personId}`));
    const votesWhileAbsent = votes.filter(v => absentKey.has(`${v.subjectId}|${v.personId}`)).length;

    const namesCollapsed: MeetingMeasure['checks']['namesCollapsed'] = [];
    const inBothLists: MeetingMeasure['checks']['inBothLists'] = [];
    for (const d of input.documents.filter(x => x.hasExtraction)) {
        const unmatched = new Set(d.unmatchedNames);
        for (const [names, ids] of [[d.lists.rollCallPresent, d.rollCallPresentIds], [d.lists.rollCallAbsent, d.rollCallAbsentIds]] as const) {
            const distinct = new Set(names);
            const unmatchedHere = [...distinct].filter(n => unmatched.has(n)).length;
            const idCount = new Set(ids ?? []).size;
            if (distinct.size > idCount + unmatchedHere) namesCollapsed.push({ decisionId: d.decisionId, names: distinct.size, ids: idCount, unmatched: unmatchedHere });
        }
        const absent = new Set(d.rollCallAbsentIds ?? []);
        for (const personId of new Set(d.rollCallPresentIds ?? [])) if (absent.has(personId)) inBothLists.push({ decisionId: d.decisionId, personId });
    }

    return {
        meeting: key,
        refused,
        hash: output ? rowsHash(output) : '',
        attendanceRows: attendance.length,
        voteRows: votes.length,
        issues,
        checks: {
            mayorRowsOffBody, unstatedAbsences, listOmitsMayor,
            changesDropped: count(DROPPED_CHANGE_CODES),
            votesWhileAbsent,
            conventionContradictions: count(CONVENTION_CONTRADICTION_CODES),
            namesCollapsed,
            // null until a page carries `nameMatches`: before that the check cannot be made.
            nameMatchedTwice: input.documents.some(d => d.nameMatches) ? (issues['NAME_MATCHED_TWICE'] ?? 0) : null,
            inBothLists,
        },
    };
}
