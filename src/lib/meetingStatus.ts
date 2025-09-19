import { getMeetingTaskStatus, MeetingTaskStatus } from "./db/tasks";

// Meeting processing stages
export const MEETING_STAGES = [
    'scheduled',
    'agendaProcessed',
    'transcribed',
    'transcriptFixed',
    'humanReviewed',
    'summarized',
    'ready',
] as const;

export type MeetingStage = typeof MEETING_STAGES[number];

export type MeetingStatus = {
    tasks: MeetingTaskStatus;
    ready: boolean;
    computedAt: Date;
    stage: MeetingStage;
    order: MeetingStage[];
};

/**
 * Derive the current meeting stage from completed tasks
 * Note: humanReview is not considered in stage derivation - it's shown separately in UI
 */
function deriveMeetingStageFromTasks(tasks: MeetingTaskStatus): MeetingStage {
    if (tasks.summarize) return 'summarized';
    if (tasks.fixTranscript) return 'transcriptFixed';
    if (tasks.transcribe) return 'transcribed';
    if (tasks.processAgenda) return 'agendaProcessed';
    return 'scheduled';
}

/**
 * Get the complete meeting status including tasks, stage, and readiness
 */
export async function getMeetingStatus(cityId: string, meetingId: string): Promise<MeetingStatus> {
    const tasks = await getMeetingTaskStatus(cityId, meetingId);
    // A meeting is ready if it has transcription, transcript fixing, summarization, AND human review
    // processAgenda is not required as some meetings may not have agendas
    const ready = tasks.transcribe && tasks.fixTranscript && tasks.summarize && tasks.humanReview;
    
    return {
        tasks,
        ready,
        computedAt: new Date(),
        stage: deriveMeetingStageFromTasks(tasks),
        order: [...MEETING_STAGES],
    };
}
