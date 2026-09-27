"use client";

import { useTranslations } from 'next-intl';
import { SeverityDot } from './auditGlossary';
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
        case 'inferredVotes':
            return {
                phrase: t('audit.inferredVotes'),
                detail: t('audit.ofTotal', { n: signal.inferred, total: signal.derivedVotes }),
            };
        case 'stated':
            return { phrase: t('audit.namedInDocument'), detail: null };
    }
}

const OFFER = 'text-left underline decoration-dotted decoration-muted-foreground/70 underline-offset-2 hover:decoration-foreground';

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
 * vocabulary of issue labels, and a label cut in half tells a reader nothing
 * they could act on.
 *
 * The line only names the worst issue. Its explanation, and every other issue
 * of the subject, open in a row of their own under the subject
 * (`AuditIssueRow`): the Θέμα cell is 218-290px wide on the real page, too
 * narrow for a paragraph, let alone twelve. The issue's name and «+X ακόμη»
 * both open that row, so the count is an offer too, not a dead number.
 */
export function AuditLine({ signal, open, onOpen, controls }: {
    signal: AuditSignal;
    /** Whether the subject's issue row is open. */
    open: boolean;
    /** Opens or closes the subject's issue row. */
    onOpen: () => void;
    /** The id of that row, for `aria-controls`. */
    controls: string;
}) {
    const t = useTranslations('admin.decisionsPage');
    const { phrase, detail } = describe(t, signal);
    const hasIssues = signal.kind === 'issues';

    return (
        <div
            aria-label={t('audit.lineLabel')}
            className="mt-1 inline-flex max-w-full rounded-[7px] border border-[hsl(var(--orange))]/20 px-2 py-0.5 text-[12px] leading-snug"
        >
            <div className="flex items-start gap-1.5">
                <SeverityDot severity={signal.severity} className="mt-[5px]" />
                <span className="min-w-0">
                    {/* A line with nothing further to say stays plain text, so
                        every dotted underline in the table is a real offer. */}
                    {hasIssues ? (
                        <button type="button" aria-expanded={open} aria-controls={controls} onClick={onOpen} className={OFFER}>
                            {phrase}
                        </button>
                    ) : phrase}
                    {/* A real space, so the phrase and the detail do not run
                        together when read aloud or copied. */}
                    {detail && ' '}
                    {detail && (hasIssues ? (
                        <button
                            type="button"
                            aria-expanded={open}
                            aria-controls={controls}
                            onClick={onOpen}
                            className={`ml-1 text-muted-foreground ${OFFER}`}
                        >
                            {detail}
                            <span className="sr-only">{` — ${t('audit.moreIssuesAction')}`}</span>
                        </button>
                    ) : <span className="ml-1 text-muted-foreground">{detail}</span>)}
                </span>
            </div>
        </div>
    );
}
