"use server";

import { withUserAuthorizedToEdit } from '../auth';
import { requestFixTranscriptInternal } from './fixTranscriptInternal';

/**
 * Browser-facing entry point for the admin panel's fix-transcript button.
 *
 * The city and meeting ids arrive from the caller, so this gate is what stops
 * one city's admin from queueing a transcript rewrite on another city's
 * meeting. Background callers have no session to gate on and use
 * requestFixTranscriptInternal.
 */
export const requestFixTranscript = async (councilMeetingId: string, cityId: string, options: { force?: boolean } = {}) => {
    await withUserAuthorizedToEdit({ cityId });
    return requestFixTranscriptInternal(councilMeetingId, cityId, options);
};
