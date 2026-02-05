// Centralized task configuration and types
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
  },
} as const;

// Derive MeetingTaskType from the configuration
export type MeetingTaskType = keyof typeof TASK_CONFIG;

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
