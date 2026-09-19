import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/** The page's decision-number badge. Exported so the questions card, the link
 * panel, its subject picker and the table's proposal line all label a decision
 * the same way. `className` carries what one call site needs on top — the
 * table's stacked reading order — without that site rebuilding the badge. */
export function Chip({ children, strike, className }: { children: ReactNode; strike?: boolean; className?: string }) {
    return (
        <Badge
            variant="outline"
            className={cn('shrink-0 font-mono text-[11px] font-normal', strike && 'text-muted-foreground line-through', className)}
        >
            {children}
        </Badge>
    );
}

export interface RecordRowProps {
    /** What names the record at a glance: a decision's number chip, or a
     * subject's «το θέμα 12». Left out when the title already says it. */
    lead?: ReactNode;
    /**
     * The record's own words — a decision's title, a subject's name.
     *
     * Two lines, not one: this used to share a single flex line with the lead,
     * the meta, the open link and the action button, and a title cut to
     * "Έγκριση απόφα…" tells a clerk nothing about which record this is.
     */
    title: string | null;
    /** The muted second line: when it was published, which subject holds it,
     * that it still waits for an answer. Pass `null` when there is nothing to
     * say — an empty line here reads as a missing fact. */
    meta?: ReactNode;
    /** The quiet control that opens the PDF, when the row has one. */
    open?: ReactNode;
    /** The one button the row exists for. */
    action: ReactNode;
    /**
     * The row's other answer, under the button. «Δεν αφορά τη συνεδρίαση»
     * beside the title, where it used to sit, read as a statement about the
     * title rather than as the second of two answers to the same question.
     */
    secondary?: ReactNode;
    /**
     * What opens under the row, inside its frame — the subject picker for an
     * unmatched decision. The frame belongs to the row, so a panel it holds
     * needs no second one around the pair.
     */
    footer?: ReactNode;
}

/**
 * One record offered for an answer: a decision in the link panel, a subject in
 * the subject picker.
 *
 * The controls sit beside the whole block and stay centred against it, so a
 * row whose title takes two lines does not leave its buttons stranded at the
 * top with dead space underneath.
 *
 * Below `sm` they sit under it instead. The number chip and the two controls
 * take about 210px of a row that cannot shrink, which on a phone left the
 * title around 80 characters-worth of nothing — "Έγκριση παρ…" names no
 * record. The full width of the card is what makes the title readable again.
 */
export function RecordRow({ lead, title, meta, open, action, secondary, footer }: RecordRowProps) {
    return (
        <div className="overflow-hidden rounded-lg border border-border/60 bg-background">
            <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                        {lead}
                        <span className="line-clamp-2 min-w-0 text-sm" title={title ?? undefined}>{title}</span>
                    </div>
                    {meta && <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className="flex items-center gap-2">
                        {open}
                        {action}
                    </div>
                    {secondary}
                </div>
            </div>
            {footer}
        </div>
    );
}
