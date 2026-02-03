"use client"
import React, { createContext, useContext, ReactNode, useMemo, useState, useCallback } from 'react';
import { Party, SpeakerTag, LastModifiedBy } from '@prisma/client';
import { updateSpeakerTag } from '@/lib/db/speakerTags';
import { createEmptySpeakerSegmentAfter, createEmptySpeakerSegmentBefore, moveUtterancesToPreviousSegment, moveUtterancesToNextSegment, deleteEmptySpeakerSegment, updateSpeakerSegmentData, EditableSpeakerSegmentData, extractSpeakerSegment, addUtteranceToSegment } from '@/lib/db/speakerSegments';
import { deleteUtterance } from '@/lib/db/utterance';
import { Transcript } from '@/lib/db/transcript';
import { MeetingData } from '@/lib/getMeetingData';
import { PersonWithRelations } from '@/lib/db/people';
import { getPartyFromRoles } from "@/lib/utils";
import type { HighlightWithUtterances } from '@/lib/db/highlights';

export interface CouncilMeetingDataContext extends MeetingData {
    getPerson: (id: string) => PersonWithRelations | undefined;
    getParty: (id: string) => Party | undefined;
    getSpeakerTag: (id: string) => SpeakerTag | undefined;
    getSpeakerSegmentCount: (tagId: string) => number;
    getSpeakerSegmentById: (id: string) => Transcript[number] | undefined;
    updateSpeakerTagPerson: (tagId: string, personId: string | null) => void;
    updateSpeakerTagLabel: (tagId: string, label: string) => void;
    createEmptySegmentAfter: (afterSegmentId: string) => Promise<void>;
    createEmptySegmentBefore: (beforeSegmentId: string) => Promise<void>;
    moveUtterancesToPrevious: (utteranceId: string, currentSegmentId: string) => Promise<void>;
    moveUtterancesToNext: (utteranceId: string, currentSegmentId: string) => Promise<void>;
    deleteEmptySegment: (segmentId: string) => Promise<void>;
    updateSpeakerSegmentData: (segmentId: string, data: EditableSpeakerSegmentData) => Promise<void>;
    addUtteranceToSegment: (segmentId: string) => Promise<string>;
    deleteUtterance: (utteranceId: string) => Promise<void>;
    updateUtterance: (segmentId: string, utteranceId: string, updates: Partial<{ text: string; startTimestamp: number; endTimestamp: number; lastModifiedBy: LastModifiedBy | null }>) => void;
    getPersonsForParty: (partyId: string) => PersonWithRelations[];
    getHighlight: (highlightId: string) => HighlightWithUtterances | undefined;
    addHighlight: (highlight: HighlightWithUtterances) => void;
    updateHighlight: (highlightId: string, updates: Partial<HighlightWithUtterances>) => void;
    removeHighlight: (highlightId: string) => void;
    extractSpeakerSegment: (segmentId: string, startUtteranceId: string, endUtteranceId: string) => Promise<void>;
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
    const [highlights, setHighlights] = useState(data.highlights);
    const speakerTagsMap = useMemo(() => new Map(speakerTags.map(tag => [tag.id, tag])), [speakerTags]);
    const speakerSegmentsMap = useMemo(() => new Map(transcript.map(segment => [segment.id, segment])), [transcript]);
    const highlightsMap = useMemo(() => new Map(highlights.map(h => [h.id, h])), [highlights]);

    // Helper function to recalculate segment timestamps based on utterances
    const recalculateSegmentTimestamps = useCallback((utterances: Array<{ startTimestamp: number; endTimestamp: number }>) => {
        if (utterances.length === 0) return null;
        const allTimestamps = utterances.flatMap(u => [u.startTimestamp, u.endTimestamp]);
        return {
            startTimestamp: Math.min(...allTimestamps),
            endTimestamp: Math.max(...allTimestamps)
        };
    }, []);

    // Create a map of speaker tag IDs to their segment counts
    const speakerTagSegmentCounts = useMemo(() => {
        const counts = new Map<string, number>();
        transcript.forEach(segment => {
            const count = counts.get(segment.speakerTag.id) || 0;
            counts.set(segment.speakerTag.id, count + 1);
        });
        return counts;
    }, [transcript]);

    // Highlight management methods
    const addHighlight = useCallback((highlight: HighlightWithUtterances) => {
        setHighlights(prev => [highlight, ...prev]);
    }, []);

    const updateHighlight = useCallback((highlightId: string, updates: Partial<HighlightWithUtterances>) => {
        setHighlights(prev => {
            const highlightIndex = prev.findIndex(h => h.id === highlightId);
            if (highlightIndex === -1) return prev;
            
            // Remove the highlight from its current position
            const updatedHighlight = { ...prev[highlightIndex], ...updates };
            const newHighlights = prev.filter(h => h.id !== highlightId);
            
            // Add it to the start of the list
            return [updatedHighlight, ...newHighlights];
        });
    }, []);

    const removeHighlight = useCallback((highlightId: string) => {
        setHighlights(prev => prev.filter(h => h.id !== highlightId));
    }, []);

    const getHighlight = useCallback((highlightId: string) => {
        return highlightsMap.get(highlightId);
    }, [highlightsMap]);

    const contextValue = useMemo(() => ({
        ...data,
        transcript,
        speakerTags,
        highlights,
        getPerson: (id: string) => peopleMap.get(id),
        getParty: (id: string) => partiesMap.get(id),
        getSpeakerTag: (id: string) => speakerTagsMap.get(id),
        getSpeakerSegmentCount: (tagId: string) => speakerTagSegmentCounts.get(tagId) || 0,
        getSpeakerSegmentById: (id: string) => speakerSegmentsMap.get(id),
        getPersonsForParty: (partyId: string) => data.people.filter(person => {
            const party = getPartyFromRoles(person.roles);
            return party?.id === partyId;
        }),
        getHighlight,
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

            // Insert the new segment after it
            setTranscript(prev => {
                // Find the index of the segment we're inserting after using fresh state
                const segmentIndex = prev.findIndex(s => s.id === afterSegmentId);
                if (segmentIndex === -1) return prev;
                
                return [
                    ...prev.slice(0, segmentIndex + 1),
                    newSegment,
                    ...prev.slice(segmentIndex + 1)
                ];
            });

            // Add the new speaker tag to our state
            setSpeakerTags(prev => [...prev, newSegment.speakerTag]);
        },
        createEmptySegmentBefore: async (beforeSegmentId: string) => {
            const newSegment = await createEmptySpeakerSegmentBefore(
                beforeSegmentId,
                data.meeting.cityId,
                data.meeting.id
            );

            // Insert the new segment before it
            setTranscript(prev => {
                // Find the index of the segment we're inserting before using fresh state
                const segmentIndex = prev.findIndex(s => s.id === beforeSegmentId);
                if (segmentIndex === -1) return prev;
                
                return [
                    ...prev.slice(0, segmentIndex),
                    newSegment,
                    ...prev.slice(segmentIndex)
                ];
            });

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

            const segment = speakerSegmentsMap.get(segmentId);
            const deletedSpeakerTagId = segment?.speakerTagId;

            // Remove the segment from the transcript
            setTranscript(prev => {
                const updated = prev.filter(s => s.id !== segmentId);
                
                // Only remove the speaker tag if no other segments are using it
                if (deletedSpeakerTagId) {
                    const isTagStillInUse = updated.some(s => s.speakerTagId === deletedSpeakerTagId);
                    if (!isTagStillInUse) {
                        setSpeakerTags(prevTags => prevTags.filter(t => t.id !== deletedSpeakerTagId));
                    }
                }
                
                return updated;
            });
        },
        addHighlight,
        updateHighlight,
        removeHighlight,
        updateSpeakerSegmentData: async (segmentId: string, editData: EditableSpeakerSegmentData) => {
            console.log(`Updating speaker segment ${segmentId} data`);
            const updatedSegment = await updateSpeakerSegmentData(segmentId, editData, data.meeting.cityId);
            
            // Update transcript state with the fully updated segment data
            setTranscript(prev => prev.map(segment =>
                segment.id === segmentId ? updatedSegment : segment
            ));
        },
        addUtteranceToSegment: async (segmentId: string) => {
            console.log(`Adding utterance to segment ${segmentId}`);
            const updatedSegment = await addUtteranceToSegment(segmentId, data.meeting.cityId);
            
            // Update transcript state with the fully updated segment data
            setTranscript(prev => prev.map(segment =>
                segment.id === segmentId ? updatedSegment : segment
            ));
            
            // Return the ID of the newly created utterance (last one in the updated segment)
            const newUtterance = updatedSegment.utterances[updatedSegment.utterances.length - 1];
            return newUtterance?.id || '';
        },
        extractSpeakerSegment: async (segmentId: string, startUtteranceId: string, endUtteranceId: string) => {
            const newSegments = await extractSpeakerSegment(data.meeting.cityId, data.meeting.id, segmentId, startUtteranceId, endUtteranceId);
            
            // Replace the original segment with the new segments (Before, Middle, After)
            setTranscript(prev => {
                const originalIndex = prev.findIndex(s => s.id === segmentId);
                if (originalIndex === -1) return prev;

                const updatedTranscript = [...prev];
                updatedTranscript.splice(originalIndex, 1, ...newSegments);
                
                return updatedTranscript;
            });
            
            // Add any new speaker tags that were created
            const newTags = newSegments.map(s => s.speakerTag);
            setSpeakerTags(prev => {
                 const prevIds = new Set(prev.map(t => t.id));
                 const tagsToAdd = newTags.filter(t => !prevIds.has(t.id));
                 return [...prev, ...tagsToAdd];
            });
        },
        deleteUtterance: async (utteranceId: string) => {
            console.log(`Deleting utterance ${utteranceId}`);
            const { segmentId, remainingUtterances } = await deleteUtterance(utteranceId);
            
            // Update the segment to remove the utterance
            setTranscript(prev => prev.map(segment => {
                if (segment.id === segmentId) {
                    const updatedUtterances = segment.utterances.filter(u => u.id !== utteranceId);
                    
                    // If no utterances remain, keep the segment but with empty utterances array
                    if (remainingUtterances === 0) {
                        return { ...segment, utterances: [] };
                    }
                    
                    // Otherwise, recalculate timestamps based on remaining utterances
                    const newTimestamps = recalculateSegmentTimestamps(updatedUtterances);
                    return {
                        ...segment,
                        utterances: updatedUtterances,
                        ...newTimestamps
                    };
                }
                return segment;
            }));
        },
        updateUtterance: (segmentId: string, utteranceId: string, updates: Partial<{ text: string; startTimestamp: number; endTimestamp: number; lastModifiedBy: LastModifiedBy | null }>) => {
            setTranscript(prev => prev.map(segment => {
                if (segment.id === segmentId) {
                    // Update the utterance
                    const updatedUtterances = segment.utterances.map(u =>
                        u.id === utteranceId ? { ...u, ...updates } : u
                    );
                    
                    // If timestamps changed, recalculate segment boundaries
                    const timestampsChanged = 'startTimestamp' in updates || 'endTimestamp' in updates;
                    if (timestampsChanged) {
                        const newTimestamps = recalculateSegmentTimestamps(updatedUtterances);
                        return {
                            ...segment,
                            utterances: updatedUtterances,
                            ...newTimestamps
                        };
                    }
                    
                    return {
                        ...segment,
                        utterances: updatedUtterances
                    };
                }
                return segment;
            }));
        }
    }), [data, peopleMap, partiesMap, speakerTags, speakerTagsMap, speakerSegmentsMap, transcript, speakerTagSegmentCounts, highlights, addHighlight, updateHighlight, removeHighlight, getHighlight, recalculateSegmentTimestamps]);

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
