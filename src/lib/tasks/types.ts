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

interface TaskConfig {
  requiredForPipeline: boolean;
  discordAlertMode?: DiscordAlertMode;
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
  generatePodcastSpec: {
    requiredForPipeline: false,
  },
  generateHighlight: {
    requiredForPipeline: false,
  },
  splitMediaFile: {
    requiredForPipeline: false,
  },
  generateVoiceprint: {
    requiredForPipeline: false,
  },
  pollDecisions: {
    requiredForPipeline: false,
    discordAlertMode: 'none',
  },
} satisfies Record<string, TaskConfig>;

// Derive MeetingTaskType from the configuration
export type MeetingTaskType = keyof typeof TASK_CONFIG;

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
