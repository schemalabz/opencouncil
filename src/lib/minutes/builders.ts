import { AttendanceStatus, VoteType } from '@prisma/client';
import { compareRanks } from '@/lib/sorting/people';
import { formatSurnameFirst } from '@/lib/formatters/name';
import { calculateVoteResult } from '@/lib/utils/votes';
import {
    MinutesMember,
    MinutesAttendance,
    MinutesVoteResult,
    MinutesCouncilComposition,
    MinutesAttendanceChange,
} from './types';

// --- Dependency types for testability ---

/** Resolves a person's display info (party, role) from their roles at a specific date. */
export type MemberResolver = (personId: string, fallbackName: string) => MinutesMember;

/** Gets the elected order for a person (for sort ordering). */
export type ElectedOrderGetter = (personId: string) => number | null;

// --- Shared helpers ---

/** Sort comparator: elected order ascending (nulls last), then name alphabetically. */
export function sortByElectedOrder(
    a: MinutesMember,
    b: MinutesMember,
    getElectedOrder: ElectedOrderGetter,
): number {
    const orderCompare = compareRanks(getElectedOrder(a.personId), getElectedOrder(b.personId));
    if (orderCompare !== 0) return orderCompare;
    return a.name.localeCompare(b.name);
}

/**
 * Merge regular and substitute members so each substitute appears right after
 * the last regular member of the same party. Substitutes whose party doesn't
 * match any regular member are appended at the end.
 */
export function interleaveSubstitutes(
    members: MinutesMember[],
    substituteMembers: MinutesMember[],
): MinutesMember[] {
    if (substituteMembers.length === 0) return members;

    const result: MinutesMember[] = [];
    // Group substitutes by party
    const subsByParty = new Map<string | null, MinutesMember[]>();
    for (const sub of substituteMembers) {
        const key = sub.party;
        const list = subsByParty.get(key) || [];
        list.push(sub);
        subsByParty.set(key, list);
    }

    // Track which parties we've already flushed substitutes for
    const flushed = new Set<string | null>();

    for (let i = 0; i < members.length; i++) {
        result.push(members[i]);
        const party = members[i].party;
        // Check if next member has a different party (or this is the last member)
        const isLastOfParty = i === members.length - 1 || members[i + 1].party !== party;
        if (isLastOfParty && subsByParty.has(party) && !flushed.has(party)) {
            result.push(...subsByParty.get(party)!);
            flushed.add(party);
        }
    }

    // Append any substitutes whose party didn't match any regular member
    for (const [party, subs] of subsByParty) {
        if (!flushed.has(party)) {
            result.push(...subs);
        }
    }

    return result;
}

// --- Builders ---

/**
 * Splits extracted attendance data into present/absent MinutesMember arrays.
 * Excludes the mayor (shown separately in council composition).
 * Sorted by elected order.
 */
export function buildAttendance(
    attendance: Array<{ personId: string; personName: string; status: AttendanceStatus }>,
    mayorPersonId: string | null,
    resolveMember: MemberResolver,
    getElectedOrder: ElectedOrderGetter,
): MinutesAttendance {
    const present: MinutesMember[] = [];
    const absent: MinutesMember[] = [];

    const sorted = [...attendance]
        .filter(a => a.personId !== mayorPersonId)
        .sort((a, b) =>
            compareRanks(getElectedOrder(a.personId), getElectedOrder(b.personId))
            || a.personName.localeCompare(b.personName)
        );

    for (const a of sorted) {
        const member = resolveMember(a.personId, a.personName);
        if (a.status === 'PRESENT') {
            present.push(member);
        } else {
            absent.push(member);
        }
    }

    return { present, absent };
}

/**
 * Builds vote result from extracted vote + attendance data.
 * Derives absent members as: those in attendance who are absent AND didn't vote (excluding mayor).
 * Returns null if there are no votes.
 */
export function buildVoteResult(
    votes: Array<{ personId: string; personName: string; voteType: VoteType }>,
    attendance: Array<{ personId: string; personName: string; status: AttendanceStatus }>,
    mayorPersonId: string | null,
    resolveMember: MemberResolver,
    getElectedOrder: ElectedOrderGetter,
): MinutesVoteResult | null {
    if (votes.length === 0) return null;

    const sortedVotes = [...votes].sort((a, b) =>
        compareRanks(getElectedOrder(a.personId), getElectedOrder(b.personId))
        || a.personName.localeCompare(b.personName)
    );

    const forMembers: MinutesMember[] = [];
    const againstMembers: MinutesMember[] = [];
    const abstainMembers: MinutesMember[] = [];
    const presentMembers: MinutesMember[] = [];
    const didNotVoteMembers: MinutesMember[] = [];

    const voterIds = new Set<string>();
    for (const v of sortedVotes) {
        voterIds.add(v.personId);
        const member = resolveMember(v.personId, v.personName);

        switch (v.voteType) {
            case 'FOR': forMembers.push(member); break;
            case 'AGAINST': againstMembers.push(member); break;
            case 'ABSTAIN': abstainMembers.push(member); break;
            case 'PRESENT': presentMembers.push(member); break;
            case 'DID_NOT_VOTE': didNotVoteMembers.push(member); break;
        }
    }

    // Absent members: those in attendance who are absent and didn't vote (excluding mayor)
    const absentMembers = attendance
        .filter(a => a.status !== 'PRESENT' && !voterIds.has(a.personId) && a.personId !== mayorPersonId)
        .sort((a, b) =>
            compareRanks(getElectedOrder(a.personId), getElectedOrder(b.personId))
            || a.personName.localeCompare(b.personName)
        )
        .map(a => resolveMember(a.personId, a.personName));

    const { passed, isUnanimous } = calculateVoteResult(votes);

    return { forMembers, againstMembers, abstainMembers, presentMembers, didNotVoteMembers, absentMembers, passed, isUnanimous };
}

/**
 * Builds the overall composition for the meeting body.
 * Pure structural data — no attendance dependency. Lists all members
 * sorted by elected order, plus mayor and president.
 *
 * For committees, members are split into regular (τακτικά) and substitute
 * (αναπληρωματικά) — the caller provides them pre-split.
 *
 * @param members - Regular members resolved as MinutesMember
 * @param substituteMembers - Substitute members (αναπληρωματικά μέλη)
 * @param mayor - Mayor info, or null if not found
 * @param president - Council president info, or null if not found
 * @param mayorPersonId - Mayor's person ID (to exclude from members list)
 * @param getElectedOrder - Resolver for council election order
 */
export function buildCouncilComposition(
    members: MinutesMember[],
    substituteMembers: MinutesMember[],
    mayor: { name: string; personId: string } | null,
    president: { name: string; personId: string } | null,
    mayorPersonId: string | null,
    getElectedOrder: ElectedOrderGetter,
): MinutesCouncilComposition {
    const mayorResult: MinutesCouncilComposition['mayor'] = mayor
        ? { name: formatSurnameFirst(mayor.name), personId: mayor.personId }
        : null;

    const presidentResult: MinutesCouncilComposition['president'] = president
        ? { name: formatSurnameFirst(president.name), personId: president.personId }
        : null;

    // Exclude mayor from members list — they're shown separately
    const sortedMembers = members
        .filter(m => m.personId !== mayorPersonId)
        .sort((a, b) => sortByElectedOrder(a, b, getElectedOrder));

    const sortedSubstitutes = substituteMembers
        .filter(m => m.personId !== mayorPersonId)
        .sort((a, b) => sortByElectedOrder(a, b, getElectedOrder));

    return { mayor: mayorResult, president: presidentResult, members: sortedMembers, substituteMembers: sortedSubstitutes };
}



/**
 * Computes mid-meeting attendance changes by diffing per-subject attendance
 * across consecutive subjects in discussion order.
 *
 * Also compares the initial roll call against the first subject's attendance
 * to catch arrivals/departures that happen during the first discussed subject
 * (which have no preceding subject to diff against).
 *
 * A person who is present in subject N but absent in subject N+1 is a departure
 * (detected at subject N+1). A person absent in N but present in N+1 is an arrival.
 */
export function buildAttendanceChanges(
    subjects: Array<{
        subjectId: string;
        name: string;
        agendaItemIndex: number | null;
        nonAgendaReason: 'beforeAgenda' | 'outOfAgenda' | null;
        attendance: MinutesAttendance | null;
    }>,
    /** Initial roll call — absent members at session start. Used to detect changes at the first discussed subject. */
    initialAbsentMembers: MinutesMember[] | null,
): MinutesAttendanceChange[] {
    const changes: MinutesAttendanceChange[] = [];

    // Pre-compute OA sequential indices (1-based)
    const oaIndexMap = new Map<string, number>();
    let oaCounter = 0;
    for (const s of subjects) {
        if (s.nonAgendaReason === 'outOfAgenda') {
            oaCounter++;
            oaIndexMap.set(s.subjectId, oaCounter);
        }
    }

    const buildAtSubject = (s: typeof subjects[number]) => ({
        id: s.subjectId,
        name: s.name,
        agendaItemIndex: s.agendaItemIndex,
        nonAgendaReason: s.nonAgendaReason,
        outOfAgendaIndex: oaIndexMap.get(s.subjectId) ?? null,
    });

    // Compare initial roll call against first subject's attendance.
    // Catches arrivals (initially absent → present) and departures
    // (initially present → absent) during the first discussed subject.
    const firstWithAttendance = subjects.find(s => s.attendance);
    if (firstWithAttendance?.attendance && initialAbsentMembers) {
        const initialAbsentIds = new Set(initialAbsentMembers.map(m => m.personId));
        const atSubject = buildAtSubject(firstWithAttendance);

        // Arrivals: initially absent → present at first subject
        for (const member of firstWithAttendance.attendance.present) {
            if (initialAbsentIds.has(member.personId)) {
                changes.push({ personId: member.personId, name: member.name, type: 'arrival', atSubject });
            }
        }

        // Departures: initially present (not in absent list) → absent at first subject
        for (const member of firstWithAttendance.attendance.absent) {
            if (!initialAbsentIds.has(member.personId)) {
                changes.push({ personId: member.personId, name: member.name, type: 'departure', atSubject });
            }
        }
    }

    // Diff consecutive subjects
    for (let i = 1; i < subjects.length; i++) {
        const prev = subjects[i - 1];
        const curr = subjects[i];
        if (!prev.attendance || !curr.attendance) {
            if (prev.attendance || curr.attendance) {
                console.warn(`[buildAttendanceChanges] Gap in attendance data at subject "${curr.name}"`);
            }
            continue;
        }

        const currAbsentIds = new Set(curr.attendance.absent.map(m => m.personId));
        const currPresentIds = new Set(curr.attendance.present.map(m => m.personId));
        const atSubject = buildAtSubject(curr);

        // Departures: present in prev, absent in curr
        for (const member of prev.attendance.present) {
            if (currAbsentIds.has(member.personId)) {
                changes.push({ personId: member.personId, name: member.name, type: 'departure', atSubject });
            }
        }

        // Arrivals: absent in prev, present in curr
        for (const member of prev.attendance.absent) {
            if (currPresentIds.has(member.personId)) {
                changes.push({ personId: member.personId, name: member.name, type: 'arrival', atSubject });
            }
        }
    }

    return changes;
}

interface SortableSubject {
    id: string;
    agendaItemIndex: number | null;
    nonAgendaReason: string | null;
    discussedIn: { id: string } | null;
}

/**
 * Sorts subjects by discussion order (transcript timestamp), with fallbacks:
 * - Subjects with transcript come before those without
 * - "discussedIn" subjects inherit their parent's timestamp, sorted after the parent
 * - Subjects without transcript fall back to agenda order
 * - outOfAgenda subjects sort after regular agenda items
 */
export function sortSubjectsByDiscussionOrder<T extends SortableSubject>(
    subjects: T[],
    firstUtteranceBySubject: Map<string, number>,
): T[] {
    function getDiscussionTime(s: T): number | undefined {
        const own = firstUtteranceBySubject.get(s.id);
        if (own !== undefined) return own;
        if (s.discussedIn) return firstUtteranceBySubject.get(s.discussedIn.id);
        return undefined;
    }

    return [...subjects].sort((a, b) => {
        const aTime = getDiscussionTime(a);
        const bTime = getDiscussionTime(b);

        // Both have discussion times: sort by time
        if (aTime !== undefined && bTime !== undefined) {
            if (aTime !== bTime) return aTime - bTime;
            // Same timestamp (child inherits parent's time): parent comes first
            const aIsChild = a.discussedIn != null;
            const bIsChild = b.discussedIn != null;
            if (aIsChild !== bIsChild) return aIsChild ? 1 : -1;
            return (a.agendaItemIndex ?? 0) - (b.agendaItemIndex ?? 0);
        }
        // Subjects with discussion time come before those without
        if (aTime !== undefined) return -1;
        if (bTime !== undefined) return 1;

        // Fallback for subjects without transcript: agenda order
        const aIsOOA = a.nonAgendaReason === 'outOfAgenda';
        const bIsOOA = b.nonAgendaReason === 'outOfAgenda';
        if (aIsOOA && !bIsOOA) return 1;
        if (!aIsOOA && bIsOOA) return -1;
        return (a.agendaItemIndex ?? 0) - (b.agendaItemIndex ?? 0);
    });
}

/** Formats a subject reference for display in attendance change sections. */
export function formatSubjectLabel(atSubject: MinutesAttendanceChange['atSubject']): string {
    if (atSubject.nonAgendaReason === 'outOfAgenda' && atSubject.outOfAgendaIndex != null) {
        return `${atSubject.outOfAgendaIndex}ο εκτός ημερήσιας`;
    }
    if (atSubject.agendaItemIndex != null) {
        return `${atSubject.agendaItemIndex}ο θέμα`;
    }
    return atSubject.name;
}
