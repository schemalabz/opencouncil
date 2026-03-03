import { shouldSkipPolling, getBackoffState, BACKOFF_SCHEDULE, MAX_POLLING_DAYS } from '../pollDecisionsBackoff';

// Helper: create a Date that is `daysAgo` days before now
const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

describe('shouldSkipPolling', () => {
    describe('first poll (no history)', () => {
        it('allows polling when there is no history', () => {
            expect(shouldSkipPolling(null, null)).toBeNull();
        });
    });

    describe('week 1 (days 0-7): no backoff', () => {
        it.each([
            [0, 0, 'same day, just polled'],
            [1, 0, 'day 1, just polled'],
            [3, 0.01, 'day 3, polled minutes ago'],
            [6, 0, 'day 6, just polled'],
            [6.9, 0, 'end of day 6, just polled'],
        ])('allows polling at day %f since first poll (last poll %f days ago) — %s', (
            daysSinceFirst, daysSinceLast, _desc,
        ) => {
            expect(shouldSkipPolling(daysAgo(daysSinceFirst), daysAgo(daysSinceLast))).toBeNull();
        });
    });

    describe('week 2 (days 7-14): min interval 2 days', () => {
        it.each([
            [8, 3, true,  'day 8, last poll 3 days ago → allow'],
            [8, 2, true,  'day 8, last poll exactly 2 days ago → allow'],
            [8, 0, false, 'day 8, just polled → skip'],
            [8, 1, false, 'day 8, last poll 1 day ago → skip'],
            [10, 1.5, false, 'day 10, last poll 1.5 days ago → skip'],
            [10, 2.1, true, 'day 10, last poll 2.1 days ago → allow'],
            [13, 0, false, 'day 13, just polled → skip'],
        ])('day %f, last poll %f days ago, allowed=%s — %s', (
            daysSinceFirst, daysSinceLast, shouldAllow, _desc,
        ) => {
            const result = shouldSkipPolling(daysAgo(daysSinceFirst), daysAgo(daysSinceLast));
            if (shouldAllow) {
                expect(result).toBeNull();
            } else {
                expect(result).toContain('backoff');
            }
        });
    });

    describe('week 3 (days 14-21): min interval 3 days', () => {
        it.each([
            [15, 4, true,  'day 15, last poll 4 days ago → allow'],
            [15, 3, true,  'day 15, last poll exactly 3 days ago → allow'],
            [15, 2, false, 'day 15, last poll 2 days ago → skip'],
            [15, 0, false, 'day 15, just polled → skip'],
            [20, 2.5, false, 'day 20, last poll 2.5 days ago → skip'],
            [20, 3.1, true, 'day 20, last poll 3.1 days ago → allow'],
        ])('day %f, last poll %f days ago, allowed=%s — %s', (
            daysSinceFirst, daysSinceLast, shouldAllow, _desc,
        ) => {
            const result = shouldSkipPolling(daysAgo(daysSinceFirst), daysAgo(daysSinceLast));
            if (shouldAllow) {
                expect(result).toBeNull();
            } else {
                expect(result).toContain('backoff');
            }
        });
    });

    describe('week 4+ (days 21+): min interval 7 days', () => {
        it.each([
            [22, 8, true,  'day 22, last poll 8 days ago → allow'],
            [22, 7, true,  'day 22, last poll exactly 7 days ago → allow'],
            [22, 6, false, 'day 22, last poll 6 days ago → skip'],
            [22, 0, false, 'day 22, just polled → skip'],
            [50, 3, false, 'day 50, last poll 3 days ago → skip'],
            [50, 7, true,  'day 50, last poll 7 days ago → allow'],
            [60, 7, true,  'day 60, last poll 7 days ago → allow'],
        ])('day %f, last poll %f days ago, allowed=%s — %s', (
            daysSinceFirst, daysSinceLast, shouldAllow, _desc,
        ) => {
            const result = shouldSkipPolling(daysAgo(daysSinceFirst), daysAgo(daysSinceLast));
            if (shouldAllow) {
                expect(result).toBeNull();
            } else {
                expect(result).toContain('backoff');
            }
        });
    });

    describe('max polling days', () => {
        it(`stops after ${MAX_POLLING_DAYS} days`, () => {
            const result = shouldSkipPolling(daysAgo(MAX_POLLING_DAYS + 1), daysAgo(8));
            expect(result).toContain(`${MAX_POLLING_DAYS}-day`);
        });

        it(`allows polling just before ${MAX_POLLING_DAYS} days`, () => {
            const result = shouldSkipPolling(daysAgo(MAX_POLLING_DAYS - 1), daysAgo(8));
            expect(result).toBeNull();
        });
    });

    describe('backoff schedule is well-formed', () => {
        it('tiers are in ascending afterDays order', () => {
            for (let i = 1; i < BACKOFF_SCHEDULE.length; i++) {
                expect(BACKOFF_SCHEDULE[i].afterDays).toBeGreaterThan(BACKOFF_SCHEDULE[i - 1].afterDays);
            }
        });

        it('tiers have non-decreasing minIntervalDays', () => {
            for (let i = 1; i < BACKOFF_SCHEDULE.length; i++) {
                expect(BACKOFF_SCHEDULE[i].minIntervalDays).toBeGreaterThanOrEqual(BACKOFF_SCHEDULE[i - 1].minIntervalDays);
            }
        });

        it('first tier starts at day 0', () => {
            expect(BACKOFF_SCHEDULE[0].afterDays).toBe(0);
        });
    });
});

describe('getBackoffState', () => {
    describe('no history', () => {
        it('returns nulls when both dates are null', () => {
            expect(getBackoffState(null, null)).toEqual({
                currentTierLabel: null,
                nextPollEligible: null,
            });
        });

        it('returns nulls when firstPollAt is null', () => {
            expect(getBackoffState(null, daysAgo(1))).toEqual({
                currentTierLabel: null,
                nextPollEligible: null,
            });
        });

        it('returns nulls when lastPollAt is null', () => {
            expect(getBackoffState(daysAgo(1), null)).toEqual({
                currentTierLabel: null,
                nextPollEligible: null,
            });
        });
    });

    describe('week 1 (days 0-7): every cron run', () => {
        it('returns "Every cron run" with no next poll restriction', () => {
            const result = getBackoffState(daysAgo(3), daysAgo(0));
            expect(result.currentTierLabel).toBe('Every cron run');
            expect(result.nextPollEligible).toBeNull();
        });
    });

    describe('week 2 (days 7-14)', () => {
        it('returns week 2 tier label', () => {
            const result = getBackoffState(daysAgo(8), daysAgo(0));
            expect(result.currentTierLabel).toBe('Week 2: every 2d');
        });

        it('returns future next poll eligible when recently polled', () => {
            const result = getBackoffState(daysAgo(8), daysAgo(0));
            expect(result.nextPollEligible).not.toBeNull();
            expect(new Date(result.nextPollEligible!).getTime()).toBeGreaterThan(Date.now());
        });

        it('returns null next poll eligible when interval has passed', () => {
            const result = getBackoffState(daysAgo(8), daysAgo(3));
            expect(result.nextPollEligible).toBeNull();
        });
    });

    describe('week 3 (days 14-21)', () => {
        it('returns week 3 tier label', () => {
            const result = getBackoffState(daysAgo(15), daysAgo(0));
            expect(result.currentTierLabel).toBe('Week 3: every 3d');
        });
    });

    describe('week 4+ (days 21+)', () => {
        it('returns week 4 tier label', () => {
            const result = getBackoffState(daysAgo(25), daysAgo(0));
            expect(result.currentTierLabel).toBe('Week 4: every 7d');
        });
    });

    describe('max polling days exceeded', () => {
        it(`returns stopped label after ${MAX_POLLING_DAYS} days`, () => {
            const result = getBackoffState(daysAgo(MAX_POLLING_DAYS + 1), daysAgo(8));
            expect(result.currentTierLabel).toContain('Stopped');
            expect(result.currentTierLabel).toContain(`${MAX_POLLING_DAYS}`);
            expect(result.nextPollEligible).toBeNull();
        });

        it(`returns active tier just before ${MAX_POLLING_DAYS} days`, () => {
            const result = getBackoffState(daysAgo(MAX_POLLING_DAYS - 1), daysAgo(8));
            expect(result.currentTierLabel).not.toContain('Stopped');
        });
    });
});
