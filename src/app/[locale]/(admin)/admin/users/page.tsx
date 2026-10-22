import { withUserAuthorizedToEdit } from "@/lib/auth";
import { getRealm } from "@/lib/realm.server";
import { realmBaseUrl } from "@/lib/utils/realmBaseUrl";
import { UsersPageClient } from "@/components/admin/users/users-page";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
    // The layout's guard does not re-run on a soft navigation; every admin
    // page re-asserts its own (see admin-auth-guard.test.ts).
    await withUserAuthorizedToEdit({});
    // The token dialog shows a machine account's MCP address. Same rule as
    // the /mcp page: it must match how /api/mcp resolves the realm, from the
    // request Host.
    return <UsersPageClient mcpBaseUrl={`${realmBaseUrl(await getRealm())}/mcp`} />;
}
