'use client';

import { useEffect, useState, useTransition } from 'react';
import type { DocumentKind } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2, Send } from 'lucide-react';
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
import { previewDocumentSend, sendDocumentNow, type DocumentSendPreview } from '@/lib/actions/documentSends';
import { DOCUMENT_NAMES } from '@/lib/documents/settings';

interface SendDocumentButtonProps {
  cityId: string;
  meetingId: string;
  document: DocumentKind;
  /** A sent document shows a check instead of the button, unless `allowResend`. */
  isSent: boolean;
  /** The admin list offers a resend: the complete minutes after a provisional send. */
  allowResend?: boolean;
  onSuccess?: () => void;
  size?: 'default' | 'sm';
  /** A short label ("Send", "Send again") that fits a table row; the document is named beside it. */
  compact?: boolean;
}

/**
 * Send one document of a meeting by hand. The dialog loads where it goes and
 * what it covers before the admin confirms; a manual send may repeat.
 */
export function SendDocumentButton({
  cityId,
  meetingId,
  document,
  isSent,
  allowResend = false,
  onSuccess,
  size = 'default',
  compact = false,
}: SendDocumentButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [preview, setPreview] = useState<DocumentSendPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const name = DOCUMENT_NAMES[document].en;

  useEffect(() => {
    if (!showDialog) return;
    // A stale answer must not describe another dialog's send
    let cancelled = false;
    setIsLoading(true);
    setPreview(null);
    setPreviewError(null);
    previewDocumentSend(cityId, meetingId, document)
      .then((result) => { if (!cancelled) setPreview(result); })
      .catch((err) => { if (!cancelled) setPreviewError(err instanceof Error ? err.message : 'Failed to load the send'); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [showDialog, cityId, meetingId, document]);

  const recipientEmails = preview?.recipientEmails ?? [];
  const readiness = preview?.readiness ?? null;
  const canSend = recipientEmails.length > 0 && readiness !== null && (readiness.state === 'complete' || readiness.state === 'incomplete');

  const handleSend = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await sendDocumentNow(cityId, meetingId, document);
      if (!result.success) {
        setError(result.error || `Failed to send the ${name.toLowerCase()}`);
        return;
      }
      setShowDialog(false);
      onSuccess?.();
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to send the ${name.toLowerCase()}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSent && !allowResend) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600">
        <CheckCircle className="h-4 w-4" />
        <span>{name} sent to the municipality</span>
      </div>
    );
  }

  const isBusy = isSubmitting || isPending;

  return (
    <div className="space-y-2">
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogTrigger asChild>
          <Button variant="outline" size={size} className={compact ? undefined : 'w-full'} disabled={isBusy}>
            {isBusy ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                {compact ? (isSent ? 'Send again' : 'Send') : (isSent ? `Send ${name} again` : `Send ${name} now`)}
              </>
            )}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send the {name.toLowerCase()}?</DialogTitle>
            <DialogDescription>
              This emails the {name.toLowerCase()} (DOCX) to the recipients in the body&apos;s document send settings.
            </DialogDescription>
          </DialogHeader>
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : previewError ? (
            // A failed load must not read as a body without recipients
            <p className="text-sm text-destructive py-2">{previewError}</p>
          ) : recipientEmails.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              The {name.toLowerCase()} setting of this administrative body does not cover this meeting.
            </p>
          ) : (
            <div className="p-4 border rounded-lg space-y-1 text-sm text-muted-foreground">
              <p><span className="font-medium text-foreground">To:</span> {recipientEmails[0]}</p>
              {recipientEmails.length > 1 && (
                <p><span className="font-medium text-foreground">CC:</span> {recipientEmails.slice(1).join(', ')}</p>
              )}
              {readiness?.state === 'incomplete' && (
                <p className="text-amber-700 dark:text-amber-500">
                  Provisional: {readiness.missingSubjectIds.length} {readiness.missingSubjectIds.length === 1 ? 'subject has' : 'subjects have'} no decision yet.
                </p>
              )}
              {readiness?.state === 'wait' && (
                <p className="text-destructive">
                  {readiness.reason === 'agenda'
                    ? 'The meeting has no agenda subjects yet, so its minutes would be empty.'
                    : 'The review of the meeting is not complete, so nothing can go out.'}
                </p>
              )}
              {readiness?.state === 'none' && (
                <p className="text-destructive">This document is not sent for this meeting ({readiness.reason}).</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={isBusy}>
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={isBusy || isLoading || !canSend}>
              {isBusy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send {name}
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
