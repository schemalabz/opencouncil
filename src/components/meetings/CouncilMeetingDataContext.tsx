"use client"
import React, { createContext, useContext, ReactNode, useMemo, useState } from 'react';
import { Person, Party, SpeakerTag } from '@prisma/client';
import { updateSpeakerTag } from '@/lib/db/speakerTags';
import { getTranscript, LightTranscript, Transcript } from '@/lib/db/transcript';
import { MeetingData } from '@/lib/getMeetingData';
import { HighlightWithUtterances } from '@/lib/db/highlights';

export interface CouncilMeetingDataContext extends MeetingData {
    getFullTranscript: () => Promise<Transcript>;
    getPerson: (id: string) => Person | undefined;
    getParty: (id: string) => Party | undefined;
    getSpeakerTag: (id: string) => SpeakerTag | undefined;
    getSpeakerSegmentById: (id: string) => Transcript[number] | undefined;
    updateSpeakerTagPerson: (tagId: string, personId: string | null) => void;
    updateSpeakerTagLabel: (tagId: string, label: string) => void;
    selectedHighlight: HighlightWithUtterances | null;
    setSelectedHighlight: (highlight: HighlightWithUtterances | null) => void;
}

const CouncilMeetingDataContext = createContext<CouncilMeetingDataContext | undefined>(undefined);

export function CouncilMeetingDataProvider({ children, data }: {
    children: ReactNode,
    data: MeetingData
}) {
    const peopleMap = useMemo(() => new Map(data.people.map(person => [person.id, person])), [data.people]);
    const partiesMap = useMemo(() => new Map(data.parties.map(party => [party.id, party])), [data.parties]);
    const [speakerTags, setSpeakerTags] = useState(data.speakerTags);
    const [selectedHighlight, setSelectedHighlight] = useState<HighlightWithUtterances | null>(null);
    const speakerTagsMap = useMemo(() => new Map(speakerTags.map(tag => [tag.id, tag])), [speakerTags]);
    const speakerSegmentsMap = useMemo(() => new Map(data.transcript.map(segment => [segment.id, segment])), [data.transcript]);

    const contextValue = useMemo(() => ({
        ...data,
        speakerTags,
        selectedHighlight,
        setSelectedHighlight,
        getPerson: (id: string) => peopleMap.get(id),
        getParty: (id: string) => partiesMap.get(id),
        getSpeakerTag: (id: string) => speakerTagsMap.get(id),
        getSpeakerSegmentById: (id: string) => speakerSegmentsMap.get(id),
        getFullTranscript: async () => {
            return await getTranscript(data.meeting.id, data.meeting.cityId);
        },
        updateSpeakerTagPerson: async (tagId: string, personId: string | null) => {
            console.log(`Updating speaker tag ${tagId} to person ${personId}`);
            await updateSpeakerTag(tagId, { personId });
            setSpeakerTags(prevTags =>
                prevTags.map(tag =>
                    tag.id === tagId ? { ...tag, personId } : tag
                )
            );
        },
        updateSpeakerTagLabel: async (tagId: string, label: string) => {
            console.log(`Updating speaker tag ${tagId} label to ${label}`);
            await updateSpeakerTag(tagId, { label });
            setSpeakerTags(prevTags =>
                prevTags.map(tag =>
                    tag.id === tagId ? { ...tag, label } : tag
                )
            );
        },
    }), [data, peopleMap, partiesMap, speakerTags, speakerTagsMap, speakerSegmentsMap, selectedHighlight]);

    return (
        <CouncilMeetingDataContext.Provider value={contextValue}>
            {children}
        </CouncilMeetingDataContext.Provider>
    );
}

export function useCouncilMeetingData() {
    const context = useContext(CouncilMeetingDataContext);
    if (context === undefined) {
        throw new Error('useCouncilMeetingData must be used within a CouncilMeetingDataProvider');
    }
    return context;
}
