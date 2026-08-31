"use client";

import React, { createContext, useContext, useMemo } from 'react';
import { useCouncilMeetingData } from '@/components/meetings/CouncilMeetingDataContext';
import { getPartyFromRoles } from '@/lib/utils';
import { TOPICLESS_COLOR } from '@/lib/topicStyle';
import { utteranceRuns, mergeIntervals, chapterStarts, type BarBand, type Chapter, type ChapterKey, type Interval } from '@/lib/utils/barTimeline';

export interface BarData {
    bands: BarBand[];
    /** merged [start,end] runs per subject id */
    intervalsBySubject: Map<string, Interval[]>;
    /** merged runs per person id */
    intervalsBySpeaker: Map<string, Interval[]>;
    /** merged runs per `${subjectId}:${personId}` */
    intervalsBySubjectSpeaker: Map<string, Interval[]>;
    /** false when no utterance names a subject — the subjects mode has nothing to show */
    hasSubjectData: boolean;
    /** where the transcript ends — stands in for the media duration until metadata loads */
    contentDuration: number;
    /** agenda chapters in time order; empty when fewer than two exist */
    chapters: Chapter[];
}

const EMPTY: BarData = {
    bands: [],
    intervalsBySubject: new Map(),
    intervalsBySpeaker: new Map(),
    intervalsBySubjectSpeaker: new Map(),
    hasSubjectData: false,
    contentDuration: 0,
    chapters: [],
};

const BarDataContext = createContext<BarData>(EMPTY);

const UNKNOWN_SPEAKER_COLOR = '#D3D3D3';

function pushInterval(map: Map<string, Interval[]>, key: string, span: Interval) {
    const list = map.get(key);
    if (list) list.push(span); else map.set(key, [span]);
}

/**
 * One derivation pass for everything the playback bar paints: one band per
 * (speaker × subject) run in both colour languages, and the interval indexes
 * the highlight sources look up. Recomputes only when the transcript identity changes — the
 * data context's getters are ref-backed and identity-stable.
 */
export function BarDataProvider({ children }: { children: React.ReactNode }) {
    const { transcript, subjects, meeting, getSpeakerTag, getPerson } = useCouncilMeetingData();

    const value = useMemo<BarData>(() => {
        if (transcript.length === 0) return EMPTY;
        const meetingDate = meeting.dateTime;
        const subjectById = new Map(subjects.map(s => [s.id, s]));

        const bands: BarBand[] = [];
        const chapterItems: { category: ChapterKey; start: number }[] = [];
        const bySubject = new Map<string, Interval[]>();
        const bySpeaker = new Map<string, Interval[]>();
        const byPair = new Map<string, Interval[]>();

        for (const segment of transcript) {
            const speakerTag = getSpeakerTag(segment.speakerTagId);
            const person = speakerTag?.personId ? getPerson(speakerTag.personId) : undefined;
            const party = person ? getPartyFromRoles(person.roles, meetingDate) : null;
            const speakerColor = party?.colorHex || UNKNOWN_SPEAKER_COLOR;
            const speakerName = person ? person.name_short : speakerTag?.label || '';

            // One band per (speaker × subject) run, so the paint, the tooltip and
            // the highlight all share utterance-level truth. In speakers mode the
            // runs of a turn wear the same colour and read as one block; in
            // subjects mode adjacent same-subject runs fuse into chapters.
            for (const run of utteranceRuns(segment.utterances, segment.startTimestamp, segment.endTimestamp)) {
                const subject = run.subjectId ? subjectById.get(run.subjectId) : undefined;
                bands.push({
                    start: run.start,
                    end: run.end,
                    speakerColor,
                    speakerName,
                    subjectId: subject ? run.subjectId : null,
                    subjectColor: subject?.topic?.colorHex ?? TOPICLESS_COLOR,
                    subjectName: subject?.name ?? null,
                    subjectIcon: subject?.topic?.icon ?? null,
                });
                if (subject && run.subjectId) {
                    pushInterval(bySubject, run.subjectId, [run.start, run.end]);
                    if (person) pushInterval(byPair, `${run.subjectId}:${person.id}`, [run.start, run.end]);
                    const category: ChapterKey | null =
                        subject.nonAgendaReason === 'beforeAgenda' ? 'beforeAgenda'
                        : subject.nonAgendaReason === 'outOfAgenda' ? 'outOfAgenda'
                        : subject.agendaItemIndex !== null ? 'agenda' : null;
                    if (category) chapterItems.push({ category, start: run.start });
                }
            }
            // A speaker's highlight is their whole turn, procedural asides included.
            if (person) pushInterval(bySpeaker, person.id, [segment.startTimestamp, segment.endTimestamp]);
        }
        bands.sort((a, b) => a.start - b.start);

        const merge = (m: Map<string, Interval[]>) => {
            for (const [k, list] of m) m.set(k, mergeIntervals(list));
        };
        merge(bySubject); merge(bySpeaker); merge(byPair);

        return {
            bands,
            intervalsBySubject: bySubject,
            intervalsBySpeaker: bySpeaker,
            intervalsBySubjectSpeaker: byPair,
            hasSubjectData: bySubject.size > 0,
            contentDuration: bands.length ? bands[bands.length - 1].end : 0,
            chapters: chapterStarts(chapterItems),
        };
    // getters are identity-stable (ref-backed useCallbacks in the data context)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transcript, subjects, meeting.dateTime]);

    return <BarDataContext.Provider value={value}>{children}</BarDataContext.Provider>;
}

export function useBarData(): BarData {
    return useContext(BarDataContext);
}
