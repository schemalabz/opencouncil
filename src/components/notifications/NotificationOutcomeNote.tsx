"use client";

import { useTranslations } from 'next-intl';
import { Bell, BellOff, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NewsPhase, NotificationOutcome } from '@/lib/notifications/freshness';
import { notificationOutcomeText } from '@/lib/notifications/outcomeText';

/** The icon for an outcome: a bell when subscribers get an email, a crossed bell when they get none. */
export function NotificationOutcomeIcon({ outcome, className }: { outcome: NotificationOutcome; className?: string }) {
    if (outcome.kind === 'sends') return <Bell className={className} />;
    if (outcome.kind === 'waitsForApproval') return <Clock className={className} />;
    return <BellOff className={cn('text-amber-500', className)} />;
}

/**
 * What a task or a release does with email notifications, in one line. The
 * outcome comes from `notificationOutcome`, the rule that the server acts on.
 */
export function NotificationOutcomeNote({ outcome, phase, className }: {
    outcome: NotificationOutcome;
    phase: NewsPhase;
    className?: string;
}) {
    const t = useTranslations('notificationOutcome');
    return (
        <span className={cn(
            'flex items-start gap-1.5',
            // The one outcome that reaches subscribers without a second confirmation
            outcome.kind === 'sends' ? 'text-amber-600 dark:text-amber-500' : 'text-muted-foreground',
            className,
        )}>
            <NotificationOutcomeIcon outcome={outcome} className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{notificationOutcomeText(t, outcome, phase)}</span>
        </span>
    );
}
