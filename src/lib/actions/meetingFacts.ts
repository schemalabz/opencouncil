"use server";

import { getCurrentUser, withUserAuthorizedToEdit } from '@/lib/auth';
import { requestReadAttendanceSheetInternal, requestReadTranscriptFactsInternal } from '@/lib/tasks/meetingFacts';

/**
 * Browser-facing starts of the two meeting-facts readers. Both are superadmin
 * cost operations in this round, like a forced re-extraction: a read of the
 * sheet is one model call over an image, a read of the transcript is several.
 */
async function requireSuperadmin(cityId: string): Promise<void> {
    await withUserAuthorizedToEdit({ cityId });
    const user = await getCurrentUser();
    if (!user?.isSuperAdmin) throw new Error('Superadmin required');
}

export async function requestReadAttendanceSheet(cityId: string, meetingId: string): Promise<{ taskId: string }> {
    await requireSuperadmin(cityId);
    const task = await requestReadAttendanceSheetInternal(cityId, meetingId);
    return { taskId: task.id };
}

export async function requestReadTranscriptFacts(cityId: string, meetingId: string): Promise<{ taskId: string }> {
    await requireSuperadmin(cityId);
    const task = await requestReadTranscriptFactsInternal(cityId, meetingId);
    return { taskId: task.id };
}
