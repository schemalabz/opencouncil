import { captureEvent } from '@/lib/analytics/capture';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ContentShareDialog } from '../ContentShareDialog';

jest.mock('@/lib/analytics/capture', () => ({ captureEvent: jest.fn() }));

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
const writeText = jest.fn();
const nativeShare = jest.fn();
const props = { analytics: { content_type: 'excerpt' as const, surface: 'transcript_selection', city_id: 'city', meeting_id: 'meeting', locale: 'en' }, open: true, onOpenChange: jest.fn(), title: 'Share an excerpt', description: 'With its source', url: 'https://example.test/share/excerpt?source=1', sourceText: '«Exact words»\nAnna', copyTextLabel: 'Copy quote', children: <p>Exact words</p> };

describe('sharing clipboard and native outcomes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
        Object.defineProperty(navigator, 'share', { configurable: true, value: nativeShare });
    });
    it('reports successful copy only after the clipboard resolves', async () => {
        let resolveCopy: (() => void) | undefined;
        writeText.mockReturnValue(new Promise<void>(resolve => { resolveCopy = resolve; }));
        render(<ContentShareDialog {...props} />);
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'copyLink' }));
        expect(screen.queryByRole('button', { name: 'copied' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'share' })).toBeDisabled();
        expect(captureEvent).toHaveBeenCalledWith('sharing_action_started', expect.objectContaining({ ...props.analytics, action: 'copy_link' }));
        expect(captureEvent).not.toHaveBeenCalledWith('sharing_action_succeeded', expect.anything());
        resolveCopy!();
        await waitFor(() => expect(screen.getByRole('button', { name: 'copied' })).toBeInTheDocument());
        expect(writeText).toHaveBeenCalledWith(props.url);
        expect(captureEvent).toHaveBeenCalledWith('sharing_action_succeeded', expect.objectContaining({ ...props.analytics, action: 'copy_link' }));
    });
    it('keeps a selectable fallback and allows retry when clipboard rejects', async () => {
        writeText.mockRejectedValueOnce(new Error('Denied')).mockResolvedValueOnce(undefined);
        render(<ContentShareDialog {...props} />);
        fireEvent.click(screen.getByRole('button', { name: 'Copy quote' }));
        await waitFor(() => expect(screen.getByText('copyError')).toBeInTheDocument());
        expect(screen.getByRole('textbox')).toHaveValue(props.url);
        expect(screen.queryByRole('button', { name: 'copied' })).not.toBeInTheDocument();
        expect(captureEvent).toHaveBeenCalledWith('sharing_action_failed', expect.objectContaining({ action: 'copy_text' }));
        fireEvent.click(screen.getByRole('button', { name: 'Copy quote' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'copied' })).toBeInTheDocument());
        expect(writeText).toHaveBeenLastCalledWith(`${props.sourceText}\n\n${props.url}`);
    });
    it('ignores native share cancellation and shares attribution with its URL', async () => {
        nativeShare.mockRejectedValue(new DOMException('Cancelled', 'AbortError'));
        render(<ContentShareDialog {...props} />);
        fireEvent.click(screen.getByRole('button', { name: 'share' }));
        await waitFor(() => expect(nativeShare).toHaveBeenCalledWith({ title: props.title, text: props.sourceText, url: props.url }));
        expect(screen.queryByText('copyError')).not.toBeInTheDocument();
        await waitFor(() => expect(captureEvent).toHaveBeenCalledWith('sharing_action_cancelled', expect.objectContaining({ action: 'native_share' })));
        expect(captureEvent).not.toHaveBeenCalledWith('sharing_action_succeeded', expect.anything());
    });
    it('offers a small destination menu when native sharing is unavailable', async () => {
        Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
        render(<ContentShareDialog {...props} />);
        const trigger = screen.getByRole('button', { name: 'share' });
        fireEvent.keyDown(trigger, { key: 'ArrowDown' });
        const whatsapp = await screen.findByRole('menuitem', { name: 'WhatsApp' });
        expect(whatsapp).toHaveAttribute('href', `https://wa.me/?text=${encodeURIComponent(`${props.title}\n${props.url}`)}`);
        expect(screen.getByRole('menuitem', { name: 'Facebook' })).toHaveAttribute('rel', 'noopener noreferrer');
        expect(screen.getByRole('menuitem', { name: 'email' })).toHaveAttribute('href', `mailto:?subject=${encodeURIComponent(props.title)}&body=${encodeURIComponent(`${props.sourceText}\n\n${props.url}`)}`);
        expect(nativeShare).not.toHaveBeenCalled();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('counts opening once while state changes, then again on reopening', () => {
        const { rerender } = render(<ContentShareDialog {...props} />);
        rerender(<ContentShareDialog {...props} analytics={{ ...props.analytics }} />);
        const opens = () => (captureEvent as jest.Mock).mock.calls.filter(([event]) => event === 'sharing_opened');
        expect(opens()).toHaveLength(1);
        rerender(<ContentShareDialog {...props} open={false} />);
        rerender(<ContentShareDialog {...props} />);
        expect(opens()).toHaveLength(2);
    });

});
