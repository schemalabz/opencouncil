import {
    LIVE_WINDOW_MS,
    PROMISE_WINDOW_MS,
    REVIEW_PROMISE_MS,
    meetingStageExplainHref,
    msUntilStageChange,
    pendingKind,
    publicMeetingStage,
    reviewDeadline,
    stageSignalsFromMeetingData,
    stageSignalsFromPreview,
    type MeetingStageSignals,
} from '../meetingStage';

const NOW = new Date('2026-02-11T15:00:00Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function at(ageMs: number, overrides: Partial<MeetingStageSignals> = {}): MeetingStageSignals {
    return {
        dateTime: new Date(NOW.getTime() - ageMs),
        hasMedia: false,
        transcribed: false,
        summarized: false,
        ...overrides,
    };
}

describe('publicMeetingStage', () => {
    it('is upcoming until the meeting starts', () => {
        expect(publicMeetingStage(at(-3 * DAY), NOW)).toBe('upcoming');
        expect(publicMeetingStage(at(-1), NOW)).toBe('upcoming');
    });

    it('is live for twelve hours after the start while no transcript exists', () => {
        expect(publicMeetingStage(at(0), NOW)).toBe('live');
        expect(publicMeetingStage(at(LIVE_WINDOW_MS - 1), NOW)).toBe('live');
        expect(publicMeetingStage(at(LIVE_WINDOW_MS - 1, { hasMedia: true }), NOW)).toBe('live');
    });

    it('waits for a video, or transcribes one, between twelve hours and a week', () => {
        expect(publicMeetingStage(at(LIVE_WINDOW_MS), NOW)).toBe('waiting');
        expect(publicMeetingStage(at(2 * DAY), NOW)).toBe('waiting');
        expect(publicMeetingStage(at(2 * DAY, { hasMedia: true }), NOW)).toBe('transcribing');
    });

    it('archives a meeting that goes a week without a transcript, video or not', () => {
        expect(publicMeetingStage(at(PROMISE_WINDOW_MS), NOW)).toBe('archive');
        expect(publicMeetingStage(at(30 * DAY, { hasMedia: true }), NOW)).toBe('archive');
    });

    it('is under review as soon as a transcript exists, even inside the live window', () => {
        expect(publicMeetingStage(at(3 * HOUR, { transcribed: true }), NOW)).toBe('review');
        expect(publicMeetingStage(at(2 * DAY, { hasMedia: true, transcribed: true }), NOW)).toBe('review');
    });

    it('is complete once summaries exist', () => {
        expect(publicMeetingStage(at(2 * DAY, { transcribed: true, summarized: true }), NOW)).toBe('complete');
        expect(publicMeetingStage(at(400 * DAY, { transcribed: true, summarized: true }), NOW)).toBe('complete');
    });

    it('stops promising a review after a week: an old transcript with no summaries is complete', () => {
        expect(publicMeetingStage(at(PROMISE_WINDOW_MS - 1, { transcribed: true }), NOW)).toBe('review');
        expect(publicMeetingStage(at(PROMISE_WINDOW_MS, { transcribed: true }), NOW)).toBe('complete');
    });

    it('never reads summaries as a transcript', () => {
        // Contributions without segments cannot happen in the pipeline; if a row
        // ever looks like that, the transcript's absence wins.
        expect(publicMeetingStage(at(2 * DAY, { summarized: true }), NOW)).toBe('waiting');
    });
});

describe('reviewDeadline', () => {
    it('is 48 hours after the meeting while that is still ahead', () => {
        const dateTime = new Date(NOW.getTime() - DAY);
        expect(reviewDeadline(dateTime, NOW)?.getTime()).toBe(dateTime.getTime() + REVIEW_PROMISE_MS);
    });

    it('is null once the promise has passed', () => {
        expect(reviewDeadline(new Date(NOW.getTime() - REVIEW_PROMISE_MS), NOW)).toBeNull();
        expect(reviewDeadline(new Date(NOW.getTime() - 3 * DAY), NOW)).toBeNull();
    });
});

describe('signals', () => {
    const media = { youtubeUrl: null, videoUrl: null, audioUrl: null, muxPlaybackId: null };

    it('reads the meeting page: tasks first, what is on hand as a fallback', () => {
        const meeting = { ...media, muxPlaybackId: 'mux', dateTime: NOW };
        const tasks = { transcribe: false, summarize: false };
        expect(stageSignalsFromMeetingData(meeting, tasks, { segmentCount: 0, contributionCount: 0 }))
            .toEqual({ dateTime: NOW, hasMedia: true, transcribed: false, summarized: false });
        expect(stageSignalsFromMeetingData(meeting, tasks, { segmentCount: 12, contributionCount: 3 }))
            .toMatchObject({ transcribed: true, summarized: true });
        expect(stageSignalsFromMeetingData({ ...media, dateTime: NOW }, { transcribe: true, summarize: true }, { segmentCount: 0, contributionCount: 0 }))
            .toMatchObject({ hasMedia: false, transcribed: true, summarized: true });
    });

    it('reads a list projection: succeeded task types, then the counts', () => {
        const base = { ...media, dateTime: NOW, taskStatuses: [], _count: { speakerSegments: 0 }, subjects: [] };
        expect(stageSignalsFromPreview(base)).toEqual({ dateTime: NOW, hasMedia: false, transcribed: false, summarized: false });
        expect(stageSignalsFromPreview({ ...base, youtubeUrl: 'https://youtu.be/x', taskStatuses: [{ type: 'transcribe' }] }))
            .toMatchObject({ hasMedia: true, transcribed: true, summarized: false });
        expect(stageSignalsFromPreview({ ...base, taskStatuses: [{ type: 'transcribe' }, { type: 'summarize' }] }))
            .toMatchObject({ transcribed: true, summarized: true });
        expect(stageSignalsFromPreview({
            ...base,
            _count: { speakerSegments: 40 },
            subjects: [{ _count: { contributions: 0 } }, { _count: { contributions: 2 } }],
        })).toMatchObject({ transcribed: true, summarized: true });
    });
});

describe('meetingStageExplainHref', () => {
    it('deep-links to the stage on the Greek realm and nowhere else', () => {
        expect(meetingStageExplainHref('greece', 'review')).toBe('/explain#oc-stage-review');
        expect(meetingStageExplainHref('serbia', 'review')).toBeNull();
        expect(meetingStageExplainHref('france', 'upcoming')).toBeNull();
    });
});

describe('pendingKind', () => {
    it('tells a meeting ahead from a transcript on its way from a review', () => {
        expect(pendingKind('upcoming')).toBe('before');
        expect(pendingKind('live')).toBe('before');
        expect(pendingKind('waiting')).toBe('processing');
        expect(pendingKind('transcribing')).toBe('processing');
        expect(pendingKind('review')).toBe('review');
        expect(pendingKind('complete')).toBeNull();
        expect(pendingKind('archive')).toBeNull();
    });
});

describe('msUntilStageChange', () => {
    const start = (ageMs: number) => new Date(NOW.getTime() - ageMs);

    it('ticks by the minute while a meeting is ahead, and no later than its start', () => {
        expect(msUntilStageChange('upcoming', start(-3 * HOUR), NOW)).toBe(60_000);
        expect(msUntilStageChange('upcoming', start(-20_000), NOW)).toBe(20_000);
    });

    it('waits for the live window to close', () => {
        expect(msUntilStageChange('live', start(2 * HOUR), NOW)).toBe(LIVE_WINDOW_MS - 2 * HOUR);
    });

    it('waits for the review promise, then for the week', () => {
        expect(msUntilStageChange('review', start(DAY), NOW)).toBe(REVIEW_PROMISE_MS - DAY);
        expect(msUntilStageChange('review', start(3 * DAY), NOW)).toBe(PROMISE_WINDOW_MS - 3 * DAY);
        expect(msUntilStageChange('transcribing', start(3 * DAY), NOW)).toBe(PROMISE_WINDOW_MS - 3 * DAY);
    });

    it('never schedules in the past, and never for a finished meeting', () => {
        expect(msUntilStageChange('live', start(2 * DAY), NOW)).toBe(1_000);
        expect(msUntilStageChange('complete', start(30 * DAY), NOW)).toBeNull();
        expect(msUntilStageChange('archive', start(30 * DAY), NOW)).toBeNull();
    });
});
