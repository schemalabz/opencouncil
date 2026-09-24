import fs from 'fs';
import path from 'path';
import {
    PUBLIC_MEETING_STAGES,
    publicMeetingStage,
    type MeetingStageSignals,
} from '../meetingStage';
import {
    presentationExplainHref,
    presentationKey,
    presentationPendingKind,
    msUntilPresentationChange,
    publicMeetingPresentation,
    type MeetingPresentationFields,
} from '../meetingPresentation';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MEETING = new Date('2026-03-12T16:00:00Z');

function at(offsetMs: number) {
    return new Date(MEETING.getTime() + offsetMs);
}

const scheduled: MeetingPresentationFields = {
    scheduleStatus: 'scheduled',
    scheduleStatusReason: null,
    format: 'inPerson',
    closedToPublic: false,
};

function signals(overrides: Partial<MeetingStageSignals> = {}): MeetingStageSignals {
    return { dateTime: MEETING, hasMedia: false, transcribed: false, summarized: false, ...overrides };
}

describe('publicMeetingPresentation', () => {
    const AGES = [-3 * DAY, 0, 13 * HOUR, 3 * DAY, 8 * DAY];
    const SIGNALS = [
        signals(),
        signals({ hasMedia: true }),
        signals({ hasMedia: true, transcribed: true }),
        signals({ hasMedia: true, transcribed: true, summarized: true }),
    ];

    it('shows the stage of a scheduled meeting, unchanged', () => {
        for (const age of AGES) {
            for (const s of SIGNALS) {
                const now = at(age);
                expect(publicMeetingPresentation(scheduled, s, now)).toEqual({ type: 'stage', stage: publicMeetingStage(s, now) });
            }
        }
    });

    it.each(['postponed', 'cancelled'] as const)('shows %s at every age, with the reason, in place of the stage', (status) => {
        const fields = { ...scheduled, scheduleStatus: status, scheduleStatusReason: 'Λόγω απεργίας' };
        for (const age of AGES) {
            for (const s of SIGNALS) {
                expect(publicMeetingPresentation(fields, s, at(age))).toEqual({ type: status, reason: 'Λόγω απεργίας' });
            }
        }
    });

    it('never reads a cancelled meeting as archive, a week later', () => {
        const cancelled = { ...scheduled, scheduleStatus: 'cancelled' as const };
        expect(publicMeetingStage(signals(), at(8 * DAY))).toBe('archive');
        expect(publicMeetingPresentation(cancelled, signals(), at(8 * DAY)).type).toBe('cancelled');
    });

    it('shows a closed meeting as held without a recording once it has started', () => {
        const closed = { ...scheduled, closedToPublic: true };
        expect(publicMeetingPresentation(closed, signals(), at(-DAY))).toEqual({ type: 'stage', stage: 'upcoming' });
        expect(publicMeetingPresentation(closed, signals(), at(13 * HOUR))).toEqual({ type: 'noRecording', reason: 'closedToPublic' });
        expect(publicMeetingPresentation(closed, signals(), at(8 * DAY))).toEqual({ type: 'noRecording', reason: 'closedToPublic' });
    });

    it('lets a transcript that exists anyway win over the closed flag', () => {
        const closed = { ...scheduled, closedToPublic: true };
        const transcribed = signals({ transcribed: true, summarized: true });
        expect(publicMeetingPresentation(closed, transcribed, at(8 * DAY))).toEqual({ type: 'stage', stage: 'complete' });
    });

    it('shows a meeting by circulation as held without a recording', () => {
        const byCirculation = { ...scheduled, format: 'byCirculation' as const };
        expect(publicMeetingPresentation(byCirculation, signals(), at(2 * HOUR))).toEqual({ type: 'noRecording', reason: 'byCirculation' });
    });
});

describe('presentation helpers', () => {
    it('keys a stage by the stage, and the other types by their type', () => {
        for (const stage of PUBLIC_MEETING_STAGES) {
            expect(presentationKey({ type: 'stage', stage })).toBe(stage);
        }
        expect(presentationKey({ type: 'cancelled', reason: null })).toBe('cancelled');
        expect(presentationKey({ type: 'noRecording', reason: 'closedToPublic' })).toBe('noRecording');
    });

    it('promises nothing for a postponed, cancelled or unrecorded meeting', () => {
        for (const p of [
            { type: 'postponed', reason: null },
            { type: 'cancelled', reason: null },
            { type: 'noRecording', reason: 'byCirculation' },
        ] as const) {
            expect(presentationPendingKind(p)).toBeNull();
            expect(msUntilPresentationChange(p, MEETING, at(0))).toBeNull();
        }
        expect(presentationPendingKind({ type: 'stage', stage: 'upcoming' })).toBe('before');
    });

    it('links to the sentence on /explain where the realm has one', () => {
        expect(presentationExplainHref('greece', { type: 'cancelled', reason: null })).toBe('/explain#oc-stage-cancelled');
        expect(presentationExplainHref('greece', { type: 'stage', stage: 'live' })).toBe('/explain#oc-stage-live');
        expect(presentationExplainHref('serbia', { type: 'cancelled', reason: null })).toBeNull();
    });
});

describe('the labels of the presentation', () => {
    it.each(['el', 'en', 'fr', 'sr'])('exist in %s for every key', (locale) => {
        const file = path.join(process.cwd(), 'messages', locale, 'meetingStage.json');
        const messages = JSON.parse(fs.readFileSync(file, 'utf8')) as { label: Record<string, string> };
        const keys = [...PUBLIC_MEETING_STAGES, 'postponed', 'cancelled', 'noRecording'];
        expect(Object.keys(messages.label).sort()).toEqual(keys.sort());
    });
});
