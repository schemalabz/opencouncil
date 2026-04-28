"use client"
import React, { createContext, useContext, ReactNode, useMemo, useState, useCallback, useRef } from 'react';
import { Party, SpeakerTag, LastModifiedBy } from '@prisma/client';
import { updateSpeakerTag } from '@/lib/db/speakerTags';
import { createEmptySpeakerSegmentAfter, createEmptySpeakerSegmentBefore, moveUtterancesToPreviousSegment, moveUtterancesToNextSegment, deleteEmptySpeakerSegment, updateSpeakerSegmentData, EditableSpeakerSegmentData, extractSpeakerSegment, addUtteranceToSegment } from '@/lib/db/speakerSegments';
import { deleteUtterance } from '@/lib/db/utterance';
import { Transcript } from '@/lib/db/transcript';
import { MeetingData } from '@/lib/getMeetingData';
import { PersonWithRelations } from '@/lib/db/people';
import { getPartyFromRoles } from "@/lib/utils";
import type { HighlightWithUtterances } from '@/lib/db/highlights';

// ============================================================
// Transcript Context — volatile, changes on every utterance edit
// ============================================================

interface CouncilMeetingTranscriptContextType {
    transcript: Transcript;
    getSpeakerSegmentById: (id: string) => Transcript[number] | undefined;
}

const CouncilMeetingTranscriptContext = createContext<CouncilMeetingTranscriptContextType | undefined>(undefined);

export function useCouncilMeetingTranscript() {
    const context = useContext(CouncilMeetingTranscriptContext);
    if (context === undefined) {
        throw new Error('useCouncilMeetingTranscript must be used within a CouncilMeetingDataProvider');
    }
    return context;
}

// ============================================================
// Main Data Context — stable during normal utterance editing
// ============================================================

export interface CouncilMeetingDataContext extends MeetingData {
    // Mutable state (changes rarely — not on every utterance edit)
    speakerTags: SpeakerTag[];
    highlights: HighlightWithUtterances[];

    // Lookup functions
    getPerson: (id: string) => PersonWithRelations | undefined;
    getParty: (id: string) => Party | undefined;
    getSpeakerTag: (id: string) => SpeakerTag | undefined;
    getPersonsForParty: (partyId: string) => PersonWithRelations[];
    getHighlight: (highlightId: string) => HighlightWithUtterances | undefined;

    // Mutation functions
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
    // === DERIVED MAPS (stable unless their source state changes) ===
    const peopleMap = useMemo(() => new Map(data.people.map(person => [person.id, person])), [data.people]);
    const partiesMap = useMemo(() => new Map(data.parties.map(party => [party.id, party])), [data.parties]);

    // === MUTABLE STATE ===
    const [speakerTags, setSpeakerTags] = useState(data.speakerTags);
    const [transcript, setTranscript] = useState(data.transcript);
    const [highlights, setHighlights] = useState(data.highlights);

    // === DERIVED MAPS FROM MUTABLE STATE ===
    const speakerTagsMap = useMemo(() => new Map(speakerTags.map(tag => [tag.id, tag])), [speakerTags]);
    const highlightsMap = useMemo(() => new Map(highlights.map(h => [h.id, h])), [highlights]);

    // === HELPERS ===
    const recalculateSegmentTimestamps = useCallback((utterances: Array<{ startTimestamp: number; endTimestamp: number }>) => {
        if (utterances.length === 0) return null;
        const allTimestamps = utterances.flatMap(u => [u.startTimestamp, u.endTimestamp]);
        return {
            startTimestamp: Math.min(...allTimestamps),
            endTimestamp: Math.max(...allTimestamps)
        };
    }, []);

    // === HIGHLIGHT MUTATIONS (stable) ===
    const addHighlight = useCallback((highlight: HighlightWithUtterances) => {
        setHighlights(prev => [highlight, ...prev]);
    }, []);

    const updateHighlightFn = useCallback((highlightId: string, updates: Partial<HighlightWithUtterances>) => {
        setHighlights(prev => {
            const highlightIndex = prev.findIndex(h => h.id === highlightId);
            if (highlightIndex === -1) return prev;
            const updatedHighlight = { ...prev[highlightIndex], ...updates };
            const newHighlights = prev.filter(h => h.id !== highlightId);
            return [updatedHighlight, ...newHighlights];
        });
    }, []);

    const removeHighlight = useCallback((highlightId: string) => {
        setHighlights(prev => prev.filter(h => h.id !== highlightId));
    }, []);

    // === SPEAKER TAG MUTATIONS (stable) ===
    const updateSpeakerTagPersonFn = useCallback(async (tagId: string, personId: string | null) => {
        await updateSpeakerTag(tagId, { personId });
        setSpeakerTags(prevTags =>
            prevTags.map(tag =>
                tag.id === tagId ? { ...tag, personId } : tag
            )
        );
    }, []);

    const updateSpeakerTagLabelFn = useCallback(async (tagId: string, label: string) => {
        await updateSpeakerTag(tagId, { label });
        setSpeakerTags(prevTags =>
            prevTags.map(tag =>
                tag.id === tagId ? { ...tag, label } : tag
            )
        );
    }, []);

    // === TRANSCRIPT MUTATIONS (stable — all use setTranscript(prev => ...)) ===
    const createEmptySegmentAfterFn = useCallback(async (afterSegmentId: string) => {
        const newSegment = await createEmptySpeakerSegmentAfter(
            afterSegmentId,
            data.meeting.cityId,
            data.meeting.id
        );
        setTranscript(prev => {
            const segmentIndex = prev.findIndex(s => s.id === afterSegmentId);
            if (segmentIndex === -1) return prev;
            return [
                ...prev.slice(0, segmentIndex + 1),
                newSegment,
                ...prev.slice(segmentIndex + 1)
            ];
        });
        setSpeakerTags(prev => [...prev, newSegment.speakerTag]);
    }, [data.meeting.cityId, data.meeting.id]);

    const createEmptySegmentBeforeFn = useCallback(async (beforeSegmentId: string) => {
        const newSegment = await createEmptySpeakerSegmentBefore(
            beforeSegmentId,
            data.meeting.cityId,
            data.meeting.id
        );
        setTranscript(prev => {
            const segmentIndex = prev.findIndex(s => s.id === beforeSegmentId);
            if (segmentIndex === -1) return prev;
            return [
                ...prev.slice(0, segmentIndex),
                newSegment,
                ...prev.slice(segmentIndex)
            ];
        });
        setSpeakerTags(prev => [...prev, newSegment.speakerTag]);
    }, [data.meeting.cityId, data.meeting.id]);

    const moveUtterancesToPreviousFn = useCallback(async (utteranceId: string, currentSegmentId: string) => {
        const result = await moveUtterancesToPreviousSegment(utteranceId, currentSegmentId);
        if (!result.previousSegment || !result.currentSegment) return;
        setTranscript(prev => {
            const updated = [...prev];
            const prevIndex = updated.findIndex(s => s.id === result.previousSegment?.id);
            const currIndex = updated.findIndex(s => s.id === result.currentSegment?.id);
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
    }, []);

    const moveUtterancesToNextFn = useCallback(async (utteranceId: string, currentSegmentId: string) => {
        const result = await moveUtterancesToNextSegment(utteranceId, currentSegmentId);
        if (!result.currentSegment || !result.nextSegment) return;
        setTranscript(prev => {
            const updated = [...prev];
            const currIndex = updated.findIndex(s => s.id === result.currentSegment?.id);
            const nextIndex = updated.findIndex(s => s.id === result.nextSegment?.id);
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
    }, []);

    const deleteEmptySegmentFn = useCallback(async (segmentId: string) => {
        await deleteEmptySpeakerSegment(segmentId, data.meeting.cityId);
        // Read from prev inside functional updater instead of speakerSegmentsMap
        setTranscript(prev => {
            const segment = prev.find(s => s.id === segmentId);
            const deletedSpeakerTagId = segment?.speakerTagId;
            const updated = prev.filter(s => s.id !== segmentId);
            if (deletedSpeakerTagId) {
                const isTagStillInUse = updated.some(s => s.speakerTagId === deletedSpeakerTagId);
                if (!isTagStillInUse) {
                    setSpeakerTags(prevTags => prevTags.filter(t => t.id !== deletedSpeakerTagId));
                }
            }
            return updated;
        });
    }, [data.meeting.cityId]);

    const updateSpeakerSegmentDataFn = useCallback(async (segmentId: string, editData: EditableSpeakerSegmentData) => {
        const updatedSegment = await updateSpeakerSegmentData(segmentId, editData, data.meeting.cityId);
        setTranscript(prev => prev.map(segment =>
            segment.id === segmentId ? updatedSegment : segment
        ));
    }, [data.meeting.cityId]);

    const addUtteranceToSegmentFn = useCallback(async (segmentId: string) => {
        const updatedSegment = await addUtteranceToSegment(segmentId, data.meeting.cityId);
        setTranscript(prev => prev.map(segment =>
            segment.id === segmentId ? updatedSegment : segment
        ));
        const newUtterance = updatedSegment.utterances[updatedSegment.utterances.length - 1];
        return newUtterance?.id || '';
    }, [data.meeting.cityId]);

    const extractSpeakerSegmentFn = useCallback(async (segmentId: string, startUtteranceId: string, endUtteranceId: string) => {
        const newSegments = await extractSpeakerSegment(data.meeting.cityId, data.meeting.id, segmentId, startUtteranceId, endUtteranceId);
        setTranscript(prev => {
            const originalIndex = prev.findIndex(s => s.id === segmentId);
            if (originalIndex === -1) return prev;
            const updatedTranscript = [...prev];
            updatedTranscript.splice(originalIndex, 1, ...newSegments);
            return updatedTranscript;
        });
        const newTags = newSegments.map(s => s.speakerTag);
        setSpeakerTags(prev => {
            const prevIds = new Set(prev.map(t => t.id));
            const tagsToAdd = newTags.filter(t => !prevIds.has(t.id));
            return [...prev, ...tagsToAdd];
        });
    }, [data.meeting.cityId, data.meeting.id]);

    const deleteUtteranceFn = useCallback(async (utteranceId: string) => {
        const { segmentId, remainingUtterances } = await deleteUtterance(utteranceId);
        setTranscript(prev => prev.map(segment => {
            if (segment.id === segmentId) {
                const updatedUtterances = segment.utterances.filter(u => u.id !== utteranceId);
                if (remainingUtterances === 0) {
                    return { ...segment, utterances: [] };
                }
                const newTimestamps = recalculateSegmentTimestamps(updatedUtterances);
                return { ...segment, utterances: updatedUtterances, ...newTimestamps };
            }
            return segment;
        }));
    }, [recalculateSegmentTimestamps]);

    const updateUtteranceFn = useCallback((segmentId: string, utteranceId: string, updates: Partial<{ text: string; startTimestamp: number; endTimestamp: number; lastModifiedBy: LastModifiedBy | null }>) => {
        setTranscript(prev => prev.map(segment => {
            if (segment.id === segmentId) {
                const updatedUtterances = segment.utterances.map(u =>
                    u.id === utteranceId ? { ...u, ...updates } : u
                );
                const timestampsChanged = 'startTimestamp' in updates || 'endTimestamp' in updates;
                if (timestampsChanged) {
                    const newTimestamps = recalculateSegmentTimestamps(updatedUtterances);
                    return { ...segment, utterances: updatedUtterances, ...newTimestamps };
                }
                return { ...segment, utterances: updatedUtterances };
            }
            return segment;
        }));
    }, [recalculateSegmentTimestamps]);

    // === TRANSCRIPT CONTEXT VALUE (volatile — changes on every edit) ===
    const speakerSegmentsMap = useMemo(() => new Map(transcript.map(segment => [segment.id, segment])), [transcript]);
    const transcriptValue = useMemo(() => ({
        transcript,
        getSpeakerSegmentById: (id: string) => speakerSegmentsMap.get(id),
    }), [transcript, speakerSegmentsMap]);

    // === MAIN CONTEXT VALUE (stable during normal utterance editing) ===
    // Deps: data, maps derived from speakerTags/highlights (rarely change), stable callbacks.
    // Does NOT depend on transcript — that's the key to preventing the cascade.
    const contextValue = useMemo(() => ({
        ...data,
        speakerTags,
        highlights,
        getPerson: (id: string) => peopleMap.get(id),
        getParty: (id: string) => partiesMap.get(id),
        getSpeakerTag: (id: string) => speakerTagsMap.get(id),
        getPersonsForParty: (partyId: string) => data.people.filter(person => {
            const party = getPartyFromRoles(person.roles);
            return party?.id === partyId;
        }),
        getHighlight: (highlightId: string) => highlightsMap.get(highlightId),
        updateSpeakerTagPerson: updateSpeakerTagPersonFn,
        updateSpeakerTagLabel: updateSpeakerTagLabelFn,
        createEmptySegmentAfter: createEmptySegmentAfterFn,
        createEmptySegmentBefore: createEmptySegmentBeforeFn,
        moveUtterancesToPrevious: moveUtterancesToPreviousFn,
        moveUtterancesToNext: moveUtterancesToNextFn,
        deleteEmptySegment: deleteEmptySegmentFn,
        updateSpeakerSegmentData: updateSpeakerSegmentDataFn,
        addUtteranceToSegment: addUtteranceToSegmentFn,
        deleteUtterance: deleteUtteranceFn,
        updateUtterance: updateUtteranceFn,
        addHighlight,
        updateHighlight: updateHighlightFn,
        removeHighlight,
        extractSpeakerSegment: extractSpeakerSegmentFn,
    }), [
        data, peopleMap, partiesMap,
        speakerTags, speakerTagsMap,
        highlights, highlightsMap,
        // Stable callbacks (don't add volatility):
        updateSpeakerTagPersonFn, updateSpeakerTagLabelFn,
        createEmptySegmentAfterFn, createEmptySegmentBeforeFn,
        moveUtterancesToPreviousFn, moveUtterancesToNextFn,
        deleteEmptySegmentFn, updateSpeakerSegmentDataFn,
        addUtteranceToSegmentFn, extractSpeakerSegmentFn,
        deleteUtteranceFn, updateUtteranceFn,
        addHighlight, updateHighlightFn, removeHighlight,
    ]);

    return (
        <CouncilMeetingDataContext.Provider value={contextValue}>
            <CouncilMeetingTranscriptContext.Provider value={transcriptValue}>
                {children}
            </CouncilMeetingTranscriptContext.Provider>
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
