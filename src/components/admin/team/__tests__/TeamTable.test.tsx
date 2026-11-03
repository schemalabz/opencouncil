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
const bodyGrant: GrantRow = {
    ...base, id: 'g2', role: 'records', administrativeBodyId: 'b1',
    administrativeBody: { id: 'b1', name: 'Council', cityId: 'athens', city: { name: 'Athens' } },
    user: { id: 'u2', email: 'nobody@example.com', name: null, isMachine: false }, status: 'pending',
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

let fetchMock: jest.Mock;
beforeEach(() => {
    toast.mockClear();
    fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => [] }));
    global.fetch = fetchMock as unknown as typeof fetch;
});

describe('TeamTable', () => {
    it('shows the live grants with their scope, role and status', () => {
        render(<TeamTable grants={[cityGrant, bodyGrant, revokedGrant]} scopes={scopes} superadmin={false} />);
        const rows = screen.getAllByRole('row').slice(1);
        expect(rows).toHaveLength(2);
        expect(within(rows[0]).getByText('Anna')).toBeInTheDocument();
        expect(within(rows[0]).getByText('Athens')).toBeInTheDocument();
        expect(within(rows[0]).getByText('role.admin')).toBeInTheDocument();
        expect(within(rows[0]).getByText('status.active')).toBeInTheDocument();
        expect(within(rows[1]).getByText('noName')).toBeInTheDocument();
        expect(within(rows[1]).getByText('Athens / Council')).toBeInTheDocument();
        expect(within(rows[1]).getByText('status.pending')).toBeInTheDocument();
        expect(screen.queryByText('gone@example.com')).not.toBeInTheDocument();
    });

    it('lists the revoked grants on request, without a revoke button', async () => {
        fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [cityGrant, revokedGrant] });
        render(<TeamTable grants={[cityGrant]} scopes={scopes} superadmin={false} />);
        await userEvent.click(screen.getByRole('switch'));
        expect(fetchMock).toHaveBeenCalledWith('/api/admin/grants?includeRevoked=1');
        const row = (await screen.findByText('gone@example.com')).closest('tr')!;
        expect(within(row).getByText('status.revoked')).toBeInTheDocument();
        expect(within(row).queryByRole('button', { name: 'revoke.action' })).not.toBeInTheDocument();
    });

    it('revokes a grant after a confirmation', async () => {
        render(<TeamTable grants={[cityGrant]} scopes={scopes} superadmin={false} />);
        await userEvent.click(screen.getByRole('button', { name: 'revoke.action' }));
        expect(await screen.findByText('anna@example.com · Athens')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'revoke.title' }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/grants', expect.objectContaining({ method: 'DELETE' })));
        const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'DELETE');
        expect(JSON.parse(call?.[1].body)).toEqual({ grantId: 'g1' });
        expect(fetchMock).toHaveBeenCalledWith('/api/admin/grants');
    });

    it('explains a refused revoke with the copy of its code', async () => {
        fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
            init?.method === 'DELETE'
                ? { ok: false, status: 400, json: async () => ({ error: 'last-admin' }) }
                : { ok: true, status: 200, json: async () => [] });
        render(<TeamTable grants={[cityGrant]} scopes={scopes} superadmin={false} />);
        await userEvent.click(screen.getByRole('button', { name: 'revoke.action' }));
        await userEvent.click(await screen.findByRole('button', { name: 'revoke.title' }));
        await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'errors.last-admin' })));
    });

    it('offers no revoke on a claimed row, or on a realm or a person grant of a realm admin', () => {
        const claimed: GrantRow = { ...cityGrant, id: 'g4', claimedAt: new Date('2026-10-03'), user: { ...cityGrant.user, email: 'claimed@example.com' } };
        const realmGrant: GrantRow = { ...cityGrant, id: 'g5', cityId: null, city: null, realm: 'greece', user: { ...cityGrant.user, email: 'peer@example.com' } };
        const rowOf = (email: string) => screen.getByText(email).closest('tr')!;
        const { rerender } = render(<TeamTable grants={[cityGrant, claimed, realmGrant]} scopes={scopes} superadmin={false} />);
        expect(within(rowOf('anna@example.com')).getByRole('button', { name: 'revoke.action' })).toBeInTheDocument();
        expect(within(rowOf('claimed@example.com')).queryByRole('button', { name: 'revoke.action' })).not.toBeInTheDocument();
        expect(within(rowOf('peer@example.com')).queryByRole('button', { name: 'revoke.action' })).not.toBeInTheDocument();

        rerender(<TeamTable grants={[cityGrant, claimed, realmGrant]} scopes={scopes} superadmin />);
        expect(within(rowOf('peer@example.com')).getByRole('button', { name: 'revoke.action' })).toBeInTheDocument();
        expect(within(rowOf('claimed@example.com')).queryByRole('button', { name: 'revoke.action' })).not.toBeInTheDocument();
    });

    it('shows the error toast when the request does not reach the server', async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
        render(<TeamTable grants={[cityGrant]} scopes={scopes} superadmin={false} />);
        await userEvent.click(screen.getByRole('button', { name: 'revoke.action' }));
        await userEvent.click(await screen.findByRole('button', { name: 'revoke.title' }));
        await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'errorGeneric' })));
    });

    it('shows an empty state when nobody holds a grant', () => {
        render(<TeamTable grants={[]} scopes={scopes} superadmin={false} />);
        expect(screen.getByText('empty')).toBeInTheDocument();
    });
});
