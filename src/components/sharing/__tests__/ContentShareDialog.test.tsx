import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ContentShareDialog } from '../ContentShareDialog';

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
const writeText = jest.fn();
const nativeShare = jest.fn();
const props = { open: true, onOpenChange: jest.fn(), title: 'Share an excerpt', description: 'With its source', url: 'https://example.test/share/excerpt?source=1', sourceText: '«Exact words»\nAnna', copyTextLabel: 'Copy quote', children: <p>Exact words</p> };

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
        resolveCopy!();
        await waitFor(() => expect(screen.getByRole('button', { name: 'copied' })).toBeInTheDocument());
        expect(writeText).toHaveBeenCalledWith(props.url);
    });
    it('keeps a selectable fallback and allows retry when clipboard rejects', async () => {
        writeText.mockRejectedValueOnce(new Error('Denied')).mockResolvedValueOnce(undefined);
        render(<ContentShareDialog {...props} />);
        fireEvent.click(screen.getByRole('button', { name: 'Copy quote' }));
        await waitFor(() => expect(screen.getByText('copyError')).toBeInTheDocument());
        expect(screen.getByRole('textbox')).toHaveValue(props.url);
        expect(screen.queryByRole('button', { name: 'copied' })).not.toBeInTheDocument();
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

});
