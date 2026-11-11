import {
    AUTOMATIC_DOCUMENTS,
    evaluateManualReadiness,
    evaluateReadiness,
    isAutomaticDocument,
    isSendable,
    minutesDueAt,
    missingSubjectIdsOf,
    readinessInputFor,
    type ReadinessInput,
    type ReadinessMeeting,
} from '../readiness';
import { MINUTES_THRESHOLD_DAYS } from '../settings';
import { daysAfter, meetingDate, minutesDueAtFixture as dueAt, readinessFacts, reviewTask, setting as settingOf, summarizeTask, task } from './factsFixture';

const setting = { enabled: true, enabledAt: new Date('2026-01-01T00:00:00Z'), recipientEmails: ['clerk@example.org'] };
const minute = 60 * 1000;
const laterPart = { continuationOfId: 'first-part', kind: null, continuationOf: { kind: 'ordinary' as const } };

function input(overrides: Omit<Partial<ReadinessInput>, 'meeting'> & { meeting?: Partial<ReadinessMeeting> } = {}): ReadinessInput {
    return {
        setting,
        reviewed: true,
        summarized: true,
        pollable: false,
        polledAfterSummarize: false,
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

const undecided = [{ id: 's1', decided: true }, { id: 's2', decided: false }];

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
            // One millisecond later it does not
            expect(evaluateReadiness('minutes', input({ setting: { ...setting, enabledAt: new Date(meetingDate.getTime() + 1) } })))
                .toEqual({ state: 'none', reason: 'beforeSwitch' });
        });

        it.each(['postponed', 'cancelled'] as const)('never goes out for a %s meeting', (scheduleStatus) => {
            expect(evaluateReadiness('minutes', input({ meeting: { scheduleStatus } }))).toEqual({ state: 'none', reason: 'notHeld' });
        });

        it('a later part of a continued meeting sends nothing of its own', () => {
            expect(evaluateReadiness('minutes', input({ meeting: laterPart }))).toEqual({ state: 'none', reason: 'laterPart' });
        });

        it('waits for the human review, with no due date: nothing goes out unreviewed', () => {
            expect(evaluateReadiness('minutes', input({ reviewed: false, now: daysAfter(30) }))).toEqual({ state: 'wait', reason: 'review', dueAt: null });
            expect(evaluateReadiness('transcript', input({ reviewed: false }))).toEqual({ state: 'wait', reason: 'review', dueAt: null });
        });

        it('the switch-on date and the later-part gate hold only for the documents that go out on their own', () => {
            const switchedOnLater = { ...setting, enabledAt: daysAfter(1) };
            // The transcript is a person's choice, for every meeting and every part
            expect(evaluateReadiness('transcript', input({ setting: switchedOnLater }))).toEqual({ state: 'complete' });
            expect(evaluateReadiness('transcript', input({ meeting: laterPart }))).toEqual({ state: 'complete' });
            expect(evaluateReadiness('minutes', input({ setting: switchedOnLater }))).toEqual({ state: 'none', reason: 'beforeSwitch' });
        });

        it('a send by hand may cover a meeting before the switch-on, and a transcript before its review', () => {
            const switchedOnLater = { ...setting, enabledAt: daysAfter(1) };
            expect(evaluateReadiness('minutes', input({ setting: switchedOnLater }), { byHand: true })).toEqual({ state: 'complete' });
            expect(evaluateReadiness('transcript', input({ reviewed: false }), { byHand: true })).toEqual({ state: 'complete' });
            // Never minutes of an unreviewed meeting, and never minutes of a later part
            expect(evaluateReadiness('minutes', input({ reviewed: false }), { byHand: true })).toEqual({ state: 'wait', reason: 'review', dueAt: null });
            expect(evaluateReadiness('minutes', input({ meeting: laterPart }), { byHand: true })).toEqual({ state: 'none', reason: 'laterPart' });
        });

        it('checks the gates in order: the setting before the meeting, the meeting before the review, the review before the summarize', () => {
            expect(evaluateReadiness('minutes', input({ setting: null, meeting: { scheduleStatus: 'cancelled' }, reviewed: false })))
                .toEqual({ state: 'none', reason: 'disabled' });
            expect(evaluateReadiness('minutes', input({ meeting: { scheduleStatus: 'cancelled' }, reviewed: false })))
                .toEqual({ state: 'none', reason: 'notHeld' });
            expect(evaluateReadiness('minutes', input({ reviewed: false, summarized: false })))
                .toEqual({ state: 'wait', reason: 'review', dueAt: null });
        });
    });

    describe('the transcript', () => {
        it('is complete as soon as the review is, whatever the decisions or the summarize say', () => {
            expect(evaluateReadiness('transcript', input({ subjects: [{ id: 's1', decided: false }] }))).toEqual({ state: 'complete' });
            expect(evaluateReadiness('transcript', input({ subjects: [] }))).toEqual({ state: 'complete' });
            expect(evaluateReadiness('transcript', input({ summarized: false }))).toEqual({ state: 'complete' });
        });

        it('is the reviewer\'s choice, not the cron\'s', () => {
            expect(AUTOMATIC_DOCUMENTS).toEqual(['minutes']);
            expect(isAutomaticDocument('transcript')).toBe(false);
            expect(isAutomaticDocument('minutes')).toBe(true);
        });
    });

    describe('the minutes', () => {
        it('are complete when every eligible subject has its decision', () => {
            expect(evaluateReadiness('minutes', input())).toEqual({ state: 'complete' });
        });

        it('wait for the decisions before the threshold, and say when the threshold is', () => {
            expect(evaluateReadiness('minutes', input({ subjects: undecided, now: new Date(dueAt.getTime() - minute) })))
                .toEqual({ state: 'wait', reason: 'decisions', dueAt });
            expect(evaluateReadiness('minutes', input({ subjects: undecided, now: dueAt })))
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
            expect(MINUTES_THRESHOLD_DAYS).toBe(5);
            expect(minutesDueAt(meetingDate, 'Europe/Athens')).toEqual(dueAt);
            // A meeting late in the evening counts its own calendar day, not the UTC one
            expect(minutesDueAt(new Date('2026-03-10T22:30:00Z'), 'Europe/Athens')).toEqual(new Date('2026-03-15T22:00:00Z'));
            // Across the change to summer time (29 Mar): midnight of 1 Apr in Athens is 21:00 UTC
            expect(minutesDueAt(new Date('2026-03-27T17:00:00Z'), 'Europe/Athens')).toEqual(new Date('2026-03-31T21:00:00Z'));
            // Another realm counts in its own timezone
            expect(minutesDueAt(meetingDate, 'Europe/Paris')).toEqual(new Date('2026-03-14T23:00:00Z'));
        });

        describe('the summarize gate', () => {
            it('wait for the first summarize, with no due date, even long after the threshold and with every decision in', () => {
                expect(evaluateReadiness('minutes', input({ summarized: false }))).toEqual({ state: 'wait', reason: 'summarize', dueAt: null });
                expect(evaluateReadiness('minutes', input({ summarized: false, subjects: undecided, now: daysAfter(60) })))
                    .toEqual({ state: 'wait', reason: 'summarize', dueAt: null });
            });

            it('hold a λογοδοσία too: its minutes take the discussion from the summarize', () => {
                expect(evaluateReadiness('minutes', input({ summarized: false, subjects: [], meeting: { kind: 'accountability' } })))
                    .toEqual({ state: 'wait', reason: 'summarize', dueAt: null });
                expect(evaluateReadiness('minutes', input({ summarized: false, subjects: [], meeting: { kind: 'activityReport' } })))
                    .toEqual({ state: 'wait', reason: 'summarize', dueAt: null });
            });

            it('come before the agenda gate', () => {
                expect(evaluateReadiness('minutes', input({ summarized: false, subjects: [], hasAgenda: false })))
                    .toEqual({ state: 'wait', reason: 'summarize', dueAt: null });
            });
        });

        describe('the poll gate, once due with subjects missing', () => {
            const due = { subjects: undecided, now: dueAt };

            it('wait for one poll after the summarize when the cron polls the meeting', () => {
                expect(evaluateReadiness('minutes', input({ ...due, pollable: true, polledAfterSummarize: false })))
                    .toEqual({ state: 'wait', reason: 'poll', dueAt: null });
            });

            it('go out incomplete once a poll ended after the summarize', () => {
                expect(evaluateReadiness('minutes', input({ ...due, pollable: true, polledAfterSummarize: true })))
                    .toEqual({ state: 'incomplete', missingSubjectIds: ['s2'] });
            });

            it('never wait for a poll that no cron will run', () => {
                expect(evaluateReadiness('minutes', input({ ...due, pollable: false, polledAfterSummarize: false })))
                    .toEqual({ state: 'incomplete', missingSubjectIds: ['s2'] });
            });

            it('do not wait for a poll before the threshold, nor when every decision is in', () => {
                expect(evaluateReadiness('minutes', input({ subjects: undecided, now: new Date(dueAt.getTime() - minute), pollable: true })))
                    .toEqual({ state: 'wait', reason: 'decisions', dueAt });
                expect(evaluateReadiness('minutes', input({ now: dueAt, pollable: true }))).toEqual({ state: 'complete' });
            });
        });

        describe('a meeting that takes no decisions, or has no eligible subject', () => {
            it('is complete once summarized when the meeting takes no decisions (a λογοδοσία), no longer at review time', () => {
                expect(evaluateReadiness('minutes', input({ subjects: [], meeting: { kind: 'accountability' } }))).toEqual({ state: 'complete' });
                expect(evaluateReadiness('minutes', input({ subjects: [], meeting: { kind: 'activityReport' } }))).toEqual({ state: 'complete' });
            });

            it('is complete once summarized for a λογοδοσία with agenda subjects too, which never get a decision', () => {
                const allUndecided = [{ id: 's1', decided: false }, { id: 's2', decided: false }];
                expect(evaluateReadiness('minutes', input({ subjects: allUndecided, meeting: { kind: 'accountability' }, now: daysAfter(MINUTES_THRESHOLD_DAYS + 1), pollable: true })))
                    .toEqual({ state: 'complete' });
                expect(evaluateReadiness('minutes', input({ subjects: allUndecided, meeting: { kind: 'activityReport' }, now: daysAfter(1) })))
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

describe('evaluateManualReadiness', () => {
    it('sends the minutes provisional before the threshold, naming the undecided subjects', () => {
        expect(evaluateManualReadiness('minutes', input({ subjects: undecided, now: daysAfter(1) })))
            .toEqual({ state: 'incomplete', missingSubjectIds: ['s2'] });
    });

    it('sends the minutes provisional instead of waiting for the poll after the summarize', () => {
        expect(evaluateManualReadiness('minutes', input({ subjects: undecided, now: dueAt, pollable: true })))
            .toEqual({ state: 'incomplete', missingSubjectIds: ['s2'] });
    });

    it('keeps the review, summarize and agenda gates', () => {
        expect(evaluateManualReadiness('minutes', input({ reviewed: false }))).toEqual({ state: 'wait', reason: 'review', dueAt: null });
        expect(evaluateManualReadiness('minutes', input({ summarized: false, subjects: undecided }))).toEqual({ state: 'wait', reason: 'summarize', dueAt: null });
        expect(evaluateManualReadiness('minutes', input({ subjects: [], hasAgenda: false }))).toEqual({ state: 'wait', reason: 'agenda', dueAt: null });
    });

    it('keeps the never-sent reasons, but not the switch-on', () => {
        expect(evaluateManualReadiness('minutes', input({ setting: null }))).toEqual({ state: 'none', reason: 'disabled' });
        expect(evaluateManualReadiness('minutes', input({ meeting: { scheduleStatus: 'cancelled' } }))).toEqual({ state: 'none', reason: 'notHeld' });
        expect(evaluateManualReadiness('minutes', input({ meeting: laterPart }))).toEqual({ state: 'none', reason: 'laterPart' });
        expect(evaluateManualReadiness('minutes', input({ setting: { ...setting, enabledAt: daysAfter(1) } }))).toEqual({ state: 'complete' });
    });

    it('sends a transcript before its review', () => {
        expect(evaluateManualReadiness('transcript', input({ reviewed: false }))).toEqual({ state: 'complete' });
    });
});

describe('isSendable and missingSubjectIdsOf', () => {
    it('only a complete or an incomplete readiness is sendable', () => {
        expect(isSendable({ state: 'complete' })).toBe(true);
        expect(isSendable({ state: 'incomplete', missingSubjectIds: ['s1'] })).toBe(true);
        expect(isSendable({ state: 'wait', reason: 'poll', dueAt: null })).toBe(false);
        expect(isSendable({ state: 'none', reason: 'disabled' })).toBe(false);
    });

    it('names the missing subjects of an incomplete readiness, and none of a complete one', () => {
        expect(missingSubjectIdsOf({ state: 'incomplete', missingSubjectIds: ['s1', 's2'] })).toEqual(['s1', 's2']);
        expect(missingSubjectIdsOf({ state: 'complete' })).toEqual([]);
    });
});

describe('readinessInputFor', () => {
    const pollableCity = { timezone: 'Europe/Athens', status: 'supported' as const, diavgeiaUid: '6104' };

    it('reads the setting of the kind, the review, the subjects and the agenda from the facts', () => {
        const minutesSetting = settingOf('minutes', { recipientEmails: ['m@example.org'] });
        const facts = readinessFacts({ administrativeBody: { documentSendSettings: [settingOf('transcript'), minutesSetting] } });
        const result = readinessInputFor(facts, 'minutes', daysAfter(3));
        expect(result).toMatchObject({
            setting: minutesSetting,
            reviewed: true,
            summarized: true,
            subjects: [{ id: 's1', decided: true }, { id: 's2', decided: false }],
            hasAgenda: true,
            now: daysAfter(3),
        });
        expect(readinessInputFor(readinessFacts({ administrativeBody: null }), 'minutes', daysAfter(3)).setting).toBeNull();
        expect(readinessInputFor(readinessFacts({ _count: { subjects: 0 } }), 'minutes', daysAfter(3)).hasAgenda).toBe(false);
    });

    it('reads the review from a humanReview row, and lets the review dialog assume it', () => {
        const unreviewed = readinessFacts({ taskStatuses: [summarizeTask] });
        expect(readinessInputFor(unreviewed, 'minutes', daysAfter(3)).reviewed).toBe(false);
        expect(readinessInputFor(unreviewed, 'minutes', daysAfter(3), { reviewed: true }).reviewed).toBe(true);
    });

    it('reads summarized from a summarize row, and not from a review alone', () => {
        expect(readinessInputFor(readinessFacts({ taskStatuses: [reviewTask] }), 'minutes', daysAfter(3)).summarized).toBe(false);
        expect(readinessInputFor(readinessFacts({ taskStatuses: [reviewTask, summarizeTask] }), 'minutes', daysAfter(3)).summarized).toBe(true);
    });

    it('reads pollable from the meeting and its city', () => {
        expect(readinessInputFor(readinessFacts(), 'minutes', daysAfter(3)).pollable).toBe(false);
        expect(readinessInputFor(readinessFacts({ city: pollableCity }), 'minutes', daysAfter(3)).pollable).toBe(true);
    });

    describe('polledAfterSummarize', () => {
        it('is false with no poll, and with no summarize', () => {
            expect(readinessInputFor(readinessFacts(), 'minutes', daysAfter(6)).polledAfterSummarize).toBe(false);
            const pollOnly = readinessFacts({ taskStatuses: [reviewTask, task('pollDecisions', daysAfter(4))] });
            expect(readinessInputFor(pollOnly, 'minutes', daysAfter(6)).polledAfterSummarize).toBe(false);
        });

        it('is false for a poll that started before the summarize, and true for one that started after it, failed or not', () => {
            const before = readinessFacts({ taskStatuses: [reviewTask, task('summarize', daysAfter(3)), task('pollDecisions', daysAfter(2))] });
            expect(readinessInputFor(before, 'minutes', daysAfter(6)).polledAfterSummarize).toBe(false);
            const after = readinessFacts({ taskStatuses: [reviewTask, task('summarize', daysAfter(3)), task('pollDecisions', daysAfter(4), 'failed')] });
            expect(readinessInputFor(after, 'minutes', daysAfter(6)).polledAfterSummarize).toBe(true);
        });

        it('compares with the latest summarize, in any row order: a re-run summarize needs a new poll', () => {
            const rerun = readinessFacts({ taskStatuses: [
                task('summarize', daysAfter(5)),
                task('pollDecisions', daysAfter(4)),
                task('summarize', daysAfter(3)),
                reviewTask,
            ] });
            expect(readinessInputFor(rerun, 'minutes', daysAfter(6)).polledAfterSummarize).toBe(false);
            const reversed = readinessFacts({ taskStatuses: [...rerun.taskStatuses].reverse() });
            expect(readinessInputFor(reversed, 'minutes', daysAfter(6)).polledAfterSummarize).toBe(false);
        });

        it('makes the due minutes of a pollable meeting wait for the poll, then go out', () => {
            const waiting = readinessFacts({ city: pollableCity, taskStatuses: [reviewTask, task('summarize', daysAfter(3))] });
            expect(evaluateReadiness('minutes', readinessInputFor(waiting, 'minutes', dueAt))).toEqual({ state: 'wait', reason: 'poll', dueAt: null });
            const polled = readinessFacts({ city: pollableCity, taskStatuses: [reviewTask, task('summarize', daysAfter(3)), task('pollDecisions', daysAfter(4))] });
            expect(evaluateReadiness('minutes', readinessInputFor(polled, 'minutes', dueAt))).toEqual({ state: 'incomplete', missingSubjectIds: ['s2'] });
        });
    });
});
