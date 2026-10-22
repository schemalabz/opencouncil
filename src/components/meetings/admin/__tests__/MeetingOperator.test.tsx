import { render, screen } from '@testing-library/react';
import MeetingOperator from '../MeetingOperator';
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { isSuperAdmin: true } } }) }));
jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/components/ui/select', () => {
    const Pass = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
    return { Select: Pass, SelectTrigger: Pass, SelectValue: () => null, SelectContent: Pass, SelectItem: Pass };
});
it('offers superadmin people only, never a machine account', async () => {
    const users = [{ id: 'u1', name: 'Anna', email: 'a@x', isSuperAdmin: true, isMachine: false },
                   { id: 'bot-1', name: 'Paola', email: 'p@machines.opencouncil.invalid', isSuperAdmin: true, isMachine: true }];
    global.fetch = jest.fn(async (url: string) => ({ ok: true, json: async () => (url === '/api/admin/users' ? users : { operator: null }) })) as unknown as typeof fetch;
    render(<MeetingOperator cityId="athens" meetingId="m1" />);
    expect(await screen.findByText('Anna')).toBeInTheDocument();
    expect(screen.queryByText('Paola')).not.toBeInTheDocument();
});
