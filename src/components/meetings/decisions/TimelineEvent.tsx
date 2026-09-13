"use client";

import type { ReactNode } from 'react';
import { LogIn, LogOut, Vote } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { voteSubjectLabel, type TimelineItem } from '@/components/meetings/decisions/timeline';

/** One meeting-level event between two rows of the discussion-order view. */
export function TimelineEvent({ item }: { item: Exclude<TimelineItem, { type: 'subject' }> }) {
    const tPage = useTranslations('admin.decisionsPage');
    const tSubject = useTranslations('Subject');
    const line = (icon: ReactNode, text: string, tone: string) => (
        <div className={`flex items-center gap-2 py-1.5 pl-10 text-xs border-b border-dashed ${tone}`}>
            {icon}<span>{text}</span>
        </div>
    );
    if (item.type === 'attendance') {
        return (
            <>
                {item.arrivals.length > 0 && line(<LogIn className="h-3 w-3" />, tPage('eventArrivals', { names: item.arrivals.join(', '), n: item.arrivals.length }), 'text-green-700')}
                {item.departures.length > 0 && line(<LogOut className="h-3 w-3" />, tPage('eventDepartures', { names: item.departures.join(', '), n: item.departures.length }), 'text-red-700')}
            </>
        );
    }
    const v = item.vote;
    const label = voteSubjectLabel(tSubject, v);
    const text = v.kind === 'urgency' ? tPage('eventUrgencyVote', { subject: label }) : tPage('eventProceduralVote', { subject: label });
    return line(<Vote className="h-3 w-3" />, `${text} — ${tPage('eventProceduralNote')}`, 'text-muted-foreground');
}
