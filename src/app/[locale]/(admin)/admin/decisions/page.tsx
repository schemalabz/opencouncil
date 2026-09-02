import { withUserAuthorizedToEdit } from '@/lib/auth';
import { getDecisionHealth } from '@/lib/db/decisionHealth';
import { DecisionsOverview, type OverviewRange } from '@/components/admin/decisions/DecisionsOverview';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Decisions - OpenCouncil Admin',
    description: 'Per-city health of the decisions pipeline',
};

export const dynamic = 'force-dynamic';

export default async function DecisionsAdminPage({ searchParams }: { searchParams: Promise<{ window?: string }> }) {
    await withUserAuthorizedToEdit({});
    const { window: raw } = await searchParams;
    const range: OverviewRange = raw === '90' ? '90' : raw === 'all' ? 'all' : '30';
    const cities = await getDecisionHealth(undefined, range === 'all' ? undefined : Number(range));
    return <DecisionsOverview cities={cities} range={range} />;
}
