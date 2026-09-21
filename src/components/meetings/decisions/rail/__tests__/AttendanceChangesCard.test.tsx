import { render, screen, fireEvent } from '@testing-library/react';
import { AttendanceChangesCard } from '../AttendanceChangesCard';
import type { TimelineItem } from '../../timeline';
import type { MinutesAttendanceChange, MinutesSubject } from '@/lib/minutes/types';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, params?: Record<string, unknown>) =>
        params ? `${key}${JSON.stringify(params)}` : key,
}));

type Presence = Extract<TimelineItem, { type: 'presence' }>;

const presence = (o: Partial<Presence>): Presence => ({
    type: 'presence', atSubjectId: 's', observedAtId: o.atSubjectId ?? 's', arrivals: [], departures: [], ...o,
});

function subject(id: string, agendaItemIndex: number): MinutesSubject {
    return {
        subjectId: id, agendaItemIndex, nonAgendaReason: null, withdrawn: false, name: id,
        discussedWith: null, discussedElsewhere: null, decision: null, attendance: null, voteResult: null,
        preDiscussionEntries: [], transcriptEntries: [], discussion: { kind: 'discussed', seconds: 0, start: 1 },
    };
}

const subjects = [subject('s1', 1), subject('s2', 2), subject('s3', 3), subject('s4', 4)];

describe('AttendanceChangesCard', () => {
    it('shows factsNone when there are no changes', () => {
        render(<AttendanceChangesCard changes={[]} subjects={subjects} />);
        expect(screen.getByText('factsNone')).toBeInTheDocument();
    });

    it('renders an arrival line in green with the names and the subject label', () => {
        const changes = [presence({ atSubjectId: 's1', arrivals: ['Α'] })];
        render(<AttendanceChangesCard changes={changes} subjects={subjects} />);
        const plus = screen.getByText('+');
        expect(plus).toHaveClass('text-green-700', 'font-mono');
        expect(screen.getByText(/Α/)).toHaveTextContent('factsChangeAt{"label":"#1"}');
    });

    it('labels a line with the agenda item where the change was actually observed, not the group anchor', () => {
        const changes = [presence({ atSubjectId: 's1', observedAtId: 's2', arrivals: ['Α'] })];
        render(<AttendanceChangesCard changes={changes} subjects={subjects} />);
        expect(screen.getByText(/Α/)).toHaveTextContent('factsChangeAt{"label":"#2"}');
    });

    it('gives two changes observed at two children of one group two separate lines, each with its own label', () => {
        const changes = [
            presence({ atSubjectId: 's1', observedAtId: 's2', arrivals: ['Α'] }),
            presence({ atSubjectId: 's1', observedAtId: 's3', arrivals: ['Β'] }),
        ];
        render(<AttendanceChangesCard changes={changes} subjects={subjects} />);
        expect(screen.getByText(/Α/)).toHaveTextContent('factsChangeAt{"label":"#2"}');
        expect(screen.getByText(/Β/)).toHaveTextContent('factsChangeAt{"label":"#3"}');
    });

    it('renders a departure line in red', () => {
        const changes = [presence({ atSubjectId: 's1', departures: ['Β'] })];
        render(<AttendanceChangesCard changes={changes} subjects={subjects} />);
        const minus = screen.getByText('−');
        expect(minus).toHaveClass('text-red-700', 'font-mono');
    });

    it('renders both an arrival and a departure line for one change point', () => {
        const changes = [presence({ atSubjectId: 's1', arrivals: ['Α'], departures: ['Β'] })];
        render(<AttendanceChangesCard changes={changes} subjects={subjects} />);
        expect(screen.getByText('+')).toBeInTheDocument();
        expect(screen.getByText('−')).toBeInTheDocument();
    });

    it('shows only the first three lines and offers an expander for the rest', () => {
        const changes = [
            presence({ atSubjectId: 's1', arrivals: ['Α'] }),
            presence({ atSubjectId: 's2', arrivals: ['Β'] }),
            presence({ atSubjectId: 's3', arrivals: ['Γ'] }),
            presence({ atSubjectId: 's4', arrivals: ['Δ'] }),
        ];
        render(<AttendanceChangesCard changes={changes} subjects={subjects} />);
        expect(screen.getByText(/Α/)).toBeInTheDocument();
        expect(screen.getByText(/Γ/)).toBeInTheDocument();
        expect(screen.queryByText(/Δ/)).not.toBeInTheDocument();
        expect(screen.getByText('factsMore{"n":1}')).toBeInTheDocument();
    });

    it('shows the sentence a document states a change in, on hover', () => {
        const changes = [presence({ atSubjectId: 's1', departures: ['Α'] })];
        const attendanceChanges: MinutesAttendanceChange[] = [{
            personId: 'p1', name: 'Α', type: 'departure', rawText: 'αποχώρησε στην 286 ΑΚΣ',
            atSubject: { id: 's1', name: 's1', agendaItemIndex: 1, nonAgendaReason: null, outOfAgendaIndex: null },
        }];
        render(<AttendanceChangesCard changes={changes} subjects={subjects} attendanceChanges={attendanceChanges} />);
        expect(screen.getByText(/Α/).closest('div')).toHaveAttribute('title', 'αποχώρησε στην 286 ΑΚΣ');
    });

    it('leaves a line reconstructed from attendance diffs without a hover', () => {
        const changes = [presence({ atSubjectId: 's1', departures: ['Α'] })];
        render(<AttendanceChangesCard changes={changes} subjects={subjects} />);
        expect(screen.getByText(/Α/).closest('div')).not.toHaveAttribute('title');
    });

    it('reveals the rest of the lines when the expander is clicked', () => {
        const changes = [
            presence({ atSubjectId: 's1', arrivals: ['Α'] }),
            presence({ atSubjectId: 's2', arrivals: ['Β'] }),
            presence({ atSubjectId: 's3', arrivals: ['Γ'] }),
            presence({ atSubjectId: 's4', arrivals: ['Δ'] }),
        ];
        render(<AttendanceChangesCard changes={changes} subjects={subjects} />);
        fireEvent.click(screen.getByText('factsMore{"n":1}'));
        expect(screen.getByText(/Δ/)).toBeInTheDocument();
    });
});
