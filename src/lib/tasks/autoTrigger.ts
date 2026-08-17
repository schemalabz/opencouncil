import { sendTaskAdminAlert } from '@/lib/discord';
import { MeetingTaskType, TaskAlreadyExistsError } from './types';

export interface AutoTriggerSource {
    /** Task type that completed and chained the follow-up task. */
    taskType: MeetingTaskType;
    /** Id of the source task. The failure alert reports it, because the follow-up task may not exist. */
    taskId: string;
}

export interface AutoTriggerContext {
    cityId: string;
    meetingId: string;
    cityName: string;
    meetingName: string;
    source: AutoTriggerSource;
}

/**
 * Start the next task of the pipeline after a step completes.
 *
 * The trigger runs inside a catch-all guard. Nothing may escape it: the source step
 * already succeeded, so a throw here would report that successful step as failed.
 * A failed trigger only produces a log line and a Discord admin alert.
 *
 * A meeting that already has the task is a skip, not a failure. startTask owns that
 * decision and reports it with TaskAlreadyExistsError, so a caller needs no check of
 * its own and no two checks can disagree.
 */
export async function autoTriggerTask(
    taskType: MeetingTaskType,
    context: AutoTriggerContext,
    trigger: () => Promise<unknown>
): Promise<void> {
    const { cityId, meetingId, cityName, meetingName, source } = context;

    try {
        await trigger();
        console.log(`Auto-triggered ${taskType} for ${cityId}/${meetingId}`);
    } catch (error) {
        if (error instanceof TaskAlreadyExistsError) {
            console.log(`Skipped auto-trigger of ${taskType} for ${cityId}/${meetingId}: ${error.reason}`);
            return;
        }

        console.error(`Failed to auto-trigger ${taskType} for ${cityId}/${meetingId}:`, error);
        await sendTaskAdminAlert({
            status: 'failed',
            taskType,
            cityName,
            meetingName,
            taskId: source.taskId,
            cityId,
            meetingId,
            error: `Failed to auto-trigger after successful ${source.taskType} (task ID is the ${source.taskType} task's): ${error instanceof Error ? error.message : String(error)}`,
        }).catch((alertError) => console.error('Failed to send auto-trigger failure alert:', alertError));
    }
}
