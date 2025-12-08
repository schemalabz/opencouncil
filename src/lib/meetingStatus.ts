import { getMeetingTaskStatus, MeetingTaskStatus } from "./db/tasks";
import { TASK_CONFIG, CORE_PROCESSING_TASKS, Task } from "./tasks/types";

// Derive meeting stages from core processing tasks
export const MEETING_STAGES = [
    'scheduled',
    ...CORE_PROCESSING_TASKS,
    'ready',
  ] as const;

export type MeetingStage = typeof MEETING_STAGES[number];

export type MeetingStatus = {
    tasks: MeetingTaskStatus;
    ready: boolean;
    computedAt: Date;
    stage: MeetingStage;
};

/**
 * Derive the current meeting stage from completed tasks
 * Note: humanReview is not considered in stage derivation - it's shown separately in UI
 */
function deriveMeetingStageFromTasks(tasks: MeetingTaskStatus): MeetingStage {
    // Check tasks in reverse order to find the latest completed stage
    for (let i = CORE_PROCESSING_TASKS.length - 1; i >= 0; i--) {
        const taskKey = CORE_PROCESSING_TASKS[i];
        if (tasks[taskKey]) {
            return taskKey as MeetingStage;
        }
    }
    return 'scheduled';
}

/**
 * Get tasks configuration from centralized definitions
 * Maps task keys to their display labels and determines which are required
 */
export function getTasks(tasks: MeetingTaskStatus, getLabel: (key: string) => string): Task[] {
    return CORE_PROCESSING_TASKS.map(taskKey => ({
        key: taskKey,
        label: getLabel(taskKey),
        completed: tasks[taskKey],
        required: TASK_CONFIG[taskKey].requiredForPipeline,
    }));
}

/**
 * Get the complete meeting status including tasks, stage, and readiness
 */
export async function getMeetingStatus(cityId: string, meetingId: string): Promise<MeetingStatus> {
    const tasks = await getMeetingTaskStatus(cityId, meetingId);
    // A meeting is ready if all required tasks are completed
    const ready = CORE_PROCESSING_TASKS.every(taskKey => 
        !TASK_CONFIG[taskKey].requiredForPipeline || tasks[taskKey]
    );
    
    return {
        tasks,
        ready,
        computedAt: new Date(),
        stage: deriveMeetingStageFromTasks(tasks),
    };
}
