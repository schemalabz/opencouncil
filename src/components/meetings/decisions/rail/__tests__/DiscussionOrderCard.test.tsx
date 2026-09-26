import { render, screen } from '@testing-library/react';
import { DiscussionOrderCard, discussionGroups, isContiguous } from '../DiscussionOrderCard';
import type { MinutesData, MinutesSubject } from '@/lib/minutes/types';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, params?: Record<string, unknown>) =>
        params ? `${key}${JSON.stringify(params)}` : key,
    useLocale: () => 'el',
}));

function subjectWithStart(start: number | null): MinutesSubject {
    return {
        subjectId: 's', agendaItemIndex: 1, nonAgendaReason: null, withdrawn: false, name: 's',
        discussedWith: null, discussedElsewhere: null, decision: null, presidedBy: null, attendance: null, voteResult: null,
        preDiscussionEntries: [], transcriptEntries: [], discussion: { kind: start === null ? 'none' : 'discussed', seconds: 0, start },
    };
}

function data(o: Partial<MinutesData>): Pick<MinutesData, 'subjects' | 'discussionOrderLabel'> {
    return { subjects: [], discussionOrderLabel: null, ...o };
}

describe('DiscussionOrderCard', () => {
    it('prints the discussion-order label and marks it as differing from the agenda', () => {
        render(<DiscussionOrderCard data={data({ discussionOrderLabel: '1ο, 3ο, 2ο', subjects: [subjectWithStart(1)] })} />);
        expect(screen.getByText('1ο, 3ο, 2ο')).toBeInTheDocument();
        expect(screen.getByText('factsDiffersFromAgenda')).toBeInTheDocument();
    });

    it('says the order follows the agenda when a subject has a start and no label was set', () => {
        render(<DiscussionOrderCard data={data({ subjects: [subjectWithStart(100)] })} />);
        expect(screen.getByText('factsFollowsAgenda')).toBeInTheDocument();
    });

    it('says no discussion order was recorded when no subject has a start', () => {
        render(<DiscussionOrderCard data={data({ subjects: [subjectWithStart(null)] })} />);
        expect(screen.getByText('factsNoOrder')).toHaveClass('text-amber-700');
    });
});

describe('discussionGroups', () => {
    it('says which agenda items were taken together, as one group', () => {
        const subjects = [
            { subjectId: 'p', agendaItemIndex: 9, discussedInId: null },
            { subjectId: 'a', agendaItemIndex: 10, discussedInId: 'p' },
            { subjectId: 'b', agendaItemIndex: 11, discussedInId: 'p' },
            { subjectId: 'c', agendaItemIndex: 12, discussedInId: 'p' },
            { subjectId: 'd', agendaItemIndex: 13, discussedInId: 'p' },
        ];
        expect(discussionGroups(subjects)).toEqual([[9, 10, 11, 12, 13]]);
    });

    it('says nothing about grouping when every item stood on its own', () => {
        const subjects = [
            { subjectId: 'a', agendaItemIndex: 1, discussedInId: null },
            { subjectId: 'b', agendaItemIndex: 2, discussedInId: null },
        ];
        expect(discussionGroups(subjects)).toEqual([]);
    });

    it('groups the children even when the parent itself has no agenda item index', () => {
        const subjects = [
            { subjectId: 'p', agendaItemIndex: null, discussedInId: null },
            { subjectId: 'a', agendaItemIndex: 5, discussedInId: 'p' },
            { subjectId: 'b', agendaItemIndex: 6, discussedInId: 'p' },
        ];
        expect(discussionGroups(subjects)).toEqual([[5, 6]]);
    });

    it('keeps a group that skips items whole, in order', () => {
        const subjects = [
            { subjectId: 'p', agendaItemIndex: 3, discussedInId: null },
            { subjectId: 'b', agendaItemIndex: 9, discussedInId: 'p' },
            { subjectId: 'a', agendaItemIndex: 7, discussedInId: 'p' },
        ];
        expect(discussionGroups(subjects)).toEqual([[3, 7, 9]]);
        expect(isContiguous([3, 7, 9])).toBe(false);
        expect(isContiguous([3, 4, 5])).toBe(true);
    });

    it('returns two groups from one meeting, ordered by their first item', () => {
        const subjects = [
            { subjectId: 'p2', agendaItemIndex: 20, discussedInId: null },
            { subjectId: 'c2', agendaItemIndex: 21, discussedInId: 'p2' },
            { subjectId: 'p1', agendaItemIndex: 1, discussedInId: null },
            { subjectId: 'c1', agendaItemIndex: 2, discussedInId: 'p1' },
        ];
        expect(discussionGroups(subjects)).toEqual([[1, 2], [20, 21]]);
    });

    it('gives no sentence to a group whose two children share one agenda item index', () => {
        // Before dedup ran first, a raw count of 2 passed the "more than one
        // item" filter, then collapsed to one index — rendering as "item 3
        // to 3 discussed together", a range of one.
        const subjects = [
            { subjectId: 'a', agendaItemIndex: 3, discussedInId: 'p' },
            { subjectId: 'b', agendaItemIndex: 3, discussedInId: 'p' },
        ];
        expect(discussionGroups(subjects)).toEqual([]);
    });

    it('gives a subject that is nobody\'s parent and has no children no range of one', () => {
        const subjects = [
            { subjectId: 'solo', agendaItemIndex: 1, discussedInId: null },
            { subjectId: 'p', agendaItemIndex: 2, discussedInId: null },
            { subjectId: 'c', agendaItemIndex: 3, discussedInId: 'p' },
        ];
        expect(discussionGroups(subjects)).toEqual([[2, 3]]);
    });
});

describe('DiscussionOrderCard, discussedWith mapping', () => {
    it('lists a non-contiguous group instead of calling it a range', () => {
        // "3 έως 9" claims seven items were taken together; four of them were
        // not, and the reader has no way to tell from the table.
        const parent: MinutesSubject = { ...subjectWithStart(1), subjectId: 'p', agendaItemIndex: 3 };
        const child = (id: string, index: number): MinutesSubject => ({
            ...subjectWithStart(2),
            subjectId: id,
            agendaItemIndex: index,
            discussedWith: { id: 'p', name: 'p', agendaItemIndex: 3, nonAgendaReason: null },
        });
        render(<DiscussionOrderCard data={data({ subjects: [parent, child('c1', 7), child('c2', 9)] })} />);
        expect(screen.getByText('rail.discussedTogetherList{"items":"3, 7 και 9"}')).toBeInTheDocument();
    });

    it('maps a MinutesSubject-shaped discussedWith onto the parent it names', () => {
        const parent: MinutesSubject = { ...subjectWithStart(1), subjectId: 'p', agendaItemIndex: 5 };
        const child: MinutesSubject = {
            ...subjectWithStart(2),
            subjectId: 'c',
            agendaItemIndex: 6,
            discussedWith: { id: 'p', name: 'p', agendaItemIndex: 5, nonAgendaReason: null },
        };
        render(<DiscussionOrderCard data={data({ subjects: [parent, child] })} />);
        expect(screen.getByText('rail.discussedTogether{"first":5,"last":6}')).toBeInTheDocument();
    });
});
