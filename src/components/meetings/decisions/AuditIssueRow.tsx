"use client";

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { ISSUE_SEVERITY, groupByCode } from '@/lib/derivation/issueCatalogue';
import { renderIssue, renderIssuePerson, renderIssueStages } from '@/lib/derivation/issueText';
import { ExplainDerivationLink, SeverityChip, SeverityDot } from './auditGlossary';
import type { AuditIssue } from './auditSignal';
import { IssueEvidence, type EvidenceLinks } from './IssueEvidence';

/**
 * Every issue of one subject, in a row that spans the whole table under the
 * subject's own row — what the audit line opens.
 *
 * Grouped by code, in the order the rail's card uses, because a subject with
 * twelve issues is usually two codes: five members voting while absent and
 * seven the list dropped read as two findings, not twelve. The severity and
 * the steps belong to the code, so they head the group; the message, the
 * member and the document's own words belong to each issue, so they are
 * listed under it.
 *
 * A region named by its heading, so `aria-controls` on the line points a
 * screen reader at something with a name.
 */
export function AuditIssueRow({ id, issues, onClose, onExplainDerivation, evidenceLinks }: {
    id: string;
    issues: AuditIssue[];
    onClose: () => void;
    /** Opens the page's account of the whole derivation. The link is offered only when there is one. */
    onExplainDerivation?: () => void;
    /** Where a statement cited by an issue can be checked: the recording, the sheet. */
    evidenceLinks?: EvidenceLinks;
}) {
    const t = useTranslations('admin.decisionsPage');
    const headingId = useId();
    const groups = groupByCode(issues, entry => entry.issue.code);

    return (
        <section
            id={id}
            aria-labelledby={headingId}
            className="rounded-[7px] border border-[hsl(var(--orange))]/20 px-3 py-2.5 text-[12px] leading-snug"
        >
            <div className="flex items-center justify-between gap-3">
                <h3 id={headingId} className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[hsl(var(--orange))]/70">
                    {t('audit.issueRow.heading', { n: issues.length })}
                </h3>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t('audit.issueRow.close')}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                    <X className="h-3.5 w-3.5" aria-hidden />
                </button>
            </div>
            <ul className="mt-2 space-y-3">
                {groups.map(group => {
                    const severity = ISSUE_SEVERITY[group.code];
                    return (
                        <li key={group.code} data-code={group.code}>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <SeverityDot severity={severity} />
                                <span className="font-medium text-foreground">{t(`issues.codes.${group.code}`)}</span>
                                {group.items.length > 1 && (
                                    <span className="text-muted-foreground">{t('audit.issueRow.times', { n: group.items.length })}</span>
                                )}
                                <SeverityChip severity={severity} />
                                <span className="text-[11px] text-muted-foreground/80">{renderIssueStages(t, group.code)}</span>
                            </div>
                            <ul className="ml-[3px] mt-1.5 space-y-1.5 border-l-2 border-foreground/10 pl-2.5 text-muted-foreground">
                                {group.items.map(({ issue, person }, i) => {
                                    const message = renderIssue(t, issue);
                                    return (
                                        <li key={`${issue.personId ?? ''}-${i}`} className="leading-relaxed">
                                            {/* The message says «the member»; this says which one. */}
                                            {person && <span className="block font-medium text-foreground/80">{renderIssuePerson(t, person)}</span>}
                                            <span className="block">{message}</span>
                                            {/* The document's own words, unless the message already quotes them. */}
                                            {issue.rawText && !message.includes(issue.rawText) && (
                                                <span className="block text-muted-foreground/70">{`«${issue.rawText}»`}</span>
                                            )}
                                            <IssueEvidence issue={issue} links={evidenceLinks} />
                                        </li>
                                    );
                                })}
                            </ul>
                        </li>
                    );
                })}
            </ul>
            {onExplainDerivation && (
                <div className="mt-2.5 border-t border-foreground/10 pt-2">
                    <ExplainDerivationLink onClick={onExplainDerivation} />
                </div>
            )}
        </section>
    );
}
