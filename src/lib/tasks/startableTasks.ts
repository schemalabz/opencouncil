/**
 * The pipeline steps an administrator starts by hand, as the admin page offers
 * them. Kept apart from startMeetingTask.ts, which reaches the database: the
 * MCP tool schema needs only this list.
 */
import type { MeetingTaskType } from './types';

export const STARTABLE_MEETING_TASKS = ['processAgenda', 'transcribe', 'fixTranscript', 'summarize'] as const satisfies readonly MeetingTaskType[];
export type StartableMeetingTask = (typeof STARTABLE_MEETING_TASKS)[number];

export type MeetingTaskRequest =
    | { type: 'processAgenda'; agendaUrl?: string; force?: boolean }
    | { type: 'transcribe'; videoUrl?: string; force?: boolean }
    | { type: 'fixTranscript'; force?: boolean }
    | { type: 'summarize'; additionalInstructions?: string; force?: boolean };
