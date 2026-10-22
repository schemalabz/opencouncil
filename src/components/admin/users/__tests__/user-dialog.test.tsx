import { render, screen, waitFor } from '@testing-library/react';
import type { UserWithRelations } from '@/lib/db/users';
import { UserDialog } from '../user-dialog';

jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));
jest.mock('@/hooks/useLocalizedValidation', () => ({ useValidationMessage: () => (message: string) => message }));

const cityAdmin = {
    id: 'u1', email: 'city@example.com', name: 'City Admin', isSuperAdmin: false, isMachine: false,
    administers: [{ id: 'adm1', city: { id: 'athens', name: 'Athens' }, party: null, person: null, administrativeBody: null }],
} as unknown as UserWithRelations;

beforeEach(() => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => [] })) as unknown as typeof fetch;
});

describe('UserDialog grants', () => {
    it('opens a create with no grants after an edit of an admin', async () => {
        const props = { onOpenChange: () => {}, onDelete: () => {} };
        const { rerender } = render(<UserDialog open user={cityAdmin} {...props} />);
        expect(await screen.findByText(/Athens/)).toBeInTheDocument();

        rerender(<UserDialog open={false} user={cityAdmin} {...props} />);
        rerender(<UserDialog open user={undefined} machine {...props} />);

        await screen.findByText('Create machine account');
        await waitFor(() => expect(screen.queryByText(/Athens/)).not.toBeInTheDocument());
    });
});
