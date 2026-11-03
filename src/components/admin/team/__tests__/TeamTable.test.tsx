import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GrantRow, GrantScopes } from '@/lib/db/grants';
import { TeamTable } from '../TeamTable';

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
const toast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ toast: (args: unknown) => toast(args) }));

const base = {
    realm: null, cityId: null, partyId: null, personId: null, administrativeBodyId: null,
    claimedAt: null, acceptedAt: new Date('2026-10-01'), revokedAt: null, createdAt: new Date('2026-10-01'),
    grantedBy: { id: 'u0', name: 'Mayor', email: 'mayor@example.com' }, revokedBy: null,
    city: null, administrativeBody: null, party: null, person: null,
};
const cityGrant: GrantRow = {
    ...base, id: 'g1', role: 'admin', cityId: 'athens', city: { id: 'athens', name: 'Athens' },
    user: { id: 'u1', email: 'anna@example.com', name: 'Anna', isMachine: false }, status: 'active',
};
const bodyInvite: GrantRow = {
    ...base, id: 'g2', role: 'records', administrativeBodyId: 'b1', acceptedAt: null,
    administrativeBody: { id: 'b1', name: 'Council', cityId: 'athens', city: { name: 'Athens' } },
    user: { id: 'u2', email: 'nobody@example.com', name: null, isMachine: false }, status: 'pending',
};
const expiredInvite: GrantRow = {
    ...base, id: 'g5', role: 'viewer', cityId: 'athens', city: { id: 'athens', name: 'Athens' }, acceptedAt: null,
    user: { id: 'u5', email: 'late@example.com', name: 'Late', isMachine: false }, status: 'expired',
};
const revokedGrant: GrantRow = {
    ...base, id: 'g3', role: 'viewer', cityId: 'athens', city: { id: 'athens', name: 'Athens' },
    revokedAt: new Date('2026-10-02'), revokedBy: { id: 'u0', name: 'Mayor' },
    user: { id: 'u3', email: 'gone@example.com', name: 'Gone', isMachine: false }, status: 'revoked',
};
const scopes: GrantScopes = {
    realms: ['greece'],
    cities: [{ id: 'athens', name: 'Athens', realm: 'greece' }],
    bodies: [{ id: 'b1', name: 'Council', cityId: 'athens' }],
    parties: [],
};
const athens = { id: 'athens', name: 'Athens' };

const rowOf = (text: string) => screen.getByText(text).closest('tr')!;
const requestOf = (method: string) => fetchMock.mock.calls.find(([, init]) => init?.method === method);

let fetchMock: jest.Mock;
beforeEach(() => {
    toast.mockClear();
    fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => [] }));
    global.fetch = fetchMock as unknown as typeof fetch;
});

describe('TeamTable', () => {
    it('splits the rows into members and invitations, and keeps the history out of sight', () => {
        render(<TeamTable grants={[cityGrant, bodyInvite, expiredInvite, revokedGrant]} scopes={scopes} superadmin={false} />);

        expect(screen.getByRole('heading', { level: 1, name: 'title' })).toBeInTheDocument();
        const member = rowOf('Anna');
        expect(within(member).getByText('anna@example.com')).toBeInTheDocument();
        expect(within(member).getByText('Athens')).toBeInTheDocument();
        expect(within(member).getByText('scopeKind.city')).toBeInTheDocument();
        expect(within(member).getByText('role.admin')).toHaveAttribute('title', 'roleHint.admin');
        expect(within(member).getByRole('button', { name: 'revoke.action' })).toBeInTheDocument();

        const invite = rowOf('nobody@example.com');
        expect(within(invite).getByText('Council')).toBeInTheDocument();
        expect(within(invite).getByText('scopeKind.body · Athens')).toBeInTheDocument();
        expect(within(invite).getByText('expires')).toBeInTheDocument();
        expect(within(invite).getByRole('button', { name: 'resend.action' })).toBeInTheDocument();
        expect(within(invite).getByRole('button', { name: 'withdraw.action' })).toBeInTheDocument();

        expect(within(rowOf('Late')).getByText('status.expired')).toBeInTheDocument();
        expect(screen.queryByText('Gone')).not.toBeInTheDocument();
        expect(screen.queryByText('empty')).not.toBeInTheDocument();
    });

    it('shows the history on request, with no action on its rows', async () => {
        fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [cityGrant, revokedGrant] });
        render(<TeamTable grants={[cityGrant]} scopes={scopes} superadmin={false} />);

        await userEvent.click(screen.getByRole('switch'));

        expect(fetchMock).toHaveBeenCalledWith('/api/admin/grants?includeRevoked=1');
        const row = (await screen.findByText('Gone')).closest('tr')!;
        expect(within(row).getByText(/status\.revoked/)).toBeInTheDocument();
        expect(within(row).queryByRole('button')).not.toBeInTheDocument();
    });

    it('names a withdrawn invite in the history', async () => {
        const withdrawn: GrantRow = { ...revokedGrant, acceptedAt: null };
        fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [withdrawn] });
        render(<TeamTable grants={[]} scopes={scopes} superadmin={false} />);

        await userEvent.click(screen.getByRole('switch'));

        expect(await screen.findByText(/inviteWithdrawn/)).toBeInTheDocument();
    });

    it('says when the history is empty', async () => {
        render(<TeamTable grants={[cityGrant]} scopes={scopes} superadmin={false} />);
        await userEvent.click(screen.getByRole('switch'));
        expect(await screen.findByText('historyEmpty')).toBeInTheDocument();
    });

    it('revokes a role after a confirmation that names the row', async () => {
        render(<TeamTable grants={[cityGrant]} scopes={scopes} superadmin={false} />);

        await userEvent.click(screen.getByRole('button', { name: 'revoke.action' }));
        expect(await screen.findByText('Anna · role.admin · Athens')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'revoke.title' }));

        await waitFor(() => expect(requestOf('DELETE')).toBeDefined());
        expect(JSON.parse(requestOf('DELETE')?.[1].body)).toEqual({ grantId: 'g1' });
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/grants'));
        expect(toast).toHaveBeenCalledWith({ title: 'revoke.done' });
    });

    it('withdraws an invite with its own confirmation', async () => {
        render(<TeamTable grants={[bodyInvite]} scopes={scopes} superadmin={false} />);

        await userEvent.click(screen.getByRole('button', { name: 'withdraw.action' }));
        await userEvent.click(await screen.findByRole('button', { name: 'withdraw.title' }));

        await waitFor(() => expect(requestOf('DELETE')).toBeDefined());
        expect(JSON.parse(requestOf('DELETE')?.[1].body)).toEqual({ grantId: 'g2' });
        await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'withdraw.done' }));
    });

    it('resends an invite with the same role on the same scope', async () => {
        fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
            init?.method === 'POST'
                ? { ok: true, status: 201, json: async () => ({ ...bodyInvite, inviteEmailSent: true }) }
                : { ok: true, status: 200, json: async () => [bodyInvite] });
        render(<TeamTable grants={[bodyInvite]} scopes={scopes} superadmin={false} />);

        await userEvent.click(screen.getByRole('button', { name: 'resend.action' }));

        await waitFor(() => expect(requestOf('POST')).toBeDefined());
        expect(JSON.parse(requestOf('POST')?.[1].body)).toEqual({
            email: 'nobody@example.com', name: null, role: 'records', scope: { administrativeBodyId: 'b1' },
        });
        await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'resend.done' }));
    });

    it('warns when the resent invite email did not go out', async () => {
        fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
            init?.method === 'POST'
                ? { ok: true, status: 201, json: async () => ({ ...bodyInvite, inviteEmailSent: false }) }
                : { ok: true, status: 200, json: async () => [bodyInvite] });
        render(<TeamTable grants={[bodyInvite]} scopes={scopes} superadmin={false} />);

        await userEvent.click(screen.getByRole('button', { name: 'resend.action' }));

        await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'dialog.emailFailed', variant: 'destructive' }));
    });

    it('explains a refused revoke with the copy of its code', async () => {
        fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
            init?.method === 'DELETE'
                ? { ok: false, status: 400, json: async () => ({ error: 'last-admin' }) }
                : { ok: true, status: 200, json: async () => [] });
        render(<TeamTable grants={[cityGrant]} scopes={scopes} superadmin={false} />);

        await userEvent.click(screen.getByRole('button', { name: 'revoke.action' }));
        await userEvent.click(await screen.findByRole('button', { name: 'revoke.title' }));

        await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'revoke.failed', description: 'errors.last-admin' })));
    });

    it('offers no action on a claimed row, or on a realm or a person grant of a realm admin', () => {
        const claimed: GrantRow = { ...cityGrant, id: 'g4', claimedAt: new Date('2026-10-03'), user: { ...cityGrant.user, name: 'Claimed' } };
        const realmGrant: GrantRow = { ...cityGrant, id: 'g6', cityId: null, city: null, realm: 'greece', user: { ...cityGrant.user, name: 'Peer' } };
        const { rerender } = render(<TeamTable grants={[cityGrant, claimed, realmGrant]} scopes={scopes} superadmin={false} />);

        expect(within(rowOf('Anna')).getByRole('button', { name: 'revoke.action' })).toBeInTheDocument();
        expect(within(rowOf('Claimed')).queryByRole('button')).not.toBeInTheDocument();
        expect(within(rowOf('Peer')).queryByRole('button')).not.toBeInTheDocument();

        rerender(<TeamTable grants={[cityGrant, claimed, realmGrant]} scopes={scopes} superadmin />);
        expect(within(rowOf('Peer')).getByRole('button', { name: 'revoke.action' })).toBeInTheDocument();
        expect(within(rowOf('Claimed')).queryByRole('button')).not.toBeInTheDocument();
    });

    it('shows the error toast when the request does not reach the server', async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
        render(<TeamTable grants={[cityGrant]} scopes={scopes} superadmin={false} />);

        await userEvent.click(screen.getByRole('button', { name: 'revoke.action' }));
        await userEvent.click(await screen.findByRole('button', { name: 'revoke.title' }));

        await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'errorGeneric' })));
    });

    it('shows an empty state when nobody holds a role and no invite is open', () => {
        render(<TeamTable grants={[revokedGrant]} scopes={scopes} superadmin={false} />);
        expect(screen.getByText('empty')).toBeInTheDocument();
        expect(screen.getByText('emptyHint')).toBeInTheDocument();
    });

    // The Team tab of a city: the page owns the h1, every scope sits in the
    // city, and the list asks the API for that city only.
    it('fits under the city page as a tab', async () => {
        fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [cityGrant, bodyInvite] });
        render(<TeamTable grants={[cityGrant, bodyInvite]} scopes={scopes} superadmin={false} city={athens} />);

        expect(screen.getByRole('heading', { level: 2, name: 'title' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
        expect(within(rowOf('nobody@example.com')).getByText('scopeKind.body')).toBeInTheDocument();
        expect(screen.queryByText('scopeKind.body · Athens')).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('switch'));
        expect(fetchMock).toHaveBeenCalledWith('/api/admin/grants?cityId=athens&includeRevoked=1');
    });
});
