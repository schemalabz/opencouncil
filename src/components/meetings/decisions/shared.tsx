"use client"

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight, Users } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { MeetingAttendanceRecord } from '@/lib/db/decisions';
import { PersonWithRelations } from '@/lib/db/people';
import { compareRanks, getElectedOrderForBody } from '@/lib/sorting/people';

// Display-only building blocks for decision content. No admin actions live
// here — a future public decisions view reuses these as-is.

export function CollapsibleMarkdown({ content, showMoreLabel, showLessLabel }: {
    content: string;
    showMoreLabel: string;
    showLessLabel: string;
}) {
    const [expanded, setExpanded] = useState(false);
    const isLong = content.length > 300;
    return (
        <div>
            <div className={isLong && !expanded ? 'max-h-24 overflow-hidden relative' : ''}>
                <div className="prose prose-xs max-w-none text-xs [&_p]:mb-1.5 [&_p]:leading-relaxed [&_ol]:ml-4 [&_ol]:list-decimal [&_ul]:ml-4 [&_ul]:list-disc [&_li]:mb-0.5">
                    <ReactMarkdown>{content}</ReactMarkdown>
                </div>
                {isLong && !expanded && (
                    <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background to-transparent" />
                )}
            </div>
            {isLong && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="text-primary hover:underline text-xs mt-1"
                >
                    {expanded ? showLessLabel : showMoreLabel}
                </button>
            )}
        </div>
    );
}

export function NameList({ names, label }: { names: string[]; label: string }) {
    const [expanded, setExpanded] = useState(false);
    if (names.length === 0) return null;
    return (
        <span>
            <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
            >
                {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {label}
            </button>
            {expanded && (
                <span className="block text-xs text-muted-foreground mt-1 ml-4">
                    {names.join(', ')}
                </span>
            )}
        </span>
    );
}

/** Sort names by elected order, falling back to alphabetical. */
export function sortNamesByElectedOrder(
    items: { personId: string; personName: string }[],
    getPerson: (id: string) => PersonWithRelations | undefined,
    administrativeBodyId: string | null,
): { personId: string; personName: string }[] {
    return [...items].sort((a, b) => {
        const aOrder = getElectedOrderForBody(getPerson(a.personId), administrativeBodyId);
        const bOrder = getElectedOrderForBody(getPerson(b.personId), administrativeBodyId);
        const orderCompare = compareRanks(aOrder, bOrder);
        if (orderCompare !== 0) return orderCompare;
        return a.personName.localeCompare(b.personName);
    });
}

export function MeetingAttendanceSummary({ attendance, getPerson, administrativeBodyId, mayorPersonId }: {
    attendance: MeetingAttendanceRecord[];
    getPerson: (id: string) => PersonWithRelations | undefined;
    administrativeBodyId: string | null;
    mayorPersonId: string | null;
}) {
    const t = useTranslations('admin.decisionsPage');
    const [expanded, setExpanded] = useState(false);
    const filtered = attendance.filter(a => a.personId !== mayorPersonId);
    const present = filtered.filter(a => a.status === 'PRESENT');
    const absent = filtered.filter(a => a.status === 'ABSENT');

    const sortedPresent = sortNamesByElectedOrder(
        present.map(a => ({ personId: a.personId, personName: a.person.name })),
        getPerson, administrativeBodyId,
    );
    const sortedAbsent = sortNamesByElectedOrder(
        absent.map(a => ({ personId: a.personId, personName: a.person.name })),
        getPerson, administrativeBodyId,
    );

    return (
        <div className="border rounded-lg p-2.5 bg-muted/30">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1.5 w-full text-left"
            >
                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <Users className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">
                    {t('rollCall')}
                </span>
                <span className="text-xs text-muted-foreground ml-1">
                    {t('rollCallCounts', { present: present.length, absent: absent.length, total: filtered.length })}
                </span>
            </button>
            {expanded && (
                <div className="mt-2 ml-5 space-y-1.5">
                    <div>
                        <span className="text-[11px] font-medium text-green-700">{t('rollCallPresent')} ({sortedPresent.length})</span>
                        <p className="text-[11px] text-muted-foreground">{sortedPresent.map(a => a.personName).join(', ')}</p>
                    </div>
                    {sortedAbsent.length > 0 && (
                        <div>
                            <span className="text-[11px] font-medium text-red-700">{t('rollCallAbsent')} ({sortedAbsent.length})</span>
                            <p className="text-[11px] text-muted-foreground">{sortedAbsent.map(a => a.personName).join(', ')}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
