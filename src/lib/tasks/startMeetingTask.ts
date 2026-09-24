// Server-only: no auth check. The caller authorizes first — the MCP admin
// tools do, with a token instead of a session.
import "server-only";
import type { TaskStatus } from '@prisma/client';
import prisma from '@/lib/db/prisma';
import { ApiError, BadRequestError, ConflictError, NotFoundError } from '@/lib/api/errors';
import { requestProcessAgendaInternal } from './processAgendaInternal';
import { requestTranscribeInternal } from './transcribeInternal';
import { requestFixTranscriptInternal } from './fixTranscriptInternal';
import { requestSummarizeInternal } from './summarizeInternal';
import { PipelineBusyError, TaskAlreadyExistsError } from './types';
import type { MeetingTaskRequest } from './startableTasks';

export type { MeetingTaskRequest, StartableMeetingTask } from './startableTasks';

/**
 * Start one pipeline step for a meeting. The step's own core builds the
 * request, refuses what it cannot do, and calls the task server; this
 * function supplies the defaults from the meeting row and settles the
 * repeat rules before any core runs:
 *
 * - A step that is still running is never started again, with or without
 *   force. startTask lets force through, which the auto-trigger after a
 *   re-transcribe needs and a caller that retries must not have: two
 *   transcribes of one meeting cost twice and their results collide.
 * - A step that succeeded needs force. The idempotency guard of startTask
 *   covers only the pipeline steps; processAgenda gets the same rule here.
 */
/**
 * A task the task server lost stays `pending` for good and blocks its step.
 * The admin page of the meeting can delete it; the error says so, or an
 * assistant has no way out but to wait.
 */
function stuckTaskHint(cityId: string, meetingId: string): string {
    return `If it shows no progress for 10 minutes, an administrator can delete the stuck task on `
        + `/${cityId}/${meetingId}/admin and start the step again.`;
}

export async function startMeetingTask(
    cityId: string,
    meetingId: string,
    request: MeetingTaskRequest
): Promise<TaskStatus> {
    const meeting = await prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId, id: meetingId } },
        select: {
            youtubeUrl: true,
            agendaUrl: true,
            _count: { select: { speakerSegments: true } },
        },
    });
    if (!meeting) throw new NotFoundError('Meeting not found');

    const force = request.force ?? false;
    const transcribed = meeting._count.speakerSegments > 0;

    // Admission is serialized per meeting with a transaction-scoped advisory
    // lock: a second call for the meeting waits here until the first one has
    // committed, and then reads the task it created. Per meeting, not per
    // step, because some steps exclude one another (see pipelineRules.ts) and
    // two different steps admitted together would both pass that rule.
    // Without the lock two calls pass the checks together and both pay.
    // The core runs while the lock is held; it takes the task server's
    // answer, so the transaction gets the timeout of a slow start.
    return prisma.$transaction(async (tx) => {
        // $executeRaw, not $queryRaw: the lock function returns void, which
        // the query client cannot deserialize.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${cityId}:${meetingId}`}))`;

        // One read answers both rules. Not checkTaskIdempotency: that guard
        // answers "already succeeded" before "already running", and honours
        // force for both, which is what the auto-triggers need and this
        // caller must not.
        const previous = await tx.taskStatus.findMany({
            where: { cityId, councilMeetingId: meetingId, type: request.type },
            select: { status: true },
        });
        if (previous.some(task => task.status !== 'succeeded' && task.status !== 'failed')) {
            throw new ConflictError(
                `A ${request.type} task is already running for this meeting. Wait for it: get_meeting lists the tasks. `
                + stuckTaskHint(cityId, meetingId)
            );
        }
        if (previous.some(task => task.status === 'succeeded') && !force) {
            throw new ConflictError(`A ${request.type} task already succeeded for this meeting. Pass force to run it again.`);
        }

        try {
            switch (request.type) {
                case 'processAgenda': {
                    const agendaUrl = request.agendaUrl ?? meeting.agendaUrl;
                    if (!agendaUrl) {
                        throw new BadRequestError('The meeting has no agenda URL. Pass agendaUrl, or set it with update_meeting.');
                    }
                    return await requestProcessAgendaInternal(agendaUrl, meetingId, cityId, { force });
                }
                case 'transcribe': {
                    const videoUrl = request.videoUrl ?? meeting.youtubeUrl;
                    if (!videoUrl) {
                        throw new BadRequestError('The meeting has no video URL. Pass videoUrl, or set youtubeUrl with update_meeting.');
                    }
                    return await requestTranscribeInternal(videoUrl, meetingId, cityId, { force });
                }
                case 'fixTranscript': {
                    if (!transcribed) throw new BadRequestError('The meeting has no transcript to fix. Start transcribe first.');
                    return await requestFixTranscriptInternal(meetingId, cityId, { force });
                }
                case 'summarize': {
                    if (!transcribed) throw new BadRequestError('The meeting has no transcript to summarize. Start transcribe first.');
                    return await requestSummarizeInternal(cityId, meetingId, [], request.additionalInstructions, { force });
                }
            }
        } catch (error) {
            if (error instanceof PipelineBusyError) {
                throw new ConflictError(
                    `A ${error.blockedBy} task is still running for this meeting, and ${request.type} must not run beside it: `
                    + `its result would be lost when the ${error.blockedBy} result replaces the transcript. Wait for it, `
                    + `with or without force. ${stuckTaskHint(cityId, meetingId)}`
                );
            }
            // The read above and startTask's own guard look at the same rows;
            // a task that lands between the two comes back as this error.
            if (error instanceof TaskAlreadyExistsError) {
                throw new ConflictError(`A ${error.taskType} task was started for this meeting a moment ago. Read get_meeting before you retry.`);
            }
            // startTask records the task as failed and throws with the answer of the
            // task server. That answer is for the administrator, not an internal error.
            if (error instanceof Error && error.message.startsWith('Failed to start task')) {
                throw new ApiError(502, error.message);
            }
            throw error;
        }
    }, {
        // The core builds the request (voiceprints, people, transcript) and
        // waits for the task server; a minute covers a slow start.
        maxWait: 10_000,
        timeout: 60_000,
    });
}
