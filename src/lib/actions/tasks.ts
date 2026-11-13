"use server";

import { processTaskResponse as processResponse } from "@/lib/tasks/tasks";
import { requestTranscribe as transcribe } from "@/lib/tasks/transcribe";
import { requestSummarize as summarize } from "@/lib/tasks/summarize";
import { requestProcessAgenda as processAgenda } from "@/lib/tasks/processAgenda";
import { requestFixTranscript as fixTranscript } from "@/lib/tasks/fixTranscript";
import {
    requestGenerateVoiceprint as generateVoiceprint,
    getVoiceprintSamples as voiceprintSamples,
    requestGenerateVoiceprintsForCity as generateVoiceprintsForCity,
    findEligiblePeopleForVoiceprintGeneration as findEligiblePeople,
} from "@/lib/tasks/generateVoiceprint";

/**
 * Browser-facing task requests for the meeting admin page and the admin
 * people page.
 *
 * The task modules are server-only: next to each request they hold the
 * handler of the task server's result, which a browser must not reach. Every
 * request below gates on withUserAuthorizedToEdit for the meeting, the city
 * or the person before it starts a task or returns data.
 */

/** Reprocess for the admin task list. processTaskResponse gates on the task's own city. */
export async function processTaskResponse(
    taskType: string,
    taskId: string,
    options?: { force?: boolean },
): Promise<void> {
    return processResponse(taskType, taskId, options);
}

export async function requestTranscribe(
    youtubeUrl: string,
    councilMeetingId: string,
    cityId: string,
    options: { force?: boolean; fast?: boolean } = {},
) {
    return transcribe(youtubeUrl, councilMeetingId, cityId, options);
}

export async function requestSummarize(
    cityId: string,
    councilMeetingId: string,
    requestedSubjects: string[] = [],
    additionalInstructions?: string,
    options: { force?: boolean } = {},
) {
    return summarize(cityId, councilMeetingId, requestedSubjects, additionalInstructions, options);
}

export async function requestProcessAgenda(
    agendaUrl: string,
    councilMeetingId: string,
    cityId: string,
    options: { force?: boolean } = {},
) {
    return processAgenda(agendaUrl, councilMeetingId, cityId, options);
}

export async function requestFixTranscript(
    councilMeetingId: string,
    cityId: string,
    options: { force?: boolean } = {},
) {
    return fixTranscript(councilMeetingId, cityId, options);
}

export async function requestGenerateVoiceprint(personId: string, segmentId: string) {
    return generateVoiceprint(personId, segmentId);
}

export async function getVoiceprintSamples(personId: string) {
    return voiceprintSamples(personId);
}

export async function requestGenerateVoiceprintsForCity(cityId: string, personIds?: string[]) {
    return generateVoiceprintsForCity(cityId, personIds);
}

export async function findEligiblePeopleForVoiceprintGeneration(cityId: string, personIds?: string[]) {
    return findEligiblePeople(cityId, personIds);
}
