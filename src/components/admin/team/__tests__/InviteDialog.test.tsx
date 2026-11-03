import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GrantScopes } from '@/lib/db/grants';
import { toast } from '@/hooks/use-toast';
import { InviteDialog } from '../InviteDialog';

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));

const scopes: GrantScopes = {
    realms: ['greece', 'france'],
    cities: [{ id: 'athens', name: 'Athens', realm: 'greece' }, { id: 'paris', name: 'Paris', realm: 'france' }],
    bodies: [{ id: 'b1', name: 'Council', cityId: 'athens' }, { id: 'b2', name: 'Conseil', cityId: 'paris' }],
    parties: [],
};

let fetchMock: jest.Mock;
beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn(async () => ({ ok: true, status: 201, json: async () => ({ inviteEmailSent: true }) }));
    global.fetch = fetchMock as unknown as typeof fetch;
});

const postedBody = () => {
    const call = fetchMock.mock.calls.find(([url, init]) => url === '/api/admin/grants' && init?.method === 'POST');
    return JSON.parse(call?.[1].body);
};

describe('InviteDialog', () => {
    it('invites on a body of the chosen city', async () => {
        const onInvited = jest.fn();
        const onOpenChange = jest.fn();
        render(<InviteDialog open onOpenChange={onOpenChange} scopes={scopes} superadmin={false} onInvited={onInvited} />);

        expect(screen.queryByRole('option', { name: 'scopeKind.realm' })).not.toBeInTheDocument();
        await userEvent.type(screen.getByLabelText('dialog.email'), 'Clerk@Example.com');
        await userEvent.selectOptions(screen.getByLabelText('dialog.role'), 'records');
        await userEvent.selectOptions(screen.getByLabelText('dialog.scopeKind'), 'body');
        await userEvent.selectOptions(screen.getByLabelText('dialog.city'), 'athens');
        const bodyPicker = screen.getByLabelText('dialog.body');
        expect(screen.queryByRole('option', { name: 'Conseil' })).not.toBeInTheDocument();
        await userEvent.selectOptions(bodyPicker, 'b1');
        await userEvent.click(screen.getByRole('button', { name: 'dialog.submit' }));

        await waitFor(() => expect(onInvited).toHaveBeenCalled());
        expect(postedBody()).toEqual({ email: 'Clerk@Example.com', name: null, role: 'records', scope: { administrativeBodyId: 'b1' } });
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('lets a superadmin invite on a realm', async () => {
        render(<InviteDialog open onOpenChange={() => {}} scopes={scopes} superadmin onInvited={() => {}} />);
        await userEvent.type(screen.getByLabelText('dialog.email'), 'lead@example.com');
        await userEvent.type(screen.getByLabelText('dialog.name'), ' Lead ');
        await userEvent.selectOptions(screen.getByLabelText('dialog.scopeKind'), 'realm');
        await userEvent.selectOptions(screen.getByLabelText('dialog.realm'), 'france');
        await userEvent.click(screen.getByRole('button', { name: 'dialog.submit' }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(postedBody()).toEqual({ email: 'lead@example.com', name: 'Lead', role: 'admin', scope: { realm: 'france' } });
    });

    it('keeps the submit disabled until a scope is chosen', () => {
        render(<InviteDialog open onOpenChange={() => {}} scopes={scopes} superadmin={false} onInvited={() => {}} />);
        expect(screen.getByRole('button', { name: 'dialog.submit' })).toBeDisabled();
    });

    it('shows the copy of a refusal code inline', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'cap' }) });
        const onInvited = jest.fn();
        render(<InviteDialog open onOpenChange={() => {}} scopes={scopes} superadmin={false} onInvited={onInvited} />);
        await userEvent.type(screen.getByLabelText('dialog.email'), 'one@example.com');
        await userEvent.selectOptions(screen.getByLabelText('dialog.city'), 'athens');
        await userEvent.click(screen.getByRole('button', { name: 'dialog.submit' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('errors.cap');
        expect(onInvited).not.toHaveBeenCalled();
    });

    it('closes and warns when the role was given but the invite email failed', async () => {
        fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'g1', inviteEmailSent: false }) });
        const onInvited = jest.fn();
        render(<InviteDialog open onOpenChange={() => {}} scopes={scopes} superadmin={false} onInvited={onInvited} />);
        await userEvent.type(screen.getByLabelText('dialog.email'), 'new@example.com');
        await userEvent.selectOptions(screen.getByLabelText('dialog.city'), 'athens');
        await userEvent.click(screen.getByRole('button', { name: 'dialog.submit' }));
        await waitFor(() => expect(onInvited).toHaveBeenCalled());
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'dialog.emailFailed' }));
    });

    it('shows no warning when the email was sent, or when none was due', async () => {
        for (const inviteEmailSent of [true, null]) {
            fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'g1', inviteEmailSent }) });
            const onInvited = jest.fn();
            const { unmount } = render(<InviteDialog open onOpenChange={() => {}} scopes={scopes} superadmin={false} onInvited={onInvited} />);
            await userEvent.type(screen.getByLabelText('dialog.email'), 'one@example.com');
            await userEvent.selectOptions(screen.getByLabelText('dialog.city'), 'athens');
            await userEvent.click(screen.getByRole('button', { name: 'dialog.submit' }));
            await waitFor(() => expect(onInvited).toHaveBeenCalled());
            unmount();
        }
        expect(toast).not.toHaveBeenCalled();
    });

    // A rejected fetch (the network is down) must not leave the dialog silent.
    it('shows the generic error when the request does not reach the server', async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
        const onInvited = jest.fn();
        render(<InviteDialog open onOpenChange={() => {}} scopes={scopes} superadmin={false} onInvited={onInvited} />);
        await userEvent.type(screen.getByLabelText('dialog.email'), 'one@example.com');
        await userEvent.selectOptions(screen.getByLabelText('dialog.city'), 'athens');
        await userEvent.click(screen.getByRole('button', { name: 'dialog.submit' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('errorGeneric');
        expect(screen.getByRole('button', { name: 'dialog.submit' })).toBeEnabled();
        expect(onInvited).not.toHaveBeenCalled();
    });
});
