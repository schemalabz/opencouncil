import { fireEvent, render, screen } from '@testing-library/react';
import CommentList from './CommentList';
import type { ConsultationCommentWithUpvotes } from '@/lib/db/consultations';

const push = jest.fn();
jest.mock('@/i18n/routing', () => ({
    useRouter: () => ({ push }),
}));
jest.mock('@/components/RelativeTime', () => ({ RelativeTime: () => null }));
// sanitize-html ships ESM that Jest does not transform. The comment body here is fixed test data.
jest.mock('@/lib/utils/sanitize', () => ({ getSafeCommentHtml: (body: string) => body }));
jest.mock('../analytics', () => ({ captureConsultationResponsePublished: jest.fn() }));

const comment: ConsultationCommentWithUpvotes = {
    id: 'c1',
    body: '<p>Περισσότερα δέντρα</p>',
    entityType: 'GEOMETRY',
    entityId: 'g1',
    createdAt: new Date('2026-10-01T10:00:00Z'),
    updatedAt: new Date('2026-10-01T10:00:00Z'),
    userId: 'u2',
    consultationId: 'k1',
    cityId: 'athens',
    user: { id: 'u2', name: 'Μαρία' },
    upvoteCount: 3,
    hasUserUpvoted: false,
    response: null,
};

function renderList(props: Partial<React.ComponentProps<typeof CommentList>> = {}) {
    return render(<CommentList comments={[comment]} onUpvoted={jest.fn()} onDeleted={jest.fn()} {...props} />);
}

describe('CommentList agree button', () => {
    const fetchMock = jest.fn();

    beforeEach(() => {
        push.mockReset();
        fetchMock.mockReset();
        global.fetch = fetchMock;
        window.history.replaceState(null, '', '/en/athens/consultation/k1?view=comment&entity=g1#comments');
    });

    it('sends a signed-out reader to sign in and back to the same view', () => {
        renderList();
        const button = screen.getByRole('button', { name: /Συμφωνώ/ });
        expect(button).toBeEnabled();

        fireEvent.click(button);

        expect(push).toHaveBeenCalledWith(
            `/sign-in?callbackUrl=${encodeURIComponent('/en/athens/consultation/k1?view=comment&entity=g1#comments')}`
        );
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('asks before the sign-in throws away an unsent comment', () => {
        const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
        renderList({ hasDraft: true });

        fireEvent.click(screen.getByRole('button', { name: /Συμφωνώ/ }));

        expect(confirmSpy).toHaveBeenCalled();
        expect(push).not.toHaveBeenCalled();
        confirmSpy.mockRestore();
    });

    it('records the agreement for a signed-in reader', async () => {
        const onUpvoted = jest.fn();
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({ upvoted: true, upvoteCount: 4 }) });
        renderList({ currentUserId: 'u1', onUpvoted });

        fireEvent.click(screen.getByRole('button', { name: /Συμφωνώ/ }));

        expect(fetchMock).toHaveBeenCalledWith('/api/consultations/comments/c1/upvote', { method: 'POST' });
        expect(push).not.toHaveBeenCalled();
        await screen.findByRole('button', { name: /Συμφωνώ/ });
        expect(onUpvoted).toHaveBeenCalledWith('c1', { upvoteCount: 4, hasUserUpvoted: true });
    });
});
