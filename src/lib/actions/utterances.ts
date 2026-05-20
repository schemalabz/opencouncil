"use server";

import type { Utterance } from "@prisma/client";
import { editUtterance as edit } from "@/lib/db/utterance";
import { replaceAllInUtterances as replaceAll } from "@/lib/db/transcriptFindReplace";

/** Browser-facing single utterance edit for the transcript editor. editUtterance gates on withUserAuthorizedToEdit before it writes. */
export async function editUtterance(utteranceId: string, newText: string): Promise<Utterance> {
    return edit(utteranceId, newText);
}

/** Browser-facing find & replace for the transcript editor. replaceAllInUtterances gates on withUserAuthorizedToEdit before it writes. */
export async function replaceAllInUtterances(
    cityId: string,
    meetingId: string,
    searchTerm: string,
    replacement: string,
    caseSensitive: boolean,
): Promise<{ utteranceCount: number; occurrenceCount: number }> {
    return replaceAll(cityId, meetingId, searchTerm, replacement, caseSensitive);
}
