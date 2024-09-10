"use client"
import React, { createContext, useContext, ReactNode, useMemo, useState } from 'react';
import { CouncilMeeting, City, Person, Party, SpeakerTag, Utterance, Word, TaskStatus } from '@prisma/client';
import { updateSpeakerTag } from '@/lib/db/speakerTags';
import { Transcript } from '@/lib/db/transcript';

export interface CouncilMeetingData {
    meeting: CouncilMeeting & {
        taskStatuses: TaskStatus[],
    };
    city: City;
    people: Person[];
    parties: Party[];
    speakerTags: SpeakerTag[];
    transcript: Transcript;

    getPerson: (id: string) => Person | undefined;
    getParty: (id: string) => Party | undefined;
    getSpeakerTag: (id: string) => SpeakerTag | undefined;
    updateSpeakerTagPerson: (tagId: string, personId: string | null) => void;
    updateSpeakerTagLabel: (tagId: string, label: string) => void;
}

const CouncilMeetingDataContext = createContext<CouncilMeetingData | undefined>(undefined);

export function CouncilMeetingDataProvider({ children, data }: {
    children: ReactNode,
    data: {
        meeting: CouncilMeeting & {
            taskStatuses: TaskStatus[],
        };
        city: City;
        people: Person[];
        parties: Party[];
        speakerTags: SpeakerTag[];
        transcript: Transcript;
    }
}) {
    const peopleMap = useMemo(() => new Map(data.people.map(person => [person.id, person])), [data.people]);
    const partiesMap = useMemo(() => new Map(data.parties.map(party => [party.id, party])), [data.parties]);
    const [speakerTags, setSpeakerTags] = useState(data.speakerTags);
    const speakerTagsMap = useMemo(() => new Map(speakerTags.map(tag => [tag.id, tag])), [speakerTags]);

    const contextValue = useMemo(() => ({
        ...data,
        speakerTags,
        getPerson: (id: string) => peopleMap.get(id),
        getParty: (id: string) => partiesMap.get(id),
        getSpeakerTag: (id: string) => speakerTagsMap.get(id),
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
    }), [data, peopleMap, partiesMap, speakerTags, speakerTagsMap]);

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
