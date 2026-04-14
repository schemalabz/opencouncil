import { AttendanceStatus, VoteType } from '@prisma/client';
import { compareRanks } from '@/lib/sorting/people';
import { formatSurnameFirst } from '@/lib/formatters/name';
import { calculateVoteResult } from '@/lib/utils/votes';
import {
    MinutesMember,
    MinutesAttendance,
    MinutesVoteResult,
    MinutesCouncilComposition,
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

    const voterIds = new Set<string>();
    for (const v of sortedVotes) {
        voterIds.add(v.personId);
        const member = resolveMember(v.personId, v.personName);

        switch (v.voteType) {
            case 'FOR': forMembers.push(member); break;
            case 'AGAINST': againstMembers.push(member); break;
            case 'ABSTAIN': abstainMembers.push(member); break;
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

    return { forMembers, againstMembers, abstainMembers, absentMembers, passed, isUnanimous };
}

/**
 * Builds the overall council composition for the meeting.
 *
 * @param attendance - The attendance split (already excludes mayor)
 * @param rawPresentIds - Set of person IDs marked present (from raw extracted data, includes mayor)
 * @param mayor - Mayor info, or null if not found
 * @param president - Council president info, or null if not found
 * @param mayorPersonId - Mayor's person ID (to exclude from members list)
 */
export function buildCouncilComposition(
    attendance: MinutesAttendance,
    rawPresentIds: Set<string>,
    mayor: { name: string; personId: string } | null,
    president: { name: string; personId: string } | null,
    mayorPersonId: string | null,
    getElectedOrder: ElectedOrderGetter,
): MinutesCouncilComposition {
    const mayorResult: MinutesCouncilComposition['mayor'] = mayor
        ? { name: formatSurnameFirst(mayor.name), present: rawPresentIds.has(mayor.personId) }
        : null;

    const presidentResult: MinutesCouncilComposition['president'] = president
        ? { name: formatSurnameFirst(president.name), present: rawPresentIds.has(president.personId) }
        : null;

    // Exclude mayor from members list — they're shown separately
    const allMembers = [...attendance.present, ...attendance.absent]
        .filter(m => m.personId !== mayorPersonId);
    allMembers.sort((a, b) => sortByElectedOrder(a, b, getElectedOrder));

    return { mayor: mayorResult, president: presidentResult, members: allMembers };
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
