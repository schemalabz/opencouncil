"use client";

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { AuditSignal } from './auditSignal';

/**
 * The severity dots, in the vocabulary the rail's issues card already teaches.
 * Kept by hand rather than imported: `rail/IssuesCard.tsx` does not export its
 * map, and the two have to read the same or a reader learns the colour twice.
 */
const SEVERITY_DOT: Record<AuditSignal['severity'], string> = {
    error: 'bg-red-600',
    warning: 'bg-amber-500',
    info: 'bg-muted-foreground/40',
};

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
 * slot `ProposalLine` uses, saying how its outcome came to be.
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
 */
export function AuditLine({ signal }: { signal: AuditSignal }) {
    const t = useTranslations('admin.decisionsPage');
    const { phrase, detail } = describe(t, signal);
    return (
        <div
            aria-label={t('audit.lineLabel')}
            className="mt-1 inline-flex max-w-full items-start gap-1.5 rounded-[7px] border border-[hsl(var(--orange))]/20 px-2 py-0.5 text-[12px] leading-snug"
        >
            <span className={cn('mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full', SEVERITY_DOT[signal.severity])} aria-hidden />
            <span className="min-w-0">
                {phrase}
                {detail && <span className="ml-1.5 text-muted-foreground">{detail}</span>}
            </span>
        </div>
    );
}
