"use client";

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { RailCard } from '@/components/ui/rail-card';
import { renderIssue } from '@/lib/derivation/issueText';
import type { Issue } from '@/lib/derivation/types';

const SEVERITY_ORDER: Record<Issue['severity'], number> = { error: 0, warning: 1, info: 2 };

const SEVERITY_DOT: Record<Issue['severity'], string> = {
    error: 'bg-red-600',
    warning: 'bg-amber-500',
    info: 'bg-muted-foreground/40',
};

/** One code's rows, with the worst severity any of them carries. */
interface CodeGroup {
    code: string;
    severity: Issue['severity'];
    issues: Issue[];
}

/** The meeting's issues grouped by code — worst severity first, then the biggest group. */
export function groupIssuesByCode(issues: Issue[]): CodeGroup[] {
    const byCode = new Map<string, CodeGroup>();
    for (const issue of issues) {
        const group = byCode.get(issue.code);
        if (!group) byCode.set(issue.code, { code: issue.code, severity: issue.severity, issues: [issue] });
        else {
            group.issues.push(issue);
            if (SEVERITY_ORDER[issue.severity] < SEVERITY_ORDER[group.severity]) group.severity = issue.severity;
        }
    }
    return [...byCode.values()].sort((a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
        || b.issues.length - a.issues.length
        || a.code.localeCompare(b.code));
}

/**
 * The rail's issues card: what the derivation could not settle, counted per
 * code and expandable to the rows behind each count. The page owns the
 * derivation; this only shows it.
 */
export function IssuesCard({ issues, subjectName }: {
    issues: Issue[];
    /** Names the subject an issue belongs to; the meeting-wide ones have none. */
    subjectName?: (subjectId: string) => string | undefined;
}) {
    const tPage = useTranslations('admin.decisionsPage');
    const [openCode, setOpenCode] = useState<string | null>(null);
    const groups = groupIssuesByCode(issues);

    return (
        <RailCard title={tPage('issues.title')}>
            <div className="space-y-1.5 text-xs">
                {groups.length === 0 && <div className="text-muted-foreground">{tPage('issues.none')}</div>}
                {groups.map(group => (
                    <div key={group.code}>
                        <button
                            type="button"
                            aria-expanded={openCode === group.code}
                            onClick={() => setOpenCode(prev => (prev === group.code ? null : group.code))}
                            className="flex w-full items-baseline justify-between gap-2 text-left hover:underline"
                        >
                            <span className="inline-flex min-w-0 items-baseline gap-1.5">
                                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[group.severity]}`} aria-hidden />
                                <span className="truncate">{tPage(`issues.codes.${group.code}`)}</span>
                            </span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">{group.issues.length}</span>
                        </button>
                        {openCode === group.code && (
                            <ul className="mt-1 space-y-1 pl-3 text-muted-foreground">
                                {group.issues.map((issue, i) => (
                                    <li key={`${issue.subjectId ?? ''}-${issue.personId ?? ''}-${i}`} title={issue.rawText ?? renderIssue(tPage, issue)}>
                                        {issue.subjectId ? (subjectName?.(issue.subjectId) ?? issue.subjectId) : renderIssue(tPage, issue)}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                ))}
            </div>
        </RailCard>
    );
}
