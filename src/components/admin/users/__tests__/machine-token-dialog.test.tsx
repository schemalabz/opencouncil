import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MachineTokenDialog } from '../machine-token-dialog';
jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));
jest.mock('@/lib/actions/machineAccounts', () => ({ listMachineTokens: jest.fn(async () => []),
    mintMachineToken: jest.fn(async () => ({ id: 't1', rawToken: 'mcp_raw_secret', tokens: [] })), revokeMachineToken: jest.fn() }));
const PAOLA = { id: 'bot-1', name: 'Paola', email: 'paola@machines.opencouncil.invalid' };
it('drops the raw token when the dialog closes, so a reopen never shows it again', async () => {
    const { rerender } = render(<MachineTokenDialog account={PAOLA} mcpBaseUrl="http://localhost/mcp" onOpenChange={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: /create/i }));
    expect((await screen.findAllByText(/mcp_raw_secret/)).length).toBeGreaterThan(0);
    rerender(<MachineTokenDialog account={null} mcpBaseUrl="http://localhost/mcp" onOpenChange={() => {}} />);
    rerender(<MachineTokenDialog account={PAOLA} mcpBaseUrl="http://localhost/mcp" onOpenChange={() => {}} />);
    await waitFor(() => expect(screen.queryByText(/mcp_raw_secret/)).not.toBeInTheDocument());
});
