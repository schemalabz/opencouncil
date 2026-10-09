import { createElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RosterImportDialog } from '../RosterImportDialog';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, values?: Record<string, string | number>) =>
        values ? `${key} ${Object.values(values).join(' ')}` : key,
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

const entry = { name: 'Ελένη Νέα', name_en: 'Eleni Nea', name_short: 'Ε. Νέα', name_short_en: 'E. Nea', roleName: null, roleName_en: null, isHead: false };
const fetchMock = jest.fn();
const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body });

/** Paste a list, let the parse answer with `startDate`, and come to the check step. */
async function readList(startDate: string | null) {
    fetchMock.mockReturnValueOnce(json({ entries: [entry], startDate }));
    render(createElement(RosterImportDialog, { cityId: 'chania', bodyId: 'youth' }));
    fireEvent.click(screen.getByRole('button', { name: 'importMembers' }));
    fireEvent.change(screen.getByPlaceholderText('importPlaceholder'), { target: { value: 'Ελένη Νέα' } });
    fireEvent.click(screen.getByRole('button', { name: 'importRead' }));
    return waitFor(() => screen.getByLabelText<HTMLInputElement>('importStartDate'));
}

async function confirmedBody() {
    fetchMock.mockReturnValueOnce(json({ created: 1, joined: 0, skipped: 0 }, 201));
    fireEvent.click(screen.getByRole('button', { name: 'importConfirm 1' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/cities/chania/administrative-bodies/youth/members');
    return JSON.parse(init.body);
}

beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
});

describe('RosterImportDialog, the start of the imported memberships', () => {
    it('offers the day the server would use, and sends no date when the admin keeps it', async () => {
        const input = await readList('2026-09-01T10:00:00.000Z');
        expect(input.value).toBe('2026-09-01');
        expect(await confirmedBody()).toEqual({ entries: [entry] });
    });

    it('sends the day that the admin gives', async () => {
        const input = await readList('2026-09-01T10:00:00.000Z');
        fireEvent.change(input, { target: { value: '2026-10-05' } });
        expect(await confirmedBody()).toEqual({ entries: [entry], startDate: new Date(2026, 9, 5).toISOString() });
    });

    it('leaves the day empty for a body whose roles never ended, and sends a day that the admin gives', async () => {
        const input = await readList(null);
        expect(input.value).toBe('');
        fireEvent.change(input, { target: { value: '2026-10-05' } });
        expect(await confirmedBody()).toEqual({ entries: [entry], startDate: new Date(2026, 9, 5).toISOString() });
    });
});
