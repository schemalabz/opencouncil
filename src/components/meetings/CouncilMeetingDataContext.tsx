"use client"
import React, { createContext, useContext, ReactNode, useMemo, useState } from 'react';
import { CouncilMeeting, City, Person, Party, SpeakerTag, Utterance, Word, TaskStatus } from '@prisma/client';

export interface CouncilMeetingData {
    meeting: CouncilMeeting & {
        taskStatuses: TaskStatus[],
    };
    city: City;
    people: Person[];
    parties: Party[];
    speakerTags: SpeakerTag[];

    getPerson: (id: string) => Person | undefined;
    getParty: (id: string) => Party | undefined;
    getSpeakerTag: (id: string) => SpeakerTag | undefined;
    updateSpeakerTagPerson: (tagId: string, personId: string | null) => void;
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
        updateSpeakerTagPerson: (tagId: string, personId: string | null) => {
            setSpeakerTags(prevTags =>
                prevTags.map(tag =>
                    tag.id === tagId ? { ...tag, personId } : tag
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
