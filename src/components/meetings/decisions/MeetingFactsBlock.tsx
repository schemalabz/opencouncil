"use client";

import type { ReactNode } from 'react';
import { Clock, Users, Vote } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { MinutesData } from '@/lib/minutes/types';
import { getAgendaLabel } from '@/lib/utils/subjects';
import { hasDiscussionOrder, voteSubjectLabel } from '@/components/meetings/decisions/timeline';

/**
 * The agenda-order view's meeting block: the minutes-only facts that the
 * discussion-order view shows as events between the rows.
 */
export function MeetingFactsBlock({ data }: { data: MinutesData }) {
    const tPage = useTranslations('admin.decisionsPage');
    const tSubject = useTranslations('Subject');

    // One "+n at #x" / "−n at #x" per subject, in the order the changes arrive (discussion order).
    const perSubject = new Map<string, { label: string; arrivals: number; departures: number }>();
    for (const c of data.attendanceChanges) {
        const entry = perSubject.get(c.atSubject.id) ?? { label: getAgendaLabel(tSubject, c.atSubject) ?? c.atSubject.name, arrivals: 0, departures: 0 };
        if (c.type === 'arrival') entry.arrivals++; else entry.departures++;
        perSubject.set(c.atSubject.id, entry);
    }
    const changeParts: string[] = [];
    for (const e of perSubject.values()) {
        if (e.arrivals) changeParts.push(tPage('factsArrivalAt', { n: e.arrivals, label: e.label }));
        if (e.departures) changeParts.push(tPage('factsDepartureAt', { n: e.departures, label: e.label }));
    }

    const voteParts = data.proceduralVotes.map(v => {
        const label = voteSubjectLabel(tSubject, v);
        return v.kind === 'urgency' ? tPage('eventUrgencyVote', { subject: label }) : tPage('eventProceduralVote', { subject: label });
    });

    const line = (icon: ReactNode, label: string, value: ReactNode) => (
        <div className="flex items-baseline gap-2 text-xs">
            <span className="text-muted-foreground">{icon}</span>
            <span className="w-40 shrink-0 font-medium">{label}</span>
            <span className="text-muted-foreground">{value}</span>
        </div>
    );

    return (
        <div className="border rounded-lg p-3 bg-muted/30 space-y-1.5">
            {line(<Users className="h-3.5 w-3.5" />, tPage('factsArrivalsDepartures'), changeParts.length ? changeParts.join(' · ') : tPage('factsNone'))}
            {line(<Clock className="h-3.5 w-3.5" />, tPage('factsDiscussionOrder'), data.discussionOrderLabel
                ? <><span className="font-mono">{data.discussionOrderLabel}</span> <span className="text-amber-700 ml-1">{tPage('factsDiffersFromAgenda')}</span></>
                : hasDiscussionOrder(data)
                    ? tPage('factsFollowsAgenda')
                    : <span className="text-amber-700">{tPage('factsNoOrder')}</span>)}
            {line(<Vote className="h-3.5 w-3.5" />, tPage('factsProceduralVotes'), voteParts.length ? voteParts.join(' · ') : tPage('factsNone'))}
        </div>
    );
}
