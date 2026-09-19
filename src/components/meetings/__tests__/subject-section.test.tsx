import { render, screen, fireEvent } from '@testing-library/react';
import { SubjectSection } from '../subject-section';
import { captureEvent } from '@/lib/analytics/capture';

/**
 * The sort toggle's analytics mapping.
 *
 * Each of the two buttons used to hard-code its own event name beside its own
 * label. `InlineToggle` replaced them with one handler that derives the name
 * from the value, so inverting that ternary now swaps the two events with no
 * visible change to the page — the funnel would report the opposite of what
 * people did, and nothing would fail.
 */

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key,
}));

jest.mock('@/lib/analytics/capture', () => ({ captureEvent: jest.fn() }));

jest.mock('../CouncilMeetingDataContext', () => ({
    useCouncilMeetingData: () => ({
        city: { id: 'zografou' },
        meeting: { id: 'jul23_2026' },
    }),
}));

jest.mock('../../subject/SubjectRow', () => ({
    SubjectRow: ({ subject }: { subject: { id: string } }) => <div>row-{subject.id}</div>,
}));

const subjects = [{ id: 's1', name: 'Θέμα 1' }] as never;

function renderSection(sortMode: 'speakingTime' | 'agendaIndex' = 'speakingTime') {
    const onSortModeChange = jest.fn();
    render(
        <SubjectSection
            title="Ημερήσια διάταξη"
            explainerText=""
            subjects={subjects}
            sortMode={sortMode}
            onSortModeChange={onSortModeChange}
            showSortToggle
        />
    );
    return { onSortModeChange };
}

describe('SubjectSection sort toggle', () => {
    beforeEach(() => jest.clearAllMocks());

    it('reports sort_discussed for the most-discussed option', () => {
        const { onSortModeChange } = renderSection('agendaIndex');
        fireEvent.click(screen.getByText('sortByMostDiscussed'));
        expect(captureEvent).toHaveBeenCalledWith('meeting_page_action', {
            action: 'sort_discussed', city_id: 'zografou', meeting_id: 'jul23_2026',
        });
        expect(onSortModeChange).toHaveBeenCalledWith('speakingTime');
    });

    it('reports sort_agenda for the agenda-order option', () => {
        const { onSortModeChange } = renderSection('speakingTime');
        fireEvent.click(screen.getByText('sortByAgendaOrder'));
        expect(captureEvent).toHaveBeenCalledWith('meeting_page_action', {
            action: 'sort_agenda', city_id: 'zografou', meeting_id: 'jul23_2026',
        });
        expect(onSortModeChange).toHaveBeenCalledWith('agendaIndex');
    });

    it('still reports when the active option is clicked again', () => {
        // The two separate buttons fired on every click, including a re-select.
        renderSection('speakingTime');
        fireEvent.click(screen.getByText('sortByMostDiscussed'));
        expect(captureEvent).toHaveBeenCalledTimes(1);
    });
});
