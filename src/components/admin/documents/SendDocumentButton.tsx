'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
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
import type { NotSentReason, WaitReason } from '@/lib/documents/readiness';
import { cn } from '@/lib/utils';

/** The refusals a send by hand can meet, and their key in `admin.documentSend.refusal`. */
const REFUSAL_KEYS = {
  review: 'refusal.review',
  summarize: 'refusal.summarize',
  agenda: 'refusal.agenda',
  disabled: 'refusal.disabled',
  notHeld: 'refusal.notHeld',
  laterPart: 'refusal.laterPart',
} as const satisfies Partial<Record<NotSentReason | WaitReason, `refusal.${string}`>>;

/** The key that says why a send by hand cannot go out; none for a wait the send by hand goes past. */
function refusalKey(reason: NotSentReason | WaitReason): (typeof REFUSAL_KEYS)[keyof typeof REFUSAL_KEYS] | null {
  return reason in REFUSAL_KEYS ? REFUSAL_KEYS[reason as keyof typeof REFUSAL_KEYS] : null;
}

/** The key of each document's name in `admin.documentSend.names`. */
const NAME_KEYS = {
  transcript: 'names.transcript',
  minutes: 'names.minutes',
} as const satisfies Record<DocumentKind, `names.${DocumentKind}`>;

interface SendDocumentButtonProps {
  cityId: string;
  meetingId: string;
  kind: DocumentKind;
  /** A sent document shows a check instead of the button, unless `allowResend`. */
  isSent: boolean;
  /** The admin list offers a resend: the complete minutes after a provisional send. */
  allowResend?: boolean;
  onSuccess?: () => void;
  size?: 'default' | 'sm';
  /** Fits a table row: the button keeps its own width instead of the full width. */
  compact?: boolean;
  /** The label of the button, where the page names the action its own way. */
  label?: string;
  /** The class of the trigger, where the page marks it as a back-of-house control (adminToolClass). */
  triggerClassName?: string;
}

/**
 * Send one document of a meeting by hand. The dialog loads where it goes and
 * what it covers before the admin confirms; a manual send may repeat.
 */
export function SendDocumentButton({
  cityId,
  meetingId,
  kind,
  isSent,
  allowResend = false,
  onSuccess,
  size = 'default',
  compact = false,
  label,
  triggerClassName,
}: SendDocumentButtonProps) {
  const t = useTranslations('admin.documentSend');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [preview, setPreview] = useState<DocumentSendPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Loading from the first frame: the dialog must not show "not covered" before the preview arrives
  const [isLoading, setIsLoading] = useState(true);
  const name = t(NAME_KEYS[kind]);

  useEffect(() => {
    if (!showDialog) return;
    // A stale answer must not describe another dialog's send
    let cancelled = false;
    setIsLoading(true);
    setPreview(null);
    setPreviewError(null);
    setError(null);
    previewDocumentSend(cityId, meetingId, kind)
      .then((result) => { if (!cancelled) setPreview(result); })
      .catch((err) => { if (!cancelled) setPreviewError(err instanceof Error ? err.message : t('loadFailed')); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [showDialog, cityId, meetingId, kind, t]);

  const recipientEmails = preview?.recipientEmails ?? [];
  const readiness = preview?.readiness ?? null;
  const canSend = recipientEmails.length > 0 && readiness !== null && (readiness.state === 'complete' || readiness.state === 'incomplete');

  const handleSend = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await sendDocumentNow(cityId, meetingId, kind);
      if (!result.success) {
        const key = result.refusal ? refusalKey(result.refusal) : null;
        setError(key ? t(key) : t('failed'));
        // The failed send is a row now: the page shows it
        startTransition(() => router.refresh());
        return;
      }
      setShowDialog(false);
      onSuccess?.();
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSent && !allowResend) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600">
        <CheckCircle className="h-4 w-4" />
        <span>{t('sent', { name })}</span>
      </div>
    );
  }

  const isBusy = isSubmitting || isPending;

  return (
    <div className="space-y-2">
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogTrigger asChild>
          <Button variant="outline" size={size} className={cn(compact ? undefined : 'w-full', triggerClassName)} disabled={isBusy}>
            {isBusy ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('sending')}
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                {label ?? (isSent ? t('sendAgain') : t('send'))}
              </>
            )}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('title', { name })}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : previewError ? (
            // A failed load must not read as a body without recipients
            <p className="text-sm text-destructive py-2">{previewError}</p>
          ) : recipientEmails.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">{t('notCovered')}</p>
          ) : (
            <div className="p-4 border rounded-lg space-y-1 text-sm text-muted-foreground">
              <p><span className="font-medium text-foreground">{t('to')}</span> {recipientEmails[0]}</p>
              {recipientEmails.length > 1 && (
                <p><span className="font-medium text-foreground">{t('cc')}</span> {recipientEmails.slice(1).join(', ')}</p>
              )}
              {readiness?.state === 'incomplete' && (
                <p className="text-amber-700 dark:text-amber-500">{t('provisional', { n: readiness.missingSubjectIds.length })}</p>
              )}
              {(readiness?.state === 'wait' || readiness?.state === 'none') && refusalKey(readiness.reason) && (
                <p className="text-destructive">{t(refusalKey(readiness.reason)!)}</p>
              )}
            </div>
          )}
          {/* Inside the dialog: an error below it would sit behind the overlay */}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={isBusy}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSend} disabled={isBusy || isLoading || !canSend}>
              {isBusy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('sending')}
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  {t('confirm')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
