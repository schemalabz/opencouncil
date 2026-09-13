import { render, screen } from '@testing-library/react';
import { SubjectMinutesMeta } from '../SubjectMinutesMeta';
import type { MinutesSubject, MinutesMember, MinutesVoteResult } from '@/lib/minutes/types';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, params?: Record<string, unknown>) =>
        params ? `${key}${JSON.stringify(params)}` : key,
}));

const member: MinutesMember = { personId: 'p', name: 'n', party: null, isPartyHead: false, role: null };
const members = (n: number): MinutesMember[] => Array.from({ length: n }, () => member);

const unanimousVote: MinutesVoteResult = {
    forMembers: members(28),
    againstMembers: [],
    abstainMembers: [],
    presentMembers: [],
    didNotVoteMembers: [],
    absentMembers: [],
    passed: true,
    isUnanimous: true,
};

function subject(o: Partial<MinutesSubject>): MinutesSubject {
    return {
        subjectId: 's', agendaItemIndex: 1, nonAgendaReason: null, withdrawn: false, name: 's',
        discussedWith: null, discussedElsewhere: null, decision: null,
        attendance: { present: members(28), absent: members(3) },
        voteResult: unanimousVote,
        preDiscussionEntries: [], transcriptEntries: [], discussion: { kind: 'discussed', seconds: 300, start: 10 }, ...o,
    };
}
const show = (s: MinutesSubject, position: number | null = 2) => render(
    <SubjectMinutesMeta subject={s} position={position} />,
);

describe('SubjectMinutesMeta', () => {
    it('shows the position and the discussion length in minutes', () => {
        show(subject({}));
        expect(screen.getByText('metaPosition{"n":2}')).toBeInTheDocument();
        expect(screen.getByText('metaDiscussed{"minutes":5}')).toBeInTheDocument();
    });
    it('rounds a short discussion up to one minute', () => {
        show(subject({ discussion: { kind: 'discussed', seconds: 12, start: 10 } }));
        expect(screen.getByText('metaDiscussed{"minutes":1}')).toBeInTheDocument();
    });
    it('says vote only for a subject with VOTE utterances and no discussion, without a gap', () => {
        show(subject({ discussion: { kind: 'voteOnly', seconds: 0, start: 10 } }));
        expect(screen.getByText('metaVoteOnly')).not.toHaveClass('text-amber-700');
    });
    it('renders metaOtherUtterances without a gap and still shows the position', () => {
        show(subject({ discussion: { kind: 'other', seconds: 0, start: 10 } }));
        expect(screen.getByText('metaOtherUtterances')).not.toHaveClass('text-amber-700');
        expect(screen.getByText('metaPosition{"n":2}')).toBeInTheDocument();
    });
    it('marks a subject with no utterances as inferred and as a gap', () => {
        show(subject({ discussion: { kind: 'none', seconds: 0, start: null } }));
        expect(screen.getByText('metaPositionInferred').closest('span')).toHaveClass('text-amber-700');
        expect(screen.getByText('metaNoUtterances').closest('span')).toHaveClass('text-amber-700');
    });
    it('names the parent of a grouped subject with the agenda marker', () => {
        show(subject({ discussedWith: { id: 'p', name: 'Parent', agendaItemIndex: 3, nonAgendaReason: null } }));
        expect(screen.getByText('metaDiscussedWith{"label":"#3"}')).toBeInTheDocument();
    });
    it('derives the attendance and vote sentence from the subject', () => {
        show(subject({}));
        expect(screen.getByText('28/3')).toBeInTheDocument();
        expect(screen.getByText('unanimous{"count":28}')).toBeInTheDocument();
    });
    it('marks missing attendance and vote as gaps', () => {
        show(subject({ attendance: null, voteResult: null }));
        expect(screen.getByText('metaNoAttendance').closest('span')).toHaveClass('text-amber-700');
        expect(screen.getByText('metaNoVote').closest('span')).toHaveClass('text-amber-700');
    });
    it('renders nothing for a withdrawn subject', () => {
        const { container } = show(subject({ withdrawn: true }));
        expect(container).toBeEmptyDOMElement();
    });
});
