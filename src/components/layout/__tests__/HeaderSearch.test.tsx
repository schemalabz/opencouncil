import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '../../../../messages/en.json';
import Header from '../Header';

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn() }),
    useSelectedLayoutSegment: () => null,
    usePathname: () => '/',
}));
jest.mock('../user-dropdown', () => ({ __esModule: true, default: () => null }));
jest.mock('../../ui/sidebar', () => ({ SidebarTrigger: () => null }));
// TopicIcon loads lucide-react/dynamic, which is ESM only under Jest; no topic shows here.
jest.mock('@/components/TopicIcon', () => ({ TopicIcon: () => null }));

function renderHeader() {
    render(
        <NextIntlClientProvider locale="en" messages={enMessages}>
            <Header path={[]} />
        </NextIntlClientProvider>
    );
    return screen.getByRole('button', { name: enMessages.Header.search });
}

it('closes the search dialog on Escape and returns the focus to the search button', async () => {
    const searchButton = renderHeader();

    fireEvent.click(searchButton);
    const dialog = await screen.findByRole('dialog', { name: enMessages.Header.search });
    expect(dialog).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(searchButton).toHaveFocus();
});

it('keeps the search dialog open on other keys', async () => {
    fireEvent.click(renderHeader());
    await screen.findByRole('dialog');

    fireEvent.keyDown(document, { key: 'a' });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
});

it('does not pass the Escape that closes the search on to window shortcuts', async () => {
    const windowShortcut = jest.fn();
    window.addEventListener('keydown', windowShortcut);
    fireEvent.click(renderHeader());
    await screen.findByRole('dialog');

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(windowShortcut).not.toHaveBeenCalled();
    window.removeEventListener('keydown', windowShortcut);
});
