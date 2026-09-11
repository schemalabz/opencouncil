import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StorySharePanel } from '../StorySharePanel';
import { ContentShareDialog } from '../ContentShareDialog';

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
const fetchImage = jest.fn();
const share = jest.fn();
const canShare = jest.fn();
const writeText = jest.fn();
const revoke = jest.fn();
const props = { imageUrl: '/api/share/story?type=contribution&id=c1&locale=el', url: 'https://opencouncil.gr/city/meeting/subjects/subject?contribution=c1#contribution-c1' };
const png = new Blob(['PNG fixture'], { type: 'image/png' });

beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(global, 'fetch', { configurable: true, value: fetchImage });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => 'blob:story-preview') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: canShare });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    fetchImage.mockResolvedValue({ ok: true, blob: async () => png });
    canShare.mockReturnValue(true);
    share.mockResolvedValue(undefined);
    writeText.mockResolvedValue(undefined);
});

it('prepares one PNG, shares only that file, and preserves the contribution link separately', async () => {
    render(<StorySharePanel {...props} />);
    expect(screen.getByRole('button', { name: 'storyShareImage' })).toBeDisabled();
    await screen.findByRole('img');
    expect(fetchImage).toHaveBeenCalledWith(props.imageUrl, expect.objectContaining({ cache: 'no-store' }));
    fireEvent.click(screen.getByRole('button', { name: 'copyLink' }));
    await screen.findByRole('button', { name: 'storyLinkCopied' });
    expect(writeText).toHaveBeenCalledWith(props.url);
    fireEvent.click(screen.getByRole('button', { name: 'storyShareImage' }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(Object.keys(share.mock.calls[0][0])).toEqual(['files']);
    const file = share.mock.calls[0][0].files[0];
    expect(file).toBeInstanceOf(File);
    expect(file).toMatchObject({ name: 'opencouncil-story.png', type: 'image/png', size: png.size });
    expect(canShare).toHaveBeenCalledWith({ files: [file] });
    expect(screen.getByRole('link', { name: 'storySave' })).toHaveAttribute('href', screen.getByRole('img').getAttribute('src'));
});

it('shows copied state only after success and keeps image sharing available on clipboard failure', async () => {
    let resolveCopy: (() => void) | undefined;
    writeText.mockReturnValueOnce(new Promise<void>(resolve => { resolveCopy = resolve; }));
    render(<StorySharePanel {...props} />);
    await screen.findByRole('img');
    fireEvent.click(screen.getByRole('button', { name: 'copyLink' }));
    expect(screen.queryByRole('button', { name: 'storyLinkCopied' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'storyShareImage' })).toBeDisabled();
    await act(async () => resolveCopy!());
    writeText.mockRejectedValueOnce(new Error('Clipboard denied'));
    fireEvent.click(screen.getByRole('button', { name: 'storyLinkCopied' }));
    await screen.findByText('copyError');
    expect(screen.getByRole('textbox')).toHaveValue(props.url);
    expect(screen.getByRole('button', { name: 'storyShareImage' })).toBeEnabled();
});

it.each([false, 'missing', 'throws'])('offers a save link when file sharing is unsupported: %s', async (support) => {
    if (support === 'missing') Object.defineProperty(navigator, 'canShare', { value: undefined });
    else if (support === 'throws') canShare.mockImplementationOnce(() => { throw new Error('Unavailable'); });
    else canShare.mockReturnValue(false);
    render(<StorySharePanel {...props} />);
    const save = await screen.findByRole('link', { name: 'storySave' });
    expect(save).toHaveAttribute('download', 'opencouncil-story.png');
    expect(screen.queryByRole('button', { name: 'storyShareImage' })).not.toBeInTheDocument();
    expect(screen.getByText('storySaveHint')).toBeInTheDocument();
});

it('treats cancelled sharing as cancellation and offers saving after other failures', async () => {
    share.mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError')).mockRejectedValueOnce(new Error('Rejected'));
    render(<StorySharePanel {...props} />);
    await screen.findByRole('img');
    fireEvent.click(screen.getByRole('button', { name: 'storyShareImage' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'storyShareImage' })).toBeEnabled());
    expect(screen.queryByText('storyShareError')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'storyShareImage' }));
    await screen.findByText('storyShareError');
    expect(screen.getByRole('link', { name: 'storySave' })).toBeInTheDocument();
});

it.each([[409, 'sourceChangedTitle'], [404, 'unavailableTitle']])('does not export an unavailable source (%s)', async (status, message) => {
    fetchImage.mockResolvedValue({ ok: false, status });
    render(<StorySharePanel {...props} />);
    await screen.findByText(message);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'storySave' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'storyShareImage' })).toBeDisabled();
});

it('recovers from a network error and releases the object URL when closed', async () => {
    fetchImage.mockRejectedValueOnce(new Error('Offline'));
    const { unmount } = render(<StorySharePanel {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'storyRetry' }));
    await screen.findByRole('img');
    unmount();
    expect(revoke).toHaveBeenCalledWith('blob:story-preview');
    expect(fetchImage.mock.calls.at(-1)[1].signal.aborted).toBe(true);
});

it('discards a late response from an old selection', async () => {
    let resolveOld: ((response: { ok: boolean; blob: () => Promise<Blob> }) => void) | undefined;
    fetchImage.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
    const { rerender } = render(<StorySharePanel {...props} />);
    rerender(<StorySharePanel {...props} imageUrl="/api/share/story?new-source" />);
    await screen.findByRole('img');
    await act(async () => resolveOld!({ ok: true, blob: async () => png }));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
});

it('loads the image only after selecting Story and resets the flow on reopening', async () => {
    const dialog = { open: true, onOpenChange: jest.fn(), title: 'Share', description: 'Description', url: props.url, sourceText: 'Quote', copyTextLabel: 'Copy text', storyImageUrl: props.imageUrl, children: <p>Selected source</p> };
    const { rerender } = render(<ContentShareDialog {...dialog} />);
    expect(fetchImage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'storyTitle' }));
    await screen.findByRole('img');
    fireEvent.click(screen.getByRole('button', { name: 'copyLink' }));
    await screen.findByRole('button', { name: 'storyLinkCopied' });
    fireEvent.click(screen.getByRole('button', { name: 'storyBack' }));
    expect(screen.getByText('Selected source')).toBeInTheDocument();
    rerender(<ContentShareDialog {...dialog} open={false} />);
    rerender(<ContentShareDialog {...dialog} />);
    expect(screen.getByRole('button', { name: 'storyTitle' })).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
});
