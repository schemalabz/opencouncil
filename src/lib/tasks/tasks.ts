// Server-only, not a "use server" module: that directive published all eight
// exports as Server Actions, handleTaskUpdate among them — the body of the
// task-server callback, which the taskStatuses route protects with a callback
// token. Only processTaskResponse is browser-called, through lib/actions/tasks.ts.
import "server-only";

import { TaskUpdate } from '../apiTypes';
import prisma from '@/lib/db/prisma';
import { lockKey } from '@/lib/db/advisoryLock';
import { MeetingTaskType, TASK_CONFIG, TaskAlreadyExistsError, TaskBlockedReason, getDiscordAlertMode, type TaskConfig } from '@/lib/tasks/types';
import { PipelineBusyError } from '@/lib/tasks/types';
import { findConflictingTask } from './pipelineRules';
import { withUserAuthorizedToEdit } from '../auth';
import { env } from '@/env.mjs';
import { sendTaskAdminAlert } from '@/lib/discord';
import { Prisma, TaskStatus } from '@prisma/client';
import { revalidateTag } from 'next/cache';
import { taskHandlers, taskTerminalHooks } from './registry';
import { mintCallbackToken } from './callbackToken';
import { errorDetail, errorMessage } from '@/lib/utils/errors';

export interface TaskIdempotencyResult {
    proceed: boolean;
    existingTask: TaskStatus | null;
    blockedReason?: TaskBlockedReason;
}

/**
 * Whether a task of this type may start on the meeting now.
 *
 * A task that is still running blocks a second one whatever `force` says:
 * two of them cost twice and their results collide. `force` lifts only the
 * block of a task that already succeeded, which is what a re-run is.
 *
 * `db` lets startTask run the read inside the transaction that holds the
 * meeting lock; the other callers only report, and read outside it.
 */
export async function checkTaskIdempotency(
    taskType: MeetingTaskType,
    cityId: string,
    councilMeetingId: string,
    options: { force?: boolean } = {},
    db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<TaskIdempotencyResult> {
    const runningTask = await db.taskStatus.findFirst({
        where: {
            councilMeetingId,
            cityId,
            type: taskType,
            status: { notIn: ['failed', 'succeeded'] },
        },
    });

    if (runningTask) {
        return { proceed: false, existingTask: runningTask, blockedReason: 'already_running' };
    }

    if (options.force) {
        return { proceed: true, existingTask: null };
    }

    const succeededTask = await db.taskStatus.findFirst({
        where: {
            councilMeetingId,
            cityId,
            type: taskType,
            status: 'succeeded',
        },
        orderBy: { createdAt: 'desc' },
    });

    if (succeededTask) {
        return { proceed: false, existingTask: succeededTask, blockedReason: 'already_succeeded' };
    }

    return { proceed: true, existingTask: null };
}

export interface TaskVersionsFilter {
    taskTypes: MeetingTaskType[];
    dateFrom?: Date;
    dateTo?: Date;
    cityIds?: string[];
    versionMin?: number;
    versionMax?: number;
}

const taskStatusWithMeetingInclude = {
    councilMeeting: {
        select: {
            name_en: true,
            city: {
                select: {
                    name_en: true
                }
            }
        }
    }
} satisfies Prisma.TaskStatusInclude;

type TaskStatusWithMeeting = Prisma.TaskStatusGetPayload<{ include: typeof taskStatusWithMeetingInclude }>;

/** The task fields that every task admin alert carries. */
function taskAlertTarget(task: TaskStatusWithMeeting) {
    return {
        taskType: task.type,
        cityName: task.councilMeeting.city.name_en,
        meetingName: task.councilMeeting.name_en,
        taskId: task.id,
        cityId: task.cityId,
        meetingId: task.councilMeetingId,
    };
}

export const startTask = async (taskType: MeetingTaskType, requestBody: any, councilMeetingId: string, cityId: string, options: { force?: boolean; silent?: boolean } = {}) => {
    const config: TaskConfig = TASK_CONFIG[taskType];

    // Admission and the row that records it happen under one lock per
    // meeting, for every caller: the admin page, the cron, the auto-triggers
    // and the MCP tools. Two calls that arrive together then serialize here,
    // and the second one reads the row the first one committed. Checks
    // outside this transaction would let both pass and both pay.
    const newTask = await prisma.$transaction(async (tx) => {
        await lockKey(tx, `${cityId}:${councilMeetingId}`);

        // A step that would work on rows another running step is about to
        // replace is refused, force or not. The automatic fixTranscript after a
        // transcribe is not affected: findConflictingTask does not count a task
        // whose result has arrived, and the transcribe handler that starts the
        // fixTranscript runs after that arrival.
        const conflicting = await findConflictingTask(taskType, cityId, councilMeetingId, tx);
        if (conflicting) {
            throw new PipelineBusyError(taskType, conflicting.type as MeetingTaskType);
        }

        // One run at a time for every task that is one per meeting, and a
        // re-run after success needs force. processAgenda included: a run
        // that found no subjects still succeeded, and a caller that repeats
        // it without force pays for the same answer.
        if (!config.concurrentRuns) {
            const idempotency = await checkTaskIdempotency(taskType, cityId, councilMeetingId, options, tx);
            if (!idempotency.proceed) {
                // No default: a new blocked reason must fail here rather than reach the
                // reviewer relabelled as "already running"
                if (!idempotency.blockedReason) {
                    throw new Error(`checkTaskIdempotency blocked ${taskType} for ${cityId}/${councilMeetingId} without a reason`);
                }
                throw new TaskAlreadyExistsError(taskType, idempotency.blockedReason);
            }
        }

        return tx.taskStatus.create({
            data: {
                type: taskType,
                status: 'pending',
                requestBody: JSON.stringify(requestBody),
                councilMeeting: { connect: { cityId_id: { cityId, id: councilMeetingId } } }
            },
            include: taskStatusWithMeetingInclude
        });
    });

    // Prepare callback URL; the task server posts back to it verbatim, so the
    // token authenticates the callback without any task-server involvement
    const callbackUrl = `${env.NEXTAUTH_URL}/api/cities/${cityId}/meetings/${councilMeetingId}/taskStatuses/${newTask.id}?token=${mintCallbackToken(newTask.id)}`;
    console.log(`Callback URL: ${callbackUrl}`);

    // Add callback URL to request body
    const fullRequestBody = { ...requestBody, callbackUrl };

    // Call the backend API
    let response;
    let error;
    try {
        console.log(`Calling ${env.TASK_API_URL}/${taskType} with body ${JSON.stringify(fullRequestBody)}`);
        response = await fetch(`${env.TASK_API_URL}/${taskType}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${env.TASK_API_KEY}`,
            },
            body: JSON.stringify(fullRequestBody),
        });
    } catch (err) {
        error = err;
        console.error('Error starting task:', error);
    }


    if (error || !response || !response.ok) {
        let reason = 'no response body';
        if (response) {
            console.log(`Status: ${response.status}`);
            const responseText = await response.text();
            try {
                const body = JSON.parse(responseText);
                reason = body.error || responseText;
            } catch (e) {
                reason = responseText;
            }
        } else if (error) {
            reason = errorMessage(error);
        }

        const fullError = `Failed to start task: ${response?.statusText} (${reason})`;

        // Update task status to failed with error details
        await prisma.taskStatus.update({
            where: { id: newTask.id },
            data: { status: 'failed', failureReason: fullError }
        });

        throw new Error(fullError);
    }

    // Update task with full request body including callback URL
    await prisma.taskStatus.update({
        where: { id: newTask.id },
        data: { requestBody: JSON.stringify(fullRequestBody) }
    });

    // Send Discord admin alert unless silent or alert mode is 'none'
    if (!options.silent && getDiscordAlertMode(taskType) !== 'none') {
        sendTaskAdminAlert({
            status: 'started',
            taskType: taskType,
            cityName: newTask.councilMeeting.city.name_en,
            meetingName: newTask.councilMeeting.name_en,
            taskId: newTask.id,
            cityId: cityId,
            meetingId: councilMeetingId,
        });
    }

    return newTask;
}

/**
 * The stage a task shows between the arrival of its result and the end of the
 * handler that writes it. The panel shows the stage of a pending task.
 */
export const RESULT_PERSISTING_STAGE = 'persisting results';

/**
 * How long a claim (a pending task with a payload) is left alone before a
 * replay may finish it. The handler may still be running: the claim write is
 * the row's last update until the flip, so a young claim is a live one.
 * Above the 10-minute transaction budget of the transcribe handler.
 */
export const CLAIM_REPLAY_AFTER_MS = 15 * 60_000;

/**
 * Record that a result handler threw. `responseBody` stays as it is: it holds the
 * task-server payload, which `processTaskResponse` replays once the handler is
 * fixed.
 */
async function recordProcessingFailure(taskId: string, error: unknown, version?: number) {
    await prisma.taskStatus.update({
        where: { id: taskId },
        data: { status: 'failed', failureReason: errorDetail(error), version },
    });
}

export const handleTaskUpdate = async <T>(taskId: string, update: TaskUpdate<T>, processResult: (taskId: string, result: T, options?: { force?: boolean }) => Promise<void>, options?: { force?: boolean }) => {
    // Get task details for Discord admin alerts
    const task = await prisma.taskStatus.findUnique({
        where: { id: taskId },
        include: taskStatusWithMeetingInclude
    });

    if (!task) {
        console.error(`Task ${taskId} not found`);
        return;
    }

    // Check if generic Discord alerts should be sent for this task type
    const sendGenericAlerts = getDiscordAlertMode(task.type) !== 'none';

    if (update.status === 'success') {
        // The task server retries a callback that times out, while the first
        // request is still processing. A second run of the result handler is
        // not safe (summarize replaces the non-agenda subjects), so only the
        // first success callback for a task proceeds.
        //
        // The claim is the payload: responseBody is null until the first
        // success callback writes it. The status stays as it was until the
        // handler has written the results, because `succeeded` is read from
        // outside as "the results are there". Notis fans a meeting out to its
        // readers on that status; when the flip came before the handler, it
        // built the brief of the 8/10 Athens council from 63 agenda subjects
        // with no discussion time and none of the 20 non-agenda subjects.
        if (!update.result) {
            // Nothing to write: the status is the whole claim. A task whose
            // payload already arrived is being written; a stray result-less
            // success must not flip it early.
            const claimed = await prisma.taskStatus.updateMany({
                where: { id: taskId, status: { not: 'succeeded' }, responseBody: null },
                data: { status: 'succeeded', failureReason: null, version: update.version }
            });
            if (claimed.count === 0) {
                console.warn(`Ignoring duplicate success callback for task ${taskId}`);
                return;
            }
            console.log(`No result for task ${taskId}`);

            // Task succeeded but has no result to process - still send completion admin alert
            if (sendGenericAlerts) {
                sendTaskAdminAlert({ status: 'completed', ...taskAlertTarget(task) });
            }
        } else {
            const claimed = await prisma.taskStatus.updateMany({
                where: { id: taskId, status: { not: 'succeeded' }, responseBody: null },
                data: {
                    responseBody: JSON.stringify(update.result),
                    stage: RESULT_PERSISTING_STAGE,
                    failureReason: null,
                    version: update.version,
                }
            });
            if (claimed.count === 0) {
                console.warn(`Ignoring duplicate success callback for task ${taskId}`);
                return;
            }

            let written = false;
            try {
                await processResult(taskId, update.result, options);
                written = true;
            } catch (error) {
                console.error(`Error processing result for task ${taskId}:`, error);
                await recordProcessingFailure(taskId, error, update.version);

                // Send Discord admin alert for processing failure
                if (sendGenericAlerts) {
                    sendTaskAdminAlert({ status: 'failed', ...taskAlertTarget(task), error: errorMessage(error) });
                }
            }

            if (written) {
                // The results are written: only now does the task read as
                // succeeded. The stage goes back to the task server's last
                // report, which is what the row showed before the claim. A
                // failure of this write is not a failure of the handler: the
                // rows are there, so it is logged, and the alert and the cache
                // revalidation still run.
                try {
                    await prisma.taskStatus.updateMany({
                        where: { id: taskId },
                        data: { status: 'succeeded', stage: task.stage }
                    });
                } catch (flipError) {
                    console.error(`Error marking task ${taskId} succeeded after its results were written:`, flipError);
                }

                // Send Discord admin alert for successful completion AFTER processing succeeds
                if (sendGenericAlerts) {
                    sendTaskAdminAlert({ status: 'completed', ...taskAlertTarget(task) });
                }

                // Revalidate cache only for successful tasks that affect meeting data
                if (task.cityId && shouldRevalidateForTaskType(task.type as MeetingTaskType)) {
                    try {
                        revalidateTag(`city:${task.cityId}:meetings`, 'max');
                    } catch (revalidateError) {
                        console.error(`Error revalidating cache for task ${taskId}:`, revalidateError);
                    }
                }
            }
        }
    } else if (update.status === 'error') {
        // A task whose result already arrived (responseBody set) is being
        // written by its handler; a late error callback does not fail it.
        const claimed = await prisma.taskStatus.updateMany({
            where: { id: taskId, status: { notIn: ['succeeded', 'failed'] }, responseBody: null },
            data: { status: 'failed', failureReason: update.error, version: update.version }
        });
        if (claimed.count === 0) {
            console.warn(
                task.responseBody != null
                    ? `Ignoring error callback for task ${taskId}: its result already arrived`
                    : `Ignoring error callback for task ${taskId}, which is already ${task.status}`,
            );
            return;
        }

        // Send Discord admin alert for task failure
        if (sendGenericAlerts) {
            sendTaskAdminAlert({ status: 'failed', ...taskAlertTarget(task), error: update.error });
        }
    } else if (update.status === 'processing') {
        // Use updateMany with WHERE clause to atomically prevent overwriting
        // terminal states, or the claim of a result that already arrived.
        await prisma.taskStatus.updateMany({
            where: {
                id: taskId,
                status: { notIn: ['succeeded', 'failed'] },
                responseBody: null,
            },
            data: { status: 'pending', stage: update.stage, percentComplete: update.progressPercent, version: update.version }
        });
    }

    // After the task reaches a terminal state, call registered hooks.
    // Runs after all DB status updates are settled, so hooks always see correct state.
    if (update.status === 'success' || update.status === 'error') {
        const terminalHook = taskTerminalHooks[task.type];
        if (terminalHook) {
            try {
                await terminalHook(taskId, task.createdAt);
            } catch (hookError) {
                console.error(`Error in terminal hook for task ${taskId}:`, hookError);
            }
        }
    }
}

// Helper function to determine which task types should trigger cache revalidation
function shouldRevalidateForTaskType(taskType: MeetingTaskType): boolean {
    // Only revalidate for tasks that affect meeting data that would be displayed in lists
    const revalidationTaskTypes = [
        // The cached list previews read which tasks succeeded for the public
        // stage; without this the cards say "transcribing" until the summary.
        'transcribe',
        'summarize',
        'processAgenda',
        'pollDecisions',
    ];
    return revalidationTaskTypes.includes(taskType);
}

export const processTaskResponse = async (taskType: string, taskId: string, options?: { force?: boolean }) => {
    console.log(`Processing task response for task ${taskId} of type ${taskType}${options?.force ? ' (force mode)' : ''}`);
    const task = await prisma.taskStatus.findUnique({ where: { id: taskId } });
    if (!task) {
        throw new Error(`Task ${taskId} not found`);
    }

    // The caller supplies the task id, so the gate is what stops one city's
    // admin from replaying a result onto another city's meeting.
    await withUserAuthorizedToEdit({ cityId: task.cityId });

    const handler = taskHandlers[taskType];
    if (!handler) {
        throw new Error(`Unsupported task type: ${taskType}`);
    }

    // Only a task whose result arrived has anything to replay. The success
    // callback's claim writes responseBody, so a null here means the task
    // server never reported a result: a pending task can still receive its
    // callback, and a failed task without a payload has nothing to replay.
    // A pending task WITH a payload is a claim whose handler never finished
    // (the request was cut mid-write); the replay is how it finishes.
    if (task.responseBody === null) {
        throw new Error(`Task ${taskId} has no result to replay (status ${task.status})`);
    }
    if (task.status !== 'succeeded' && task.status !== 'failed') {
        const ageMs = Date.now() - task.updatedAt.getTime();
        if (ageMs < CLAIM_REPLAY_AFTER_MS) {
            throw new Error(
                `Task ${taskId} is still persisting its result (claimed ${Math.round(ageMs / 60_000)} min ago); ` +
                `replay it after ${CLAIM_REPLAY_AFTER_MS / 60_000} minutes if it does not finish`,
            );
        }
    }

    // A row from before the failureReason column can hold failure text here
    // instead of a payload. Parse before the handler runs, so that a replay of
    // such a row does not record a parse error as the failure of the task.
    let payload: unknown;
    try {
        payload = JSON.parse(task.responseBody);
    } catch {
        throw new Error(`Task ${taskId} has no result to replay: responseBody is not a task payload`);
    }

    // The handler runs on a succeeded task too (a forced re-run), but a
    // replay never demotes a succeeded task: both writes skip it. A failed
    // task, or a claim whose handler never finished, takes the replay's
    // outcome.
    try {
        await handler(taskId, payload, options);
    } catch (error) {
        await prisma.taskStatus.updateMany({
            where: { id: taskId, status: { not: 'succeeded' } },
            data: { status: 'failed', failureReason: errorDetail(error) },
        });
        throw error;
    }
    await prisma.taskStatus.updateMany({
        where: { id: taskId, status: { not: 'succeeded' } },
        data: { status: 'succeeded', failureReason: null },
    });
}

export const getHighestVersionsForTasks = async (taskTypes: MeetingTaskType[]): Promise<Record<string, number | null>> => {
    await withUserAuthorizedToEdit({});
    const tasks = await prisma.taskStatus.findMany({
        select: {
            type: true,
            version: true
        },
        where: { type: { in: taskTypes } },
        orderBy: { version: 'desc' },
    });

    const highestVersions: Record<string, number | null> = {};

    // Initialize all task types with null version
    taskTypes.forEach(type => {
        highestVersions[type] = null;
    });

    // Update with highest version found for each type
    tasks.forEach(task => {
        if (highestVersions[task.type] === null || (task.version !== null && task.version > (highestVersions[task.type] ?? 0))) {
            highestVersions[task.type] = task.version;
        }
    });

    return highestVersions;
}

export const getTaskVersionsForMeetings = async (filters: TaskVersionsFilter): Promise<Record<string, any>[]> => {
    await withUserAuthorizedToEdit({});

    // Build meeting where clause
    const meetingWhere: Prisma.CouncilMeetingWhereInput = {
        city: {
            status: { not: 'pending' }
        }
    };

    if (filters.dateFrom || filters.dateTo) {
        meetingWhere.dateTime = {};
        if (filters.dateFrom) {
            meetingWhere.dateTime.gte = filters.dateFrom;
        }
        if (filters.dateTo) {
            meetingWhere.dateTime.lte = filters.dateTo;
        }
    }

    if (filters.cityIds && filters.cityIds.length > 0) {
        meetingWhere.cityId = { in: filters.cityIds };
    }

    // Fetch all succeeded tasks — version filtering happens in JS against the
    // latest succeeded task per type (by updatedAt), not any matching task
    const taskStatusWhere: Prisma.TaskStatusWhereInput = {
        type: { in: filters.taskTypes },
        status: "succeeded"
    };

    const meetings = await prisma.councilMeeting.findMany({
        select: {
            id: true,
            cityId: true,
            dateTime: true,
            taskStatuses: {
                where: taskStatusWhere,
                select: {
                    type: true,
                    version: true,
                    updatedAt: true
                },
                orderBy: {
                    updatedAt: 'desc'
                }
            }
        },
        where: meetingWhere,
        orderBy: { dateTime: 'desc' }
    });

    // For each meeting, pick the latest succeeded task per type (first in updatedAt desc order)
    const hasVersionFilter = filters.versionMin !== undefined || filters.versionMax !== undefined;
    const includeUnversioned = filters.versionMin === 0 || filters.versionMax === 0;

    const versionInRange = (version: number | null): boolean => {
        // null = unversioned, treated as below any numeric version
        if (version === null) return includeUnversioned;
        // For versioned tasks: 0 in the dropdown means "unversioned", not a numeric bound.
        // versionMin=0 → no lower bound on versioned tasks (unversioned is the floor)
        // versionMax=0 → upper bound is "unversioned only", so no versioned task can match
        if (filters.versionMax === 0) return false;
        if (filters.versionMin !== undefined && filters.versionMin > 0 && version < filters.versionMin) return false;
        if (filters.versionMax !== undefined && version > filters.versionMax) return false;
        return true;
    };

    return meetings
        .map(meeting => {
            const result: Record<string, any> = {
                cityId: meeting.cityId,
                meetingId: meeting.id,
                dateTime: meeting.dateTime
            };

            filters.taskTypes.forEach(taskType => {
                const latest = meeting.taskStatuses.find(t => t.type === taskType);
                // Distinguish "never ran" (no task found → null for display) from
                // "ran but unversioned" (task exists with version=null)
                result[taskType] = latest ? (latest.version ?? null) : null;
                result[`_has_${taskType}`] = !!latest;
            });

            return result;
        })
        .filter(meeting => {
            // Only show meetings where at least one selected task type has run
            const hasAnyTask = filters.taskTypes.some(taskType => meeting[`_has_${taskType}`]);
            if (!hasAnyTask) return false;

            if (!hasVersionFilter) return true;

            // Additionally filter by version range when active
            return filters.taskTypes.some(taskType => {
                if (!meeting[`_has_${taskType}`]) return false;
                return versionInRange(meeting[taskType] as number | null);
            });
        })
        .map(meeting => {
            // Strip internal flags before returning
            filters.taskTypes.forEach(taskType => {
                delete meeting[`_has_${taskType}`];
            });
            return meeting;
        });
};

export const getTaskVersionsGroupedByCity = async (filters: TaskVersionsFilter): Promise<Record<string, any>> => {
    await withUserAuthorizedToEdit({});

    // Get all meetings with their task versions
    const meetingsWithVersions = await getTaskVersionsForMeetings(filters);

    // Build city where clause
    const cityWhere: Prisma.CityWhereInput = {
        status: { not: 'pending' }
    };

    if (filters.cityIds && filters.cityIds.length > 0) {
        cityWhere.id = { in: filters.cityIds };
    }

    // Get city information
    const cities = await prisma.city.findMany({
        where: cityWhere,
        select: {
            id: true,
            name: true,
            name_en: true
        }
    });

    // Group by city
    const groupedByCity: Record<string, any> = {};

    // Initialize with empty arrays for each city
    cities.forEach(city => {
        groupedByCity[city.id] = {
            cityId: city.id,
            cityName: city.name,
            cityNameEn: city.name_en,
            meetings: [],
            meetingCount: 0
        };
    });

    // Add meetings to their respective cities
    meetingsWithVersions.forEach(meeting => {
        const cityId = meeting.cityId;
        if (groupedByCity[cityId]) {
            groupedByCity[cityId].meetings.push(meeting);
            groupedByCity[cityId].meetingCount++;
        }
    });

    return groupedByCity;
};

export const getAvailableCities = async (): Promise<{ id: string; name: string; name_en: string }[]> => {
    await withUserAuthorizedToEdit({});
    return prisma.city.findMany({
        where: { status: { not: 'pending' } },
        select: { id: true, name: true, name_en: true },
        orderBy: { name_en: 'asc' }
    });
};