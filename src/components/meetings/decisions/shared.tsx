"use client"

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
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
