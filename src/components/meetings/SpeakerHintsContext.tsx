"use client";
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getSpeakerHintsForMeeting, SpeakerTagHints } from '@/lib/db/speakerTags';
import { speakerHintsDisagree } from '@/lib/speakerHints';
import { useCouncilMeetingMeta } from './CouncilMeetingDataContext';
import { useTranscriptOptions } from './options/OptionsContext';

interface SpeakerHintsContextType {
    /** The hints of a speaker tag; undefined when it has none, or outside editing mode. */
    getHints: (speakerTagId: string) => SpeakerTagHints | undefined;
    /** True while the two methods name different people and no reviewer has decided. */
    needsReview: (speakerTagId: string) => boolean;
}

const NO_HINTS: SpeakerHintsContextType = {
    getHints: () => undefined,
    needsReview: () => false,
};

const SpeakerHintsContext = createContext<SpeakerHintsContextType>(NO_HINTS);

/**
 * Speaker hints for the reviewer's editor. Hints are not part of the public
 * meeting data: they are fetched once editing mode is on, through a server
 * action that checks edit rights. Readers never load or see them.
 */
export function SpeakerHintsProvider({ children }: { children: React.ReactNode }) {
    const { options } = useTranscriptOptions();
    const { meeting, speakerTags } = useCouncilMeetingMeta();
    const [hintsByTagId, setHintsByTagId] = useState<Map<string, SpeakerTagHints>>(new Map());

    useEffect(() => {
        if (!options.editable) return;
        let cancelled = false;
        getSpeakerHintsForMeeting(meeting.cityId, meeting.id)
            .then(hints => {
                if (!cancelled) setHintsByTagId(new Map(hints.map(hint => [hint.id, hint])));
            })
            .catch(error => console.error('Failed to load speaker hints:', error));
        return () => {
            cancelled = true;
        };
    }, [options.editable, meeting.cityId, meeting.id]);

    const value = useMemo<SpeakerHintsContextType>(() => {
        if (!options.editable) return NO_HINTS;
        // Whether a reviewer has decided comes from the meeting's own tags, which
        // follow the server after every saved edit: a failed edit decides nothing.
        const decidedTagIds = new Set(speakerTags.filter(tag => tag.personSetBy === 'user').map(tag => tag.id));
        return {
            getHints: speakerTagId => hintsByTagId.get(speakerTagId),
            needsReview: speakerTagId => {
                const hints = hintsByTagId.get(speakerTagId);
                return hints !== undefined && !decidedTagIds.has(speakerTagId) && speakerHintsDisagree(hints);
            },
        };
    }, [options.editable, hintsByTagId, speakerTags]);

    return <SpeakerHintsContext.Provider value={value}>{children}</SpeakerHintsContext.Provider>;
}

export function useSpeakerHints() {
    return useContext(SpeakerHintsContext);
}
