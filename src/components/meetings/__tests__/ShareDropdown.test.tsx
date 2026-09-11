import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ShareDropdown from '../ShareDropdown';
import { ShareProvider, useShare } from '@/contexts/ShareContext';

jest.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }));
let mockPathname = '/en/city/meeting/subjects/subject';
let mockSubjectId: string | undefined = 'subject';
let mockCurrentTime = 0;
jest.mock('next/navigation', () => ({ usePathname: () => mockPathname, useParams: () => ({ subjectId: mockSubjectId }) }));
jest.mock('../VideoProvider', () => ({ useVideo: () => ({ currentTime: mockCurrentTime }) }));
jest.mock('../CouncilMeetingDataContext', () => ({ useCouncilMeetingData: () => ({
    meeting: { id: 'meeting', cityId: 'city', released: true, name: 'Council meeting', name_en: 'Council meeting' },
    subjects: [{ id: 'subject', name: 'A safer square' }],
}) }));
jest.mock('posthog-js', () => ({ __loaded: false }));
jest.mock('../StoryTemplatePickerDialog', () => ({ __esModule: true, default: ({ open }: { open: boolean }) => open ? <div role="dialog" aria-label="meetingStory" /> : null }));
jest.mock('@/components/sharing/SubjectShareDialog', () => ({ SubjectShareDialog: ({ open }: { open: boolean }) => open ? <div role="dialog" aria-label="subjectStory" /> : null }));
jest.mock('@/components/embed/SubjectEmbedDialog', () => ({ SubjectEmbedDialog: ({ open }: { open: boolean }) => open ? <div role="dialog" aria-label="embed" /> : null }));

const writeText = jest.fn();
const nativeShare = jest.fn();
const subjectUrl = 'http://localhost/en/city/meeting/subjects/subject';

function Controls() {
    const { openShareDropdownAndCopy } = useShare();
    return <>
        <button onClick={() => openShareDropdownAndCopy(0)}>copyFromStart</button>
        <ShareDropdown cityId="city" meetingId="meeting" />
    </>;
}

function mount() {
    return render(<ShareProvider><Controls /></ShareProvider>);
}

async function openMenu() {
    fireEvent.keyDown(screen.getByRole('button', { name: 'title' }), { key: 'ArrowDown' });
    return screen.findByRole('menuitem', { name: 'copyLink' });
}

describe('meeting and subject sharing menu', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        writeText.mockReset().mockResolvedValue(undefined);
        nativeShare.mockReset().mockResolvedValue(undefined);
        mockPathname = '/en/city/meeting/subjects/subject';
        mockSubjectId = 'subject';
        mockCurrentTime = 0;
        window.history.replaceState({}, '', `${mockPathname}?contribution=contribution1#contribution-contribution1`);
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
        Object.defineProperty(navigator, 'share', { configurable: true, value: nativeShare });
    });

    it('copies the subject without an incoming contribution highlight and hides the raw URL', async () => {
        mount();
        const copy = await openMenu();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        expect(screen.getByText('A safer square')).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: 'storyTitle' })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: 'embedSubject' })).toBeInTheDocument();
        fireEvent.click(copy);
        await screen.findByRole('menuitem', { name: 'copied' });
        expect(writeText).toHaveBeenCalledWith(subjectUrl);
    });

    it('confirms copying only after the clipboard resolves', async () => {
        let resolveCopy: (() => void) | undefined;
        writeText.mockReturnValue(new Promise<void>(resolve => { resolveCopy = resolve; }));
        mount();
        fireEvent.click(await openMenu());
        expect(screen.queryByRole('menuitem', { name: 'copied' })).not.toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: 'share' })).toHaveAttribute('aria-disabled', 'true');
        resolveCopy!();
        await screen.findByRole('menuitem', { name: 'copied' });
    });

    it('offers a selectable link after a failed copy and clears the error on retry', async () => {
        writeText.mockRejectedValueOnce(new Error('Denied'));
        mount();
        fireEvent.click(await openMenu());
        expect(await screen.findByRole('textbox')).toHaveValue(subjectUrl);
        expect(screen.getByRole('alert')).toHaveTextContent('copyError');
        fireEvent.click(screen.getByRole('menuitem', { name: 'copyLink' }));
        await screen.findByRole('menuitem', { name: 'copied' });
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });
    it.each(['copyLink', 'share'])('ignores a stale %s result after closing and reopening', async action => {
        let rejectOld!: (reason: Error) => void;
        const old = new Promise<void>((_, reject) => { rejectOld = reject; });
        (action === 'copyLink' ? writeText : nativeShare).mockReturnValueOnce(old);
        mount();
        await openMenu();
        fireEvent.click(screen.getByRole('menuitem', { name: action }));
        fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
        const copy = await openMenu();
        expect(copy).not.toHaveAttribute('aria-disabled');
        fireEvent.click(copy);
        await screen.findByRole('menuitem', { name: 'copied' });
        await act(async () => { rejectOld(new Error('Old failure')); await old.catch(() => {}); });
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: 'copied' })).toBeInTheDocument();
    });

    it('shares the subject title and clean URL without treating cancellation as an error', async () => {
        nativeShare.mockRejectedValue(new DOMException('Cancelled', 'AbortError'));
        mount();
        await openMenu();
        fireEvent.click(screen.getByRole('menuitem', { name: 'share' }));
        await waitFor(() => expect(nativeShare).toHaveBeenCalledWith({ title: 'A safer square', url: subjectUrl }));
        await waitFor(() => expect(screen.getByRole('menuitem', { name: 'share' })).not.toHaveAttribute('aria-disabled'));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: 'copyLink' })).toBeInTheDocument();
    });

    it('provides the link as a fallback if native sharing fails', async () => {
        nativeShare.mockRejectedValue(new Error('Unavailable'));
        mount();
        await openMenu();
        fireEvent.click(screen.getByRole('menuitem', { name: 'share' }));
        expect(await screen.findByRole('textbox')).toHaveValue(subjectUrl);
    });

    it('supports keyboard access to destinations when native sharing is unavailable', async () => {
        Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
        mount();
        await openMenu();
        fireEvent.keyDown(screen.getByRole('menuitem', { name: 'share' }), { key: 'ArrowRight' });
        expect(await screen.findByRole('menuitem', { name: 'WhatsApp' })).toHaveAttribute('href', `https://wa.me/?text=${encodeURIComponent(`A safer square\n${subjectUrl}`)}`);
        expect(screen.getByRole('menuitem', { name: 'Facebook' })).toHaveAttribute('href', `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(subjectUrl)}`);
        expect(screen.getByRole('menuitem', { name: 'email' })).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('preserves zero for automatic timestamp copies and removes the timestamp when unchecked', async () => {
        mockPathname = '/en/city/meeting/transcript';
        mockSubjectId = undefined;
        window.history.replaceState({}, '', `${mockPathname}?textLocale=el&t=95`);
        mount();
        fireEvent.click(screen.getByRole('button', { name: 'copyFromStart' }));
        await screen.findByRole('menuitem', { name: 'copied' });
        expect(writeText).toHaveBeenCalledTimes(1);
        expect(writeText).toHaveBeenCalledWith('http://localhost/en/city/meeting/transcript?textLocale=el&t=0');
        const timestamp = screen.getByRole('menuitemcheckbox', { name: 'startFrom' });
        expect(timestamp).toHaveAttribute('aria-checked', 'true');
        fireEvent.click(timestamp);
        fireEvent.click(screen.getByRole('menuitem', { name: 'copyLink' }));
        await screen.findByRole('menuitem', { name: 'copied' });
        expect(writeText).toHaveBeenLastCalledWith('http://localhost/en/city/meeting/transcript?textLocale=el');
    });

    it.each([['storyTitle', 'subjectStory'], ['embedSubject', 'embed']])('closes the menu before opening %s', async (item, dialog) => {
        mount();
        await openMenu();
        fireEvent.click(screen.getByRole('menuitem', { name: item }));
        await screen.findByRole('dialog', { name: dialog });
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('retains the existing meeting Story picker outside subject pages', async () => {
        mockPathname = '/en/city/meeting';
        mockSubjectId = undefined;
        window.history.replaceState({}, '', mockPathname);
        mount();
        await openMenu();
        expect(screen.queryByRole('menuitem', { name: 'embedSubject' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('menuitem', { name: 'storyTitle' }));
        await screen.findByRole('dialog', { name: 'meetingStory' });
    });
});
