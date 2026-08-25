import { getReviewStats } from '@/lib/db/reviews';
import { StatsCard } from '@/components/ui/stats-card';
import { AlertCircle, CalendarCheck, CheckCircle2, Clock } from 'lucide-react';

export function ReviewsOverviewSkeleton() {
  return (
    // Mirrors StatsCard's responsive grid and bottom margin so the section
    // does not shift when the streamed content replaces the fallback.
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4 mb-6">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-28 rounded-lg border animate-pulse bg-muted/40" />
      ))}
    </div>
  );
}

export async function ReviewsOverviewWidget() {
  const stats = await getReviewStats();

  return (
    <StatsCard
      columns={4}
      items={[
        {
          title: 'Needs Review',
          value: stats.needsReview,
          icon: <AlertCircle className="h-4 w-4" />,
          description: 'no user edits yet, all time',
        },
        {
          title: 'In Progress',
          value: stats.inProgress,
          icon: <Clock className="h-4 w-4" />,
          description: 'has user edits, all time',
        },
        {
          title: 'Completed Today',
          value: stats.completedToday,
          icon: <CheckCircle2 className="h-4 w-4" />,
          description: 'human reviews finished today',
        },
        {
          title: 'Completed This Week',
          value: stats.completedThisWeek,
          icon: <CalendarCheck className="h-4 w-4" />,
          description: 'since the start of the week',
        },
      ]}
    />
  );
}
