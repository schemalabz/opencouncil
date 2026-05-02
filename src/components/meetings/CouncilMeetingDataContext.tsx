"use client"
import React, { createContext, useContext, ReactNode, useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Party, SpeakerTag, LastModifiedBy } from '@prisma/client';
import { updateSpeakerTag } from '@/lib/db/speakerTags';
import { createEmptySpeakerSegmentAfter, createEmptySpeakerSegmentBefore, moveUtterancesToPreviousSegment, moveUtterancesToNextSegment, deleteEmptySpeakerSegment, updateSpeakerSegmentData, EditableSpeakerSegmentData, extractSpeakerSegment, addUtteranceToSegment } from '@/lib/db/speakerSegments';
import { deleteUtterance } from '@/lib/db/utterance';
import { Transcript } from '@/lib/db/transcript';
import { MeetingData } from '@/lib/getMeetingData';
import { PersonWithRelations } from '@/lib/db/people';
import { getPartyFromRoles } from "@/lib/utils";
import type { HighlightWithUtterances } from '@/lib/db/highlights';

// Actions are mutations + getters that don't depend on transcript identity.
// They are stable references for the lifetime of the provider, so consumers
// that only need to mutate (e.g. Utterance) never re-render on data changes.
export interface CouncilMeetingActions {
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

export interface CouncilMeetingDataContext extends MeetingData, CouncilMeetingActions {
    getPerson: (id: string) => PersonWithRelations | undefined;
    getParty: (id: string) => Party | undefined;
    getSpeakerTag: (id: string) => SpeakerTag | undefined;
    getSpeakerSegmentCount: (tagId: string) => number;
    getSpeakerSegmentById: (id: string) => Transcript[number] | undefined;
    getPersonsForParty: (partyId: string) => PersonWithRelations[];
    getHighlight: (highlightId: string) => HighlightWithUtterances | undefined;
}

const CouncilMeetingDataContext = createContext<CouncilMeetingDataContext | undefined>(undefined);
const CouncilMeetingActionsContext = createContext<CouncilMeetingActions | undefined>(undefined);
// "Meta" context = everything in CouncilMeetingDataContext EXCEPT `transcript`
// and items derived from it. Lets components like SpeakerSegment subscribe to
// speakerTags / highlights / getters / static data WITHOUT re-rendering on
// every transcript edit.
type CouncilMeetingMeta = Omit<CouncilMeetingDataContext, 'transcript'>;
const CouncilMeetingMetaContext = createContext<CouncilMeetingMeta | undefined>(undefined);

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

    // cityId/meetingId are constant for the page, so we capture them in
    // closures rather than reading data.meeting.* (which would force `data`
    // into action callback deps and break their stable identity).
    const cityId = data.meeting.cityId;
    const meetingId = data.meeting.id;

    const recalculateSegmentTimestamps = useCallback((utterances: Array<{ startTimestamp: number; endTimestamp: number }>) => {
        if (utterances.length === 0) return null;
        const allTimestamps = utterances.flatMap(u => [u.startTimestamp, u.endTimestamp]);
        return {
            startTimestamp: Math.min(...allTimestamps),
            endTimestamp: Math.max(...allTimestamps)
        };
    }, []);

    const addHighlight = useCallback((highlight: HighlightWithUtterances) => {
        setHighlights(prev => [highlight, ...prev]);
    }, []);

    const updateHighlight = useCallback((highlightId: string, updates: Partial<HighlightWithUtterances>) => {
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

    const updateSpeakerTagPerson = useCallback(async (tagId: string, personId: string | null) => {
        console.log(`Updating speaker tag ${tagId} to person ${personId}`);
        await updateSpeakerTag(tagId, { personId });
        setSpeakerTags(prevTags =>
            prevTags.map(tag => (tag.id === tagId ? { ...tag, personId } : tag))
        );
    }, []);

    const updateSpeakerTagLabel = useCallback(async (tagId: string, label: string) => {
        console.log(`Updating speaker tag ${tagId} label to ${label}`);
        await updateSpeakerTag(tagId, { label });
        setSpeakerTags(prevTags =>
            prevTags.map(tag => (tag.id === tagId ? { ...tag, label } : tag))
        );
    }, []);

    const createEmptySegmentAfter = useCallback(async (afterSegmentId: string) => {
        const newSegment = await createEmptySpeakerSegmentAfter(afterSegmentId, cityId, meetingId);
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
    }, [cityId, meetingId]);

    const createEmptySegmentBefore = useCallback(async (beforeSegmentId: string) => {
        const newSegment = await createEmptySpeakerSegmentBefore(beforeSegmentId, cityId, meetingId);
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
    }, [cityId, meetingId]);

    const moveUtterancesToPrevious = useCallback(async (utteranceId: string, currentSegmentId: string) => {
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

    const moveUtterancesToNext = useCallback(async (utteranceId: string, currentSegmentId: string) => {
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

    const deleteEmptySegment = useCallback(async (segmentId: string) => {
        await deleteEmptySpeakerSegment(segmentId, cityId);
        setTranscript(prev => prev.filter(s => s.id !== segmentId));
        // Bump speakerTags' identity so SpeakerSegment (subscribed to meta
        // context) re-renders with the updated segment count for any shared
        // tag. The auto-prune effect below drops the tag entirely if the
        // deletion leaves it orphaned — that derivation is robust under
        // batched deletes that a manual ref-check inside the action wouldn't
        // get right.
        setSpeakerTags(prev => [...prev]);
    }, [cityId]);

    const updateSpeakerSegmentDataAction = useCallback(async (segmentId: string, editData: EditableSpeakerSegmentData) => {
        console.log(`Updating speaker segment ${segmentId} data`);
        const updatedSegment = await updateSpeakerSegmentData(segmentId, editData, cityId);
        setTranscript(prev => prev.map(segment =>
            segment.id === segmentId ? updatedSegment : segment
        ));
    }, [cityId]);

    const addUtteranceToSegmentAction = useCallback(async (segmentId: string) => {
        console.log(`Adding utterance to segment ${segmentId}`);
        const updatedSegment = await addUtteranceToSegment(segmentId, cityId);
        setTranscript(prev => prev.map(segment =>
            segment.id === segmentId ? updatedSegment : segment
        ));
        const newUtterance = updatedSegment.utterances[updatedSegment.utterances.length - 1];
        return newUtterance?.id || '';
    }, [cityId]);

    const extractSpeakerSegmentAction = useCallback(async (segmentId: string, startUtteranceId: string, endUtteranceId: string) => {
        const newSegments = await extractSpeakerSegment(cityId, meetingId, segmentId, startUtteranceId, endUtteranceId);
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
    }, [cityId, meetingId]);

    const deleteUtteranceAction = useCallback(async (utteranceId: string) => {
        console.log(`Deleting utterance ${utteranceId}`);
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

    const updateUtterance = useCallback((segmentId: string, utteranceId: string, updates: Partial<{ text: string; startTimestamp: number; endTimestamp: number; lastModifiedBy: LastModifiedBy | null }>) => {
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

    // Stable for the lifetime of the provider — every callback above is
    // wrapped in useCallback with deps that never change.
    const actionsValue = useMemo<CouncilMeetingActions>(() => ({
        updateSpeakerTagPerson,
        updateSpeakerTagLabel,
        createEmptySegmentAfter,
        createEmptySegmentBefore,
        moveUtterancesToPrevious,
        moveUtterancesToNext,
        deleteEmptySegment,
        updateSpeakerSegmentData: updateSpeakerSegmentDataAction,
        addUtteranceToSegment: addUtteranceToSegmentAction,
        deleteUtterance: deleteUtteranceAction,
        updateUtterance,
        addHighlight,
        updateHighlight,
        removeHighlight,
        extractSpeakerSegment: extractSpeakerSegmentAction,
    }), [
        updateSpeakerTagPerson,
        updateSpeakerTagLabel,
        createEmptySegmentAfter,
        createEmptySegmentBefore,
        moveUtterancesToPrevious,
        moveUtterancesToNext,
        deleteEmptySegment,
        updateSpeakerSegmentDataAction,
        addUtteranceToSegmentAction,
        deleteUtteranceAction,
        updateUtterance,
        addHighlight,
        updateHighlight,
        removeHighlight,
        extractSpeakerSegmentAction,
    ]);

    // Speaker tag → segment count. Recomputed only when transcript changes.
    const speakerTagSegmentCounts = useMemo(() => {
        const counts = new Map<string, number>();
        transcript.forEach(segment => {
            const count = counts.get(segment.speakerTag.id) || 0;
            counts.set(segment.speakerTag.id, count + 1);
        });
        return counts;
    }, [transcript]);

    // Auto-prune speakerTags whose segments are gone. Deriving this from the
    // committed transcript is robust under batched deletes (a synchronous
    // ref-check inside `deleteEmptySegment` would race when two segments with
    // the same tag are deleted before React re-renders).
    useEffect(() => {
        setSpeakerTags(prev => {
            const usedTagIds = new Set<string>();
            for (const segment of transcript) usedTagIds.add(segment.speakerTagId);
            const filtered = prev.filter(tag => usedTagIds.has(tag.id));
            return filtered.length === prev.length ? prev : filtered;
        });
    }, [transcript]);

    // Stable-identity getters: read the latest Map via a ref so the function
    // ref itself never changes. Downstream callbacks (calculateHighlightData,
    // extractSelectedSegment, …) list these in their deps; if the getter
    // identity churned on transcript edits, those memoized provider values
    // would invalidate and re-render every Utterance via context.
    const peopleMapRef = useRef(peopleMap);
    const partiesMapRef = useRef(partiesMap);
    const speakerTagsMapRef = useRef(speakerTagsMap);
    const speakerSegmentsMapRef = useRef(speakerSegmentsMap);
    const speakerTagSegmentCountsRef = useRef(speakerTagSegmentCounts);
    const highlightsMapRef = useRef(highlightsMap);
    const peopleRef = useRef(data.people);
    peopleMapRef.current = peopleMap;
    partiesMapRef.current = partiesMap;
    speakerTagsMapRef.current = speakerTagsMap;
    speakerSegmentsMapRef.current = speakerSegmentsMap;
    speakerTagSegmentCountsRef.current = speakerTagSegmentCounts;
    highlightsMapRef.current = highlightsMap;
    peopleRef.current = data.people;

    const getPerson = useCallback((id: string) => peopleMapRef.current.get(id), []);
    const getParty = useCallback((id: string) => partiesMapRef.current.get(id), []);
    const getSpeakerTag = useCallback((id: string) => speakerTagsMapRef.current.get(id), []);
    const getSpeakerSegmentCount = useCallback((tagId: string) => speakerTagSegmentCountsRef.current.get(tagId) || 0, []);
    const getSpeakerSegmentById = useCallback((id: string) => speakerSegmentsMapRef.current.get(id), []);
    const getHighlight = useCallback((highlightId: string) => highlightsMapRef.current.get(highlightId), []);
    const getPersonsForParty = useCallback((partyId: string) => peopleRef.current.filter(person => {
        const party = getPartyFromRoles(person.roles);
        return party?.id === partyId;
    }), []);

    // Public data context minus `transcript`. Identity is stable across
    // transcript edits — invalidates only when speakerTags / highlights /
    // static data change. SpeakerSegment et al. subscribe via this hook to
    // bail on transcript-only edits.
    const metaValue = useMemo<CouncilMeetingMeta>(() => {
        // Drop the initial transcript prop from the spread so consumers can't
        // read a stale snapshot through this context (the live transcript
        // lives on `contextValue` only).
        const { transcript: _initialTranscript, ...staticData } = data;
        return {
            ...staticData,
            speakerTags,
            highlights,
            getPerson,
            getParty,
            getSpeakerTag,
            getSpeakerSegmentCount,
            getSpeakerSegmentById,
            getPersonsForParty,
            getHighlight,
            ...actionsValue,
        };
    }, [
        data,
        speakerTags,
        highlights,
        getPerson,
        getParty,
        getSpeakerTag,
        getSpeakerSegmentCount,
        getSpeakerSegmentById,
        getPersonsForParty,
        getHighlight,
        actionsValue,
    ]);

    // Backward-compatible composition: metaValue + transcript. Existing
    // useCouncilMeetingData() consumers see the same shape as before.
    const contextValue = useMemo<CouncilMeetingDataContext>(() => ({
        ...metaValue,
        transcript,
    }), [metaValue, transcript]);

    return (
        <CouncilMeetingActionsContext.Provider value={actionsValue}>
            <CouncilMeetingMetaContext.Provider value={metaValue}>
                <CouncilMeetingDataContext.Provider value={contextValue}>
                    {children}
                </CouncilMeetingDataContext.Provider>
            </CouncilMeetingMetaContext.Provider>
        </CouncilMeetingActionsContext.Provider>
    );
}

export function useCouncilMeetingData() {
    const context = useContext(CouncilMeetingDataContext);
    if (context === undefined) {
        throw new Error('useCouncilMeetingData must be used within a CouncilMeetingDataProvider');
    }
    return context;
}

// Hook for components that only need to dispatch mutations. Consumers of this
// hook do NOT re-render when transcript/speakerTags/highlights change — the
// returned value is referentially stable for the lifetime of the provider.
export function useCouncilMeetingActions() {
    const context = useContext(CouncilMeetingActionsContext);
    if (context === undefined) {
        throw new Error('useCouncilMeetingActions must be used within a CouncilMeetingDataProvider');
    }
    return context;
}

// Hook for components that need everything EXCEPT the transcript array
// (e.g., SpeakerSegment, which is the parent of Utterance and renders the
// segment header from speakerTag / person / party / segmentCount). Consumers
// of this hook do NOT re-render on transcript edits — only on speakerTags /
// highlights / static data changes. This is the right hook for any component
// that doesn't directly iterate the transcript.
export function useCouncilMeetingMeta() {
    const context = useContext(CouncilMeetingMetaContext);
    if (context === undefined) {
        throw new Error('useCouncilMeetingMeta must be used within a CouncilMeetingDataProvider');
    }
    return context;
}
