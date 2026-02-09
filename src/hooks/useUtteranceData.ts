"use client";

import { useMemo } from "react";
import { useCouncilMeetingData } from "@/components/meetings/CouncilMeetingDataContext";
import { Transcript } from "@/lib/db/transcript";
import { Utterance } from "@prisma/client";

export interface UtteranceLookupResult {
    utterance: Utterance;
    utteranceIndex: number;
    segment: Transcript[number];
}

/**
 * Hook to look up an utterance from the transcript context.
 * Returns the utterance, its index, and the containing segment.
 * Returns null if the utterance is not found.
 */
export function useUtteranceData(utteranceId: string | null): UtteranceLookupResult | null {
    const { transcript } = useCouncilMeetingData();

    return useMemo(() => {
        if (!utteranceId) return null;

        for (const segment of transcript) {
            const utteranceIndex = segment.utterances.findIndex(
                (u) => u.id === utteranceId
            );

            if (utteranceIndex !== -1) {
                return {
                    utterance: segment.utterances[utteranceIndex],
                    utteranceIndex,
                    segment,
                };
            }
        }

        return null;
    }, [transcript, utteranceId]);
}

