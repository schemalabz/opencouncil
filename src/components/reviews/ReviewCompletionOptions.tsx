'use client';

import { useTranslations } from 'next-intl';
import { Bell, BellOff, Clock, LucideIcon } from 'lucide-react';
import { NotificationBehavior } from '@prisma/client';
import { Separator } from '@/components/ui/separator';
import { CheckboxCard } from '@/components/ui/checkbox-card';
import { cn } from '@/lib/utils';
import {
    summarizeNotifiesBeforeRelease,
    type ReviewCompletionControls,
} from './useReviewCompletion';

/**
 * What happens to the notifications that summarize creates, per notification behavior
 * of the administrative body. A meeting without an administrative body gets no
 * notifications at all — see handleSummarizeResult.
 */
const NOTIFICATION_OUTCOME: Record<NotificationBehavior, { key: string; icon: LucideIcon; className: string }> = {
    NOTIFICATIONS_AUTO: {
        key: 'auto',
        icon: Bell,
        // The one outcome that reaches subscribers without a second confirmation
        className: 'text-amber-600 dark:text-amber-500',
    },
    NOTIFICATIONS_APPROVAL: {
        key: 'approval',
        icon: Clock,
        className: 'text-muted-foreground',
    },
    NOTIFICATIONS_DISABLED: {
        key: 'disabled',
        icon: BellOff,
        className: 'text-muted-foreground',
    },
};

interface ReviewCompletionOptionsProps {
    completion: ReviewCompletionControls;
    separatorClassName?: string;
}

/**
 * The options that the reviewer confirms before the review completes: run summarize,
 * and send the transcript to the municipality.
 */
export function ReviewCompletionOptions({
    completion,
    separatorClassName = 'my-2',
}: ReviewCompletionOptionsProps) {
    const t = useTranslations('reviews.completeDialog');
    const { state, sendTranscript, setSendTranscript, runSummarize, setRunSummarize } = completion;

    if (!state) {
        return null;
    }

    const { contactEmails, administrativeBodyName, notificationBehavior, summarizeAvailability } = state;
    const [primaryEmail, ...ccEmails] = contactEmails;

    const canSummarize = summarizeAvailability === 'available';
    const notification = NOTIFICATION_OUTCOME[notificationBehavior ?? 'NOTIFICATIONS_DISABLED'];
    const NotificationIcon = notification.icon;
    const notifiesBeforeRelease = summarizeNotifiesBeforeRelease(state);

    return (
        <>
            <Separator className={separatorClassName} />
            <div className="space-y-3">
                <CheckboxCard
                    checked={runSummarize}
                    disabled={!canSummarize}
                    onCheckedChange={setRunSummarize}
                    label={t('runSummarize.label')}
                    description={
                        <>
                            <p>{t('runSummarize.help')}</p>
                            {!canSummarize && <p>{t(`runSummarize.unavailable.${summarizeAvailability}`)}</p>}
                            {/* One outcome line, and only for a send the reviewer asked
                                for. Before release the warning replaces the plain AUTO
                                line, which describes the same single send */}
                            {canSummarize && runSummarize && (
                                notifiesBeforeRelease ? (
                                    <p className="flex items-start gap-1.5 text-amber-600 dark:text-amber-500">
                                        <Bell className="h-4 w-4 shrink-0 mt-0.5" />
                                        <span>{t('runSummarize.notifications.beforeRelease')}</span>
                                    </p>
                                ) : (
                                    <p className={cn('flex items-start gap-1.5', notification.className)}>
                                        <NotificationIcon className="h-4 w-4 shrink-0 mt-0.5" />
                                        <span>{t(`runSummarize.notifications.${notification.key}`)}</span>
                                    </p>
                                )
                            )}
                        </>
                    }
                />

                {contactEmails.length > 0 && (
                    <CheckboxCard
                        checked={sendTranscript}
                        onCheckedChange={setSendTranscript}
                        label={t('sendTranscript.label')}
                        description={
                            <>
                                <p>{t('sendTranscript.help', {
                                    toEmail: primaryEmail,
                                    bodyName: administrativeBodyName ?? '',
                                })}</p>
                                {ccEmails.length > 0 && (
                                    <p>{t('sendTranscript.cc', { ccEmails: ccEmails.join(', ') })}</p>
                                )}
                            </>
                        }
                    />
                )}
            </div>
        </>
    );
}
