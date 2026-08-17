'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2 } from 'lucide-react';
import { markHumanReviewComplete } from '@/lib/tasks/humanReview';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ReviewCompletionOptions } from '@/components/reviews/ReviewCompletionOptions';
import { failedFollowUps, useReviewCompletion } from '@/components/reviews/useReviewCompletion';

interface MarkReviewCompleteButtonProps {
  cityId: string;
  meetingId: string;
  isCompleted: boolean;
  onSuccess?: () => void;
}

export function MarkReviewCompleteButton({ 
  cityId, 
  meetingId, 
  isCompleted,
  onSuccess
}: MarkReviewCompleteButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const completion = useReviewCompletion(cityId, meetingId, showDialog);

  const handleMarkComplete = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      const { followUps } = await markHumanReviewComplete(cityId, meetingId, completion.completionOptions);

      // The review is complete either way, but a follow-up that failed must not
      // disappear behind a closed dialog
      const failed = failedFollowUps(followUps);
      if (failed.length > 0) {
        setError(`Review completed, but these follow-ups failed: ${failed.join(', ')}. Retry them from the meeting admin panel.`);
        return;
      }

      // Close dialog
      setShowDialog(false);
      
      // Call success callback (e.g., to close parent sheet)
      onSuccess?.();
      
      // Refresh the page data
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark review as complete');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Don't show button if already completed
  if (isCompleted) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600">
        <CheckCircle className="h-4 w-4" />
        <span>Review marked as complete</span>
      </div>
    );
  }

  const isBusy = isSubmitting || isPending;

  return (
    <div className="space-y-2">
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogTrigger asChild>
          <Button
            className="w-full"
            disabled={isBusy}
          >
            {isBusy ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Marking Complete...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Mark Review as Complete
              </>
            )}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Review as Complete?</DialogTitle>
            <DialogDescription>
              This will mark the transcript review as complete. The meeting will be removed from the &quot;Needs Attention&quot; list and moved to completed reviews.
            </DialogDescription>
          </DialogHeader>
          {completion.isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : completion.error ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-destructive">{completion.error}</p>
              <Button variant="outline" size="sm" onClick={completion.reload}>
                Retry
              </Button>
            </div>
          ) : (
            <ReviewCompletionOptions completion={completion} />
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
              disabled={isBusy}
            >
              Cancel
            </Button>
            <Button
              onClick={handleMarkComplete}
              // Never confirm without the loaded options: the reviewer would
              // complete the review with every follow-up silently off
              disabled={isBusy || completion.isLoading || !completion.state}
            >
              {isBusy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Marking...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Mark Complete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}

