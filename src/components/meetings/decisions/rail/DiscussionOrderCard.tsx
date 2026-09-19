"use client";

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { RailCard } from '@/components/ui/rail-card';
import { hasDiscussionOrder } from '@/components/meetings/decisions/timeline';
import type { MinutesData } from '@/lib/minutes/types';

/**
 * The agenda items each single vote covered, one group per vote, in ascending
 * order.
 *
 * The table gives every subject its own row and its own number, the way the
 * posted Πίνακας does, so this sentence is the only place the reader learns
 * that five items were taken as one.
 *
 * A group is not always a run of consecutive items — a council can take items
 * 3, 7 and 9 together — so the indexes travel whole and the sentence decides
 * how to say them.
 */
export function discussionGroups(subjects: ReadonlyArray<{ agendaItemIndex: number | null; discussedInId: string | null; subjectId: string }>): number[][] {
    const byParent = new Map<string, number[]>();
    for (const s of subjects) {
        const parent = s.discussedInId;
        if (!parent || s.agendaItemIndex === null) continue;
        byParent.set(parent, [...(byParent.get(parent) ?? []), s.agendaItemIndex]);
    }
    for (const s of subjects) {
        const own = byParent.get(s.subjectId);
        if (own && s.agendaItemIndex !== null) own.push(s.agendaItemIndex);
    }
    // Dedup before the length check: two children can share one
    // agendaItemIndex (e.g. a re-discussed item recorded twice), and
    // filtering on the raw count first let such a pair pass as a "group"
    // that then collapsed to a single index — "item 3 to 3".
    return [...byParent.values()]
        .map(indexes => [...new Set(indexes)].sort((a, b) => a - b))
        .filter(indexes => indexes.length > 1)
        .sort((a, b) => a[0] - b[0]);
}

/** Whether a group is a run of consecutive items, which is the only case "X έως Y" describes. */
export function isContiguous(indexes: readonly number[]): boolean {
    return indexes[indexes.length - 1] - indexes[0] === indexes.length - 1;
}

/** The rail's discussion-order card, in three states: the order as a label when
 * it differs from the agenda, a plain confirmation when it follows it, or an
 * amber notice when the transcript recorded no order at all. Below that, one
 * sentence per group of subjects a single vote covered — the table numbers
 * them separately, so this is the only place that grouping shows. */
export function DiscussionOrderCard({ data }: { data: Pick<MinutesData, 'subjects' | 'discussionOrderLabel'> }) {
    const tPage = useTranslations('admin.decisionsPage');
    const locale = useLocale();
    const groups = discussionGroups(
        data.subjects.map(s => ({ subjectId: s.subjectId, agendaItemIndex: s.agendaItemIndex, discussedInId: s.discussedWith?.id ?? null })),
    );
    const listFormat = useMemo(() => new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }), [locale]);

    return (
        <RailCard title={tPage('factsDiscussionOrder')}>
            <div className="text-xs">
                {data.discussionOrderLabel ? (
                    <>
                        <span className="font-mono">{data.discussionOrderLabel}</span>{' '}
                        <span className="text-amber-700">{tPage('factsDiffersFromAgenda')}</span>
                    </>
                ) : hasDiscussionOrder(data) ? (
                    <span className="text-muted-foreground">{tPage('factsFollowsAgenda')}</span>
                ) : (
                    <span className="text-amber-700">{tPage('factsNoOrder')}</span>
                )}
            </div>
            {groups.length > 0 && (
                <div className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
                    {groups.map(indexes => (
                        <p key={indexes.join('-')}>
                            {isContiguous(indexes)
                                ? tPage('rail.discussedTogether', { first: indexes[0], last: indexes[indexes.length - 1] })
                                : tPage('rail.discussedTogetherList', { items: listFormat.format(indexes.map(String)) })}
                        </p>
                    ))}
                </div>
            )}
        </RailCard>
    );
}
