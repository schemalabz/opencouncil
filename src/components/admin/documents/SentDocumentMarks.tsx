'use client';

import { CheckCircle } from 'lucide-react';
import type { DocumentSendSummary } from '@/lib/db/types';
import { DOCUMENT_KINDS, DOCUMENT_NAMES } from '@/lib/documents/settings';
import { formatNumericDateTime } from '@/lib/formatters/time';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/** The recipients on one line: To first, CC after. */
export function recipientsLine(recipientEmails: string[]): string {
    if (recipientEmails.length === 0) return '';
    const [to, ...cc] = recipientEmails;
    return cc.length > 0 ? `To: ${to} · CC: ${cc.join(', ')}` : `To: ${to}`;
}

/** What the tooltip of a mark says: when and why the document went out, what it lacked, and to whom. */
export function sentDetails(send: DocumentSendSummary): string[] {
    const lines = [`${DOCUMENT_NAMES[send.document].en} sent${send.sentAt ? ` ${formatNumericDateTime(send.sentAt, undefined, 'el', false)}` : ''} (${send.trigger}).`];
    if (!send.complete) {
        const missing = send.missingSubjectIds.length;
        lines.push(`Provisional: ${missing} subject${missing === 1 ? '' : 's'} had no decision.`);
    }
    if (send.recipientEmails.length > 0) lines.push(recipientsLine(send.recipientEmails));
    return lines;
}

/**
 * A check mark for each document of the meeting that went out to the
 * municipality, with its details on hover. The decisions page of the meeting
 * shows where the minutes stand and sends them by hand.
 */
export function SentDocumentMarks({ sends }: { sends: DocumentSendSummary[] }) {
    const sent = DOCUMENT_KINDS.flatMap(document => sends.filter(send => send.document === document).slice(0, 1));
    if (sent.length === 0) return null;
    return (
        <TooltipProvider>
            <div className="flex flex-col items-center gap-0.5">
                {sent.map(send => (
                    <Tooltip key={send.document}>
                        <TooltipTrigger asChild>
                            <span className="inline-flex cursor-help items-center gap-1 text-[10px] text-muted-foreground">
                                <CheckCircle className="h-3 w-3 text-green-600" aria-hidden />
                                {DOCUMENT_NAMES[send.document].en}
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>
                            <div className="max-w-xs space-y-1 text-xs">
                                {sentDetails(send).map(line => <p key={line}>{line}</p>)}
                            </div>
                        </TooltipContent>
                    </Tooltip>
                ))}
            </div>
        </TooltipProvider>
    );
}
