'use client';

import { useState, useTransition, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2 } from 'lucide-react';
import { markHumanReviewComplete, getMeetingContactEmails } from '@/lib/tasks/humanReview';
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
import { SendTranscriptCheckbox } from '@/components/reviews/SendTranscriptCheckbox';

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
  const [contactEmails, setContactEmails] = useState<string[]>([]);
  const [sendTranscript, setSendTranscript] = useState(false);
  const [isLoadingEmails, setIsLoadingEmails] = useState(false);

  useEffect(() => {
    if (showDialog) {
      setIsLoadingEmails(true);
      getMeetingContactEmails(cityId, meetingId)
        .then((result) => {
          setContactEmails(result.contactEmails);
          // Default to true if contact emails exist, matching CompleteReviewDialog behavior
          setSendTranscript(result.contactEmails.length > 0);
        })
        .catch(() => setContactEmails([]))
        .finally(() => setIsLoadingEmails(false));
    }
  }, [showDialog, cityId, meetingId]);

  const handleMarkComplete = async () => {
    setError(null);
    setIsSubmitting(true);
    
    try {
      await markHumanReviewComplete(
        cityId,
        meetingId,
        undefined,
        sendTranscript && contactEmails.length > 0
      );
      
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

  const isLoading = isSubmitting || isPending || isLoadingEmails;

  return (
    <div className="space-y-2">
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogTrigger asChild>
          <Button 
            className="w-full" 
            disabled={isLoading}
          >
            {isLoading ? (
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
          <SendTranscriptCheckbox
            contactEmails={contactEmails}
            checked={sendTranscript}
            onCheckedChange={setSendTranscript}
          />
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowDialog(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleMarkComplete}
              disabled={isLoading}
            >
              {isLoading ? (
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

