import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReviewerInfo, ReviewListItem } from '@/lib/db/reviews';
import { ReviewerSelect } from '../ReviewerSelect';

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/lib/actions/reviews', () => ({ setMeetingReviewer: jest.fn() }));

const maria = { id: 'maria', name: 'Maria', email: 'maria@example.com' };
const superAdmins = [maria, { id: 'nikos', name: 'Nikos', email: 'nikos@example.com' }];

function editor(userId: string, editCount: number): ReviewerInfo {
    return { userId, userName: userId[0].toUpperCase() + userId.slice(1), userEmail: `${userId}@example.com`, editCount };
}

function renderRow(assignedReviewer: ReviewListItem['assignedReviewer'], reviewers: ReviewerInfo[]) {
    const review: ReviewListItem = {
        meetingId: 'm1',
        cityId: 'athens',
        cityName: 'Athens',
        administrativeBodyName: null,
        meetingName: 'Meeting',
        meetingDate: new Date('2026-10-01'),
        status: 'inProgress',
        totalUtterances: 100,
        reviewedUtterances: 10,
        userEditedUtterances: 10,
        taskEditedUtterances: 0,
        progressPercentage: 10,
        reviewers,
        primaryReviewer: reviewers[0] ?? null,
        assignedReviewer,
        firstEditAt: null,
        lastEditAt: null,
        meetingDurationMs: 0,
        reviewDurationMs: null,
        transcriptSent: false,
    };
    render(<ReviewerSelect review={review} superAdmins={superAdmins} />);
    return screen.getByRole('combobox');
}

describe('ReviewerSelect', () => {
    it('warns when the assigned person made the most edits but another person also edited', async () => {
        const trigger = renderRow(maria, [editor('maria', 30), editor('nikos', 10)]);

        expect(trigger).toHaveTextContent('Maria');
        expect(screen.getByLabelText('Others also edited')).toBeInTheDocument();
    });

    it('lists every other editor with an edit count on hover', async () => {
        const trigger = renderRow(maria, [editor('nikos', 40), editor('eleni', 5), editor('maria', 1)]);

        await userEvent.hover(trigger);

        const tooltip = await screen.findByRole('tooltip');
        expect(tooltip).toHaveTextContent('Nikos: 40 edits');
        expect(tooltip).toHaveTextContent('Eleni: 5 edits');
        expect(tooltip).not.toHaveTextContent('Maria');
    });

    it('does not warn when nobody besides the assigned person edited', () => {
        renderRow(maria, [editor('maria', 12)]);

        expect(screen.queryByLabelText('Others also edited')).not.toBeInTheDocument();
    });

    it('shows the primary reviewer as "by edits" without a warning when nobody is assigned', () => {
        const trigger = renderRow(null, [editor('nikos', 40), editor('eleni', 5)]);

        expect(trigger).toHaveTextContent('Nikos');
        expect(trigger).toHaveTextContent('by edits');
        expect(trigger).toHaveClass('text-muted-foreground');
        expect(screen.queryByLabelText('Others also edited')).not.toBeInTheDocument();
    });
});
