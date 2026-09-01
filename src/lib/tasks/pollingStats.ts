import "server-only";
import prisma from '../db/prisma';
import { getConflictingCandidates } from '../db/decisionCandidates';
import { getPollableMeetingDateRange, getBackoffState, BACKOFF_SCHEDULE, MAX_POLLING_DAYS } from './pollDecisionsBackoff';

/**
 * Polling-effectiveness statistics for the cron stats endpoint. Not an action
 * module: every export of a "use server" file is a callable endpoint, and this
 * has no auth of its own — the cron route holds the CRON_SECRET gate.
 */

/**
 * Returns statistics about decision polling effectiveness.
 * For each decision discovered by polling: when was it published on Diavgeia,
 * when did we find it, and how many poll attempts it took.
 * Use this to fine-tune the BACKOFF_SCHEDULE.
 */
export async function getPollingStats() {
    // Decisions discovered by polling (have a taskId)
    const discoveries = await prisma.decision.findMany({
        where: { taskId: { not: null } },
        select: {
            subjectId: true,
            ada: true,
            publishDate: true,
            createdAt: true,
            task: {
                select: {
                    id: true,
                    createdAt: true,
                    councilMeetingId: true,
                    cityId: true,
                },
            },
            subject: {
                select: {
                    name: true,
                    councilMeeting: {
                        select: { dateTime: true },
                    },
                },
            },
        },
        orderBy: { createdAt: 'desc' },
    });

    // For each discovery, count how many poll attempts happened for that meeting
    // before (and including) the discovery task
    const meetingIds = [...new Set(discoveries.map(d => d.task!.councilMeetingId))];

    const pollCounts = meetingIds.length > 0
        ? await prisma.taskStatus.groupBy({
            by: ['councilMeetingId', 'cityId'],
            where: {
                councilMeetingId: { in: meetingIds },
                type: 'pollDecisions',
                status: 'succeeded',
            },
            _count: true,
            _min: { createdAt: true },
        })
        : [];

    const pollCountByMeeting = new Map(
        pollCounts.map(p => [
            `${p.cityId}:${p.councilMeetingId}`,
            { totalPolls: p._count, firstPollAt: p._min.createdAt },
        ])
    );

    const discoveryDetails = discoveries.map(d => {
        const task = d.task!;
        const key = `${task.cityId}:${task.councilMeetingId}`;
        const meetingPolls = pollCountByMeeting.get(key);

        const meetingDate = d.subject.councilMeeting.dateTime;
        const discoveredAt = task.createdAt;
        const firstPollAt = meetingPolls?.firstPollAt ?? discoveredAt;
        const publishDate = d.publishDate;

        // How long after Diavgeia published did we find it?
        const discoveryDelayDays = publishDate
            ? (discoveredAt.getTime() - publishDate.getTime()) / (1000 * 60 * 60 * 24)
            : null;

        // How long after we started polling did we find it?
        const pollingDurationDays = (discoveredAt.getTime() - firstPollAt.getTime()) / (1000 * 60 * 60 * 24);

        // How long after the meeting did Diavgeia publish?
        const publishDelayDays = publishDate
            ? (publishDate.getTime() - meetingDate.getTime()) / (1000 * 60 * 60 * 24)
            : null;

        return {
            cityId: task.cityId,
            meetingId: task.councilMeetingId,
            meetingDate: meetingDate.toISOString().split('T')[0],
            subjectId: d.subjectId,
            subjectName: d.subject.name,
            ada: d.ada,
            publishDate: publishDate?.toISOString().split('T')[0] ?? null,
            discoveredAt: discoveredAt.toISOString(),
            firstPollAt: firstPollAt.toISOString(),
            totalPollsForMeeting: meetingPolls?.totalPolls ?? 1,
            discoveryDelayDays: discoveryDelayDays !== null ? Math.round(discoveryDelayDays * 10) / 10 : null,
            pollingDurationDays: Math.round(pollingDurationDays * 10) / 10,
            publishDelayDays: publishDelayDays !== null ? Math.round(publishDelayDays * 10) / 10 : null,
        };
    });

    // Compute summary stats
    const delaysWithData = discoveryDetails.filter(d => d.discoveryDelayDays !== null);
    const sortedDelays = delaysWithData.map(d => d.discoveryDelayDays!).sort((a, b) => a - b);
    const publishDelaysWithData = discoveryDetails.filter(d => d.publishDelayDays !== null);
    const sortedPublishDelays = publishDelaysWithData.map(d => d.publishDelayDays!).sort((a, b) => a - b);

    const median = (arr: number[]) => {
        if (arr.length === 0) return null;
        const mid = Math.floor(arr.length / 2);
        return arr.length % 2 !== 0 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
    };

    const avg = (arr: number[]) => arr.length === 0 ? null : Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;

    // Meetings still being actively polled (have unlinked subjects)
    const pollableDateRange = getPollableMeetingDateRange();
    const stillPollingMeetings = await prisma.councilMeeting.findMany({
        where: {
            dateTime: pollableDateRange,
            city: { diavgeiaUid: { not: null } },
            subjects: {
                some: {
                    agendaItemIndex: { not: null },
                    decision: null,
                },
            },
        },
        select: {
            id: true,
            cityId: true,
            dateTime: true,
            subjects: {
                where: {
                    agendaItemIndex: { not: null },
                    decision: null,
                },
                select: { id: true, name: true },
            },
        },
        orderBy: { dateTime: 'desc' },
    });

    // Batch-fetch polling history for still-polling meetings
    const stillPollingIds = stillPollingMeetings.map(m => m.id);
    const stillPollingHistory = stillPollingIds.length > 0
        ? await prisma.taskStatus.groupBy({
            by: ['councilMeetingId', 'cityId'],
            where: {
                councilMeetingId: { in: stillPollingIds },
                type: 'pollDecisions',
                status: 'succeeded',
            },
            _count: true,
            _min: { createdAt: true },
            _max: { createdAt: true },
        })
        : [];

    const stillPollingHistoryMap = new Map(
        stillPollingHistory.map(h => [
            `${h.cityId}:${h.councilMeetingId}`,
            { count: h._count, firstPollAt: h._min.createdAt, lastPollAt: h._max.createdAt },
        ])
    );

    // Batch-fetch total eligible subject counts per meeting
    const eligibleCounts = stillPollingIds.length > 0
        ? await prisma.subject.groupBy({
            by: ['councilMeetingId', 'cityId'],
            where: {
                councilMeetingId: { in: stillPollingIds },
                agendaItemIndex: { not: null },
            },
            _count: true,
        })
        : [];

    const eligibleCountMap = new Map(
        eligibleCounts.map(r => [`${r.cityId}:${r.councilMeetingId}`, r._count])
    );

    const meetingsStillPolling = stillPollingMeetings.map(m => {
        const key = `${m.cityId}:${m.id}`;
        const history = stillPollingHistoryMap.get(key);
        const firstPollAt = history?.firstPollAt ?? null;
        const lastPollAt = history?.lastPollAt ?? null;
        const { currentTierLabel, nextPollEligible } = getBackoffState(firstPollAt, lastPollAt);

        return {
            cityId: m.cityId,
            meetingId: m.id,
            meetingDate: m.dateTime.toISOString().split('T')[0],
            unlinkedSubjects: m.subjects.map(s => ({ id: s.id, name: s.name })),
            totalEligibleSubjects: eligibleCountMap.get(key) ?? 0,
            totalPolls: history?.count ?? 0,
            firstPollAt: firstPollAt?.toISOString() ?? null,
            lastPollAt: lastPollAt?.toISOString() ?? null,
            currentTierLabel,
            nextPollEligible,
        };
    });

    // Distinct cities for filter dropdown: union of cities with poll tasks + cities with unlinked subjects
    const [pollCityRows, stillPollingCityRows] = await Promise.all([
        prisma.taskStatus.findMany({
            where: { type: 'pollDecisions' },
            distinct: ['cityId'],
            select: { cityId: true },
        }),
        prisma.councilMeeting.findMany({
            where: {
                dateTime: pollableDateRange,
                city: { diavgeiaUid: { not: null } },
                subjects: { some: { agendaItemIndex: { not: null }, decision: null } },
            },
            distinct: ['cityId'],
            select: { cityId: true },
        }),
    ]);
    const pollCities = [...new Set([
        ...pollCityRows.map(r => r.cityId),
        ...stillPollingCityRows.map(r => r.cityId),
    ])].sort();

    // ADA conflicts: unresolved candidates whose proposed subject collides with
    // an ADA already held by another subject's Decision (issue #617 phase 4).
    const candidateConflicts = await getConflictingCandidates();
    const conflicts = candidateConflicts.map(c => ({
        candidateId: c.candidateId,
        claimingSubject: c.claimingSubject,
        ada: c.ada,
        existingDecision: c.existingDecision,
    }));

    // Recent poll tasks for the "Recent Polls" table
    const recentPollTasks = await prisma.taskStatus.findMany({
        where: { type: 'pollDecisions' },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
            id: true,
            createdAt: true,
            status: true,
            councilMeetingId: true,
            cityId: true,
            requestBody: true,
            responseBody: true,
        },
    });

    const recentPolls = recentPollTasks.map(task => {
        let subjectsPolled = 0;
        let matchesFound: number | null = null;
        let unmatchedCount: number | null = null;
        let ambiguousCount: number | null = null;

        try {
            const req = JSON.parse(task.requestBody) as { subjects?: unknown[] };
            subjectsPolled = Array.isArray(req.subjects) ? req.subjects.length : 0;
        } catch { /* ignore parse errors */ }

        if (task.status === 'succeeded' && task.responseBody) {
            try {
                const res = JSON.parse(task.responseBody) as {
                    matches?: unknown[];
                    unmatchedSubjects?: unknown[];
                    ambiguousSubjects?: unknown[];
                };
                matchesFound = Array.isArray(res.matches) ? res.matches.length : 0;
                unmatchedCount = Array.isArray(res.unmatchedSubjects) ? res.unmatchedSubjects.length : 0;
                ambiguousCount = Array.isArray(res.ambiguousSubjects) ? res.ambiguousSubjects.length : 0;
            } catch { /* ignore parse errors */ }
        }

        return {
            id: task.id,
            createdAt: task.createdAt.toISOString(),
            status: task.status,
            councilMeetingId: task.councilMeetingId,
            cityId: task.cityId,
            subjectsPolled,
            matchesFound,
            unmatchedCount,
            ambiguousCount,
            requestBody: task.requestBody,
            responseBody: task.responseBody,
        };
    });

    return {
        backoffSchedule: BACKOFF_SCHEDULE,
        maxPollingDays: MAX_POLLING_DAYS,
        meetingsStillPolling,
        conflicts,
        summary: {
            totalDiscoveries: discoveryDetails.length,
            meetingsStillPolling: meetingsStillPolling.length,
            discoveryDelay: {
                avgDays: avg(sortedDelays),
                medianDays: median(sortedDelays),
                minDays: sortedDelays.length > 0 ? sortedDelays[0] : null,
                maxDays: sortedDelays.length > 0 ? sortedDelays[sortedDelays.length - 1] : null,
            },
            publishDelay: {
                description: "Days between meeting date and Diavgeia publication",
                avgDays: avg(sortedPublishDelays),
                medianDays: median(sortedPublishDelays),
                minDays: sortedPublishDelays.length > 0 ? sortedPublishDelays[0] : null,
                maxDays: sortedPublishDelays.length > 0 ? sortedPublishDelays[sortedPublishDelays.length - 1] : null,
            },
        },
        discoveries: discoveryDetails,
        recentPolls,
        pollCities,
    };
}