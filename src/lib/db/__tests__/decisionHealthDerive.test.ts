import {
    accumulateMeeting, bodyKey, classifyUnmatchedSubject, collectMeetingCandidateStats,
    compareBodyRows, compareDecisionNumbers, declaredCalendarDate, emptyCoverage,
    isInMeasurementWindow, meetingKey, nearestMeetingGapDays, subjectNameKey,
} from '../decisionHealthDerive';

describe('classifyUnmatchedSubject', () => {
    const subject = { cityId: 'city1', councilMeetingId: 'm1', name: 'Θέμα Α' };
    const stats = (hasRead: boolean, hasOpen: boolean) =>
        ({ hasReadCandidate: hasRead, hasOpenSessionCandidate: hasOpen });

    test('a linked identically named sibling wins over every other cause', () => {
        const twins = new Set([subjectNameKey('city1', 'm1', 'Θέμα Α')]);
        expect(classifyUnmatchedSubject(subject, twins, stats(true, true))).toBe('duplicateSubject');
    });

    test('twin keys are meeting-scoped: the same name elsewhere is no duplicate', () => {
        const twins = new Set([subjectNameKey('city1', 'm2', 'Θέμα Α')]);
        expect(classifyUnmatchedSubject(subject, twins, stats(false, false))).toBe('notProcessed');
    });

    test('no read candidate on the meeting means the pipeline has not processed it', () => {
        expect(classifyUnmatchedSubject(subject, new Set(), stats(false, false))).toBe('notProcessed');
        expect(classifyUnmatchedSubject(subject, new Set(), undefined)).toBe('notProcessed');
    });

    test('open session candidates make the gap ours to explain', () => {
        expect(classifyUnmatchedSubject(subject, new Set(), stats(true, true))).toBe('candidatesUnmatched');
    });

    test('a processed meeting with an exhausted pool is probably unpublished', () => {
        expect(classifyUnmatchedSubject(subject, new Set(), stats(true, false))).toBe('nothingFetched');
    });
});

describe('collectMeetingCandidateStats', () => {
    const base = { cityId: 'c', councilMeetingId: 'm', decisionId: null, dismissedAt: null };

    test('unread rows neither process a meeting nor open a candidate', () => {
        const stats = collectMeetingCandidateStats([{ ...base, readStatus: 'unread' }]);
        expect(stats.get(meetingKey('c', 'm'))).toEqual(
            { hasReadCandidate: false, hasOpenSessionCandidate: false });
    });

    test('a resolved read row processes the meeting without opening work', () => {
        const stats = collectMeetingCandidateStats([
            { ...base, decisionId: 'd1', readStatus: 'ok' },
            { ...base, readStatus: 'not_a_decision' },
        ]);
        expect(stats.get(meetingKey('c', 'm'))).toEqual(
            { hasReadCandidate: true, hasOpenSessionCandidate: false });
    });

    test('an unresolved read row opens session work', () => {
        const stats = collectMeetingCandidateStats([{ ...base, readStatus: 'ok' }]);
        expect(stats.get(meetingKey('c', 'm'))).toEqual(
            { hasReadCandidate: true, hasOpenSessionCandidate: true });
    });

    test('orphan rows (no meeting) contribute to no meeting stats', () => {
        const stats = collectMeetingCandidateStats([
            { ...base, councilMeetingId: null, readStatus: 'ok' }]);
        expect(stats.size).toBe(0);
    });
});

describe('compareDecisionNumbers', () => {
    test('sorts "2" before "10": numeric on the digits, not text', () => {
        expect(['10/2026', '2/2026'].sort(compareDecisionNumbers)).toEqual(['2/2026', '10/2026']);
    });

    test('digit-less values and nulls go last, text breaks remaining ties', () => {
        expect((['β', null, '5', 'α'] as Array<string | null>).sort(compareDecisionNumbers))
            .toEqual(['5', 'α', 'β', null]);
    });

    test('equal numeric keys fall back to the raw text', () => {
        expect(['7β', '7α'].sort(compareDecisionNumbers)).toEqual(['7α', '7β']);
    });
});

describe('nearestMeetingGapDays', () => {
    test('finds the smallest absolute gap in whole days', () => {
        expect(nearestMeetingGapDays('2026-05-10', ['2026-05-01', '2026-05-12'])).toBe(2);
        expect(nearestMeetingGapDays('2026-05-10', ['2026-05-10'])).toBe(0);
    });

    test('null when the city has no meetings at all', () => {
        expect(nearestMeetingGapDays('2026-05-10', [])).toBeNull();
    });
});

describe('isInMeasurementWindow', () => {
    const now = new Date('2026-09-01T12:00:00Z');

    test('the future never counts, in any view', () => {
        expect(isInMeasurementWindow(new Date('2026-09-01T12:00:01Z'), null, now)).toBe(false);
        expect(isInMeasurementWindow(new Date('2026-09-01T12:00:01Z'), 30, now)).toBe(false);
    });

    test('no window means no lower bound', () => {
        expect(isInMeasurementWindow(new Date('2000-01-01T00:00:00Z'), null, now)).toBe(true);
    });

    test('the window is a closed lower bound of sinceDays days', () => {
        expect(isInMeasurementWindow(new Date('2026-08-02T12:00:00Z'), 30, now)).toBe(true);
        expect(isInMeasurementWindow(new Date('2026-08-02T11:59:59Z'), 30, now)).toBe(false);
    });
});

describe('declaredCalendarDate', () => {
    test('reads the UTC calendar date of a midnight-UTC stored declaration', () => {
        expect(declaredCalendarDate(new Date('2026-03-15T00:00:00Z'))).toBe('2026-03-15');
    });
});

describe('accumulateMeeting', () => {
    test('an empty record holds zeros in every field and every taxonomy bucket', () => {
        expect(emptyCoverage()).toEqual({
            meetings: 0, polledMeetings: 0, eligibleSubjects: 0, linkedSubjects: 0, contentLinks: 0,
            unmatchedTaxonomy: { notProcessed: 0, candidatesUnmatched: 0, nothingFetched: 0, duplicateSubject: 0 },
        });
    });

    test('folds one meeting: counts, links, content and the cause of each unlinked subject', () => {
        const into = emptyCoverage();
        accumulateMeeting(into, {
            polled: true,
            subjects: [
                { linked: true, content: true },
                { linked: true, content: false },
                { linked: false, cause: 'nothingFetched' },
                { linked: false, cause: 'nothingFetched' },
                { linked: false, cause: 'duplicateSubject' },
            ],
        });
        expect(into).toEqual({
            meetings: 1, polledMeetings: 1, eligibleSubjects: 5, linkedSubjects: 2, contentLinks: 1,
            unmatchedTaxonomy: { notProcessed: 0, candidatesUnmatched: 0, nothingFetched: 2, duplicateSubject: 1 },
        });
    });

    test('the same measured meeting folds identically into two records', () => {
        const meeting = {
            polled: false,
            subjects: [{ linked: false as const, cause: 'notProcessed' as const }],
        };
        const city = emptyCoverage();
        const body = emptyCoverage();
        accumulateMeeting(city, meeting);
        accumulateMeeting(body, meeting);
        expect(body).toEqual(city);
        expect(city.polledMeetings).toBe(0);
        expect(city.unmatchedTaxonomy.notProcessed).toBe(1);
    });
});

describe('bodyKey', () => {
    test('the no-body bucket has its own key per city', () => {
        expect(bodyKey('c1', null)).not.toBe(bodyKey('c1', 'b1'));
        expect(bodyKey('c1', null)).not.toBe(bodyKey('c2', null));
        expect(bodyKey('c1', 'b1')).toBe(bodyKey('c1', 'b1'));
    });
});

describe('compareBodyRows', () => {
    const row = (type: 'council' | 'committee' | 'community', name: string) => ({ body: { type, name } });

    test('orders by type: council, committee, community; then by Greek name', () => {
        const rows = [
            row('community', '5η Κοινότητα'), row('committee', 'Δημοτική Επιτροπή'),
            row('council', 'Δημοτικό Συμβούλιο'), row('community', '1η Κοινότητα'),
        ];
        expect([...rows].sort(compareBodyRows).map(r => r.body.name)).toEqual([
            'Δημοτικό Συμβούλιο', 'Δημοτική Επιτροπή', '1η Κοινότητα', '5η Κοινότητα',
        ]);
    });

    test('the no-body row sorts last', () => {
        const rows = [{ body: null }, row('community', 'Κ')];
        expect([...rows].sort(compareBodyRows).map(r => r.body?.name ?? null)).toEqual(['Κ', null]);
    });
});
