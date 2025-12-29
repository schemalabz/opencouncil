import { ReviewAggregates } from '@/lib/db/reviews';
import { StatsCard, StatsCardItem } from '@/components/ui/stats-card';
import { FileText, Edit3, Clock, Zap } from 'lucide-react';
import { formatDurationMs } from '@/lib/formatters/time';

interface ReviewAggregatesProps {
  aggregates: ReviewAggregates;
}

export function ReviewAggregatesDisplay({ aggregates }: ReviewAggregatesProps) {
  const statsItems: StatsCardItem[] = [
    {
      title: 'Total Reviews',
      value: aggregates.totalReviews,
      icon: <FileText className="h-4 w-4" />,
      description: aggregates.totalReviews === 1 ? 'meeting' : 'meetings',
    },
    {
      title: 'User Edits',
      value: aggregates.totalUserEditedUtterances.toLocaleString(),
      icon: <Edit3 className="h-4 w-4" />,
      description: 'utterances edited',
    },
    {
      title: 'Total Review Time',
      value: formatDurationMs(aggregates.totalReviewTimeMs),
      icon: <Clock className="h-4 w-4" />,
      description: 'hours by reviewers',
    },
    {
      title: 'Avg Efficiency',
      value: aggregates.averageEfficiency !== null 
        ? `1:${aggregates.averageEfficiency.toFixed(1)}`
        : 'N/A',
      icon: <Zap className="h-4 w-4" />,
      description: 'review to meeting ratio',
    },
  ];

  return <StatsCard items={statsItems} columns={4} />;
}

