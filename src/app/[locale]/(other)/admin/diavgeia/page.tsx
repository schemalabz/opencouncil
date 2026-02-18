import { withUserAuthorizedToEdit } from '@/lib/auth';
import { getPollingStats } from '@/lib/tasks/pollDecisions';
import { PollingStats } from '@/components/admin/diavgeia/PollingStats';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Diavgeia Polling Stats - OpenCouncil Admin',
  description: 'Monitor Diavgeia decision polling and backoff schedule',
};

export default async function DiavgeiaAdminPage() {
  await withUserAuthorizedToEdit({});

  const stats = await getPollingStats();

  return (
    <div className="container mx-auto py-6">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Diavgeia Polling Stats</h1>
          <p className="text-muted-foreground">
            Monitor decision discovery effectiveness and tune the backoff schedule.
          </p>
        </div>

        <PollingStats stats={stats} />
      </div>
    </div>
  );
}
