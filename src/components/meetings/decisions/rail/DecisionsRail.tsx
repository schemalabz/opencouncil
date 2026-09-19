"use client";

import { Loader2, RotateCcw, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AdminOnly, AdminToolButton } from '@/components/admin/AdminStrip';
import { PresenceCard } from '@/components/meetings/decisions/rail/PresenceCard';
import { AttendanceChangesCard } from '@/components/meetings/decisions/rail/AttendanceChangesCard';
import { DiscussionOrderCard } from '@/components/meetings/decisions/rail/DiscussionOrderCard';
import { MinutesCard } from '@/components/meetings/decisions/rail/MinutesCard';
import { minutesReadiness, type Timeline } from '@/components/meetings/decisions/timeline';
import type { MinutesData } from '@/lib/minutes/types';

/**
 * The decisions page's rail: the minutes card, the meeting's facts (presence,
 * attendance changes, discussion order), and — for a superadmin only — the
 * staff block. No fetching: the page owns every value and callback, this only
 * composes the cards.
 *
 * The minutes card leads because it is the only card here that does anything,
 * and because producing the πρακτικά is often why a city admin opened the
 * page. On a phone the rail stacks below the whole table, so last place put
 * the export at the bottom of a very long page.
 *
 * The staff block holds the two controls nobody else may run: a poll that
 * bypasses the task server's extraction cache, and the destructive extraction
 * reset. The ordinary Diavgeia re-check belongs to every admin and lives on
 * the questions card, so it is not repeated here. Where the decisions come
 * from is on the page's status line, where a city admin can read it too.
 */
export function DecisionsRail({
    minutes,
    timeline,
    isSuperAdmin,
    onPreviewMinutes,
    onExportDocx,
    previewDisabled,
    isPolling,
    onPollSkippingCache,
    isClearing,
    onResetExtractions,
    showResetExtractions,
}: {
    /** Null while the minutes have not loaded (or failed to): the presence,
     * attendance-changes and discussion-order cards render nothing then. */
    minutes: MinutesData | null;
    timeline: Timeline | null;
    isSuperAdmin: boolean;
    onPreviewMinutes: () => void;
    onExportDocx: () => void;
    previewDisabled: boolean;
    isPolling: boolean;
    /** Polls Diavgeia and re-extracts every document, cache or no cache. */
    onPollSkippingCache: () => void;
    isClearing: boolean;
    onResetExtractions: () => void;
    /** Whether the meeting has any extracted data left to reset. */
    showResetExtractions: boolean;
}) {
    const tPage = useTranslations('admin.decisionsPage');
    const tCommon = useTranslations('Common');
    const changes = timeline?.items.filter((item): item is Extract<typeof item, { type: 'presence' }> => item.type === 'presence') ?? [];

    return (
        <div className="flex min-w-0 flex-col gap-3.5">
            <MinutesCard
                onPreview={onPreviewMinutes}
                onExport={onExportDocx}
                previewDisabled={previewDisabled}
                readiness={minutes && minutesReadiness(minutes)}
            />
            {minutes && timeline && <PresenceCard rollCall={timeline.rollCall} />}
            {minutes && (
                <AttendanceChangesCard changes={changes} subjects={minutes.subjects} />
            )}
            {minutes && <DiscussionOrderCard data={minutes} />}
            {isSuperAdmin && (
                // One frame, not two: the block wore the AdminOnly stripes and
                // then striped each control row inside them again, so the
                // hazard pattern read as two nested warnings about one thing.
                <AdminOnly label={tCommon('adminOnly')}>
                    <div className="space-y-3 px-1 pb-1">
                        <div className="space-y-1.5">
                            <AdminToolButton disabled={isPolling} onClick={onPollSkippingCache}>
                                <Search className="h-3.5 w-3.5 mr-1.5" />
                                {tPage('pollButtonSkipCache')}
                            </AdminToolButton>
                            <p className="text-[11px] text-muted-foreground">{tPage('skipCacheHint')}</p>
                        </div>
                        {showResetExtractions && (
                            <div className="space-y-1.5">
                                <AdminToolButton destructive disabled={isClearing} onClick={onResetExtractions}>
                                    {isClearing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5 mr-1.5" />}
                                    {tPage('resetExtractions')}
                                </AdminToolButton>
                                <p className="text-[11px] text-muted-foreground">{tPage('resetExtractionsDescription')}</p>
                            </div>
                        )}
                    </div>
                </AdminOnly>
            )}
        </div>
    );
}
