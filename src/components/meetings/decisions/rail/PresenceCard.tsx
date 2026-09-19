"use client";

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { RailCard } from '@/components/ui/rail-card';
import type { RollCall } from '@/components/meetings/decisions/timeline';

/** The rail's roll-call card: the meeting's opening present/absent count, the
 * absent names inline, and the present names behind an expander. Renders
 * nothing when the roll call carries no count (e.g. no council composition
 * on file). */
export function PresenceCard({ rollCall }: { rollCall: RollCall }) {
    const tPage = useTranslations('admin.decisionsPage');
    const [expanded, setExpanded] = useState(false);

    if (!rollCall.count) return null;

    const { count, absentNames, presentNames } = rollCall;
    const total = count.present + count.absent;

    return (
        <RailCard title={tPage('attendance')}>
            <div className="space-y-1.5 text-xs">
                <div className="font-medium">{tPage('presenceHeadline', { present: count.present, total })}</div>
                {/* A full house has an attendance record with no ABSENT rows, so the
                    line would read "0 absent:" with nothing after it. */}
                {count.absent > 0 && (
                    <div className="text-muted-foreground">
                        <span>{tPage('presenceAbsentInline', { n: count.absent })}</span> {absentNames.join(', ')}
                    </div>
                )}
                <button type="button" aria-expanded={expanded} className="underline hover:text-foreground" onClick={() => setExpanded(prev => !prev)}>
                    {expanded ? tPage('showLess') : tPage('showMore')}
                </button>
                {expanded && (
                    <div className="text-muted-foreground">
                        <span>{tPage('presencePresentList', { n: count.present })}</span> {presentNames.join(', ')}
                    </div>
                )}
            </div>
        </RailCard>
    );
}
