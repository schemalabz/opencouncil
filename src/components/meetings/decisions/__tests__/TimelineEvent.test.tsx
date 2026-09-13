import { render, screen } from '@testing-library/react';
import { TimelineEvent } from '../TimelineEvent';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, params?: Record<string, unknown>) =>
        params ? `${key}${JSON.stringify(params)}` : key,
}));

describe('TimelineEvent', () => {
    it('lists arrivals in green and departures in red', () => {
        render(<TimelineEvent item={{ type: 'attendance', atSubjectId: 'b', arrivals: ['Α'], departures: ['Β', 'Γ'] }} />);
        expect(screen.getByText('eventArrivals{"names":"Α","n":1}').closest('div')).toHaveClass('text-green-700');
        expect(screen.getByText('eventDepartures{"names":"Β, Γ","n":2}').closest('div')).toHaveClass('text-red-700');
    });
    it('names an urgency vote with the out-of-agenda marker and says it does not place the subject', () => {
        render(<TimelineEvent item={{ type: 'proceduralVote', vote: { subjectId: 'oa', name: 'Κατεπείγον', agendaItemIndex: null, nonAgendaReason: 'outOfAgenda', kind: 'urgency', timestamp: 5 } }} />);
        expect(screen.getByText('eventUrgencyVote{"subject":"categories.outOfAgenda.shortLabel Κατεπείγον"} — eventProceduralNote')).toBeInTheDocument();
    });
    it('names a procedural vote with the agenda number', () => {
        render(<TimelineEvent item={{ type: 'proceduralVote', vote: { subjectId: 's5', name: 'Θέμα', agendaItemIndex: 5, nonAgendaReason: null, kind: 'procedural', timestamp: 5 } }} />);
        expect(screen.getByText('eventProceduralVote{"subject":"#5 Θέμα"} — eventProceduralNote')).toBeInTheDocument();
    });
});
