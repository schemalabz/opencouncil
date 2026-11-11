"use client";

import { useLocale, useTranslations } from 'next-intl';
import { SendDocumentButton } from '@/components/admin/documents/SendDocumentButton';
import { AdminStrip, adminToolClass } from '@/components/admin/AdminStrip';
import type { DocumentState } from '@/lib/documents/status';
import { formatNumericDate } from '@/lib/formatters/time';

/**
 * Where the minutes stand with the back office of the body (#874): the last
 * send, or when they go out on their own, and, for a superadmin, the button
 * that sends them by hand, in the back-of-house strip. The page renders it
 * only for a body that sends its minutes.
 */
export function MinutesSendLine({ minutes, cityId, meetingId, timezone, isSuperAdmin }: {
    minutes: DocumentState;
    cityId: string;
    meetingId: string;
    timezone: string;
    isSuperAdmin: boolean;
}) {
    const t = useTranslations('admin.decisionsPage.rail.minutesSend');
    const locale = useLocale();
    const date = (value: Date) => formatNumericDate(value, timezone, locale);
    const to = minutes.recipientEmails[0] ?? '';

    const line = (() => {
        switch (minutes.state) {
            case 'sent':
                return minutes.sentAt ? t('sent', { date: date(minutes.sentAt), to }) : null;
            case 'sentIncomplete':
                return minutes.sentAt ? t('sentIncomplete', { date: date(minutes.sentAt), to, n: minutes.missingCount }) : null;
            case 'pending':
                return t('pending');
            case 'unconfirmed':
                return t('unconfirmed');
            case 'failed':
                return t('failed');
            case 'waiting':
                if (minutes.waitReason === 'review') return t('waitReview');
                if (minutes.waitReason === 'summarize') return t('waitSummarize');
                if (minutes.waitReason === 'agenda') return t('waitAgenda');
                if (minutes.waitReason === 'poll') return t('waitPoll');
                return minutes.dueAt ? t('waitDecisions', { date: date(minutes.dueAt) }) : null;
            case 'unsent':
                return t('unsent');
            case 'byHandOnly':
                return t('byHandOnly');
            case 'notEnabled':
                return null;
        }
    })();

    return (
        <div className="mt-3 space-y-2 border-t pt-3">
            {line && (
                // The raw reason of a failed send is for whoever checks it, not for the line
                <p className="text-xs leading-snug text-muted-foreground" title={minutes.state === 'failed' ? minutes.failureReason ?? undefined : undefined}>{line}</p>
            )}
            {minutes.earlierSentAt && <p className="text-[11px] leading-snug text-muted-foreground">{t('earlier', { date: date(minutes.earlierSentAt) })}</p>}
            {/* A send in flight takes no second one; a send by hand is a superadmin's */}
            {isSuperAdmin && minutes.state !== 'pending' && (
                <AdminStrip>
                    <SendDocumentButton
                        cityId={cityId}
                        meetingId={meetingId}
                        kind="minutes"
                        isSent={minutes.state === 'sent' || minutes.state === 'sentIncomplete'}
                        allowResend
                        compact
                        triggerClassName={adminToolClass}
                        label={t('send')}
                    />
                </AdminStrip>
            )}
        </div>
    );
}
