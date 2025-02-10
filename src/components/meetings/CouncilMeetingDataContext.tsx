"use client"
import React, { createContext, useContext, ReactNode, useMemo, useState } from 'react';
import { Person, Party, SpeakerTag } from '@prisma/client';
import { updateSpeakerTag } from '@/lib/db/speakerTags';
import { createEmptySpeakerSegmentAfter, moveUtterancesToPreviousSegment, moveUtterancesToNextSegment, deleteEmptySpeakerSegment } from '@/lib/db/speakerSegments';
import { getTranscript, LightTranscript, Transcript } from '@/lib/db/transcript';
import { MeetingData, PersonWithRelations } from '@/lib/getMeetingData';
import { HighlightWithUtterances } from '@/lib/db/highlights';

export interface CouncilMeetingDataContext extends MeetingData {
    getPerson: (id: string) => PersonWithRelations | undefined;
    getParty: (id: string) => Party | undefined;
    getSpeakerTag: (id: string) => SpeakerTag | undefined;
    getSpeakerSegmentCount: (tagId: string) => number;
    getSpeakerSegmentById: (id: string) => Transcript[number] | undefined;
    updateSpeakerTagPerson: (tagId: string, personId: string | null) => void;
    updateSpeakerTagLabel: (tagId: string, label: string) => void;
    selectedHighlight: HighlightWithUtterances | null;
    setSelectedHighlight: (highlight: HighlightWithUtterances | null) => void;
    createEmptySegmentAfter: (afterSegmentId: string) => Promise<void>;
    moveUtterancesToPrevious: (utteranceId: string, currentSegmentId: string) => Promise<void>;
    moveUtterancesToNext: (utteranceId: string, currentSegmentId: string) => Promise<void>;
    deleteEmptySegment: (segmentId: string) => Promise<void>;
    getPersonsForParty: (partyId: string) => PersonWithRelations[];
}

const CouncilMeetingDataContext = createContext<CouncilMeetingDataContext | undefined>(undefined);

export function CouncilMeetingDataProvider({ children, data }: {
    children: ReactNode,
    data: MeetingData
}) {
    const peopleMap = useMemo(() => new Map(data.people.map(person => [person.id, person])), [data.people]);
    const partiesMap = useMemo(() => new Map(data.parties.map(party => [party.id, party])), [data.parties]);
    const [speakerTags, setSpeakerTags] = useState(data.speakerTags);
    const [transcript, setTranscript] = useState(data.transcript);
    const [selectedHighlight, setSelectedHighlight] = useState<HighlightWithUtterances | null>(null);
    const speakerTagsMap = useMemo(() => new Map(speakerTags.map(tag => [tag.id, tag])), [speakerTags]);
    const speakerSegmentsMap = useMemo(() => new Map(transcript.map(segment => [segment.id, segment])), [transcript]);

    // Create a map of speaker tag IDs to their segment counts
    const speakerTagSegmentCounts = useMemo(() => {
        const counts = new Map<string, number>();
        transcript.forEach(segment => {
            const count = counts.get(segment.speakerTag.id) || 0;
            counts.set(segment.speakerTag.id, count + 1);
        });
        return counts;
    }, [transcript]);

    const contextValue = useMemo(() => ({
        ...data,
        transcript,
        speakerTags,
        selectedHighlight,
        setSelectedHighlight,
        getPerson: (id: string) => peopleMap.get(id),
        getParty: (id: string) => partiesMap.get(id),
        getSpeakerTag: (id: string) => speakerTagsMap.get(id),
        getSpeakerSegmentCount: (tagId: string) => speakerTagSegmentCounts.get(tagId) || 0,
        getSpeakerSegmentById: (id: string) => speakerSegmentsMap.get(id),
        getPersonsForParty: (partyId: string) => data.people.filter(person => person.partyId === partyId),
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
        createEmptySegmentAfter: async (afterSegmentId: string) => {
            const newSegment = await createEmptySpeakerSegmentAfter(
                afterSegmentId,
                data.meeting.cityId,
                data.meeting.id
            );

            // Find the index of the segment we're inserting after
            const segmentIndex = transcript.findIndex(s => s.id === afterSegmentId);
            if (segmentIndex === -1) return;

            // Insert the new segment after it
            setTranscript(prev => [
                ...prev.slice(0, segmentIndex + 1),
                newSegment,
                ...prev.slice(segmentIndex + 1)
            ]);

            // Add the new speaker tag to our state
            setSpeakerTags(prev => [...prev, newSegment.speakerTag]);
        },
        moveUtterancesToPrevious: async (utteranceId: string, currentSegmentId: string) => {
            const result = await moveUtterancesToPreviousSegment(utteranceId, currentSegmentId);

            if (!result.previousSegment || !result.currentSegment) return;

            // Update the transcript state with the modified segments
            setTranscript(prev => {
                const updated = [...prev];
                const prevIndex = updated.findIndex(s => s.id === result.previousSegment?.id);
                const currIndex = updated.findIndex(s => s.id === result.currentSegment?.id);

                // Only update if we found both segments and they're not null
                if (prevIndex !== -1 && currIndex !== -1 && result.previousSegment && result.currentSegment) {
                    updated[prevIndex] = {
                        ...updated[prevIndex],
                        ...result.previousSegment,
                        utterances: result.previousSegment.utterances || []
                    };
                    updated[currIndex] = {
                        ...updated[currIndex],
                        ...result.currentSegment,
                        utterances: result.currentSegment.utterances || []
                    };
                }
                return updated;
            });
        },
        moveUtterancesToNext: async (utteranceId: string, currentSegmentId: string) => {
            const result = await moveUtterancesToNextSegment(utteranceId, currentSegmentId);

            if (!result.currentSegment || !result.nextSegment) return;

            // Update the transcript state with the modified segments
            setTranscript(prev => {
                const updated = [...prev];
                const currIndex = updated.findIndex(s => s.id === result.currentSegment?.id);
                const nextIndex = updated.findIndex(s => s.id === result.nextSegment?.id);

                // Only update if we found both segments and they're not null
                if (currIndex !== -1 && nextIndex !== -1 && result.currentSegment && result.nextSegment) {
                    updated[currIndex] = {
                        ...updated[currIndex],
                        ...result.currentSegment,
                        utterances: result.currentSegment.utterances || []
                    };
                    updated[nextIndex] = {
                        ...updated[nextIndex],
                        ...result.nextSegment,
                        utterances: result.nextSegment.utterances || []
                    };
                }
                return updated;
            });
        },
        deleteEmptySegment: async (segmentId: string) => {
            await deleteEmptySpeakerSegment(segmentId, data.meeting.cityId);

            // Remove the segment from the transcript
            setTranscript(prev => prev.filter(s => s.id !== segmentId));

            // Remove the associated speaker tag
            const segment = speakerSegmentsMap.get(segmentId);
            if (segment) {
                setSpeakerTags(prev => prev.filter(t => t.id !== segment.speakerTagId));
            }
        }
    }), [data, peopleMap, partiesMap, speakerTags, speakerTagsMap, speakerSegmentsMap, selectedHighlight, transcript, speakerTagSegmentCounts]);

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
