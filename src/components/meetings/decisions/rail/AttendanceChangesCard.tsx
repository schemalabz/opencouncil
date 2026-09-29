"use client";

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { RailCard } from '@/components/ui/rail-card';
import { getAgendaLabel } from '@/lib/utils/subjects';
import type { MinutesAttendanceChange, MinutesSubject } from '@/lib/minutes/types';
import type { TimelineItem } from '@/components/meetings/decisions/timeline';

const VISIBLE_LINES = 3;

interface ChangeLine {
    key: string;
    sign: '+' | '−';
    tone: string;
    names: string[];
    label: string;
    /** The sentences the documents state these changes in, for the hover. */
    rawText?: string;
}

/** The rail's B1 card: the arrival and departure lines, the first three shown
 * and the rest behind an expander. The lines say who moved and where; the
 * attendance in force is the roll call, one card above. A line reconstructed
 * from attendance diffs has no sentence to hover. */
export function AttendanceChangesCard({ changes, subjects, attendanceChanges = [] }: {
    changes: Extract<TimelineItem, { type: 'presence' }>[];
    subjects: MinutesSubject[];
    /** The changes as the minutes carry them — the only place the stated sentence lives. */
    attendanceChanges?: MinutesAttendanceChange[];
}) {
    const tPage = useTranslations('admin.decisionsPage');
    const tSubject = useTranslations('Subject');
    const [expanded, setExpanded] = useState(false);

    const subjectLabel = (atSubjectId: string): string => {
        const subject = subjects.find(s => s.subjectId === atSubjectId);
        return subject ? (getAgendaLabel(tSubject, subject) ?? subject.name) : atSubjectId;
    };

    // The timeline item carries names only; the sentence comes back off the
    // minutes by where the change was observed, its direction and the name.
    const rawTextByChange = new Map<string, string>();
    for (const c of attendanceChanges) {
        if (c.rawText) rawTextByChange.set(`${c.atSubject.id}|${c.type}|${c.name}`, c.rawText);
    }
    const sentencesFor = (observedAtId: string, type: 'arrival' | 'departure', names: string[]): string | undefined => {
        const texts = names
            .map(n => rawTextByChange.get(`${observedAtId}|${type}|${n}`))
            .filter((t): t is string => !!t);
        return texts.length ? [...new Set(texts)].join(' ') : undefined;
    };

    const lines: ChangeLine[] = changes.flatMap(c => {
        const label = subjectLabel(c.observedAtId);
        const out: ChangeLine[] = [];
        if (c.arrivals.length) out.push({
            key: `${c.observedAtId}-arr`, sign: '+', tone: 'text-green-700', names: c.arrivals, label,
            rawText: sentencesFor(c.observedAtId, 'arrival', c.arrivals),
        });
        if (c.departures.length) out.push({
            key: `${c.observedAtId}-dep`, sign: '−', tone: 'text-red-700', names: c.departures, label,
            rawText: sentencesFor(c.observedAtId, 'departure', c.departures),
        });
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
                    <div key={line.key} className="flex items-baseline gap-1.5 text-muted-foreground" title={line.rawText}>
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
