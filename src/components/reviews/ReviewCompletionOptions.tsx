'use client';

import { useTranslations } from 'next-intl';
import { Separator } from '@/components/ui/separator';
import { CheckboxCard } from '@/components/ui/checkbox-card';
import { NotificationOutcomeNote } from '@/components/notifications/NotificationOutcomeNote';
import type { ReviewCompletionControls } from './useReviewCompletion';

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

    const { contactEmails, administrativeBodyName, summarizeAvailability, summarizeNotifications } = state;
    const [primaryEmail, ...ccEmails] = contactEmails;

    const canSummarize = summarizeAvailability === 'available';

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
                        // Spans, not paragraphs: the description sits inside the card's label.
                        <>
                            <span className="block">{t('runSummarize.help')}</span>
                            {!canSummarize && (
                                <span className="block">{t(`runSummarize.unavailable.${summarizeAvailability}`)}</span>
                            )}
                            {/* One outcome line, and only for a summarize the reviewer asked for */}
                            {canSummarize && runSummarize && (
                                <NotificationOutcomeNote outcome={summarizeNotifications} phase="summarize" />
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
                                <span className="block">{t('sendTranscript.help', {
                                    toEmail: primaryEmail,
                                    bodyName: administrativeBodyName ?? '',
                                })}</span>
                                {ccEmails.length > 0 && (
                                    <span className="block">{t('sendTranscript.cc', { ccEmails: ccEmails.join(', ') })}</span>
                                )}
                            </>
                        }
                    />
                )}
            </div>
        </>
    );
}
