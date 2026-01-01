import { getMeetingsNeedingReview, getReviewers } from '@/lib/db/reviews';
import { ReviewsTable } from '@/components/admin/reviews/ReviewsTable';
import { ReviewFilters } from '@/components/admin/reviews/ReviewFilters';

interface PageProps {
  searchParams: { 
    show?: 'needsAttention' | 'all' | 'completed';
    reviewerId?: string;
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
          show={show}
          reviewerId={reviewerId}
          reviewers={reviewers}
        />
      </div>
      
      <ReviewsTable reviews={reviews} />
    </div>
  );
}

