import { getMeetingsNeedingReview } from '@/lib/db/reviews';
import { ReviewsTable } from '@/components/admin/reviews/ReviewsTable';

export default async function ReviewsPage() {
  const reviews = await getMeetingsNeedingReview();
  
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Transcript Reviews</h1>
        <p className="text-muted-foreground">
          Meetings that have completed automatic transcript fixing and need human review
        </p>
      </div>
      
      <ReviewsTable reviews={reviews} />
    </div>
  );
}

