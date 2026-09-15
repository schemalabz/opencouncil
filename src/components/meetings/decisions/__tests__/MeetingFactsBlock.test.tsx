import { render, screen } from '@testing-library/react';
import { MeetingFactsBlock } from '../MeetingFactsBlock';
import type { MinutesData, MinutesAttendanceChange, MinutesSubject } from '@/lib/minutes/types';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, params?: Record<string, unknown>) =>
        params ? `${key}${JSON.stringify(params)}` : key,
}));

const at = (id: string, agendaItemIndex: number | null, outOfAgendaIndex: number | null = null): MinutesAttendanceChange['atSubject'] =>
    ({ id, name: id, agendaItemIndex, nonAgendaReason: agendaItemIndex == null ? 'outOfAgenda' : null, outOfAgendaIndex });

function data(o: Partial<MinutesData>): MinutesData {
    return {
        city: { name: 'Δ', name_municipality: 'Δ', timezone: 'Europe/Athens', logoImage: null, realm: 'greece' },
        meeting: { id: 'm', cityId: 'c', name: 'Σ', dateTime: '2026-06-15T18:00:00.000Z' },
        administrativeBody: null, councilComposition: null, absentMembers: null, preambleEntries: [],
        attendanceChanges: [], discussionOrderLabel: null, proceduralVotes: [], subjects: [], epilogueEntries: [], ...o,
    };
}

function subjectWithStart(start: number | null): MinutesSubject {
    return {
        subjectId: 's', agendaItemIndex: 1, nonAgendaReason: null, withdrawn: false, name: 's',
        discussedWith: null, discussedElsewhere: null, decision: null, attendance: null, voteResult: null,
        preDiscussionEntries: [], transcriptEntries: [], discussion: { kind: start === null ? 'none' : 'discussed', seconds: 0, start },
    };
}

const dataWithChanges = data({
    attendanceChanges: [
        { personId: 'a', name: 'Α', type: 'arrival', atSubject: at('s1', 1) },
        { personId: 'b', name: 'Β', type: 'departure', atSubject: at('s7', 7) },
        { personId: 'c', name: 'Γ', type: 'departure', atSubject: at('s7', 7) },
    ],
    discussionOrderLabel: '1ο, 3ο, 2ο',
    proceduralVotes: [{ subjectId: 'oa', name: 'Κατεπείγον', agendaItemIndex: null, nonAgendaReason: 'outOfAgenda', kind: 'urgency', timestamp: 5 }],
});

describe('MeetingFactsBlock', () => {
    it('counts arrivals and departures per subject', () => {
        render(<MeetingFactsBlock data={dataWithChanges} />);
        expect(screen.getByText('factsArrivalAt{"n":1,"label":"#1"} · factsDepartureAt{"n":2,"label":"#7"}')).toBeInTheDocument();
    });
    it('prints the discussion-order label', () => {
        render(<MeetingFactsBlock data={dataWithChanges} />);
        expect(screen.getByText('1ο, 3ο, 2ο')).toBeInTheDocument();
    });
    it('marks the label as differing from the agenda', () => {
        render(<MeetingFactsBlock data={dataWithChanges} />);
        expect(screen.getByText('factsDiffersFromAgenda')).toBeInTheDocument();
    });
    it('prints the urgency-vote line', () => {
        render(<MeetingFactsBlock data={dataWithChanges} />);
        expect(screen.getByText('eventUrgencyVote{"subject":"categories.outOfAgenda.shortLabel Κατεπείγον"}')).toBeInTheDocument();
    });
    it('says the order follows the agenda when a subject has a start and prints none for empty lines', () => {
        render(<MeetingFactsBlock data={data({ subjects: [subjectWithStart(100)] })} />);
        expect(screen.getByText('factsFollowsAgenda')).toBeInTheDocument();
        expect(screen.getAllByText('factsNone')).toHaveLength(2);
    });
    it('says no discussion order was recorded when no subject has a start', () => {
        render(<MeetingFactsBlock data={data({ subjects: [subjectWithStart(null)] })} />);
        expect(screen.getByText('factsNoOrder')).toHaveClass('text-amber-700');
    });
});
