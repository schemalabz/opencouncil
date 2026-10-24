import { Metadata } from 'next';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { listMachineAccounts } from '@/lib/db/machineAccounts';
import { mcpBaseUrl } from '@/lib/mcp/baseUrl';
import { MachineAccountsPage } from '@/components/admin/machine-accounts/machine-accounts-page';

export const metadata: Metadata = {
    title: 'Machine accounts - OpenCouncil Admin',
    description: 'Accounts for services that use the MCP server',
};

export const dynamic = 'force-dynamic';

export default async function MachineAccountsAdminPage() {
    await withUserAuthorizedToEdit({});
    const [accounts, baseUrl] = await Promise.all([listMachineAccounts(), mcpBaseUrl()]);
    return <MachineAccountsPage accounts={accounts} mcpBaseUrl={baseUrl} />;
}
