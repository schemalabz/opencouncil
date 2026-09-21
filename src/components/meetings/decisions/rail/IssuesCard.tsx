"use client";

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExplainDerivationLink, SeverityChip, SeverityDot } from '@/components/meetings/decisions/auditGlossary';
import { RailCard } from '@/components/ui/rail-card';
import { ISSUE_SEVERITY } from '@/lib/derivation/issueCatalogue';
import { renderIssue, renderIssueStages } from '@/lib/derivation/issueText';
import type { Issue, IssueCode } from '@/lib/derivation/types';

const SEVERITY_ORDER: Record<Issue['severity'], number> = { error: 0, warning: 1, info: 2 };

/** One code's rows, with the worst severity any of them carries. */
interface CodeGroup {
    code: IssueCode;
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
 * code and expandable to what each count is made of. The page owns the
 * derivation; this only shows it.
 *
 * Expanding a code answers what it means, not just which rows carry it: its
 * severity in words, the step or steps that raise it, and then every row's own
 * message in full. The severity and the steps sit above the list because they
 * belong to the code, not to any one row; the messages sit in it because they
 * are parameterised per row.
 */
export function IssuesCard({ issues, subjectName, onExplainDerivation }: {
    issues: Issue[];
    /** Names the subject an issue belongs to; the meeting-wide ones have none. */
    subjectName?: (subjectId: string) => string | undefined;
    /** Opens the page's account of the whole derivation. The link is offered only when there is one. */
    onExplainDerivation?: () => void;
}) {
    const tPage = useTranslations('admin.decisionsPage');
    const [openCode, setOpenCode] = useState<string | null>(null);
    const groups = groupIssuesByCode(issues);

    return (
        <RailCard title={tPage('issues.title')}>
            <div className="space-y-1.5 text-xs">
                {groups.length === 0 && <div className="text-muted-foreground">{tPage('issues.none')}</div>}
                {groups.map(group => {
                    // What the derivation says about the code, not what this
                    // meeting's rows happen to carry — the catalogue states it
                    // once and the card reads that statement.
                    const severity = ISSUE_SEVERITY[group.code];
                    const open = openCode === group.code;
                    return (
                        <div key={group.code}>
                            <button
                                type="button"
                                aria-expanded={open}
                                onClick={() => setOpenCode(prev => (prev === group.code ? null : group.code))}
                                className="flex w-full items-baseline justify-between gap-2 text-left"
                            >
                                <span className="inline-flex min-w-0 items-baseline gap-1.5">
                                    <SeverityDot severity={severity} />
                                    <span className="truncate underline decoration-dotted decoration-muted-foreground/70 underline-offset-2 hover:decoration-foreground">
                                        {tPage(`issues.codes.${group.code}`)}
                                    </span>
                                </span>
                                <span className="shrink-0 tabular-nums text-muted-foreground">{group.issues.length}</span>
                            </button>
                            {open && (
                                <div className="mt-1.5 pl-3">
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <SeverityChip severity={severity} />
                                        <span className="text-[11px] text-muted-foreground/80">
                                            {renderIssueStages(tPage, group.code)}
                                        </span>
                                    </div>
                                    <ul className="mt-1.5 space-y-1.5 border-l-2 border-foreground/10 pl-2 text-muted-foreground">
                                        {group.issues.map((issue, i) => (
                                            <li key={`${issue.subjectId ?? ''}-${issue.personId ?? ''}-${i}`}>
                                                {issue.subjectId && (
                                                    <span className="block text-foreground/80">
                                                        {subjectName?.(issue.subjectId) ?? issue.subjectId}
                                                    </span>
                                                )}
                                                <span className="block leading-relaxed">{renderIssue(tPage, issue)}</span>
                                                {/* The document's own words, which used to
                                                    be reachable only by hovering the row. */}
                                                {issue.rawText && (
                                                    <span className="block text-muted-foreground/70">{`«${issue.rawText}»`}</span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            {onExplainDerivation && (
                <div className="mt-2.5 border-t pt-2">
                    <ExplainDerivationLink onClick={onExplainDerivation} />
                </div>
            )}
        </RailCard>
    );
}
