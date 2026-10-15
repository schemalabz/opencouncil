'use client';
import { useEffect, useMemo, useState } from 'react';
import { useCouncilMeetingData } from '@/components/meetings/CouncilMeetingDataContext';
import { reviewDeadline, stageSignalsFromMeetingData } from '@/lib/meetingStage';
import {
    msUntilPresentationChange,
    presentationKey,
    publicMeetingPresentation,
    type PresentationKey,
    type PublicMeetingPresentation,
} from '@/lib/meetingPresentation';

export interface MeetingStageReading {
    /** What the page shows: the stage, or the fact that replaces it (postponed, cancelled, no recording). */
    presentation: PublicMeetingPresentation;
    /** The key of the presentation, for chips, tones and /explain anchors. */
    stage: PresentationKey;
    /** The review promise, while it is still ahead. */
    deadline: Date | null;
    /** The clock the reading was taken at, for anything relative that renders beside it. */
    now: Date;
}

/**
 * The meeting page's stage, re-read when the clock alone can change it: at the
 * next boundary, so an upcoming meeting turns live — and the live one starts
 * waiting — without a reload, and by the minute while a countdown is on
 * screen. A complete meeting never re-reads: every tick re-renders the page.
 */
export function useMeetingStage(): MeetingStageReading {
    const { meeting, subjects, transcript, taskStatus } = useCouncilMeetingData();
    const [now, setNow] = useState(() => new Date());

    const segmentCount = transcript.length;
    const reading = useMemo(() => {
        const signals = stageSignalsFromMeetingData(meeting, taskStatus, {
            segmentCount,
            contributionCount: subjects.reduce((count, subject) => count + (subject.contributions?.length ?? 0), 0),
        });
        const presentation = publicMeetingPresentation(meeting, signals, now);
        return { presentation, stage: presentationKey(presentation), deadline: reviewDeadline(meeting.dateTime, now), now };
    }, [meeting, taskStatus, segmentCount, subjects, now]);

    const wait = msUntilPresentationChange(reading.presentation, meeting.dateTime, now);
    useEffect(() => {
        if (wait === null) return;
        const timeout = setTimeout(() => setNow(new Date()), wait);
        return () => clearTimeout(timeout);
    }, [wait, now]);

    return reading;
}
