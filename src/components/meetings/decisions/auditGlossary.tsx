"use client";

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { IssueSeverity } from '@/lib/derivation/issueCatalogue';

/**
 * The vocabulary both audit surfaces speak — the table's line under a subject
 * and the rail's issues card.
 *
 * It lives in one module because a reader meets the same code in both places
 * and has to be taught it once: the same dot colour, the same word for the
 * severity, the same offer to see the whole derivation. Each surface kept its
 * own copy of the colours until now, which is two chances to drift.
 */

const DOT: Record<IssueSeverity, string> = {
    error: 'bg-red-600',
    warning: 'bg-amber-500',
    info: 'bg-muted-foreground/40',
};

/**
 * Severity at a glance. Grey is the resting state, not a defect — see
 * `auditSignal.ts` on why a healthy meeting stays grey.
 */
export function SeverityDot({ severity, className }: { severity: IssueSeverity; className?: string }) {
    return <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DOT[severity], className)} aria-hidden />;
}

const CHIP: Record<IssueSeverity, string> = {
    error: 'border-red-600/30 text-red-700',
    warning: 'border-amber-600/35 text-amber-700',
    info: 'border-muted-foreground/25 text-muted-foreground',
};

/**
 * The severity in words, shown only inside an opened explanation. A colour
 * answers "how bad" only to someone who already knows the key; a reader who
 * has just asked what a code means is exactly the reader who does not.
 */
export function SeverityChip({ severity, className }: { severity: IssueSeverity; className?: string }) {
    const t = useTranslations('admin.decisionsPage');
    return (
        <span
            className={cn(
                'shrink-0 rounded-[5px] border px-1.5 py-px text-[10px] uppercase leading-[1.5] tracking-[0.04em]',
                CHIP[severity],
                className,
            )}
        >
            {t(`issues.severity.${severity}`)}
        </span>
    );
}

/**
 * The way out of a single code and into the whole picture: the five steps a
 * fact passes through, in the page's own dialog.
 *
 * A button rather than an anchor — the destination is a dialog on this page,
 * and the page owns it. Rendered only where a caller passed a way to open it,
 * so the offer is never dead.
 */
export function ExplainDerivationLink({ onClick, className }: { onClick: () => void; className?: string }) {
    const t = useTranslations('admin.decisionsPage');
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn('text-[11px] text-muted-foreground hover:text-foreground hover:underline', className)}
        >
            {`${t('issues.howDerived')} →`}
        </button>
    );
}
