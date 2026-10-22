import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserWithRelations } from '@/lib/db/users';
import { UsersPageClient } from '../users-page';

// The page's own job is the paging of the table: the rows, the dashboards and
// the dialogs are drawn by components that are not under test.
jest.mock('@/components/admin/users/analytics-dashboard', () => ({ AnalyticsDashboard: () => null }));
jest.mock('@/components/admin/users/user-stats', () => ({ UserStats: () => null }));
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

const usersOf = (count: number) => Array.from({ length: count }, (_, i) => ({
    id: `u${i}`,
    email: `user-${i}@example.com`,
    name: null,
    onboarded: true,
    allowProductUpdates: false,
    notificationPreferences: [],
    petitions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
}));

let users = usersOf(0);

beforeEach(() => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => users })) as unknown as typeof fetch;
});

describe('UsersPageClient paging', () => {
    it('pages the table, 20 users a page', async () => {
        users = usersOf(45);
        render(<UsersPageClient mcpBaseUrl="http://localhost:3000/mcp" />);

        await screen.findByText('user-0@example.com');
        await userEvent.click(screen.getByRole('button', { name: /next/i }));

        expect(await screen.findByText('user-20@example.com')).toBeInTheDocument();
        expect(screen.queryByText('user-0@example.com')).not.toBeInTheDocument();
    });

    it('shows the last page that exists when the list shrinks under the open page', async () => {
        users = usersOf(41);
        render(<UsersPageClient mcpBaseUrl="http://localhost:3000/mcp" />);

        await screen.findByText('user-0@example.com');
        await userEvent.click(screen.getByRole('button', { name: /next/i }));
        await userEvent.click(await screen.findByRole('button', { name: /next/i }));
        // Page 3 holds the 41st user alone. A refresh with one user fewer leaves 2 pages.
        await userEvent.click(await screen.findByText('user-40@example.com'));
        users = usersOf(40);
        await userEvent.click(screen.getByText('close dialog'));

        await waitFor(() => expect(screen.queryByText('user-40@example.com')).not.toBeInTheDocument());
        expect(screen.getByText('user-39@example.com')).toBeInTheDocument();
    });
});
