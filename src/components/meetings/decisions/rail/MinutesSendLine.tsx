"use client";

import { useLocale, useTranslations } from 'next-intl';
import { SendDocumentButton } from '@/components/admin/documents/SendDocumentButton';
import type { DocumentState } from '@/lib/documents/status';
import { formatNumericDate } from '@/lib/formatters/time';

/**
 * Where the minutes stand with the back office of the body (#874): the last
 * send, or when they go out on their own, and the button that sends them by
 * hand. The page renders it only for a body that sends its minutes.
 */
export function MinutesSendLine({ minutes, cityId, meetingId, timezone }: {
    minutes: DocumentState;
    cityId: string;
    meetingId: string;
    timezone: string;
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
                return t('failed', { reason: minutes.failureReason ?? '' });
            case 'waiting':
                if (minutes.waitReason === 'review') return t('waitReview');
                if (minutes.waitReason === 'agenda') return t('waitAgenda');
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
            {line && <p className="text-xs leading-snug text-muted-foreground">{line}</p>}
            {minutes.earlierSentAt && <p className="text-[11px] leading-snug text-muted-foreground">{t('earlier', { date: date(minutes.earlierSentAt) })}</p>}
            {/* A send in flight takes no second one */}
            {minutes.state !== 'pending' && (
                <SendDocumentButton
                    cityId={cityId}
                    meetingId={meetingId}
                    document="minutes"
                    isSent={minutes.state === 'sent' || minutes.state === 'sentIncomplete'}
                    allowResend
                    size="sm"
                    label={t('send')}
                />
            )}
        </div>
    );
}
