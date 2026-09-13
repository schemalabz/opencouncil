import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SubjectEmbedDialog } from '../SubjectEmbedDialog';
jest.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }));
const writeText = jest.fn();
const target = { cityId: 'city', meetingId: 'meeting', subjectId: 'subject' };

describe('subject embed dialog', () => {
    beforeEach(() => { jest.clearAllMocks(); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } }); });
    it('loads no iframe while closed and keeps preview and snippet appearance synchronized', () => {
        const { rerender, container } = render(<SubjectEmbedDialog open={false} onOpenChange={jest.fn()} target={target} />);
        expect(container.querySelector('iframe')).toBeNull();
        rerender(<SubjectEmbedDialog open onOpenChange={jest.fn()} target={target} />);
        const preview = screen.getByTitle('embedTitle');
        expect(preview).toHaveAttribute('src', expect.stringContaining('mode=light'));
        fireEvent.click(screen.getByRole('button', { name: 'dark' }));
        expect(preview).toHaveAttribute('src', expect.stringContaining('mode=dark'));
        expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('&amp;mode=dark');
    });
    it('exposes clipboard errors and copies the current subject after navigation', async () => {
        writeText.mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce(undefined);
        const { rerender } = render(<SubjectEmbedDialog open onOpenChange={jest.fn()} target={target} />);
        fireEvent.click(screen.getByRole('button', { name: 'copyEmbed' }));
        await waitFor(() => expect(screen.getByText('embedCopyError')).toBeInTheDocument());
        rerender(<SubjectEmbedDialog open onOpenChange={jest.fn()} target={{ ...target, subjectId: 'new-subject' }} />);
        fireEvent.click(screen.getByRole('button', { name: 'copyEmbed' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'embedCopied' })).toBeInTheDocument());
        expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining('subjectId=new-subject'));
    });
});
