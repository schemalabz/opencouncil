import { getAdminRealms } from '@/lib/auth';
import { getDecisionHealth } from '@/lib/db/decisionHealth';
import { countDecisionReadIssuesByMeeting } from '@/lib/db/decisions';
import { DecisionsOverview, type OverviewRange } from '@/components/admin/decisions/DecisionsOverview';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Decisions - OpenCouncil Admin',
    description: 'Per-city health of the decisions pipeline',
};

export const dynamic = 'force-dynamic';

export default async function DecisionsAdminPage({ searchParams }: { searchParams: Promise<{ window?: string }> }) {
    const realms = await getAdminRealms();
    const { window: raw } = await searchParams;
    const range: OverviewRange = raw === '90' ? '90' : raw === 'all' ? 'all' : '30';
    const [cities, readIssues] = await Promise.all([
        getDecisionHealth(realms, undefined, range === 'all' ? undefined : Number(range)),
        countDecisionReadIssuesByMeeting(realms),
    ]);
    return <DecisionsOverview cities={cities} range={range} readIssues={readIssues} />;
}
