import { createHash } from 'crypto';
import { rankRollCall } from './replayAttendance';
import type { DerivationInput, DerivationOutput, IssueCode } from './types';

/** Stated changes the resolution drops, or a page's own list contradicts (spec §7.1 check 4). A task that adds such a code adds it here. */
export const DROPPED_CHANGE_CODES: readonly IssueCode[] = ['IMPLIED_CHANGE', 'CHANGE_NOT_CORROBORATED'];
/** A page against its body's conventions (spec §7.1 check 6). A task that adds such a code adds it here. */
export const CONVENTION_CONTRADICTION_CODES: readonly IssueCode[] = ['LAYOUT_DISAGREES'];

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
        /** 2: a roll-call member absent on items though no departure of theirs is stated. */
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

    // The replay ranks the roll call by source, so a manual ABSENT outranks a page's PRESENT here too.
    const rollCall = rankRollCall(input.rollCall).rows;
    const presentAtRollCall = new Set([...rollCall.values()].filter(r => r.status === 'PRESENT').map(r => r.personId));
    const departed = new Set(input.events.filter(e => e.kind === 'DEPARTURE').map(e => e.personId));
    const absentOn = new Map<string, number>();
    for (const a of attendance) {
        if (a.status === 'ABSENT' && presentAtRollCall.has(a.personId) && !departed.has(a.personId)) {
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
            namesCollapsed, nameMatchedTwice: null, inBothLists,
        },
    };
}
