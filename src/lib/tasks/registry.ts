import { handleTranscribeResult } from './transcribe';
import { handleSummarizeResult } from './summarize';
import { handleGeneratePodcastSpecResult } from './generatePodcastSpec';
import { handleSplitMediaFileResult } from './splitMediaFile';
import { handleFixTranscriptResult } from './fixTranscript';
import { handleProcessAgendaResult } from './processAgenda';
import { handleGenerateVoiceprintResult } from './generateVoiceprint';
import { handleGenerateHighlightResult } from './generateHighlight';
import { handlePollDecisionsResult } from './pollDecisions';

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
};

