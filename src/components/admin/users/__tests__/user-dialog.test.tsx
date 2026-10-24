import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserWithAdministers } from '@/lib/db/types';
import { UserDialog } from '../user-dialog';

jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));
jest.mock('@/hooks/useLocalizedValidation', () => ({ useValidationMessage: () => (message: string) => message }));

const cityAdmin = {
    id: 'u1', email: 'city@example.com', name: 'City Admin', isSuperAdmin: false, isMachine: false,
    administers: [{ id: 'adm1', city: { id: 'athens', name: 'Athens' }, party: null, person: null, administrativeBody: null }],
} as unknown as UserWithAdministers;

const paola = {
    id: 'bot-1', email: 'paola@machines.opencouncil.invalid', name: 'Paola', isSuperAdmin: true, isMachine: true,
    administers: [],
} as unknown as UserWithAdministers;

let fetchMock: jest.Mock;
beforeEach(() => {
    fetchMock = jest.fn(async () => ({ ok: true, json: async () => [] }));
    global.fetch = fetchMock as unknown as typeof fetch;
});

const savedBody = () => {
    const call = fetchMock.mock.calls.find(([url, init]) => url === '/api/admin/users' && init?.method);
    return { method: call?.[1].method, body: JSON.parse(call?.[1].body) };
};

describe('UserDialog grants', () => {
    it('opens a create with no grants after an edit of an admin', async () => {
        const { rerender } = render(<UserDialog open user={cityAdmin} onOpenChange={() => {}} />);
        expect(await screen.findByText(/Athens/)).toBeInTheDocument();

        rerender(<UserDialog open={false} user={cityAdmin} onOpenChange={() => {}} />);
        rerender(<UserDialog open user={undefined} machine onOpenChange={() => {}} />);

        await screen.findByText('New machine account');
        await waitFor(() => expect(screen.queryByText(/Athens/)).not.toBeInTheDocument());
    });
});

describe('UserDialog for a machine account', () => {
    it('creates from a label, shows the address it gets, and sends no email', async () => {
        render(<UserDialog open machine onOpenChange={() => {}} />);
        await userEvent.type(screen.getByLabelText('Label'), 'Athens importer');
        expect(screen.getByText('athens-importer@machines.opencouncil.invalid')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
        await waitFor(() => expect(savedBody().method).toBe('POST'));
        expect(savedBody().body).toMatchObject({ isMachine: true, label: 'Athens importer' });
        expect(savedBody().body).not.toHaveProperty('email');
    });

    it('refuses a label with no Latin letter or digit before any request', async () => {
        render(<UserDialog open machine onOpenChange={() => {}} />);
        await userEvent.type(screen.getByLabelText('Label'), 'Παόλα');
        expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
    });

    it('edits the name and rights, shows the address as fixed text, and offers no delete', async () => {
        render(<UserDialog open user={paola} onOpenChange={() => {}} onDelete={() => {}} />);
        expect(screen.getByText('paola@machines.opencouncil.invalid')).toBeInTheDocument();
        expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
        await waitFor(() => expect(savedBody().method).toBe('PUT'));
        expect(savedBody().body).toMatchObject({ id: 'bot-1', name: 'Paola', isSuperAdmin: true });
        expect(savedBody().body).not.toHaveProperty('email');
    });
});
