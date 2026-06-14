'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import type { DispatchOutcome, DispatchPhase } from '@/hooks/useSequentialDispatch';

interface BatchProgressViewProps<T> {
    phase: DispatchPhase;
    items: T[];
    currentIndex: number;
    results: DispatchOutcome<T>[];
    cancelled: boolean;
    getItemKey: (item: T) => string;
    getItemLabel: (item: T) => string;
    title: { executing: string; done: string };
    /** Verb for the in-progress line, e.g. "Processing" or "Polling". */
    currentVerb: string;
    /** Optional content rendered in the done phase (e.g. a follow-up link). */
    doneExtra?: ReactNode;
    onCancel: () => void;
    onClose: () => void;
}

export function BatchProgressView<T>({
    phase,
    items,
    currentIndex,
    results,
    cancelled,
    getItemKey,
    getItemLabel,
    title,
    currentVerb,
    doneExtra,
    onCancel,
    onClose,
}: BatchProgressViewProps<T>) {
    if (phase === 'idle') return null;

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const remaining = items.length - results.length;
    const progressPercent = items.length > 0 ? (results.length / items.length) * 100 : 0;

    return (
        <>
            <DialogHeader>
                <DialogTitle>{phase === 'executing' ? title.executing : title.done}</DialogTitle>
                <DialogDescription>
                    {succeeded} dispatched, {failed} failed
                    {remaining > 0 && `, ${remaining} remaining`}
                    {cancelled && ' (cancelled)'}
                </DialogDescription>
            </DialogHeader>

            <Progress value={progressPercent} className="w-full" />

            {phase === 'executing' && currentIndex < items.length && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {currentVerb}: {getItemLabel(items[currentIndex])}
                </div>
            )}

            <ScrollArea className="max-h-60 border rounded-md">
                <div className="p-2 space-y-1">
                    {results.map((result) => (
                        <div key={getItemKey(result.item)} className="flex items-center gap-2 text-sm">
                            {result.success
                                ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                                : <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                            }
                            <span className="text-xs truncate">{getItemLabel(result.item)}</span>
                            {result.error && (
                                <span className="text-red-600 text-xs truncate">— {result.error}</span>
                            )}
                        </div>
                    ))}
                </div>
            </ScrollArea>

            {phase === 'done' && doneExtra}

            <DialogFooter>
                {phase === 'executing' ? (
                    <Button variant="destructive" onClick={onCancel}>Cancel</Button>
                ) : (
                    <Button variant="outline" onClick={onClose}>Close</Button>
                )}
            </DialogFooter>
        </>
    );
}
