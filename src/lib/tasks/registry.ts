import { handleTranscribeResult } from './transcribe';
import { handleSummarizeResult } from './summarize';
import { handleGeneratePodcastSpecResult } from './generatePodcastSpec';
import { handleSplitMediaFileResult } from './splitMediaFile';
import { handleFixTranscriptResult } from './fixTranscript';
import { handleProcessAgendaResult } from './processAgenda';
import { handleGenerateVoiceprintResult } from './generateVoiceprint';
import { handleGenerateHighlightResult } from './generateHighlight';
import { handlePollDecisionsResult, checkBatchCompletionAndAlert } from './pollDecisions';
import { handleExtractDecisionsResult } from './extractDecisions';

// Task handler registry - maps task types to their result handlers
export type TaskResultHandler = (taskId: string, result: any, options?: { force?: boolean }) => Promise<void>;

export const taskHandlers: Record<string, TaskResultHandler> = {
    transcribe: handleTranscribeResult,
    summarize: handleSummarizeResult,
    generatePodcastSpec: handleGeneratePodcastSpecResult,
    splitMediaFile: handleSplitMediaFileResult,
    fixTranscript: handleFixTranscriptResult,
    processAgenda: handleProcessAgendaResult,
    generateVoiceprint: handleGenerateVoiceprintResult,
    generateHighlight: handleGenerateHighlightResult,
    pollDecisions: handlePollDecisionsResult,
    extractDecisions: handleExtractDecisionsResult,
};

// Hooks called after a task reaches a terminal state (succeeded or failed).
// Runs after handleTaskUpdate has settled the DB status, so the hook always
// sees the correct final state. Used by task types that need post-terminal
// coordination (e.g., batch completion detection for pollDecisions).
export type TaskTerminalHook = (taskId: string, taskCreatedAt: Date) => Promise<void>;

export const taskTerminalHooks: Partial<Record<string, TaskTerminalHook>> = {
    pollDecisions: checkBatchCompletionAndAlert,
};

