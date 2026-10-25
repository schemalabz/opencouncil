import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MachineAccountWithTokens } from '@/lib/db/types';
import { mintMachineToken, revokeMachineToken } from '@/lib/actions/machineAccounts';
import { MachineAccountSection } from '../machine-account-section';

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }));
// The real CopyButton reads its own translations.
jest.mock('@/components/mcp/CopyButton', () => ({ CopyButton: ({ label }: { label?: string }) => <button type="button" aria-label={label}>copy</button> }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));
jest.mock('@/lib/actions/machineAccounts', () => ({
    mintMachineToken: jest.fn(async () => ({ id: 't-new', rawToken: 'mcp_raw_secret' })),
    revokeMachineToken: jest.fn(async () => undefined),
}));

const token = (id: string, revoked = false) => ({
    id, name: 'MCP address', keyPrefix: `mcp_${id}`, createdAt: new Date('2026-10-24'), lastUsedAt: null,
    revokedAt: revoked ? new Date('2026-10-24') : null,
});

const paola = {
    id: 'bot-1', name: 'Paola', email: 'paola@machines.opencouncil.invalid', isSuperAdmin: true, isMachine: true,
    createdAt: new Date('2026-10-24'), administers: [], mcpTokens: [token('t1')],
} as unknown as MachineAccountWithTokens;

const renderSection = () => render(<MachineAccountSection account={paola} mcpBaseUrl="https://opencouncil.gr/mcp" onEdit={() => {}} />);

it('keeps a new token on the page until the copy is confirmed', async () => {
    renderSection();
    await userEvent.click(screen.getByRole('button', { name: 'newToken' }));
    expect((await screen.findAllByText(/mcp_raw_secret/)).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'newToken' })).toBeDisabled();
    // Focus moves to the new token, since the button it left is disabled.
    expect(screen.getByText('reveal.title')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'reveal.copyToken' })).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    await userEvent.click(document.body);
    expect(screen.getAllByText(/mcp_raw_secret/).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: 'reveal.dismiss' }));
    await waitFor(() => expect(screen.queryByText(/mcp_raw_secret/)).not.toBeInTheDocument());
    expect(mintMachineToken).toHaveBeenCalledWith('bot-1');
});

it('revokes only after the inline confirmation', async () => {
    renderSection();
    await userEvent.click(screen.getByRole('button', { name: 'revokeToken' }));
    expect(revokeMachineToken).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'revokeConfirm' }));
    await waitFor(() => expect(revokeMachineToken).toHaveBeenCalledWith('bot-1', 't1'));
});

it('stops showing a new token once it is revoked', async () => {
    const { rerender } = renderSection();
    await userEvent.click(screen.getByRole('button', { name: 'newToken' }));
    await screen.findAllByText(/mcp_raw_secret/);
    // The refresh after the mint brings the new token into the table.
    rerender(<MachineAccountSection account={{ ...paola, mcpTokens: [token('t-new'), token('t1')] }} mcpBaseUrl="https://opencouncil.gr/mcp" onEdit={() => {}} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'revokeToken' })[0]);
    await userEvent.click(screen.getByRole('button', { name: 'revokeConfirm' }));
    await waitFor(() => expect(screen.queryByText(/mcp_raw_secret/)).not.toBeInTheDocument());
    expect(revokeMachineToken).toHaveBeenCalledWith('bot-1', 't-new');
});

it('names the rights: a superadmin, or no rights at all', () => {
    renderSection();
    expect(screen.getByText('rights.superAdmin')).toBeInTheDocument();
    render(<MachineAccountSection account={{ ...paola, id: 'bot-2', isSuperAdmin: false }} mcpBaseUrl="x" onEdit={() => {}} />);
    expect(screen.getByText('rights.none')).toBeInTheDocument();
});
