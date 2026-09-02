'use client';
import { Clock } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCouncilMeetingData } from '@/components/meetings/CouncilMeetingDataContext';
import { formatDateTime, formatWeekday } from '@/lib/formatters/time';
import { cn } from '@/lib/utils';

/**
 * The box a piece of the page shows while it is still coming: a dashed
 * hairline, a clock on the first line, the sentence, and the promise on a
 * line of its own. One shape for the meeting page's missing sections and a
 * subject page's missing summary or statements.
 */
export function PendingBox({ deadline, className, children }: {
    /** The review promise, while it is still ahead; null says nothing about when. */
    deadline: Date | null;
    className?: string;
    children: React.ReactNode;
}) {
    const t = useTranslations('meetingStage');
    const locale = useLocale();
    const { city } = useCouncilMeetingData();
    return (
        <div className={cn('rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground', className)}>
            {/* Inline with the first line, so the glyph cannot drift between the lines. */}
            <p>
                <Clock className="mr-2 inline-block h-4 w-4 align-[-3px] text-yellow-600" aria-hidden />
                {children}
            </p>
            {deadline && (
                <p className="mt-0.5 pl-6 text-xs">
                    {t('pendingSections.by', { deadline: `${formatWeekday(deadline, city.timezone, locale)} ${formatDateTime(deadline, city.timezone, 'long', locale)}` })}
                </p>
            )}
        </div>
    );
}
