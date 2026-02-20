import { getMeetingsNeedingReview, getReviewers } from '@/lib/db/reviews';
import { ReviewsTable } from '@/components/admin/reviews/ReviewsTable';
import { ReviewFilters } from '@/components/admin/reviews/ReviewFilters';

interface PageProps {
  searchParams: { 
    show?: 'needsAttention' | 'all' | 'completed';
    reviewerId?: string;
import { getMeetingsNeedingReview, getReviewers, type ReviewListItem } from '@/lib/db/reviews';
import { getMeetingUploadMetrics } from '@/lib/db/meetings';
import { ReviewsTable } from '@/components/admin/reviews/ReviewsTable';
import { ReviewFilters } from '@/components/admin/reviews/ReviewFilters';
import { ReviewVolumeChart } from '@/components/admin/reviews/ReviewVolumeChart';
import { Last30DaysFilter } from '@/components/admin/reviews/Last30DaysFilter';
import { formatDistanceToNow } from 'date-fns';
import { formatDurationMs } from '@/lib/formatters/time';
import { Card, CardContent } from '@/components/ui/card';

interface PageProps {
  searchParams: {
    show?: 'needsAttention' | 'all' | 'completed';
    reviewerId?: string;
    last30Days?: string;
  };
}

function filterReviewsByShow(reviews: ReviewListItem[], show: 'needsAttention' | 'all' | 'completed'): ReviewListItem[] {
  switch (show) {
    case 'needsAttention':
      return reviews.filter(r => r.status !== 'completed');
    case 'completed':
      return reviews.filter(r => r.status === 'completed');
    case 'all':
    default:
      return reviews;
  }
}

function calculateReviewMetrics(reviews: ReviewListItem[]) {
  const needsReviewMeetings = reviews.filter(m => m.status !== 'completed');

  const needsReviewDuration = needsReviewMeetings.reduce(
    (sum, meeting) => sum + meeting.meetingDurationMs,
    0
  );

  const oldestNeedsReview = needsReviewMeetings.length > 0
    ? needsReviewMeetings.reduce((oldest, meeting) =>
      meeting.meetingDate < oldest ? meeting.meetingDate : oldest,
      needsReviewMeetings[0].meetingDate
    )
    : null;

  return {
    needsReview: needsReviewDuration,
    oldestNeedsReview,
  };
}

export default async function ReviewsPage({ searchParams }: PageProps) {
  const { show = 'needsAttention', reviewerId } = searchParams;
  
  const [reviews, reviewers] = await Promise.all([
    getMeetingsNeedingReview({ show, reviewerId }),
    getReviewers()
  ]);
  
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
  const { show = 'needsAttention', reviewerId, last30Days } = searchParams;
  const last30DaysBool = last30Days !== 'false';

  // Fetch all meetings once (with reviewerId filter if specified), then filter client-side
  const [allReviews, reviewers, uploadMetrics] = await Promise.all([
    getMeetingsNeedingReview({ show: 'all', reviewerId, last30Days: last30DaysBool }),
    getReviewers(),
    getMeetingUploadMetrics(last30DaysBool)
  ]);

  // Filter for table display
  const reviews = filterReviewsByShow(allReviews, show);

  // Calculate metrics from all reviews (not filtered by show, but respects reviewerId)
  const reviewMetrics = calculateReviewMetrics(allReviews);

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-3xl font-bold">Transcript Reviews</h1>
          <span className="text-lg text-muted-foreground">
            {reviews.length} {reviews.length === 1 ? 'meeting' : 'meetings'}
          </span>
        </div>
        <p className="text-muted-foreground mt-2">
          Track and manage human review progress on meeting transcripts
        </p>
      </div>
      
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <ReviewFilters 

      {/* Review Volume Chart - Not affected by 30-day filter */}
      <div className="mb-6">
        <ReviewVolumeChart />
      </div>

      {/* 30-Day Filter - Prominent at top */}
      <Last30DaysFilter last30Days={last30DaysBool} />

      {/* Metrics Display */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{formatDurationMs(reviewMetrics.needsReview)}</div>
            <div className="text-sm text-muted-foreground mt-1">
              Meeting time needs review
            </div>
            {reviewMetrics.oldestNeedsReview && (
              <div className="text-xs text-muted-foreground mt-2">
                Oldest: {formatDistanceToNow(reviewMetrics.oldestNeedsReview, { addSuffix: true })}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{uploadMetrics.needsUpload}</div>
            <div className="text-sm text-muted-foreground mt-1">
              Meetings need upload
            </div>
            {uploadMetrics.oldestNeedsUpload && (
              <div className="text-xs text-muted-foreground mt-2">
                Oldest: {formatDistanceToNow(uploadMetrics.oldestNeedsUpload, { addSuffix: true })}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{uploadMetrics.scheduledFuture}</div>
            <div className="text-sm text-muted-foreground mt-1">
              Meetings scheduled
            </div>
            {uploadMetrics.earliestScheduledFuture && (
              <div className="text-xs text-muted-foreground mt-2">
                Earliest: {formatDistanceToNow(uploadMetrics.earliestScheduledFuture, { addSuffix: true })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <ReviewFilters
          show={show}
          reviewerId={reviewerId}
          reviewers={reviewers}
        />
      </div>
      

      <ReviewsTable reviews={reviews} />
    </div>
  );
}

