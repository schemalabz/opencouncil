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
  /**
   * Who starts, replays and deletes the task (#828). 'meeting': the editors
   * of its meeting, the admin of the meeting's body among them. 'city': the
   * city's admins only, because the task takes a step that a body admin may
   * not: human review and the transcript it sends, decision polling, and
   * voiceprints. A new task type does not compile until it decides.
   */
  scope: 'meeting' | 'city';
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
    scope: 'meeting',
    requiredForPipeline: false,
  },
  transcribe: {
    scope: 'meeting',
    requiredForPipeline: true,
  },
  fixTranscript: {
    scope: 'meeting',
    requiredForPipeline: true,
  },
  humanReview: {
    scope: 'city',
    requiredForPipeline: true,
  },
  summarize: {
    scope: 'meeting',
    requiredForPipeline: true,
  },
  generateHighlight: {
    scope: 'meeting',
    requiredForPipeline: false,
    concurrentRuns: true,
  },
  generateVoiceprint: {
    scope: 'city',
    requiredForPipeline: false,
    concurrentRuns: true,
  },
  pollDecisions: {
    scope: 'city',
    requiredForPipeline: false,
    discordAlertMode: 'none',
    concurrentRuns: true,
  },
} satisfies Record<string, TaskConfig>;

// Derive MeetingTaskType from the configuration
export type MeetingTaskType = keyof typeof TASK_CONFIG;

function isMeetingTaskType(type: string): type is MeetingTaskType {
    return type in TASK_CONFIG;
}

/**
 * The authorization scope of a task, from the scope of its type (TaskConfig):
 * its meeting for a task that a body admin runs, and its city otherwise. The
 * entry points that start a task and the replay and delete paths all read it.
 */
export function taskScope(task: { type: string; cityId: string; councilMeetingId: string | null }): { cityId: string; councilMeetingId?: string } {
    return task.councilMeetingId && isMeetingTaskType(task.type) && TASK_CONFIG[task.type].scope === 'meeting'
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
