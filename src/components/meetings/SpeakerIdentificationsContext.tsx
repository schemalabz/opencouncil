"use client";
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getSpeakerIdentificationsForMeeting } from '@/lib/actions/speakerTags';
import type { SpeakerTagIdentification } from '@/lib/db/speakerTags';
import type { MethodIdentification } from '@/lib/speakerIdentifications';
import { hasPendingSpeakerSuggestion, isReviewerAssignment, speakerIdentificationsDisagree } from '@/lib/speakerIdentifications';
import { useCouncilMeetingMeta } from './CouncilMeetingDataContext';
import { useTranscriptOptions } from './options/OptionsContext';

/**
 * Automatic person reconciliation compares people only. The picker retains
 * visitor opinions too, including those held back from automatic application.
 */
type PersonIdentification = SpeakerTagIdentification & Pick<MethodIdentification, 'personId'>;

const namesPerson = (identification: SpeakerTagIdentification): identification is PersonIdentification =>
    identification.personId !== null;

interface SpeakerIdentificationsContextType {
    /** What each method says about a speaker tag; empty when no method has an opinion, or outside editing mode. */
    getIdentifications: (speakerTagId: string) => SpeakerTagIdentification[];
    /** True while both methods would act, on different people, and no reviewer has decided. */
    needsReview: (speakerTagId: string) => boolean;
    /** An unresolved alternative to what the tag currently displays. */
    hasSuggestion: (speakerTagId: string) => boolean;
}

const NONE: SpeakerTagIdentification[] = [];
const NO_IDENTIFICATIONS: SpeakerIdentificationsContextType = {
    getIdentifications: () => NONE,
    needsReview: () => false,
    hasSuggestion: () => false,
};

const SpeakerIdentificationsContext = createContext<SpeakerIdentificationsContextType>(NO_IDENTIFICATIONS);

/**
 * Speaker identifications for the reviewer's editor. They are not part of the
 * public meeting data: they are fetched once editing mode is on, through a
 * server action that checks edit rights. Readers never load or see them.
 */
export function SpeakerIdentificationsProvider({ children }: { children: React.ReactNode }) {
    const { options } = useTranscriptOptions();
    const { meeting, speakerTags } = useCouncilMeetingMeta();
    const [byTagId, setByTagId] = useState<Map<string, SpeakerTagIdentification[]>>(new Map());

    useEffect(() => {
        if (!options.editable) return;
        let cancelled = false;
        getSpeakerIdentificationsForMeeting(meeting.cityId, meeting.id)
            .then(identifications => {
                if (cancelled) return;
                const grouped = new Map<string, SpeakerTagIdentification[]>();
                for (const identification of identifications) {
                    grouped.set(identification.speakerTagId, [...(grouped.get(identification.speakerTagId) ?? []), identification]);
                }
                setByTagId(grouped);
            })
            .catch(error => console.error('Failed to load speaker identifications:', error));
        return () => {
            cancelled = true;
        };
    }, [options.editable, meeting.cityId, meeting.id]);

    const value = useMemo<SpeakerIdentificationsContextType>(() => {
        if (!options.editable) return NO_IDENTIFICATIONS;
        // Whether a reviewer has decided comes from the meeting's own tags, which
        // follow the server after every saved edit: a failed edit decides nothing.
        const decidedTagIds = new Set(speakerTags.filter(isReviewerAssignment).map(tag => tag.id));
        const tagsById = new Map(speakerTags.map(tag => [tag.id, tag]));
        return {
            getIdentifications: speakerTagId => byTagId.get(speakerTagId) ?? NONE,
            needsReview: speakerTagId =>
                !decidedTagIds.has(speakerTagId) && speakerIdentificationsDisagree((byTagId.get(speakerTagId) ?? NONE).filter(namesPerson)),
            hasSuggestion: speakerTagId => {
                const tag = tagsById.get(speakerTagId);
                return tag ? hasPendingSpeakerSuggestion(byTagId.get(speakerTagId) ?? NONE, tag) : false;
            },
        };
    }, [options.editable, byTagId, speakerTags]);

    return <SpeakerIdentificationsContext.Provider value={value}>{children}</SpeakerIdentificationsContext.Provider>;
}

export function useSpeakerIdentifications() {
    return useContext(SpeakerIdentificationsContext);
}
