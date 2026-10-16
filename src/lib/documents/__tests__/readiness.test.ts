import { AUTOMATIC_DOCUMENTS, evaluateReadiness, minutesDueAt, type ReadinessInput, type ReadinessMeeting } from '../readiness';
import { MINUTES_THRESHOLD_DAYS } from '../settings';

const DAY_MS = 24 * 60 * 60 * 1000;
const meetingDate = new Date('2026-03-10T17:00:00Z');
const daysAfter = (days: number) => new Date(meetingDate.getTime() + days * DAY_MS);

const setting = { enabled: true, enabledAt: null, recipientEmails: ['clerk@example.org'] };
// 10 Mar 2026, 19:00 in Athens: due at the start of 20 Mar, Athens time (UTC+2 before the 29 Mar change)
const dueAt = new Date('2026-03-19T22:00:00Z');
const minute = 60 * 1000;

function input(overrides: Omit<Partial<ReadinessInput>, 'meeting'> & { meeting?: Partial<ReadinessMeeting> } = {}): ReadinessInput {
    return {
        setting,
        reviewed: true,
        subjects: [{ id: 's1', decided: true }, { id: 's2', decided: true }],
        hasAgenda: true,
        now: daysAfter(3),
        ...overrides,
        meeting: {
            dateTime: meetingDate,
            scheduleStatus: 'scheduled',
            continuationOfId: null,
            kind: 'ordinary',
            continuationOf: null,
            city: { timezone: 'Europe/Athens' },
            ...overrides.meeting,
        },
    };
}

describe('evaluateReadiness', () => {
    describe('the gates every document shares', () => {
        it.each(['transcript', 'minutes'] as const)('%s: never goes out when the body has no setting, or a disabled one', (document) => {
            expect(evaluateReadiness(document, input({ setting: null }))).toEqual({ state: 'none', reason: 'disabled' });
            expect(evaluateReadiness(document, input({ setting: { ...setting, enabled: false } }))).toEqual({ state: 'none', reason: 'disabled' });
        });

        it('never goes out for a meeting held before the switch-on', () => {
            const switchedOnLater = { ...setting, enabledAt: daysAfter(1) };
            expect(evaluateReadiness('minutes', input({ setting: switchedOnLater }))).toEqual({ state: 'none', reason: 'beforeSwitch' });
            // The meeting of the very moment of the switch counts
            expect(evaluateReadiness('minutes', input({ setting: { ...setting, enabledAt: meetingDate } }))).toEqual({ state: 'complete' });
        });

        it('a setting from the migration, with no enabledAt, covers every meeting', () => {
            expect(evaluateReadiness('transcript', input({ setting: { ...setting, enabledAt: null } }))).toEqual({ state: 'complete' });
        });

        it.each(['postponed', 'cancelled'] as const)('never goes out for a %s meeting', (scheduleStatus) => {
            expect(evaluateReadiness('minutes', input({ meeting: { scheduleStatus } }))).toEqual({ state: 'none', reason: 'notHeld' });
        });

        it('a later part of a continued meeting sends nothing of its own', () => {
            expect(evaluateReadiness('minutes', input({ meeting: { continuationOfId: 'first-part', kind: null, continuationOf: { kind: 'ordinary' } } })))
                .toEqual({ state: 'none', reason: 'laterPart' });
        });

        it('waits for the human review, with no due date: nothing goes out unreviewed', () => {
            expect(evaluateReadiness('minutes', input({ reviewed: false, now: daysAfter(30) }))).toEqual({ state: 'wait', reason: 'review', dueAt: null });
            expect(evaluateReadiness('transcript', input({ reviewed: false }))).toEqual({ state: 'wait', reason: 'review', dueAt: null });
        });

        it('the switch-on date and the later-part gate hold only for the documents that go out on their own', () => {
            const switchedOnLater = { ...setting, enabledAt: daysAfter(1) };
            // The transcript is a person's choice, for every meeting and every part
            expect(evaluateReadiness('transcript', input({ setting: switchedOnLater }))).toEqual({ state: 'complete' });
            expect(evaluateReadiness('transcript', input({ meeting: { continuationOfId: 'first-part', kind: null, continuationOf: { kind: 'ordinary' } } })))
                .toEqual({ state: 'complete' });
            expect(evaluateReadiness('minutes', input({ setting: switchedOnLater }))).toEqual({ state: 'none', reason: 'beforeSwitch' });
        });

        it('a send by hand may cover a meeting before the switch-on, and a transcript before its review', () => {
            const switchedOnLater = { ...setting, enabledAt: daysAfter(1) };
            expect(evaluateReadiness('minutes', input({ setting: switchedOnLater }), { byHand: true })).toEqual({ state: 'complete' });
            expect(evaluateReadiness('transcript', input({ reviewed: false }), { byHand: true })).toEqual({ state: 'complete' });
            // Never minutes of an unreviewed meeting, and never minutes of a later part
            expect(evaluateReadiness('minutes', input({ reviewed: false }), { byHand: true })).toEqual({ state: 'wait', reason: 'review', dueAt: null });
            expect(evaluateReadiness('minutes', input({ meeting: { continuationOfId: 'first-part', kind: null, continuationOf: { kind: 'ordinary' } } }), { byHand: true }))
                .toEqual({ state: 'none', reason: 'laterPart' });
        });

        it('checks the gates in order: the setting before the meeting, the meeting before the review', () => {
            expect(evaluateReadiness('minutes', input({ setting: null, meeting: { scheduleStatus: 'cancelled' }, reviewed: false })))
                .toEqual({ state: 'none', reason: 'disabled' });
            expect(evaluateReadiness('minutes', input({ meeting: { scheduleStatus: 'cancelled' }, reviewed: false })))
                .toEqual({ state: 'none', reason: 'notHeld' });
        });
    });

    describe('the transcript', () => {
        it('is complete as soon as the review is, whatever the decisions say', () => {
            expect(evaluateReadiness('transcript', input({ subjects: [{ id: 's1', decided: false }] }))).toEqual({ state: 'complete' });
            expect(evaluateReadiness('transcript', input({ subjects: [] }))).toEqual({ state: 'complete' });
        });

        it('is the reviewer\'s choice, not the cron\'s', () => {
            expect(AUTOMATIC_DOCUMENTS).toEqual(['minutes']);
        });
    });

    describe('the minutes', () => {
        it('are complete when every eligible subject has its decision', () => {
            expect(evaluateReadiness('minutes', input())).toEqual({ state: 'complete' });
        });

        it('wait for the decisions before the threshold, and say when the threshold is', () => {
            const subjects = [{ id: 's1', decided: true }, { id: 's2', decided: false }];
            expect(evaluateReadiness('minutes', input({ subjects, now: new Date(dueAt.getTime() - minute) })))
                .toEqual({ state: 'wait', reason: 'decisions', dueAt });
            expect(evaluateReadiness('minutes', input({ subjects, now: dueAt })))
                .toEqual({ state: 'incomplete', missingSubjectIds: ['s2'] });
        });

        it('go out incomplete once the threshold passes, naming the subjects without a decision', () => {
            const subjects = [{ id: 's1', decided: true }, { id: 's2', decided: false }, { id: 's3', decided: false }];
            expect(evaluateReadiness('minutes', input({ subjects, now: daysAfter(MINUTES_THRESHOLD_DAYS) })))
                .toEqual({ state: 'incomplete', missingSubjectIds: ['s2', 's3'] });
        });

        it('go out complete after the threshold when the last decision arrived late', () => {
            expect(evaluateReadiness('minutes', input({ now: daysAfter(40) }))).toEqual({ state: 'complete' });
        });

        it('count the threshold in calendar days where the meeting took place, from local midnight', () => {
            expect(MINUTES_THRESHOLD_DAYS).toBe(10);
            expect(minutesDueAt(meetingDate, 'Europe/Athens')).toEqual(dueAt);
            // A meeting late in the evening counts its own calendar day, not the UTC one
            expect(minutesDueAt(new Date('2026-03-10T22:30:00Z'), 'Europe/Athens')).toEqual(new Date('2026-03-20T22:00:00Z'));
            // Across the change to summer time (29 Mar): midnight of 3 Apr in Athens is 21:00 UTC
            expect(minutesDueAt(new Date('2026-03-24T17:00:00Z'), 'Europe/Athens')).toEqual(new Date('2026-04-02T21:00:00Z'));
            // Another realm counts in its own timezone
            expect(minutesDueAt(meetingDate, 'Europe/Paris')).toEqual(new Date('2026-03-19T23:00:00Z'));
        });

        describe('a meeting that takes no decisions, or has no eligible subject', () => {
            it('is complete at review time when the meeting takes no decisions (a λογοδοσία)', () => {
                expect(evaluateReadiness('minutes', input({ subjects: [], meeting: { kind: 'accountability' } }))).toEqual({ state: 'complete' });
                expect(evaluateReadiness('minutes', input({ subjects: [], meeting: { kind: 'activityReport' } }))).toEqual({ state: 'complete' });
            });

            it('is complete at review time for a λογοδοσία with agenda subjects too, which never get a decision', () => {
                const undecided = [{ id: 's1', decided: false }, { id: 's2', decided: false }];
                expect(evaluateReadiness('minutes', input({ subjects: undecided, meeting: { kind: 'accountability' }, now: daysAfter(MINUTES_THRESHOLD_DAYS + 1) })))
                    .toEqual({ state: 'complete' });
                expect(evaluateReadiness('minutes', input({ subjects: undecided, meeting: { kind: 'activityReport' }, now: daysAfter(1) })))
                    .toEqual({ state: 'complete' });
            });

            it('waits for the agenda otherwise, whatever the date, with no due date', () => {
                expect(evaluateReadiness('minutes', input({ subjects: [], hasAgenda: false, now: daysAfter(60) }))).toEqual({ state: 'wait', reason: 'agenda', dueAt: null });
                expect(evaluateReadiness('minutes', input({ subjects: [], hasAgenda: false, meeting: { kind: null } }))).toEqual({ state: 'wait', reason: 'agenda', dueAt: null });
                // An agenda whose every item was withdrawn leaves nothing to decide: the minutes are complete
                expect(evaluateReadiness('minutes', input({ subjects: [], hasAgenda: true, now: daysAfter(1) }))).toEqual({ state: 'complete' });
            });
        });
    });
});
