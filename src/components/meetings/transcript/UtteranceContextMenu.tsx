"use client";
import React, { useCallback, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeftToLine, ArrowRightToLine, Copy, Loader2, Scissors, Star } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useShare } from '@/contexts/ShareContext';
import { useToast } from '@/hooks/use-toast';

import { useCouncilMeetingActions } from '../CouncilMeetingDataContext';
import { useEditing } from '../EditingContext';
import { useHighlight } from '../HighlightContext';
import { useTranscriptOptions } from '../options/OptionsContext';

interface ContextTarget {
    id: string;
    segmentId: string;
    startTimestamp: number;
    x: number;
    y: number;
}

/**
 * Single shared right-click menu for the entire transcript.
 *
 * Per-utterance `<ContextMenu>` instances each register a document-level
 * `keydown` listener (Radix Menu uses one to track keyboard-vs-mouse usage).
 * On a 9K-utterance transcript that turned every keystroke into a 9K-listener
 * fanout — measured ~412ms per keydown. Hosting a single menu here drops it
 * to one listener while preserving the original UX.
 *
 * The wrapper captures `contextmenu`, finds the target utterance via
 * `closest('[data-utterance-id]')`, and opens a controlled DropdownMenu
 * positioned at the cursor via a virtual trigger.
 */
export function UtteranceContextMenu({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    const [target, setTarget] = useState<ContextTarget | null>(null);
    const pendingShareRef = useRef<number | null>(null);

    const { options } = useTranscriptOptions();
    const { editingHighlight, createHighlight } = useHighlight();
    const { selectedUtteranceIds, isProcessing, toggleSelection, clearSelection, extractSelectedSegment } = useEditing();
    const { moveUtterancesToPrevious, moveUtterancesToNext } = useCouncilMeetingActions();
    const { openShareDropdownAndCopy } = useShare();
    const { toast } = useToast();
    const t = useTranslations('transcript.utterance');

    const canStartHighlight = options.canCreateHighlights && !editingHighlight && !options.editable;
    const canShare = !editingHighlight && !options.editable;
    const hasAnyAction = canStartHighlight || options.editable || canShare;

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        if (!hasAnyAction) return;
        const span = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-utterance-id]');
        if (!span) return; // outside an utterance — let the system menu show
        const id = span.dataset.utteranceId;
        const segmentId = span.dataset.segmentId;
        if (!id || !segmentId) return;
        const startTimestamp = parseFloat(span.dataset.startTimestamp || '0');

        e.preventDefault();
        setTarget({ id, segmentId, startTimestamp, x: e.clientX, y: e.clientY });
        setOpen(true);

        // Mirror the original per-utterance behavior: temporarily select the
        // right-clicked utterance for visual feedback unless it's already in
        // the user's deliberate selection.
        if (!selectedUtteranceIds.has(id)) {
            toggleSelection(id, { shift: false, ctrl: false });
        }
    }, [hasAnyAction, selectedUtteranceIds, toggleSelection]);

    const handleOpenChange = useCallback((next: boolean) => {
        setOpen(next);
        if (next) return;
        // Closing — flush a deferred share, then clear any temp selection.
        if (pendingShareRef.current !== null) {
            openShareDropdownAndCopy(pendingShareRef.current);
            pendingShareRef.current = null;
        }
        if (selectedUtteranceIds.size === 1) {
            clearSelection();
        }
        // Depend on the full Set, not just `.size`. Each selection change
        // produces a new Set identity, so we recreate this callback even when
        // size stays the same (e.g., right-clicking utterance B while A was
        // the lone selection swaps the contents but keeps size = 1).
    }, [clearSelection, openShareDropdownAndCopy, selectedUtteranceIds]);

    const targetSelected = target ? selectedUtteranceIds.has(target.id) : false;

    const handleStartHighlight = useCallback(async () => {
        if (!target) return;
        await createHighlight({
            preSelectedUtteranceId: target.id,
            onSuccess: () => toast({
                title: t('toasts.highlightCreated'),
                description: t('toasts.highlightCreatedDescription'),
            }),
            onError: () => toast({
                title: t('common.error'),
                description: t('toasts.createHighlightError'),
                variant: 'destructive',
            }),
        });
    }, [target, createHighlight, toast, t]);

    const handleMoveToPrevious = useCallback(() => {
        if (!target) return;
        const { id, segmentId } = target;
        toast({
            title: t('toasts.moveUtterances'),
            description: t('toasts.moveToPreviousDescription'),
            action: (
                <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                        moveUtterancesToPrevious(id, segmentId);
                        toast({ description: t('toasts.utterancesMovedSuccessfully') });
                    }}
                >
                    {t('toasts.confirm')}
                </Button>
            ),
        });
    }, [target, moveUtterancesToPrevious, toast, t]);

    const handleMoveToNext = useCallback(() => {
        if (!target) return;
        const { id, segmentId } = target;
        toast({
            title: t('toasts.moveUtterances'),
            description: t('toasts.moveToNextDescription'),
            action: (
                <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                        moveUtterancesToNext(id, segmentId);
                        toast({ description: t('toasts.utterancesMovedSuccessfully') });
                    }}
                >
                    {t('toasts.confirm')}
                </Button>
            ),
        });
    }, [target, moveUtterancesToNext, toast, t]);

    const handleShareFromHere = useCallback(() => {
        if (!target) return;
        // Defer until after the menu closes so Share's dropdown isn't fighting
        // ours for focus / dismissal.
        pendingShareRef.current = target.startTimestamp;
    }, [target]);

    return (
        <div onContextMenu={handleContextMenu}>
            {children}
            <DropdownMenu open={open} onOpenChange={handleOpenChange}>
                <DropdownMenuTrigger asChild>
                    <div
                        aria-hidden
                        style={{
                            position: 'fixed',
                            left: target?.x ?? 0,
                            top: target?.y ?? 0,
                            width: 0,
                            height: 0,
                            pointerEvents: 'none',
                        }}
                    />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    {target && canStartHighlight && (
                        <DropdownMenuItem onClick={handleStartHighlight}>
                            <Star className="h-4 w-4 mr-2" />
                            {t('contextMenu.startHighlightFromHere')}
                        </DropdownMenuItem>
                    )}
                    {target && options.editable && (
                        <>
                            {canStartHighlight && <DropdownMenuSeparator />}
                            <DropdownMenuItem
                                onClick={() => extractSelectedSegment()}
                                disabled={isProcessing || (!targetSelected && selectedUtteranceIds.size > 0)}
                            >
                                {isProcessing
                                    ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    : <Scissors className="h-4 w-4 mr-2" />}
                                {t('contextMenu.extractSegment', { defaultValue: 'Extract Segment' })}
                                {targetSelected && <span className="ml-auto text-xs text-muted-foreground pl-4">e</span>}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleMoveToPrevious}>
                                <ArrowLeftToLine className="h-4 w-4 mr-2" />
                                {t('contextMenu.moveToPreviousSegment')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleMoveToNext}>
                                <ArrowRightToLine className="h-4 w-4 mr-2" />
                                {t('contextMenu.moveToNextSegment')}
                            </DropdownMenuItem>
                        </>
                    )}
                    {target && canShare && (
                        <DropdownMenuItem onClick={handleShareFromHere}>
                            <Copy className="h-4 w-4 mr-2" />
                            {t('contextMenu.shareFromHere')}
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
