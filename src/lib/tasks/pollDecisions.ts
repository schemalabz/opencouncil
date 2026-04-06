"use server";

import { PollDecisionsRequest, PollDecisionsResult, ExtractedDecisionData } from "../apiTypes";
import { startTask } from "./tasks";
import prisma from "../db/prisma";
import { AttendanceStatus, DataSource, VoteType } from "@prisma/client";
import { upsertDecision, deleteDecision, getDecisionForSubject } from "../db/decisions";
export { getDecisionForSubject };
import { withUserAuthorizedToEdit } from "../auth";
import { getPeopleForMeeting } from "../db/people";
import { isRoleActiveAt, isMayorRole } from "../utils/roles";
import { shouldSkipPolling, getBackoffState, BACKOFF_SCHEDULE, MAX_POLLING_DAYS, LOGODOSIA_NAME_PATTERN } from "./pollDecisionsBackoff";
import { sendPollDecisionsBatchStartedAlert, sendPollDecisionsBatchCompletedAlert } from "../discord";

export async function requestPollDecisions(
    cityId: string,
    councilMeetingId: string,
    options?: { forceExtract?: boolean },
) {
    await withUserAuthorizedToEdit({ cityId });

    return pollDecisionsForMeeting(cityId, councilMeetingId, options);
}

/**
 * Core function to poll decisions for a meeting. Used by both the admin action and the cron job.
 * Does NOT check authorization — callers are responsible for auth.
 *
 * @param options.silent - When true, suppresses the per-task "started" Discord alert (used by cron batch)
 * @param options.forceExtract - When true, skips extraction cache and reprocesses all PDFs
 */
export async function pollDecisionsForMeeting(
    cityId: string,
    councilMeetingId: string,
    options?: { silent?: boolean; forceExtract?: boolean },
) {
    const councilMeeting = await prisma.councilMeeting.findUnique({
        where: {
            cityId_id: {
                id: councilMeetingId,
                cityId,
            },
        },
        include: {
            city: {
                select: {
                    diavgeiaUid: true,
                },
            },
            administrativeBody: {
                select: {
                    id: true,
                    diavgeiaUnitIds: true,
                },
            },
            subjects: {
                select: {
                    id: true,
                    name: true,
                    agendaItemIndex: true,
                    nonAgendaReason: true,
                    decision: { select: { ada: true, title: true, pdfUrl: true, excerpt: true } },
                },
                where: {
                    OR: [
                        { agendaItemIndex: { not: null } },
                        { nonAgendaReason: 'outOfAgenda' },
                    ],
                },
            },
        },
    });

    if (!councilMeeting) {
        throw new Error("Council meeting not found");
    }

    if (!councilMeeting.city.diavgeiaUid) {
        throw new Error("City does not have a Diavgeia UID configured");
    }

    if (councilMeeting.subjects.length === 0) {
        throw new Error("No eligible subjects to poll (subjects must have agendaItemIndex or be outOfAgenda)");
    }

    // Fetch people for name matching during extraction
    const people = await getPeopleForMeeting(cityId, councilMeeting.administrativeBody?.id ?? null);
    const peopleForRequest = people.map(p => ({ id: p.id, name: p.name }));

    // Find the city mayor for presence extraction from decision narrative
    const mayorPerson = people.find(p =>
        p.roles.some(r => isMayorRole(r) && isRoleActiveAt(r, councilMeeting.dateTime))
    );

    const body: Omit<PollDecisionsRequest, 'callbackUrl'> = {
        meetingDate: councilMeeting.dateTime.toISOString().split('T')[0],
        diavgeiaUid: councilMeeting.city.diavgeiaUid,
        diavgeiaUnitIds: councilMeeting.administrativeBody?.diavgeiaUnitIds.length
            ? councilMeeting.administrativeBody.diavgeiaUnitIds
            : undefined,
        mayorId: mayorPerson?.id,
        forceExtract: options?.forceExtract || undefined,
        people: peopleForRequest,
        subjects: councilMeeting.subjects.map(s => ({
            subjectId: s.id,
            name: s.name,
            agendaItemIndex: s.agendaItemIndex,
            ...(s.decision?.ada ? {
                existingDecision: {
                    ada: s.decision.ada,
                    decisionTitle: s.decision.title ?? '',
                    pdfUrl: s.decision.pdfUrl,
                    needsExtraction: !s.decision.excerpt, // linked but no extraction data
                },
            } : {}),
        })),
    };

    return startTask('pollDecisions', body, councilMeetingId, cityId, { silent: options?.silent });
}

/**
 * Polls decisions for recent meetings across all cities with Diavgeia configured.
 * Called by the cron endpoint. Finds meetings from the last 90 days that still have
 * subjects without linked decisions, and dispatches pollDecisions tasks for them.
 *
 * Uses progressive backoff based on time elapsed since the first poll for each
 * meeting (derived from TaskStatus records). This avoids endlessly polling meetings
 * whose subjects may never have decisions on Diavgeia. After MAX_POLLING_DAYS,
 * automatic polling stops — users can still trigger manual fetches from the
 * subject page.
 *
 * Limits to 10 dispatched tasks per invocation.
 */
export async function pollDecisionsForRecentMeetings() {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // Find meetings from the last 90 days in cities with diavgeiaUid,
    // that have at least one subject with agendaItemIndex but no decision.
    // Λογοδοσία meetings are excluded — see isLogodosiaMeeting().
    const meetings = await prisma.councilMeeting.findMany({
        where: {
            dateTime: { gte: ninetyDaysAgo },
            city: {
                diavgeiaUid: { not: null },
            },
            NOT: {
                name: { contains: LOGODOSIA_NAME_PATTERN },
            },
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
        },
        orderBy: { dateTime: 'desc' },
        take: 50, // Fetch extra candidates since many may be skipped by backoff
    });

    if (meetings.length === 0) {
        return { meetingsProcessed: 0, results: [] };
    }

    // Batch-fetch polling history for all candidate meetings in one query
    const pollHistory = await prisma.taskStatus.groupBy({
        by: ['councilMeetingId', 'cityId'],
        where: {
            councilMeetingId: { in: meetings.map(m => m.id) },
            type: 'pollDecisions',
            status: 'succeeded',
        },
        _count: true,
        _min: { createdAt: true },
        _max: { createdAt: true },
    });

    const historyByMeeting = new Map(
        pollHistory.map(h => [
            `${h.cityId}:${h.councilMeetingId}`,
            { count: h._count, firstPollAt: h._min.createdAt, lastPollAt: h._max.createdAt },
        ])
    );

    const results: Array<{ cityId: string; meetingId: string; status: string }> = [];
    let dispatched = 0;
    let skipped = 0;
    const dispatchedMeetings: Array<{ cityId: string; meetingId: string }> = [];
    const dispatchErrors: Array<{ cityId: string; meetingId: string; error: string }> = [];

    for (const meeting of meetings) {
        if (dispatched >= 10) break;

        const key = `${meeting.cityId}:${meeting.id}`;
        const history = historyByMeeting.get(key);

        const skipReason = shouldSkipPolling(
            history?.firstPollAt ?? null,
            history?.lastPollAt ?? null,
        );
        if (skipReason) {
            results.push({ cityId: meeting.cityId, meetingId: meeting.id, status: `skipped: ${skipReason}` });
            skipped++;
            continue;
        }

        try {
            await pollDecisionsForMeeting(
                meeting.cityId,
                meeting.id,
                { silent: true },
            );

            dispatched++;
            dispatchedMeetings.push({ cityId: meeting.cityId, meetingId: meeting.id });
            results.push({ cityId: meeting.cityId, meetingId: meeting.id, status: 'started' });
        } catch (error) {
            console.error(`Failed to poll decisions for meeting ${meeting.cityId}/${meeting.id}:`, error);
            const errorMsg = (error as Error).message;
            dispatchErrors.push({ cityId: meeting.cityId, meetingId: meeting.id, error: errorMsg });
            results.push({ cityId: meeting.cityId, meetingId: meeting.id, status: `error: ${errorMsg}` });
        }
    }

    // Send a single batch started alert instead of per-task alerts.
    // .catch() ensures failures are logged — this is the sole observability path
    // for pollDecisions (discordAlertMode: 'none' suppresses all generic alerts).
    if (dispatched > 0 || dispatchErrors.length > 0) {
        sendPollDecisionsBatchStartedAlert({
            dispatchedCount: dispatched,
            skippedCount: skipped,
            meetings: dispatchedMeetings,
            errors: dispatchErrors,
        }).catch(err => console.error('Failed to send pollDecisions batch started alert:', err));
    }

    return { meetingsProcessed: dispatched, results };
}

/**
 * Returns statistics about decision polling effectiveness.
 * For each decision discovered by polling: when was it published on Diavgeia,
 * when did we find it, and how many poll attempts it took.
 * Use this to fine-tune the BACKOFF_SCHEDULE.
 */
export async function getPollingStats(cityId?: string, councilMeetingId?: string) {
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
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const stillPollingMeetings = await prisma.councilMeeting.findMany({
        where: {
            dateTime: { gte: ninetyDaysAgo },
            city: { diavgeiaUid: { not: null } },
            subjects: {
                some: {
                    agendaItemIndex: { not: null },
                    decision: null,
                },
            },
            ...(cityId && { cityId }),
            ...(councilMeetingId && { id: councilMeetingId }),
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
                dateTime: { gte: ninetyDaysAgo },
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

    // Distinct meeting IDs for the selected city: union of meetings from both sources
    let pollMeetings: string[] = [];
    if (cityId) {
        const [taskMeetingRows, stillPollingMeetingRows] = await Promise.all([
            prisma.taskStatus.findMany({
                where: { type: 'pollDecisions', cityId },
                distinct: ['councilMeetingId'],
                select: { councilMeetingId: true },
            }),
            prisma.councilMeeting.findMany({
                where: {
                    cityId,
                    dateTime: { gte: ninetyDaysAgo },
                    city: { diavgeiaUid: { not: null } },
                    subjects: { some: { agendaItemIndex: { not: null }, decision: null } },
                },
                select: { id: true },
                orderBy: { dateTime: 'desc' },
            }),
        ]);
        pollMeetings = [...new Set([
            ...taskMeetingRows.map(r => r.councilMeetingId).filter((id): id is string => id !== null),
            ...stillPollingMeetingRows.map(r => r.id),
        ])];
    }

    // ADA conflicts: subjects with claimedAda set
    const claimingSubjects = await prisma.subject.findMany({
        where: {
            claimedAda: { not: null },
            ...(cityId && { cityId }),
            ...(councilMeetingId && { councilMeetingId }),
        },
        select: {
            id: true,
            name: true,
            cityId: true,
            councilMeetingId: true,
            claimedAda: true,
        },
    });

    // Look up existing decisions for the claimed ADAs
    const claimedAdas = claimingSubjects.map(s => s.claimedAda!);
    const existingDecisionsForClaims = claimedAdas.length > 0
        ? await prisma.decision.findMany({
            where: { ada: { in: claimedAdas } },
            select: {
                ada: true,
                title: true,
                pdfUrl: true,
                subjectId: true,
                subject: {
                    select: {
                        id: true,
                        name: true,
                        cityId: true,
                        councilMeetingId: true,
                    },
                },
            },
        })
        : [];
    const decisionByAda = new Map(existingDecisionsForClaims.map(d => [d.ada!, d]));

    const conflicts = claimingSubjects.map(claiming => {
        const existingDecision = decisionByAda.get(claiming.claimedAda!);
        return {
            claimingSubject: {
                id: claiming.id,
                name: claiming.name,
                cityId: claiming.cityId,
                councilMeetingId: claiming.councilMeetingId,
            },
            ada: claiming.claimedAda!,
            existingDecision: existingDecision ? {
                title: existingDecision.title,
                pdfUrl: existingDecision.pdfUrl,
                currentSubject: {
                    id: existingDecision.subject.id,
                    name: existingDecision.subject.name,
                    cityId: existingDecision.subject.cityId,
                    councilMeetingId: existingDecision.subject.councilMeetingId,
                },
            } : null,
        };
    });

    // Recent poll tasks for the "Recent Polls" table
    const recentPollTasks = await prisma.taskStatus.findMany({
        where: {
            type: 'pollDecisions',
            ...(cityId && { cityId }),
            ...(councilMeetingId && { councilMeetingId }),
        },
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
        pollMeetings,
    };
}

/**
 * Server action: request a decision poll for a single subject.
 * Any user can trigger this (public-facing). Simple rate limiting via
 * checking for existing pending/running tasks within the last 5 minutes.
 */
export async function requestPollDecisionForSubject(subjectId: string): Promise<{
    status: 'requested' | 'already_running';
    taskId: string;
    cityId: string;
    meetingId: string;
}> {
    const subject = await prisma.subject.findUnique({
        where: { id: subjectId },
        select: {
            id: true,
            name: true,
            agendaItemIndex: true,
            cityId: true,
            councilMeetingId: true,
        },
    });

    if (!subject || subject.agendaItemIndex == null) {
        throw new Error("Subject not found or not eligible for decisions");
    }

    // Simple rate limit: check for existing pending/running pollDecisions task
    // for the same meeting within the last 5 minutes
    const fiveMinutesAgo = new Date();
    fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);

    const recentTask = await prisma.taskStatus.findFirst({
        where: {
            councilMeetingId: subject.councilMeetingId,
            cityId: subject.cityId,
            type: 'pollDecisions',
            status: { notIn: ['failed', 'succeeded'] },
            createdAt: { gte: fiveMinutesAgo },
        },
    });

    if (recentTask) {
        return {
            status: 'already_running',
            taskId: recentTask.id,
            cityId: subject.cityId,
            meetingId: subject.councilMeetingId,
        };
    }

    const task = await pollDecisionsForMeeting(
        subject.cityId,
        subject.councilMeetingId,
    );

    return {
        status: 'requested',
        taskId: task.id,
        cityId: subject.cityId,
        meetingId: subject.councilMeetingId,
    };
}

/**
 * Returns polling history and current backoff state for a specific meeting.
 * Used by the DecisionsPanel to show polling status.
 */
export async function getPollingHistoryForMeeting(
    cityId: string,
    councilMeetingId: string
): Promise<{
    totalPolls: number;
    firstPollAt: string | null;
    lastPollAt: string | null;
    currentTierLabel: string | null;
    nextPollEligible: string | null;
}> {
    const history = await prisma.taskStatus.aggregate({
        where: {
            councilMeetingId,
            cityId,
            type: 'pollDecisions',
            status: 'succeeded',
        },
        _count: true,
        _min: { createdAt: true },
        _max: { createdAt: true },
    });

    const totalPolls = history._count;
    const firstPollAt = history._min.createdAt;
    const lastPollAt = history._max.createdAt;

    if (totalPolls === 0 || !firstPollAt || !lastPollAt) {
        return {
            totalPolls: 0,
            firstPollAt: null,
            lastPollAt: null,
            currentTierLabel: null,
            nextPollEligible: null,
        };
    }

    const { currentTierLabel, nextPollEligible } = getBackoffState(firstPollAt, lastPollAt);

    return {
        totalPolls,
        firstPollAt: firstPollAt.toISOString(),
        lastPollAt: lastPollAt.toISOString(),
        currentTierLabel,
        nextPollEligible,
    };
}

/**
 * Returns the timestamp of the last successful pollDecisions task for a meeting.
 * Used to show "last searched" time on the subject page.
 */
export async function getLastPollTimeForMeeting(
    meetingId: string,
    cityId: string
): Promise<string | null> {
    const lastTask = await prisma.taskStatus.findFirst({
        where: {
            councilMeetingId: meetingId,
            cityId,
            type: 'pollDecisions',
            status: 'succeeded',
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
    });
    return lastTask?.createdAt.toISOString() ?? null;
}

export async function resolveAdaConflict(
    subjectId: string,
    resolution: 'reassign' | 'dismiss',
) {
    const subject = await prisma.subject.findUnique({
        where: { id: subjectId },
        select: { id: true, cityId: true, claimedAda: true },
    });

    if (!subject) {
        throw new Error("Subject not found");
    }

    await withUserAuthorizedToEdit({ cityId: subject.cityId });

    if (!subject.claimedAda) {
        throw new Error("Subject has no claimed ADA");
    }

    if (resolution === 'dismiss') {
        await prisma.subject.update({
            where: { id: subjectId },
            data: { claimedAda: null },
        });
        return;
    }

    // resolution === 'reassign'
    await prisma.$transaction(async (tx) => {
        // Re-read claimedAda inside the transaction to avoid using a stale value
        const freshSubject = await tx.subject.findUnique({
            where: { id: subjectId },
            select: { claimedAda: true },
        });

        if (!freshSubject?.claimedAda) {
            // Claim was resolved concurrently — nothing to do
            return;
        }

        // Only move the decision if the claiming subject doesn't already have one
        const existingOnClaiming = await tx.decision.findUnique({
            where: { subjectId },
        });

        if (!existingOnClaiming) {
            const existingDecision = await tx.decision.findUnique({
                where: { ada: freshSubject.claimedAda },
                include: { subject: { select: { cityId: true } } },
            });

            if (existingDecision) {
                // Defensive: polls are per-city so cross-city conflicts shouldn't occur,
                // but guard against it to prevent modifying another city's data.
                if (existingDecision.subject.cityId !== subject.cityId) {
                    throw new Error("Cannot reassign a decision that belongs to a different city");
                }

                // Delete existing decision to free ADA unique constraint, then recreate on claiming subject
                await tx.decision.delete({ where: { id: existingDecision.id } });
                await tx.decision.create({
                    data: {
                        subjectId,
                        ada: existingDecision.ada,
                        pdfUrl: existingDecision.pdfUrl,
                        protocolNumber: existingDecision.protocolNumber,
                        title: existingDecision.title,
                        publishDate: existingDecision.publishDate,
                        taskId: existingDecision.taskId,
                        createdById: existingDecision.createdById,
                    },
                });
            }
        }

        // Always clear the claim
        await tx.subject.update({
            where: { id: subjectId },
            data: { claimedAda: null },
        });
    });
}

/** Per-meeting entry in the batch completion summary. */
export interface PollDecisionsMeetingResult {
    cityId: string;
    meetingId: string;
    matches: number;
    reassignments: number;
    conflicts: number;
    extractions: number;
    status: 'succeeded' | 'failed';
    error?: string;
}

/** Max characters for an individual error line in batch Discord summaries. */
const ERROR_PREVIEW_LENGTH = 200;

/**
 * Radius (ms) for grouping pollDecisions tasks into a batch.
 * Tasks created within ±BATCH_WINDOW_MS of each other are considered siblings.
 *
 * Must be less than half the cron interval to avoid grouping tasks from
 * consecutive runs into the same batch. Current cron interval: 10 minutes.
 */
const BATCH_WINDOW_MS = 2 * 60 * 1000;

/**
 * After a pollDecisions task reaches a terminal state, check whether all sibling
 * tasks in the same batch window have also finished. If so, aggregate results
 * and send a single batch completion alert.
 *
 * Called via taskTerminalHooks in handleTaskUpdate — runs AFTER the task's DB
 * status is settled, so all statuses read from DB are correct.
 *
 * NOTE: Tasks that fail during startTask() (backend API errors) are set to
 * 'failed' directly without a callback, so handleTaskUpdate and this hook are
 * never invoked for them. Partial dispatch failures self-heal (surviving tasks
 * trigger this hook and find failed siblings via the time-window query). A
 * complete dispatch failure produces only a batch started alert — no completed
 * alert fires, since the started alert already shows the dispatch errors.
 */
export async function checkBatchCompletionAndAlert(
    _taskId: string,
    taskCreatedAt: Date,
) {
    const windowStart = new Date(taskCreatedAt.getTime() - BATCH_WINDOW_MS);
    const windowEnd = new Date(taskCreatedAt.getTime() + BATCH_WINDOW_MS);

    // Find all pollDecisions tasks in the time window
    const siblingTasks = await prisma.taskStatus.findMany({
        where: {
            type: 'pollDecisions',
            createdAt: { gte: windowStart, lte: windowEnd },
        },
        select: {
            id: true,
            status: true,
            cityId: true,
            councilMeetingId: true,
            responseBody: true,
        },
    });

    // Check if all siblings are in terminal state.
    // Note: if two tasks complete nearly simultaneously, both may see allTerminal=true
    // and send a duplicate alert. This is a benign race — Discord duplicates are
    // preferable to missing alerts, and the window is very small in practice.
    const allTerminal = siblingTasks.every(t => t.status === 'succeeded' || t.status === 'failed');
    if (!allTerminal) {
        return; // Not all done yet — a later completion will trigger the summary
    }

    // Aggregate results — all tasks read uniformly from DB.
    let totalMatches = 0;
    let totalReassignments = 0;
    let totalConflicts = 0;
    let totalExtractions = 0;
    let succeededCount = 0;
    let failedCount = 0;
    const meetingBreakdown: PollDecisionsMeetingResult[] = [];

    for (const sibling of siblingTasks) {
        const cityId = sibling.cityId;
        const meetingId = sibling.councilMeetingId ?? 'unknown';

        if (sibling.status === 'failed') {
            failedCount++;
            meetingBreakdown.push({
                cityId,
                meetingId,
                matches: 0,
                reassignments: 0,
                conflicts: 0,
                extractions: 0,
                status: 'failed',
                error: sibling.responseBody?.substring(0, ERROR_PREVIEW_LENGTH) ?? undefined,
            });
            continue;
        }

        succeededCount++;

        // Parse responseBody for result counts. Prefer _processedCounts (enriched
        // after processing) for accurate post-processing numbers; fall back to raw
        // server response counts for older tasks or edge cases.
        let matches = 0;
        let reassignments = 0;
        let conflicts = 0;
        let extractions = 0;
        if (sibling.responseBody) {
            try {
                const parsed = JSON.parse(sibling.responseBody);
                if (parsed._processedCounts) {
                    matches = parsed._processedCounts.matches ?? 0;
                    reassignments = parsed._processedCounts.reassignments ?? 0;
                    conflicts = parsed._processedCounts.conflicts ?? 0;
                    extractions = parsed._processedCounts.extractions ?? 0;
                } else {
                    matches = Array.isArray(parsed.matches) ? parsed.matches.length : 0;
                    reassignments = Array.isArray(parsed.reassignments) ? parsed.reassignments.length : 0;
                }
            } catch { /* ignore parse errors */ }
        }
        totalMatches += matches;
        totalReassignments += reassignments;
        totalConflicts += conflicts;
        totalExtractions += extractions;
        meetingBreakdown.push({
            cityId,
            meetingId,
            matches,
            reassignments,
            conflicts,
            extractions,
            status: 'succeeded',
        });
    }

    sendPollDecisionsBatchCompletedAlert({
        succeededCount,
        failedCount,
        totalMatches,
        totalReassignments,
        totalConflicts,
        totalExtractions,
        meetingBreakdown,
    }).catch(err => console.error('Failed to send pollDecisions batch completed alert:', err));
}

export async function handlePollDecisionsResult(taskId: string, result: PollDecisionsResult) {
    const task = await prisma.taskStatus.findUnique({
        where: { id: taskId },
    });

    if (!task) {
        throw new Error("Task not found");
    }

    const requestBody = JSON.parse(task.requestBody) as PollDecisionsRequest;
    const mayorId = requestBody.mayorId;

    let reassignmentCount = 0;
    let processedCount = 0;
    let conflictCount = 0;

    // Collect all subjectIds from matches and reassignments for validation
    const allSubjectIds = [
        ...result.matches.map(m => m.subjectId),
        ...result.reassignments.flatMap(r => [r.fromSubjectId, r.toSubjectId]),
    ];

    const validSubjectIds = await prisma.subject.findMany({
        where: {
            id: { in: allSubjectIds },
            cityId: task.cityId,
            councilMeetingId: task.councilMeetingId,
        },
        select: { id: true },
    });
    const validSubjectIdSet = new Set(validSubjectIds.map(s => s.id));

    // Validate every reassignment has a corresponding match to upsert,
    // otherwise deleting the old decision would lose it permanently.
    const matchSubjectIds = new Set(result.matches.map(m => m.subjectId));
    for (const r of result.reassignments) {
        if (!matchSubjectIds.has(r.toSubjectId)) {
            throw new Error(`Reassignment for ${r.ada} has no corresponding match (${r.fromSubjectId} → ${r.toSubjectId})`);
        }
    }

    // Wrap reassignments + upserts in a transaction to ensure atomicity.
    // Reassignments delete old decisions to free ADA unique constraints before
    // upserting new ones — without a transaction, a failed upsert after a
    // successful delete would permanently lose decision data.
    await prisma.$transaction(async (tx) => {
        // Step 1: Detect ADA conflicts — find ADAs that already exist on other subjects
        const matchAdas = result.matches.map(m => m.ada).filter((ada): ada is string => ada != null);
        const existingDecisions = matchAdas.length > 0
            ? await tx.decision.findMany({ where: { ada: { in: matchAdas } }, select: { ada: true, subjectId: true } })
            : [];
        const adaToExistingSubject = new Map(existingDecisions.map(d => [d.ada!, d.subjectId]));

        // Build set of ADAs being reassigned — these are handled explicitly, not conflicts
        const reassignedAdas = new Set(result.reassignments.map(r => r.ada));

        // Step 2: Process reassignments — delete old decisions to free ADA unique constraint
        if (result.reassignments.length > 0) {
            for (const r of result.reassignments) {
                if (!validSubjectIdSet.has(r.fromSubjectId) || !validSubjectIdSet.has(r.toSubjectId)) {
                    console.warn(`Poll decisions: skipping invalid reassignment ${r.ada} (${r.fromSubjectId} → ${r.toSubjectId}) for task ${taskId}`);
                    continue;
                }
                await tx.decision.deleteMany({ where: { subjectId: r.fromSubjectId } });
                reassignmentCount++;
                console.log(`Reassigned ADA ${r.ada}: ${r.fromSubjectId} → ${r.toSubjectId}: ${r.reason}`);
            }
        }

        // Step 3: Upsert new matches (including reassigned ones), recording conflicts
        for (const match of result.matches) {
            // Skip any subjectIds that don't belong to this meeting
            if (!validSubjectIdSet.has(match.subjectId)) {
                console.warn(`Poll decisions: skipping invalid subjectId ${match.subjectId} for task ${taskId}`);
                continue;
            }

            // Check for ADA conflict: ADA exists on a different subject and isn't being reassigned
            if (match.ada) {
                const existingSubjectId = adaToExistingSubject.get(match.ada);
                if (existingSubjectId && existingSubjectId !== match.subjectId && !reassignedAdas.has(match.ada)) {
                    // Record the claim on the incoming subject, skip the upsert
                    await tx.subject.update({
                        where: { id: match.subjectId },
                        data: { claimedAda: match.ada },
                    });
                    conflictCount++;
                    console.log(`ADA conflict: ${match.ada} already belongs to subject ${existingSubjectId}, claimed by subject ${match.subjectId}`);
                    continue;
                }
            }

            try {
                await tx.decision.upsert({
                    where: { subjectId: match.subjectId },
                    create: {
                        subjectId: match.subjectId,
                        pdfUrl: match.pdfUrl,
                        protocolNumber: match.protocolNumber ?? null,
                        ada: match.ada ?? null,
                        title: match.decisionTitle ?? null,
                        publishDate: match.publishDate ? new Date(match.publishDate) : null,
                        taskId,
                    },
                    update: {
                        pdfUrl: match.pdfUrl,
                        protocolNumber: match.protocolNumber ?? null,
                        ada: match.ada ?? null,
                        title: match.decisionTitle ?? null,
                        publishDate: match.publishDate ? new Date(match.publishDate) : null,
                    },
                });
            } catch (e) {
                // Concurrent poll race: another transaction committed a decision with the same
                // ADA between our conflict check and this upsert. Fall back to recording a claim.
                if (match.ada && (e as { code?: string })?.code === 'P2002') {
                    await tx.subject.update({
                        where: { id: match.subjectId },
                        data: { claimedAda: match.ada },
                    });
                    conflictCount++;
                    console.log(`ADA conflict (concurrent): ${match.ada} claimed by subject ${match.subjectId}`);
                    continue;
                }
                throw e;
            }

            // Clear any stale conflict claim now that this subject has a valid decision
            await tx.subject.updateMany({
                where: { id: match.subjectId, claimedAda: { not: null } },
                data: { claimedAda: null },
            });

            processedCount++;

            // Track this ADA so later matches in the same batch see it as taken
            if (match.ada) {
                adaToExistingSubject.set(match.ada, match.subjectId);
            }
        }
    });

    // --- Process extraction results (excerpt, attendance, votes) ---
    // Each subject is wrapped in its own transaction for atomicity:
    // partial failures roll back individual subjects without blocking others.
    // Uses deleteMany + createMany instead of N individual upserts.
    let extractedCount = 0;
    if (result.extractions) {
        for (const decision of result.extractions.decisions) {
            try {
                await prisma.$transaction(async (tx) => {
                    // 1. Update Decision excerpt and references
                    await tx.decision.updateMany({
                        where: { subjectId: decision.subjectId },
                        data: {
                            excerpt: decision.excerpt || null,
                            references: decision.references || null,
                        },
                    });

                    // 2. Create SubjectAttendance records (deduplicate by personId)
                    const attendanceByPerson = new Map<string, AttendanceStatus>(
                        [
                            ...decision.presentMemberIds.map(id => [id, 'PRESENT' as const] as const),
                            ...decision.absentMemberIds.map(id => [id, 'ABSENT' as const] as const),
                        ]
                    );

                    // Include mayor attendance if extracted from decision narrative
                    if (decision.mayorPresent != null && mayorId) {
                        attendanceByPerson.set(mayorId, decision.mayorPresent ? 'PRESENT' : 'ABSENT');
                    }

                    if (attendanceByPerson.size > 0) {
                        await tx.subjectAttendance.deleteMany({
                            where: { subjectId: decision.subjectId, source: DataSource.decision },
                        });
                        await tx.subjectAttendance.createMany({
                            data: [...attendanceByPerson].map(([personId, status]) => ({
                                subjectId: decision.subjectId,
                                personId,
                                status,
                                source: DataSource.decision,
                                taskId,
                            })),
                        });
                    }

                    // 3. Create SubjectVote records (deduplicate by personId)
                    // Vote inference (unanimous, majority) is handled by the backend —
                    // voteDetails already includes inferred FOR votes.
                    const voteByPerson = new Map<string, VoteType>();
                    for (const d of decision.voteDetails) {
                        voteByPerson.set(d.personId, d.vote);
                    }

                    if (voteByPerson.size > 0) {
                        await tx.subjectVote.deleteMany({
                            where: { subjectId: decision.subjectId, source: DataSource.decision },
                        });
                        await tx.subjectVote.createMany({
                            data: [...voteByPerson].map(([personId, voteType]) => ({
                                subjectId: decision.subjectId,
                                personId,
                                voteType,
                                source: DataSource.decision,
                                taskId,
                            })),
                        });
                    }

                    // TODO: Re-enable once the codebase stops using `agendaItemIndex !== null`
                    // as a proxy for "is a regular agenda item". Currently, most display
                    // and categorization logic (categorizeSubjects, sidebar, DecisionsPanel,
                    // subject-card, MinutesPreviewContent, subject-helpers upsert matching,
                    // etc.) assumes outOfAgenda subjects have agendaItemIndex === null.
                    // Setting it here causes them to be miscategorized as regular agenda
                    // items across the UI. To enable this, those checks need to use
                    // nonAgendaReason as the primary discriminator instead.
                    //
                    // 4. Update agendaItemIndex from subjectInfo for outOfAgenda subjects
                    // if (decision.subjectInfo?.number != null) {
                    //     await tx.subject.updateMany({
                    //         where: {
                    //             id: decision.subjectId,
                    //             agendaItemIndex: null,
                    //             nonAgendaReason: 'outOfAgenda',
                    //         },
                    //         data: { agendaItemIndex: decision.subjectInfo.number },
                    //     });
                    // }
                });

                extractedCount++;
            } catch (error) {
                console.error(`Failed to write extraction data for subject ${decision.subjectId}:`, error);
            }

            // Log unmatched members (outside transaction — informational only)
            if (decision.unmatchedMembers.length > 0) {
                for (const name of decision.unmatchedMembers) {
                    console.log(`  Unmatched member "${name}" in subject "${decision.subjectId}"`);
                }
            }

            // Log per-decision warnings from validation
            if (decision.warnings && decision.warnings.length > 0) {
                for (const w of decision.warnings) {
                    console.log(`  [${w.severity}] ${w.code}: ${w.message} (subject ${decision.subjectId})`);
                }
            }
        }

        if (result.extractions.warnings.length > 0) {
            console.log(`Extraction warnings (${result.extractions.warnings.length}):`);
            for (const w of result.extractions.warnings) {
                console.log(`  - ${w}`);
            }
        }
    }

    // Enrich responseBody with post-processing counts so the batch completion
    // hook (checkBatchCompletionAndAlert) can read accurate totals from DB.
    // Wrapped in try/catch because this runs after the main transaction committed —
    // a failure here should not mark the task as failed when decisions were already persisted.
    try {
        await prisma.taskStatus.update({
            where: { id: taskId },
            data: {
                responseBody: JSON.stringify({
                    ...result,
                    _processedCounts: {
                        matches: processedCount,
                        reassignments: reassignmentCount,
                        conflicts: conflictCount,
                        extractions: extractedCount,
                    },
                }),
            },
        });
    } catch (enrichError) {
        console.error(`Failed to enrich responseBody for task ${taskId} (decisions already persisted):`, enrichError);
    }

    console.log(`Poll decisions completed: ${processedCount} matched, ${extractedCount} extracted, ${reassignmentCount} reassigned, ${conflictCount} conflicts, ${result.unmatchedSubjects.length} unmatched, ${result.ambiguousSubjects.length} ambiguous`);
}
