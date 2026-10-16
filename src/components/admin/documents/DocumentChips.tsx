'use client';

import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, CheckCircle, Clock, Loader2, Send } from 'lucide-react';
import type { DocumentChip, DocumentChipState } from '@/lib/documents/status';
import { visibleDocumentChips } from '@/lib/documents/status';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DOCUMENT_NAMES } from '@/lib/documents/settings';
import { formatNumericDateTime, formatNumericDate } from '@/lib/formatters/time';
import { cn } from '@/lib/utils';

/**
 * One glyph per state. Colour only where an operator has to look (attention):
 * a sent document is a plain green check, a waiting one is muted.
 */
const STATE_STYLE: Record<Exclude<DocumentChipState, 'notEnabled'>, { icon: LucideIcon; iconClassName: string; badgeClassName: string }> = {
    sent: { icon: CheckCircle, iconClassName: 'text-green-600', badgeClassName: 'text-foreground' },
    sentIncomplete: { icon: AlertTriangle, iconClassName: 'text-amber-600', badgeClassName: 'border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200' },
    pending: { icon: Loader2, iconClassName: 'text-muted-foreground animate-spin', badgeClassName: 'text-muted-foreground' },
    failed: { icon: AlertTriangle, iconClassName: 'text-red-600', badgeClassName: 'border-red-600/40 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200' },
    waiting: { icon: Clock, iconClassName: 'text-muted-foreground', badgeClassName: 'text-muted-foreground' },
    unsent: { icon: Send, iconClassName: 'text-amber-600', badgeClassName: 'border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200' },
};

/** A document left unsent by a reviewer's choice: no colour, because nobody has to act. */
const UNSENT_BY_CHOICE_STYLE = { icon: Send, iconClassName: 'text-muted-foreground', badgeClassName: 'text-muted-foreground' };

/** A reviewed meeting with no agenda: it waits, but only an operator can unblock it. */
const WAITING_FOR_OPERATOR_STYLE = { icon: Clock, iconClassName: 'text-amber-600', badgeClassName: STATE_STYLE.unsent.badgeClassName };

export function chipStyle(state: Exclude<DocumentChipState, 'notEnabled'>, attention: boolean) {
    if (state === 'unsent' && !attention) return UNSENT_BY_CHOICE_STYLE;
    if (state === 'waiting' && attention) return WAITING_FOR_OPERATOR_STYLE;
    return STATE_STYLE[state];
}

const STATE_LABEL: Record<Exclude<DocumentChipState, 'notEnabled'>, string> = {
    sent: 'Sent',
    sentIncomplete: 'Sent incomplete',
    pending: 'Sending',
    failed: 'Failed',
    waiting: 'Waiting',
    unsent: 'Not sent',
};

const WAIT_TEXT = {
    review: 'Waits for the human review.',
    agenda: 'Reviewed, but the meeting has no agenda subjects yet.',
    decisions: 'Waits for the decisions.',
} as const;

/** The recipients on one line: To first, CC after. */
export function recipientsLine(recipientEmails: string[]): string {
    if (recipientEmails.length === 0) return '';
    const [to, ...cc] = recipientEmails;
    return cc.length > 0 ? `To: ${to} · CC: ${cc.join(', ')}` : `To: ${to}`;
}

/** What the tooltip of a chip says: the state, the time and the trigger, what it waits for, the recipients. */
export function chipDetails(chip: DocumentChip): string[] {
    const lines: string[] = [];
    switch (chip.state) {
        case 'sent':
        case 'sentIncomplete':
            if (chip.sentAt) lines.push(`${STATE_LABEL[chip.state]} ${formatNumericDateTime(chip.sentAt, undefined, 'el', false)} (${chip.trigger}).`);
            if (chip.state === 'sentIncomplete') lines.push(`${chip.missingCount} subject${chip.missingCount === 1 ? '' : 's'} had no decision.`);
            break;
        case 'pending':
            lines.push('A send is in progress.');
            break;
        case 'failed':
            lines.push(`The send failed${chip.failureReason ? `: ${chip.failureReason}` : ''}.`);
            break;
        case 'waiting':
            if (chip.waitReason) lines.push(WAIT_TEXT[chip.waitReason]);
            if (chip.dueAt) lines.push(`Goes out at the latest on ${formatNumericDate(chip.dueAt)}.`);
            break;
        case 'unsent':
            lines.push(chip.document === 'transcript'
                ? 'Reviewed, and the reviewer did not send it.'
                : `Due, and not sent: ${chip.missingCount} subject${chip.missingCount === 1 ? '' : 's'} without a decision.`);
            break;
        case 'notEnabled':
            lines.push('The body does not send this document for this meeting.');
            break;
    }
    if (chip.recipientEmails.length > 0) lines.push(recipientsLine(chip.recipientEmails));
    return lines;
}

/** One compact chip: the state glyph and the document name. The state text lives in the tooltip. */
export function DocumentChipBadge({ chip }: { chip: DocumentChip }) {
    if (chip.state === 'notEnabled') return null;
    const style = chipStyle(chip.state, chip.attention);
    const Icon = style.icon;
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Badge variant="outline" className={cn('cursor-help gap-1 whitespace-nowrap px-1.5 text-xs font-normal', style.badgeClassName)}>
                    <Icon className={cn('h-3 w-3 shrink-0', style.iconClassName)} aria-label={STATE_LABEL[chip.state]} />
                    {DOCUMENT_NAMES[chip.document].en}
                    {chip.state === 'sentIncomplete' && <span className="tabular-nums">({chip.missingCount})</span>}
                </Badge>
            </TooltipTrigger>
            <TooltipContent>
                <div className="max-w-xs space-y-1 text-xs">
                    <p className="font-medium">{STATE_LABEL[chip.state]}</p>
                    {chipDetails(chip).map((line) => <p key={line}>{line}</p>)}
                </div>
            </TooltipContent>
        </Tooltip>
    );
}

/** The chips of a meeting: one per document the body sends. A muted dash when it sends none. */
export function DocumentChips({ chips }: { chips: DocumentChip[] }) {
    const visible = visibleDocumentChips(chips);
    if (visible.length === 0) {
        return <span className="text-sm text-muted-foreground">-</span>;
    }
    return (
        <TooltipProvider>
            <div className="flex flex-wrap gap-1">
                {visible.map((chip) => <DocumentChipBadge key={chip.document} chip={chip} />)}
            </div>
        </TooltipProvider>
    );
}
