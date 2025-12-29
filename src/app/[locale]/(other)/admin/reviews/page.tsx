import { getMeetingsNeedingReview, getReviewers, ReviewProgress, ReviewAggregates } from '@/lib/db/reviews';
import { ReviewsTable } from '@/components/admin/reviews/ReviewsTable';
import { ReviewFilters } from '@/components/admin/reviews/ReviewFilters';
import { ReviewAggregatesDisplay } from '@/components/admin/reviews/ReviewAggregates';

interface PageProps {
  searchParams: { 
    show?: 'needsAttention' | 'all' | 'completed';
    reviewerId?: string;
  };
}

function calculateReviewAggregates(reviews: ReviewProgress[]): ReviewAggregates {
  const totalReviews = reviews.length;
  
  const totalUserEditedUtterances = reviews.reduce(
    (sum, review) => sum + review.userEditedUtterances, 
    0
  );
  
  const totalReviewTimeMs = reviews.reduce(
    (sum, review) => sum + review.estimatedReviewTimeMs, 
    0
  );
  
  // Calculate average efficiency (only from reviews that have efficiency data)
  const reviewsWithEfficiency = reviews.filter(r => r.reviewEfficiency !== null);
  const averageEfficiency = reviewsWithEfficiency.length > 0
    ? reviewsWithEfficiency.reduce((sum, r) => sum + (r.reviewEfficiency || 0), 0) / reviewsWithEfficiency.length
    : null;
  
  return {
    totalReviews,
    totalUserEditedUtterances,
    totalReviewTimeMs,
    averageEfficiency
  };
}

export default async function ReviewsPage({ searchParams }: PageProps) {
  const { show = 'needsAttention', reviewerId } = searchParams;
  
  const [reviews, reviewers] = await Promise.all([
    getMeetingsNeedingReview({ show, reviewerId }),
    getReviewers()
  ]);
  
  // Calculate aggregates from filtered reviews
  const aggregates = calculateReviewAggregates(reviews);
  
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Transcript Reviews</h1>
        <p className="text-muted-foreground">
          Track and manage human review progress on meeting transcripts
        </p>
      </div>
      
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <ReviewFilters 
          show={show}
          reviewerId={reviewerId}
          reviewers={reviewers}
        />
      </div>
      
      <ReviewAggregatesDisplay aggregates={aggregates} />
      
      <ReviewsTable reviews={reviews} />
    </div>
  );
}

