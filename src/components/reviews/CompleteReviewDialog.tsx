'use client'
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ReviewSessionsBreakdown } from '../admin/reviews/ReviewSessionsBreakdown';
import { getMeetingReviewStats } from '@/lib/db/reviews';
import { markHumanReviewComplete } from '@/lib/tasks/humanReview';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CheckboxCard } from '@/components/ui/checkbox-card';
import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';
import { Separator } from '@/components/ui/separator';
import { ReviewCompletionOptions } from './ReviewCompletionOptions';
import { failedFollowUps, useReviewCompletion } from './useReviewCompletion';

interface CompleteReviewDialogProps {
  cityId: string;
  meetingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CompleteReviewDialog({
  cityId,
  meetingId,
  open,
  onOpenChange,
  onSuccess
}: CompleteReviewDialogProps) {
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getMeetingReviewStats>> | null>(null);
  const [hasManualTime, setHasManualTime] = useState(false);
  const [manualTimeInput, setManualTimeInput] = useState('');
  const completion = useReviewCompletion(cityId, meetingId, open);
  const { toast } = useToast();
  const t = useTranslations('reviews.completeDialog');

  useEffect(() => {
    if (open) {
      // Fetch stats when dialog opens; useReviewCompletion loads the completion options
      setIsLoadingStats(true);
      setStatsError(null);
      setSubmitError(null);
      getMeetingReviewStats({ cityId, meetingId })
        .then(setStats)
        .catch((err) => {
          console.error('Failed to fetch review data:', err);
          setStatsError(err.message || 'Failed to load review data');
        })
        .finally(() => setIsLoadingStats(false));
    }
  }, [open, cityId, meetingId]);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const { followUps } = await markHumanReviewComplete(cityId, meetingId, {
        manualReviewTime: hasManualTime ? manualTimeInput : undefined,
        ...completion.completionOptions,
      });
      // The review is complete either way. A follow-up that failed must not read as
      // a success: it is the only signal the reviewer gets outside Discord.
      const failed = failedFollowUps(followUps);
      toast(
        failed.length > 0
          ? {
              title: t('toasts.followUpFailed.title'),
              description: t('toasts.followUpFailed.description', {
                actions: failed.map((key) => t(`toasts.followUpFailed.actions.${key}`)).join(', '),
              }),
              variant: 'destructive' as const,
            }
          : {
              title: t('toasts.success.title'),
              description: t('toasts.success.description'),
            }
      );
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      console.error('Failed to mark review as complete:', err);
      const errorMessage = err instanceof Error ? err.message : t('toasts.error.description');
      setSubmitError(errorMessage);
      toast({
        title: t('toasts.error.title'),
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('description')}
          </DialogDescription>
        </DialogHeader>

        {/* The header stays centered with the dialog. The body reads as prose and
            as a form, so it aligns left */}
        <div className="py-4 text-left">
          {/* The review statistics only report the work. The reviewer completes the
              review without them, so a failure here reports itself and stops there */}
          {isLoadingStats && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {statsError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{t('errors.stats', { message: statsError })}</AlertDescription>
            </Alert>
          )}

          {!isLoadingStats && !statsError && stats && (
            <>
              {!stats.hasReviewers ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {t('noEdits')}
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  {/* Show primary reviewer info */}
                  {stats.primaryReviewer && (
                    <div className="mb-4 p-4 border rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-semibold">{t('primaryReviewer')}</span>
                        <Badge variant="default">
                          {stats.primaryReviewer.userName || stats.primaryReviewer.userEmail}
                        </Badge>
                      </div>
                      {stats.secondaryReviewers.length > 0 && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{t('additionalContributors')}</span>
                          <span>
                            {stats.secondaryReviewers
                              .map(r => r.userName || r.userEmail)
                              .join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Review Sessions Breakdown */}
                  {stats.unifiedReviewSessions && stats.unifiedReviewSessions.length > 0 && (
                    <ReviewSessionsBreakdown
                      sessions={stats.unifiedReviewSessions}
                      totalReviewTimeMs={stats.totalReviewTimeMs}
                      meetingDurationMs={stats.meetingDurationMs}
                      reviewEfficiency={stats.totalReviewEfficiency}
                      hideBreaks={true}
                    />
                  )}

                  <Separator className="my-4" />

                  {/* Manual time override option */}
                  <CheckboxCard
                    checked={hasManualTime}
                    onCheckedChange={setHasManualTime}
                    label={t('manualTime.label')}
                    description={t('manualTime.help')}
                  >
                    {hasManualTime && (
                      <Input
                        placeholder={t('manualTime.placeholder')}
                        value={manualTimeInput}
                        onChange={(e) => setManualTimeInput(e.target.value)}
                      />
                    )}
                  </CheckboxCard>
                </>
              )}
            </>
          )}

          {/* The options carry the outward-facing choices, so they load and fail on
              their own. The reviewer keeps them when the statistics above fail */}
          {completion.isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {completion.error && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex flex-wrap items-center gap-2">
                <span>{t('errors.options', { message: completion.error })}</span>
                <Button variant="outline" size="sm" onClick={completion.reload}>
                  {t('buttons.retry')}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <ReviewCompletionOptions completion={completion} separatorClassName="my-4" />

          {submitError && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {t('buttons.cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            // Never confirm options that the dialog did not load: the reviewer would
            // start summarize — and the notifications it releases — without seeing
            // the warning. isLoadingStats blocks too, so a fast reviewer cannot
            // confirm before the manual-time override has rendered. A statistics
            // failure leaves both flags false and still allows the review
            disabled={isSubmitting || isLoadingStats || completion.isLoading || !completion.state}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('buttons.completing')}
              </>
            ) : (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                {t('buttons.markComplete')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

