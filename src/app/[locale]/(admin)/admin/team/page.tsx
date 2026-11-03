import { Metadata } from 'next';
import { getAdminRealms, getCurrentUser } from '@/lib/auth';
import { listGrants, listGrantScopes } from '@/lib/db/grants';
import { TeamTable } from '@/components/admin/team/TeamTable';

export const metadata: Metadata = {
    title: 'Team - OpenCouncil Admin',
    description: 'The people who hold a role on a realm, a city or an administrative body',
};

export const dynamic = 'force-dynamic';

export default async function TeamAdminPage() {
    const realms = await getAdminRealms();
    const [grants, scopes, user] = await Promise.all([listGrants({ realms }), listGrantScopes(realms), getCurrentUser()]);
    // getAdminRealms throws without a session, so the viewer is here.
    return <TeamTable grants={grants} scopes={scopes} superadmin={realms === null} viewerId={user?.id ?? ''} />;
}
