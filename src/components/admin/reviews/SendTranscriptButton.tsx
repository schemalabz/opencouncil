'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2, Send } from 'lucide-react';
import { useReviewCompletion } from '@/components/reviews/useReviewCompletion';
import { sendTranscriptToMunicipality } from '@/lib/tasks/sendTranscript';
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
interface SendTranscriptButtonProps {
  cityId: string;
  meetingId: string;
  isTranscriptSent: boolean;
  onSuccess?: () => void;
}

export function SendTranscriptButton({
  cityId,
  meetingId,
  isTranscriptSent,
  onSuccess,
}: SendTranscriptButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  // Reuses the loader of the completion dialog: same recipients, same stale-response guard
  const completion = useReviewCompletion(cityId, meetingId, showDialog);
  const contactEmails = completion.state?.contactEmails ?? [];

  const handleSendTranscript = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await sendTranscriptToMunicipality(cityId, meetingId);

      if (!result.success) {
        setError(result.error || 'Failed to send transcript');
        return;
      }

      setShowDialog(false);
      onSuccess?.();

      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send transcript');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isTranscriptSent) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600">
        <CheckCircle className="h-4 w-4" />
        <span>Transcript sent to municipality</span>
      </div>
    );
  }

  const isBusy = isSubmitting || isPending;

  return (
    <div className="space-y-2">
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            className="w-full"
            disabled={isBusy}
          >
            {isBusy ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send Transcript to Municipality
              </>
            )}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Transcript?</DialogTitle>
            <DialogDescription>
              This will email the transcript (DOCX) to the municipality&apos;s configured contact emails.
            </DialogDescription>
          </DialogHeader>
          {completion.isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : completion.error ? (
            // A failed load must not read as a municipality without contact emails
            <p className="text-sm text-destructive py-2">{completion.error}</p>
          ) : contactEmails.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              No contact emails configured for this administrative body.
            </p>
          ) : (
            <div className="p-4 border rounded-lg space-y-1 text-sm text-muted-foreground">
              <p><span className="font-medium text-foreground">To:</span> {contactEmails[0]}</p>
              {contactEmails.length > 1 && (
                <p><span className="font-medium text-foreground">CC:</span> {contactEmails.slice(1).join(', ')}</p>
              )}
            </div>
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
              onClick={handleSendTranscript}
              disabled={isBusy || completion.isLoading || contactEmails.length === 0}
            >
              {isBusy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Transcript
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
