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
  extractDecisions: {
    requiredForPipeline: false,
  },
} satisfies Record<string, TaskConfig>;

// Derive MeetingTaskType from the configuration
export type MeetingTaskType = keyof typeof TASK_CONFIG;

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
