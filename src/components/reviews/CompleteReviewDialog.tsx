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
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { Separator } from '@/components/ui/separator';

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
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getMeetingReviewStats>> | null>(null);
  const [hasManualTime, setHasManualTime] = useState(false);
  const [manualTimeInput, setManualTimeInput] = useState('');
  const { toast } = useToast();
  const t = useTranslations('reviews.completeDialog');

  useEffect(() => {
    if (open) {
      // Fetch stats when dialog opens - gets actual reviewer info from edit history
      setIsLoading(true);
      setError(null);
      getMeetingReviewStats(cityId, meetingId)
        .then(setStats)
        .catch((err) => {
          console.error('Failed to fetch review stats:', err);
          setError(err.message || 'Failed to load review stats');
        })
        .finally(() => setIsLoading(false));
    }
  }, [open, cityId, meetingId]);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await markHumanReviewComplete(cityId, meetingId, hasManualTime ? manualTimeInput : undefined);
      toast({
        title: t('toasts.success.title'),
        description: t('toasts.success.description'),
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      console.error('Failed to mark review as complete:', err);
      setError(err.message || t('toasts.error.description'));
      toast({
        title: t('toasts.error.title'),
        description: err.message || t('toasts.error.description'),
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

        <div className="py-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!isLoading && !error && stats && (
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
                  <div className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-start space-x-2">
                      <Checkbox
                        id="manual-time"
                        checked={hasManualTime}
                        onCheckedChange={(checked) => setHasManualTime(checked as boolean)}
                      />
                      <div className="grid gap-1.5 leading-none">
                        <Label
                          htmlFor="manual-time"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                        >
                          {t('manualTime.label')}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {t('manualTime.help')}
                        </p>
                      </div>
                    </div>
                    {hasManualTime && (
                      <Input
                        placeholder={t('manualTime.placeholder')}
                        value={manualTimeInput}
                        onChange={(e) => setManualTimeInput(e.target.value)}
                        className="mt-2"
                      />
                    )}
                  </div>
                </>
              )}
            </>
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
            disabled={isLoading || isSubmitting}
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

