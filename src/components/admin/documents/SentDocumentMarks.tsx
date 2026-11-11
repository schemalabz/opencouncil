'use client';

import { AlertTriangle, CheckCircle } from 'lucide-react';
import type { DocumentSendTrigger } from '@prisma/client';
import { missingCountOf, type DocumentSendSummary } from '@/lib/db/types';
import { DOCUMENT_KINDS, DOCUMENT_NAMES, splitRecipients } from '@/lib/documents/settings';
import { DEFAULT_TIMEZONE, formatNumericDateTime } from '@/lib/formatters/time';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** Why a send went out, in the words of the admin list. */
const TRIGGER_LABELS = {
    review: 'after the review',
    complete: 'all decisions in',
    threshold: 'deadline',
    manual: 'by hand',
} as const satisfies Record<DocumentSendTrigger, string>;

/** The recipients on one line: To first, CC after. */
export function recipientsLine(recipientEmails: string[]): string {
    const { to, cc } = splitRecipients(recipientEmails);
    if (!to) return '';
    return cc.length > 0 ? `To: ${to} · CC: ${cc.join(', ')}` : `To: ${to}`;
}

/**
 * What the tooltip of a mark says: when and why the document went out, what
 * it lacked, and to whom. The admin table spans cities and has no city
 * timezone at hand, so it reads Athens time, as the row's date does.
 */
export function sentDetails(send: DocumentSendSummary): string[] {
    const when = send.sentAt ? ` ${formatNumericDateTime(send.sentAt, DEFAULT_TIMEZONE, 'el', false)}` : '';
    const lines = [`${DOCUMENT_NAMES[send.kind].en} sent${when} (${TRIGGER_LABELS[send.trigger]}).`];
    const missing = missingCountOf(send);
    if (missing > 0) lines.push(`Provisional: ${missing} subject${missing === 1 ? '' : 's'} had no decision.`);
    if (send.recipientEmails.length > 0) lines.push(recipientsLine(send.recipientEmails));
    return lines;
}

/**
 * A mark for each document of the meeting that went out to the municipality,
 * with its details on hover: green when complete, amber with the count when
 * the minutes went out provisional. The decisions page of the meeting shows
 * where the minutes stand and sends them by hand. One send per document: the
 * query keeps the latest.
 */
export function SentDocumentMarks({ sends }: { sends: DocumentSendSummary[] }) {
    if (sends.length === 0) return null;
    // In the order of DOCUMENT_KINDS, whichever went out first
    const ordered = [...sends].sort((a, b) => DOCUMENT_KINDS.indexOf(a.kind) - DOCUMENT_KINDS.indexOf(b.kind));
    return (
        <TooltipProvider>
            <div className="flex flex-col items-center gap-0.5">
                {ordered.map(send => {
                    const missing = missingCountOf(send);
                    const Icon = missing > 0 ? AlertTriangle : CheckCircle;
                    return (
                        <Tooltip key={send.kind}>
                            <TooltipTrigger asChild>
                                <span className={cn('inline-flex cursor-help items-center gap-1 text-[10px]', missing > 0 ? 'text-amber-700 dark:text-amber-500' : 'text-muted-foreground')}>
                                    <Icon className={cn('h-3 w-3', missing > 0 ? 'text-amber-600' : 'text-green-600')} aria-hidden />
                                    {DOCUMENT_NAMES[send.kind].en}
                                    {missing > 0 && <span className="tabular-nums">({missing})</span>}
                                </span>
                            </TooltipTrigger>
                            <TooltipContent>
                                <div className="max-w-xs space-y-1 text-xs">
                                    {sentDetails(send).map(line => <p key={line}>{line}</p>)}
                                </div>
                            </TooltipContent>
                        </Tooltip>
                    );
                })}
            </div>
        </TooltipProvider>
    );
}
