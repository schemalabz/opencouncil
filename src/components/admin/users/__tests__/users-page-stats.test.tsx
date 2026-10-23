import { render, screen } from '@testing-library/react';
import type { UserWithRelations } from '@/lib/db/users';
import { UsersPageClient } from '../users-page';

// The stats describe people: a machine account is a service's user row.
jest.mock('@/components/admin/users/analytics-dashboard', () => ({ AnalyticsDashboard: () => null }));
jest.mock('@/components/admin/users/user-stats', () => ({ UserStats: ({ totalUsers }: { totalUsers: number }) => <p>people: {totalUsers}</p> }));
jest.mock('@/components/admin/users/seed-users-dialog', () => ({ SeedUsersDialog: () => null }));
jest.mock('@/components/admin/users/expandable-user-row', () => ({
    ExpandableUserRow: ({ user, onEdit }: { user: UserWithRelations; onEdit: (user: UserWithRelations) => void }) => (
        <tr><td><button onClick={() => onEdit(user)}>{user.email}</button></td></tr>
    ),
}));
jest.mock('@/components/admin/users/user-dialog', () => ({
    UserDialog: ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) =>
        open ? <button onClick={() => onOpenChange(false)}>close dialog</button> : null,
}));
jest.mock('@/components/admin/users/machine-token-dialog', () => ({ MachineTokenDialog: () => null }));
jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));

const row = (id: string, isMachine: boolean) => ({ id, email: `${id}@example.com`, name: null, isMachine, onboarded: true,
    allowProductUpdates: false, notificationPreferences: [], petitions: [], createdAt: '2026-01-01T00:00:00.000Z' });
it('counts people only in the stats', async () => {
    const users = [row('anna', false), row('paola', true)];
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => users })) as unknown as typeof fetch;
    render(<UsersPageClient mcpBaseUrl="http://localhost:3000/mcp" />);
    expect(await screen.findByText('people: 1')).toBeInTheDocument();
});
