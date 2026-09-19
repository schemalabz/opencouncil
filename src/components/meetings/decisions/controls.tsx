import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * A row that puts a sentence on the left and the control that answers it at the
 * right edge, opposite it.
 *
 * `justify-between` rather than `ml-auto` on the control: when the pair no
 * longer fits on one line, the control wraps onto a line of its own, where
 * `justify-between` leaves it at the left edge under the sentence instead of
 * floating at the right of an otherwise empty line. Add `items-center` for a
 * one-line sentence, `items-start` for a sentence with a second line under it.
 */
export const ANSWER_ROW = 'flex flex-wrap justify-between gap-x-4 gap-y-2';

/**
 * The sentence in an {@link ANSWER_ROW}. The basis is the width below which the
 * sentence stops sharing its line: without it a long sentence takes the whole
 * line on its own and pushes the control below it at every width.
 */
export const ANSWER_ROW_TEXT = 'min-w-0 flex-1 basis-[22rem]';

/**
 * The shell both picker panels open in: a strip under the thing it answers
 * for, set apart by a top line and a quieter ground.
 */
export const PANEL_SHELL = 'border-t border-border/60 bg-muted/40 px-5 pb-4 pt-4';

/**
 * Added to {@link PANEL_SHELL} only by a panel that opens under a table row.
 * The indent lines the panel's contents up with the Θέμα column, so it applies
 * only where that column exists: from `md` up, where the row grid is on. A
 * panel that opens anywhere else — the subject picker, inside the questions
 * card — has no column to align to, and the indent would only eat its width.
 */
export const PANEL_TABLE_INDENT = 'md:pl-20';

/**
 * The page's quiet control: a real button that reads as a link.
 *
 * Every secondary answer on this page wears it — close, undo, open the
 * document, fall back to an ΑΔΑ — so that the filled buttons are only ever the
 * thing the person came to do.
 */
export function QuietButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            type="button"
            className={cn(
                'text-[13px] text-muted-foreground underline underline-offset-[3px] hover:text-foreground disabled:opacity-50',
                className,
            )}
            {...props}
        />
    );
}
