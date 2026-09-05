"use client";

import type React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarX2, Inbox, Swords, TriangleAlert } from 'lucide-react';
import type { MeetingQueues } from '@/lib/db/decisionHealthDerive';

/**
 * Icon + count per non-empty queue of a city or a body; the text lives in the
 * hover title and for screen readers. The hero's queue list is the legend.
 */
export function QueueBadges({ queues, unplaceable = 0, empty, inheritColor = false }: {
    queues: MeetingQueues;
    unplaceable?: number;
    /** What to render when every queue is empty; a dash by default. */
    empty?: React.ReactNode;
    /** Drop the per-queue colours, for badges inside a filled control. */
    inheritColor?: boolean;
}) {
    const t = useTranslations('admin.decisionsOverview');
    const locale = useLocale();
    const realUnplaced = queues.unplacedCandidates - queues.unplacedUnread;
    const items = [
        { count: queues.failedMeetings, Icon: TriangleAlert, label: t('row.stuck', { count: queues.failedMeetings }), cls: 'text-red-600 dark:text-red-500' },
        { count: queues.conflicts, Icon: Swords, label: t('row.conflicts', { count: queues.conflicts }), cls: 'text-amber-700 dark:text-amber-500' },
        { count: realUnplaced, Icon: Inbox, label: t('row.unplaced', { count: realUnplaced }), cls: 'text-amber-700 dark:text-amber-500' },
        { count: unplaceable, Icon: CalendarX2, label: t('row.unplaceable', { count: unplaceable }), cls: 'text-amber-700 dark:text-amber-500' },
    ].filter(a => a.count > 0);
    if (items.length === 0) return empty === undefined ? <span className="text-muted-foreground">—</span> : empty;
    return items.map(({ Icon, count, label, cls }) => (
        <span key={label} title={label} className={`flex items-center gap-1 ${inheritColor ? '' : cls}`}>
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">{label}</span>
            <span aria-hidden>{count.toLocaleString(locale)}</span>
        </span>
    ));
}
