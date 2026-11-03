import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GrantScopes } from '@/lib/db/grants';
import { toast } from '@/hooks/use-toast';
import { InviteDialog } from '../InviteDialog';

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));

// Radix Select reads pointer capture, which jsdom lacks.
beforeAll(() => {
    Element.prototype.hasPointerCapture = jest.fn(() => false);
    Element.prototype.releasePointerCapture = jest.fn();
});

const scopes: GrantScopes = {
    realms: ['greece', 'france'],
    cities: [{ id: 'athens', name: 'Athens', realm: 'greece' }, { id: 'paris', name: 'Paris', realm: 'france' }],
    bodies: [{ id: 'b1', name: 'Council', cityId: 'athens' }, { id: 'b2', name: 'Conseil', cityId: 'paris' }],
    parties: [{ id: 'p1', name: 'Greens', cityId: 'athens' }],
};
const athens = { id: 'athens', name: 'Athens' };

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

const pickRole = (role: string) => userEvent.click(screen.getByRole('radio', { name: new RegExp(`^role\\.${role}`) }));
const pickKind = (kind: string) => userEvent.click(screen.getByRole('radio', { name: `scopeKind.${kind}` }));
const pick = async (label: string, option: string) => {
    await userEvent.click(screen.getByLabelText(label));
    await userEvent.click(await screen.findByRole('option', { name: option }));
};
const submit = () => userEvent.click(screen.getByRole('button', { name: 'dialog.submit' }));

describe('InviteDialog', () => {
    it('invites on a body of the chosen city', async () => {
        const onInvited = jest.fn();
        const onOpenChange = jest.fn();
        render(<InviteDialog open onOpenChange={onOpenChange} scopes={scopes} superadmin={false} onInvited={onInvited} />);

        expect(screen.queryByRole('radio', { name: 'scopeKind.realm' })).not.toBeInTheDocument();
        await userEvent.type(screen.getByLabelText('dialog.email'), 'Clerk@Example.com');
        await pickRole('records');
        await pickKind('body');
        await pick('dialog.city', 'Athens');
        await userEvent.click(screen.getByLabelText('dialog.body'));
        expect(screen.queryByRole('option', { name: 'Conseil' })).not.toBeInTheDocument();
        await userEvent.click(await screen.findByRole('option', { name: 'Council' }));
        await submit();

        await waitFor(() => expect(onInvited).toHaveBeenCalledWith({ inviteEmailSent: true }));
        expect(postedBody()).toEqual({ email: 'Clerk@Example.com', name: null, role: 'records', scope: { administrativeBodyId: 'b1' } });
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('invites on a party, and forgets the pick when the city changes', async () => {
        render(<InviteDialog open onOpenChange={() => {}} scopes={scopes} superadmin={false} onInvited={() => {}} />);

        await userEvent.type(screen.getByLabelText('dialog.email'), 'one@example.com');
        await pickRole('viewer');
        await pickKind('party');
        await pick('dialog.city', 'Athens');
        await pick('dialog.party', 'Greens');
        expect(screen.getByRole('button', { name: 'dialog.submit' })).toBeEnabled();

        await pick('dialog.city', 'Paris');
        expect(screen.getByRole('button', { name: 'dialog.submit' })).toBeDisabled();
    });

    it('lets a superadmin invite on a realm', async () => {
        render(<InviteDialog open onOpenChange={() => {}} scopes={scopes} superadmin onInvited={() => {}} />);

        await userEvent.type(screen.getByLabelText('dialog.email'), 'lead@example.com');
        await userEvent.type(screen.getByLabelText('dialog.name'), ' Lead ');
        await pickRole('admin');
        await pickKind('realm');
        await userEvent.click(screen.getByLabelText('dialog.realm'));
        await userEvent.click((await screen.findAllByRole('option'))[1]);
        await submit();

        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(postedBody()).toEqual({ email: 'lead@example.com', name: 'Lead', role: 'admin', scope: { realm: 'france' } });
    });

    it('keeps the submit disabled until both a role and a scope are chosen', async () => {
        render(<InviteDialog open onOpenChange={() => {}} scopes={scopes} superadmin={false} onInvited={() => {}} />);
        const button = screen.getByRole('button', { name: 'dialog.submit' });

        expect(button).toBeDisabled();
        await pick('dialog.city', 'Athens');
        expect(button).toBeDisabled();
        await pickRole('meetings');
        expect(button).toBeEnabled();
    });

    it('names every role with what it carries', () => {
        render(<InviteDialog open onOpenChange={() => {}} scopes={scopes} superadmin={false} onInvited={() => {}} />);
        for (const role of ['admin', 'records', 'meetings', 'highlights', 'viewer']) {
            expect(screen.getByText(`roleHint.${role}`)).toBeInTheDocument();
        }
    });

    it('shows the copy of a refusal code inline', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'cap' }) });
        const onInvited = jest.fn();
        render(<InviteDialog open onOpenChange={() => {}} scopes={scopes} superadmin={false} onInvited={onInvited} />);

        await userEvent.type(screen.getByLabelText('dialog.email'), 'one@example.com');
        await pickRole('admin');
        await pick('dialog.city', 'Athens');
        await submit();

        expect(await screen.findByRole('alert')).toHaveTextContent('errors.cap');
        expect(onInvited).not.toHaveBeenCalled();
    });

    it('closes and warns when the role was given but the invite email failed', async () => {
        fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'g1', inviteEmailSent: false }) });
        const onInvited = jest.fn();
        render(<InviteDialog open onOpenChange={() => {}} scopes={scopes} superadmin={false} onInvited={onInvited} />);

        await userEvent.type(screen.getByLabelText('dialog.email'), 'new@example.com');
        await pickRole('admin');
        await pick('dialog.city', 'Athens');
        await submit();

        await waitFor(() => expect(onInvited).toHaveBeenCalled());
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'dialog.emailFailed' }));
    });

    it('shows no warning when the email was sent, or when none was due', async () => {
        for (const inviteEmailSent of [true, null]) {
            fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'g1', inviteEmailSent }) });
            const onInvited = jest.fn();
            const { unmount } = render(<InviteDialog open onOpenChange={() => {}} scopes={scopes} superadmin={false} onInvited={onInvited} />);
            await userEvent.type(screen.getByLabelText('dialog.email'), 'one@example.com');
            await pickRole('admin');
            await pick('dialog.city', 'Athens');
            await submit();
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
        await pickRole('admin');
        await pick('dialog.city', 'Athens');
        await submit();

        expect(await screen.findByRole('alert')).toHaveTextContent('errorGeneric');
        expect(screen.getByRole('button', { name: 'dialog.submit' })).toBeEnabled();
        expect(onInvited).not.toHaveBeenCalled();
    });

    describe('on the Team tab of a city', () => {
        const cityScopes: GrantScopes = { realms: [], cities: [{ id: 'athens', name: 'Athens', realm: 'greece' }], bodies: scopes.bodies.slice(0, 1), parties: scopes.parties };

        it('names the city instead of a picker, and invites on the whole of it', async () => {
            render(<InviteDialog open onOpenChange={() => {}} scopes={cityScopes} superadmin={false} city={athens} onInvited={() => {}} />);

            expect(screen.queryByLabelText('dialog.city')).not.toBeInTheDocument();
            expect(screen.getByText('dialog.wholeCity')).toBeInTheDocument();
            await userEvent.type(screen.getByLabelText('dialog.email'), 'one@example.com');
            await pickRole('highlights');
            await submit();

            await waitFor(() => expect(fetchMock).toHaveBeenCalled());
            expect(postedBody()).toEqual({ email: 'one@example.com', name: null, role: 'highlights', scope: { cityId: 'athens' } });
        });

        it('offers the bodies of the city without a city pick', async () => {
            render(<InviteDialog open onOpenChange={() => {}} scopes={cityScopes} superadmin={false} city={athens} onInvited={() => {}} />);

            await pickKind('body');
            await pick('dialog.body', 'Council');
            await userEvent.type(screen.getByLabelText('dialog.email'), 'one@example.com');
            await pickRole('records');
            await submit();

            await waitFor(() => expect(fetchMock).toHaveBeenCalled());
            expect(postedBody().scope).toEqual({ administrativeBodyId: 'b1' });
        });

        // A body admin holds no city: one kind, so no kind to choose.
        it('goes straight to the body picker for a body admin', () => {
            const bodyScopes: GrantScopes = { realms: [], cities: [], bodies: scopes.bodies.slice(0, 1), parties: [] };
            render(<InviteDialog open onOpenChange={() => {}} scopes={bodyScopes} superadmin={false} city={athens} onInvited={() => {}} />);

            expect(screen.queryByRole('radio', { name: /^scopeKind\./ })).not.toBeInTheDocument();
            expect(screen.getByLabelText('dialog.body')).toBeInTheDocument();
            expect(screen.queryByText('dialog.wholeCity')).not.toBeInTheDocument();
        });

        it('picks the only body, so a body admin chooses a role and sends', async () => {
            const bodyScopes: GrantScopes = { realms: [], cities: [], bodies: scopes.bodies.slice(0, 1), parties: [] };
            render(<InviteDialog open onOpenChange={() => {}} scopes={bodyScopes} superadmin={false} city={athens} onInvited={() => {}} />);

            await userEvent.type(screen.getByLabelText('dialog.email'), 'clerk@example.org');
            await pickRole('records');
            await submit();
            await waitFor(() => expect(fetchMock).toHaveBeenCalled());
            expect(postedBody().scope).toEqual({ administrativeBodyId: 'b1' });
        });
    });
});
