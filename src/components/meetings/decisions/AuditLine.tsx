"use client";

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { renderIssue, renderIssueStages } from '@/lib/derivation/issueText';
import { cn } from '@/lib/utils';
import { ExplainDerivationLink, SeverityChip, SeverityDot } from './auditGlossary';
import type { AuditSignal } from './auditSignal';

type T = ReturnType<typeof useTranslations>;

/**
 * The line's words: a short signal phrase and, when there is one, a muted
 * detail after it.
 *
 * @translationNamespace admin.decisionsPage
 */
function describe(t: T, signal: AuditSignal): { phrase: string; detail: string | null } {
    switch (signal.kind) {
        case 'issues':
            return {
                // The code's short label, the same one the rail's issues card
                // counts under — the line and the card name a thing alike.
                phrase: t(`issues.codes.${signal.code}`),
                detail: signal.extraIssues > 0 ? t('audit.moreIssues', { n: signal.extraIssues }) : null,
            };
        case 'phraseOnly':
            return { phrase: t('audit.phraseOnly'), detail: null };
        case 'inferredVotes':
            return {
                phrase: t('audit.inferredVotes'),
                detail: t('audit.ofTotal', { n: signal.inferred, total: signal.derivedVotes }),
            };
        case 'stated':
            return { phrase: t('audit.namedInDocument'), detail: null };
    }
}

/**
 * What a subject looks like under audit mode: one line under its title, in the
 * slot `ProposalLine` uses, saying how its outcome came to be — and, for a
 * line that names an issue, what that issue actually says.
 *
 * A full border and no stripes. The house hazard pattern marks back-of-house
 * surfaces everywhere else, but this line is Greek prose someone has to read
 * word by word, and 7%-alpha diagonals behind it cost more legibility than the
 * signal is worth. The border is the same orange the stripes are made of, so
 * the line still reads as staff-only.
 *
 * Severity colours the dot and nothing else. A red row would read as "this
 * decision is wrong" when it almost always means "nobody has pressed confirm",
 * and the row's own amber ground is already spoken for — it means a proposal is
 * waiting for an answer.
 *
 * The phrase wraps rather than truncating. `ProposalLine` above it truncates,
 * but what it cuts is a subject title — variable-length text whose first words
 * still identify it. The phrase here IS the signal, drawn from a short fixed
 * vocabulary of issue labels, and «Διαφωνία διάταξης παρουσιολο…» tells a
 * reader nothing they could act on.
 *
 * The explanation opens in place, inside the line's own border, rather than in
 * a tooltip or a glossary of every code there is: the question is asked at the
 * code someone is looking at, and it is answered there. Closed by default,
 * because a table of forty rows each shouting a paragraph is not an audit.
 */
export function AuditLine({ signal, onExplainDerivation }: {
    signal: AuditSignal;
    /** Opens the page's account of the whole derivation. The link is offered only when there is one. */
    onExplainDerivation?: () => void;
}) {
    const t = useTranslations('admin.decisionsPage');
    const [open, setOpen] = useState(false);
    const { phrase, detail } = describe(t, signal);
    const { issue, severity } = signal;

    return (
        <div
            aria-label={t('audit.lineLabel')}
            className={cn(
                'mt-1 max-w-full flex-col rounded-[7px] border border-[hsl(var(--orange))]/20 px-2 text-[12px] leading-snug',
                // Closed, the box hugs its phrase so it reads as a marker on the
                // row. Open, it is a panel and takes the cell, so a short message
                // does not leave a stub of a box under a wide title. Measured on
                // the real page the Θέμα cell is only 218-290px, so both states
                // wrap either way — this is about the short-message case.
                open ? 'flex w-full py-1.5' : 'inline-flex py-0.5',
            )}
        >
            <div className="flex items-start gap-1.5">
                <SeverityDot severity={severity} className="mt-[5px]" />
                <span className="min-w-0">
                    {/* A line with nothing further to say stays plain text, so
                        every dotted underline in the table is a real offer. */}
                    {issue ? (
                        <button
                            type="button"
                            aria-expanded={open}
                            onClick={() => setOpen(value => !value)}
                            className="text-left underline decoration-dotted decoration-muted-foreground/70 underline-offset-2 hover:decoration-foreground"
                        >
                            {phrase}
                        </button>
                    ) : phrase}
                    {detail && <span className="ml-1.5 text-muted-foreground">{detail}</span>}
                </span>
                {open && issue && <SeverityChip severity={severity} className="ml-auto mt-0.5" />}
            </div>
            {open && issue && (
                <>
                    <p className="ml-[13px] mt-1.5 border-l-2 border-foreground/10 pl-2 leading-relaxed text-muted-foreground">
                        {renderIssue(t, issue)}
                    </p>
                    <div className="ml-[13px] mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[11px] text-muted-foreground/80">{renderIssueStages(t, issue.code)}</span>
                        {onExplainDerivation && <ExplainDerivationLink onClick={onExplainDerivation} />}
                    </div>
                </>
            )}
        </div>
    );
}
