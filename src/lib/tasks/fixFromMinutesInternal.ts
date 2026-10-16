/**
 * Core fixFromMinutes logic without auth checks: the request, and the handler
 * of the task server's result (#876).
 *
 * NOT in a "use server" file — this must not be callable as a Server Action.
 * Only called from:
 *   - startMeetingTask, after the MCP tools and the admin page authorize
 *   - the fixTranscript result handler's auto-trigger, which runs on a
 *     task-server callback with no user session to authorize against
 */
import "server-only";
import prisma from '@/lib/db/prisma';
import { FixFromMinutesResult } from '@/lib/apiTypes';
import { getFixFromMinutesRequestBody } from '@/lib/db/utils';
import { startTask } from '@/lib/tasks/tasks';
import { meetingLabelInCity } from '@/lib/meetingName';
import { applySpeakerHints } from './speakerHints';
import { isSupersededCorrection } from './fixTranscriptInternal';
import { autoTriggerTask } from './autoTrigger';
import { requestSummarizeInternal } from './summarizeInternal';

/**
 * Starts the task. A URL passed here is stored on the meeting first, as the
 * video of a transcribe is: the request builder and every later run read it
 * from the meeting.
 */
export const requestFixFromMinutesInternal = async (
    councilMeetingId: string,
    cityId: string,
    options: { force?: boolean; municipalMinutesUrl?: string } = {}
) => {
    if (options.municipalMinutesUrl) {
        await prisma.councilMeeting.update({
            where: { cityId_id: { cityId, id: councilMeetingId } },
            data: { municipalMinutesUrl: options.municipalMinutesUrl },
        });
    }
    const requestBody = await getFixFromMinutesRequestBody(councilMeetingId, cityId);
    return startTask('fixFromMinutes', requestBody, councilMeetingId, cityId, { force: options.force });
};

/**
 * Applies a fixFromMinutes result: the text corrections, each recorded as an
 * edit of this run, then the `minutes` speaker opinions. It takes the task id
 * and the result from its caller and checks no session, so it lives here and
 * not in a "use server" file.
 *
 * A superseded result is ignored whole, text and hints, as a fixTranscript
 * result is. The task stands in for the human review (TASK_CONFIG), so its
 * success starts summarize, as the end of a review does.
 */
export const handleFixFromMinutesResult = async (taskId: string, result: FixFromMinutesResult) => {
    if (await isSupersededCorrection(taskId)) {
        console.log(`fixFromMinutes result of task ${taskId} ignored: a later transcribe, fixTranscript or fixFromMinutes run supersedes it`);
        return;
    }

    const task = await prisma.taskStatus.findUnique({
        where: { id: taskId },
        include: {
            councilMeeting: {
                include: {
                    city: { select: { name_en: true, timezone: true } },
                    administrativeBody: { select: { name: true, name_en: true } },
                },
            },
        },
    });
    if (!task) {
        throw new Error('Task not found');
    }

    const nonExistentIds: string[] = [];
    for (const update of result.updateUtterances) {
        const utterance = await prisma.utterance.findUnique({ where: { id: update.utteranceId } });
        if (!utterance) {
            nonExistentIds.push(update.utteranceId);
            continue;
        }

        await prisma.utterance.update({
            where: { id: update.utteranceId },
            data: { text: update.text, uncertain: update.markUncertain, lastModifiedBy: 'task' },
        });
        await prisma.utteranceEdit.create({
            data: {
                utteranceId: update.utteranceId,
                beforeText: utterance.text,
                afterText: update.text,
                editedBy: 'task',
                taskId,
            },
        });
    }

    const { report } = result;
    console.log(
        `fixFromMinutes ${task.cityId}/${task.councilMeetingId}: updated ${result.updateUtterances.length} utterances ` +
        `(${nonExistentIds.length} not found); coverage ${Math.round(report.document.coverage * 100)}%, ` +
        `${report.alignment.alignedTurns}/${report.alignment.turns} turns aligned, ${report.alignment.turnsUnderGate} under the gate, ` +
        `${report.corrections.substitutions} substitutions, ${report.speakers.actionable} actionable speakers, ` +
        `${report.speakers.contested.length} contested, ${report.speakers.disagreements.length} disagreements, ` +
        `${report.speakers.unresolvedLabels.length} unresolved labels`
    );
    if (nonExistentIds.length > 0) {
        console.warn(`Warning: The following utterance IDs were not found: ${nonExistentIds.join(', ')}`);
    }

    // Absent when the pass did not run (no roster, or no speaker tag ids): the
    // opinions of an earlier run then stay as they are. An empty list says the
    // pass ran and named nobody, and clears them.
    // The text corrections above are committed one by one, so a failure here
    // must not fail the task: it would report corrected text as a failed run.
    if (result.speakerHints) {
        try {
            await applySpeakerHints(taskId, result.speakerHints, 'minutes');
        } catch (error) {
            console.error(`Failed to apply the minutes speaker hints of task ${taskId}; the text corrections stand:`, error);
        }
    }

    // The minutes take the place of the review, and the review is what starts
    // summarize. force: a re-run of the correction after a re-transcribe
    // summarizes a transcript the earlier summarize never saw.
    await autoTriggerTask(
        'summarize',
        {
            cityId: task.cityId,
            meetingId: task.councilMeetingId,
            cityName: task.councilMeeting.city.name_en,
            meetingName: meetingLabelInCity(task.councilMeeting, 'en'),
            source: { taskType: 'fixFromMinutes', taskId },
        },
        () => requestSummarizeInternal(task.cityId, task.councilMeetingId, [], undefined, { force: true })
    );
};
