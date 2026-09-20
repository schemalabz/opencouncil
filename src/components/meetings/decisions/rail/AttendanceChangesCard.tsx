"use client";

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { RailCard } from '@/components/ui/rail-card';
import { getAgendaLabel } from '@/lib/utils/subjects';
import type { MinutesSubject } from '@/lib/minutes/types';
import type { TimelineItem } from '@/components/meetings/decisions/timeline';

const VISIBLE_LINES = 3;

interface ChangeLine {
    key: string;
    sign: '+' | '−';
    tone: string;
    names: string[];
    label: string;
}

/** The rail's B1 card: the arrival and departure lines, the first three shown
 * and the rest behind an expander. The lines say who moved and where; the
 * attendance in force is the roll call, one card above. */
export function AttendanceChangesCard({ changes, subjects }: {
    changes: Extract<TimelineItem, { type: 'presence' }>[];
    subjects: MinutesSubject[];
}) {
    const tPage = useTranslations('admin.decisionsPage');
    const tSubject = useTranslations('Subject');
    const [expanded, setExpanded] = useState(false);

    const subjectLabel = (atSubjectId: string): string => {
        const subject = subjects.find(s => s.subjectId === atSubjectId);
        return subject ? (getAgendaLabel(tSubject, subject) ?? subject.name) : atSubjectId;
    };

    const lines: ChangeLine[] = changes.flatMap(c => {
        const label = subjectLabel(c.observedAtId);
        const out: ChangeLine[] = [];
        if (c.arrivals.length) out.push({ key: `${c.observedAtId}-arr`, sign: '+', tone: 'text-green-700', names: c.arrivals, label });
        if (c.departures.length) out.push({ key: `${c.observedAtId}-dep`, sign: '−', tone: 'text-red-700', names: c.departures, label });
        return out;
    });

    const visibleLines = expanded ? lines : lines.slice(0, VISIBLE_LINES);
    const remaining = lines.length - VISIBLE_LINES;

    return (
        <RailCard title={tPage('factsArrivalsDepartures')}>
            <div className="space-y-1.5 text-xs">
                {changes.length === 0 && (
                    <div className="text-muted-foreground">{tPage('factsNone')}</div>
                )}
                {visibleLines.map(line => (
                    <div key={line.key} className="flex items-baseline gap-1.5 text-muted-foreground">
                        <span className={`font-mono ${line.tone}`}>{line.sign}</span>
                        <span>{line.names.join(', ')} {tPage('factsChangeAt', { label: line.label })}</span>
                    </div>
                ))}
                {!expanded && remaining > 0 && (
                    <button type="button" aria-expanded={false} className="underline hover:text-foreground" onClick={() => setExpanded(true)}>
                        {tPage('factsMore', { n: remaining })}
                    </button>
                )}
                {expanded && lines.length > VISIBLE_LINES && (
                    <button type="button" aria-expanded className="underline hover:text-foreground" onClick={() => setExpanded(false)}>
                        {tPage('showLess')}
                    </button>
                )}
            </div>
        </RailCard>
    );
}
