// Centralized task configuration and types

/**
 * Controls whether generic Discord alerts (started/completed/failed) are sent
 * via sendTaskAdminAlert for a given task type.
 *
 * - 'all'  — send all lifecycle alerts (default when omitted)
 * - 'none' — suppress all generic alerts; the task's result handler
 *            is responsible for sending its own alerts
 */
export type DiscordAlertMode = 'all' | 'none';

/** Why the idempotency guard blocks a new run of a pipeline task. */
export type TaskBlockedReason = 'already_succeeded' | 'already_running';

export interface TaskConfig {
  requiredForPipeline: boolean;
  discordAlertMode?: DiscordAlertMode;
  /**
   * The task runs per highlight, per person or per poll, so two of them on
   * one meeting at the same time are expected. Every other task is one per
   * meeting: startTask refuses a second one while the first still runs.
   */
  concurrentRuns?: boolean;
}

export const TASK_CONFIG = {
  processAgenda: {
    requiredForPipeline: false,
  },
  transcribe: {
    requiredForPipeline: true,
  },
  fixTranscript: {
    requiredForPipeline: true,
  },
  humanReview: {
    requiredForPipeline: true,
  },
  transcriptSent: {
    requiredForPipeline: true,
  },
  summarize: {
    requiredForPipeline: true,
  },
  generateHighlight: {
    requiredForPipeline: false,
    concurrentRuns: true,
  },
  generateVoiceprint: {
    requiredForPipeline: false,
    concurrentRuns: true,
  },
  pollDecisions: {
    requiredForPipeline: false,
    discordAlertMode: 'none',
    concurrentRuns: true,
  },
} satisfies Record<string, TaskConfig>;

// Derive MeetingTaskType from the configuration
export type MeetingTaskType = keyof typeof TASK_CONFIG;

/**
 * The tasks that an admin of a meeting's body runs (#828). The others are the
 * city's: human review and the transcript it sends, decision polling, and
 * voiceprints. Replaying or deleting one of those rows would rewrite a step
 * that a body admin may not take.
 */
const BODY_ADMIN_TASK_TYPES: ReadonlySet<string> = new Set<MeetingTaskType>([
  'processAgenda', 'transcribe', 'fixTranscript', 'summarize', 'generateHighlight',
]);

/**
 * The authorization scope of a task: its meeting for a task that a body admin
 * runs, so that an admin of the meeting's body passes, and its city otherwise.
 */
export function taskScope(task: { type: string; cityId: string; councilMeetingId: string | null }): { cityId: string; councilMeetingId?: string } {
    return task.councilMeetingId && BODY_ADMIN_TASK_TYPES.has(task.type)
        ? { cityId: task.cityId, councilMeetingId: task.councilMeetingId }
        : { cityId: task.cityId };
}

/**
 * startTask throws this when the idempotency guard blocks a pipeline task.
 * A caller that chains one task after another treats it as a skip, not as a failure:
 * the meeting already has the task that the caller wanted to start.
 */
export class TaskAlreadyExistsError extends Error {
  constructor(
    readonly taskType: MeetingTaskType,
    readonly reason: TaskBlockedReason
  ) {
    super(
      reason === 'already_succeeded'
        ? `A ${taskType} task has already succeeded for this council meeting`
        : `A ${taskType} task is already running for this council meeting`
    );
    this.name = 'TaskAlreadyExistsError';
  }
}

/**
 * startTask throws this when another step of the pipeline is still running on
 * the meeting and the two must not overlap (see pipelineRules.ts). Unlike
 * TaskAlreadyExistsError it is not a skip: the caller wanted a step that is
 * not there yet, and has to wait for the blocking one.
 */
export class PipelineBusyError extends Error {
  constructor(
    readonly taskType: MeetingTaskType,
    readonly blockedBy: MeetingTaskType
  ) {
    super(`A ${blockedBy} task is still running for this council meeting; ${taskType} has to wait for it`);
    this.name = 'PipelineBusyError';
  }
}

/**
 * Returns the DiscordAlertMode for a task type.
 * Unknown task types (e.g. from DB records with stale type values) default to 'all'
 * so that generic alerts are never accidentally suppressed.
 */
export function getDiscordAlertMode(taskType: string): DiscordAlertMode {
  const config = TASK_CONFIG[taskType as MeetingTaskType] as TaskConfig | undefined;
  return config?.discordAlertMode ?? 'all';
}

// Derive core processing tasks from configuration
export const CORE_PROCESSING_TASKS = Object.entries(TASK_CONFIG)
  .filter(([_, config]) => config.requiredForPipeline)
  .map(([key]) => key as MeetingTaskType);

// Task type for UI components
export type Task = {
  key: MeetingTaskType;
  label: string;
  completed: boolean;
  required: boolean;
};
