'use client';
import { useEffect, useMemo, useState } from 'react';
import { useCouncilMeetingData } from '@/components/meetings/CouncilMeetingDataContext';
import { msUntilStageChange, publicMeetingStage, reviewDeadline, stageSignalsFromMeetingData, type PublicMeetingStage } from '@/lib/meetingStage';

export interface MeetingStageReading {
    stage: PublicMeetingStage;
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
        return { stage: publicMeetingStage(signals, now), deadline: reviewDeadline(meeting.dateTime, now), now };
    }, [meeting, taskStatus, segmentCount, subjects, now]);

    const wait = msUntilStageChange(reading.stage, meeting.dateTime, now);
    useEffect(() => {
        if (wait === null) return;
        const timeout = setTimeout(() => setNow(new Date()), wait);
        return () => clearTimeout(timeout);
    }, [wait, now]);

    return reading;
}
