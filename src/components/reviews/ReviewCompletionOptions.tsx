'use client';

import { useLocale, useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';
import { formatDate } from '@/lib/formatters/time';
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
    const locale = useLocale();
    const { state, sendTranscript, setSendTranscript, runSummarize, setRunSummarize } = completion;

    if (!state) {
        return null;
    }

    const { transcriptRecipients, automaticDocuments, administrativeBodyName, summarizeAvailability, summarizeNotifications } = state;
    const [primaryEmail, ...ccEmails] = transcriptRecipients;

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

                {transcriptRecipients.length > 0 && (
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

                {/* The body's setting decides these; the reviewer is told, not asked */}
                {automaticDocuments.map(({ document, recipientEmails, readiness }) => (
                    <div key={document} className="flex items-start gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
                        <FileText className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>
                            {readiness.state === 'complete' && t(`automatic.${document}.now`, { toEmail: recipientEmails[0] ?? '' })}
                            {readiness.state === 'incomplete' && t(`automatic.${document}.nowIncomplete`, {
                                toEmail: recipientEmails[0] ?? '',
                                count: readiness.missingSubjectIds.length,
                            })}
                            {readiness.state === 'wait' && readiness.reason === 'decisions' && t(`automatic.${document}.later`, {
                                toEmail: recipientEmails[0] ?? '',
                                dueDate: readiness.dueAt ? formatDate(readiness.dueAt, undefined, locale) : '',
                            })}
                            {readiness.state === 'wait' && readiness.reason === 'agenda' && t(`automatic.${document}.noAgenda`, { toEmail: recipientEmails[0] ?? '' })}
                        </span>
                    </div>
                ))}
            </div>
        </>
    );
}
