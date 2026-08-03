"use client";
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeftToLine, ArrowRightToLine, ClipboardCopy, Copy, ListEnd, ListStart, Loader2, Scissors, Star, Trash2 } from 'lucide-react';

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
    // Captured at right-click time so the menu's open/focus changes don't
    // collapse the selection before "Copy text" runs.
    selectedText: string;
    utteranceText: string;
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
    // Tracks whether handleContextMenu applied a temp utterance selection
    // for visual feedback, so the close handler only clears what it added.
    const didTempSelectRef = useRef(false);
    // "Select from here" anchor for range-add via the context menu. Lives
    // only here — independent of the shift-click anchor in HighlightContext
    // so it isn't overwritten by stray clicks between "from" and "until".
    const [rangeAnchorId, setRangeAnchorId] = useState<string | null>(null);

    const { options } = useTranscriptOptions();
    const { editingHighlight, createHighlight, addUtteranceRangeToHighlight } = useHighlight();
    const { selectedUtteranceIds, isProcessing, toggleSelection, clearSelection, extractSelectedSegment, confirmDeleteSelected } = useEditing();
    const { moveUtterancesToPrevious, moveUtterancesToNext } = useCouncilMeetingActions();
    const { openShareDropdownAndCopy } = useShare();
    const { toast } = useToast();
    const t = useTranslations('transcript.utterance');

    const canStartHighlight = options.canCreateHighlights && !editingHighlight && !options.editable;
    const canShare = !editingHighlight && !options.editable;
    const canRangeSelect = Boolean(editingHighlight);
    // "Copy text" is universally available, so the menu always opens on an
    // utterance. The original `hasAnyAction` gate is no longer needed.

    // Clear the range anchor whenever the user switches highlights or exits
    // highlight-edit mode — a stale anchor from a previous highlight would
    // produce nonsensical ranges.
    useEffect(() => {
        setRangeAnchorId(null);
    }, [editingHighlight?.id]);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        const span = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-utterance-id]');
        if (!span) return; // outside an utterance — let the system menu show
        const id = span.dataset.utteranceId;
        const segmentId = span.dataset.segmentId;
        if (!id || !segmentId) return;
        const startTimestamp = parseFloat(span.dataset.startTimestamp || '0');

        // Capture the user's text selection BEFORE preventDefault / state
        // updates that might collapse it. `getSelection()` is global; if the
        // user has nothing selected, this is an empty string.
        const selectedText = window.getSelection()?.toString() ?? '';
        const utteranceText = (span.textContent ?? '').trim();

        e.preventDefault();
        setTarget({ id, segmentId, startTimestamp, x: e.clientX, y: e.clientY, selectedText, utteranceText });
        setOpen(true);

        // Temp-select the right-clicked utterance for visual feedback —
        // but skip it when the user already has a text selection (which is
        // their own feedback; bolding only the clicked utterance would
        // misrepresent a multi-utterance selection), when this utterance is
        // already deliberately selected, or in highlight-edit mode (where
        // font-semibold would stack on font-bold and EditingContext state
        // would mutate for no visible reason).
        if (!selectedText && !editingHighlight && !selectedUtteranceIds.has(id)) {
            toggleSelection(id, { shift: false, ctrl: false });
            didTempSelectRef.current = true;
        }
    }, [editingHighlight, selectedUtteranceIds, toggleSelection]);

    const handleOpenChange = useCallback((next: boolean) => {
        setOpen(next);
        if (next) return;
        // Closing — flush a deferred share, then clear any temp selection.
        if (pendingShareRef.current !== null) {
            openShareDropdownAndCopy(pendingShareRef.current);
            pendingShareRef.current = null;
        }
        if (didTempSelectRef.current) {
            clearSelection();
            didTempSelectRef.current = false;
        }
    }, [clearSelection, openShareDropdownAndCopy]);

    const targetSelected = target ? selectedUtteranceIds.has(target.id) : false;

    const handleCopyText = useCallback(async () => {
        if (!target) return;
        // Prefer the user's manual selection; fall back to the utterance's
        // full text. Matches what native "Copy" would have produced.
        const text = target.selectedText.trim() || target.utteranceText;
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            toast({
                title: t('common.error'),
                description: t('toasts.copyError'),
                variant: 'destructive',
            });
        }
    }, [target, toast, t]);

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

    const handleSelectFromHere = useCallback(() => {
        if (!target) return;
        setRangeAnchorId(target.id);
    }, [target]);

    const handleSelectUntilHere = useCallback(() => {
        if (!target || !rangeAnchorId) return;
        // Only clear the anchor when the range actually committed — if the
        // call no-ops (e.g. every utterance in the range is already in the
        // highlight), preserve the anchor so the user isn't forced to
        // re-set it just to try a different "until here".
        const added = addUtteranceRangeToHighlight(rangeAnchorId, target.id);
        if (added) setRangeAnchorId(null);
    }, [target, rangeAnchorId, addUtteranceRangeToHighlight]);

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
                    {target && (
                        <DropdownMenuItem onClick={handleCopyText}>
                            <ClipboardCopy className="h-4 w-4 mr-2" />
                            {t('contextMenu.copyText')}
                        </DropdownMenuItem>
                    )}
                    {target && canRangeSelect && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleSelectFromHere}>
                                <ListStart className="h-4 w-4 mr-2" />
                                {t('contextMenu.selectFromHere')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleSelectUntilHere} disabled={!rangeAnchorId}>
                                <ListEnd className="h-4 w-4 mr-2" />
                                {t('contextMenu.selectUntilHere')}
                            </DropdownMenuItem>
                        </>
                    )}
                    {target && canStartHighlight && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleStartHighlight}>
                                <Star className="h-4 w-4 mr-2" />
                                {t('contextMenu.startHighlightFromHere')}
                            </DropdownMenuItem>
                        </>
                    )}
                    {target && options.editable && (
                        <>
                            <DropdownMenuSeparator />
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
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={() => {
                                    // Snapshot ids synchronously: the menu's
                                    // close handler (handleOpenChange) will clear
                                    // the temp-selection before our deferred call
                                    // runs, so we can't rely on selectedUtteranceIds
                                    // being intact inside setTimeout.
                                    const ids = selectedUtteranceIds.size > 0
                                        ? Array.from(selectedUtteranceIds)
                                        : [target!.id];
                                    // Defer dialog opening so the Radix DropdownMenu's
                                    // DismissableLayer fully unmounts and restores
                                    // body.style.pointerEvents first. Mounting the
                                    // Dialog while pointer-events:'none' is still on
                                    // <body> causes Radix to cache 'none' as the
                                    // original and re-apply it on close, freezing
                                    // the page.
                                    setTimeout(() => confirmDeleteSelected(ids), 0);
                                }}
                                disabled={isProcessing}
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                {selectedUtteranceIds.size > 1
                                    ? t('contextMenu.deleteSelectedUtterances', { count: selectedUtteranceIds.size })
                                    : t('contextMenu.deleteUtterance')}
                            </DropdownMenuItem>
                        </>
                    )}
                    {target && canShare && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleShareFromHere}>
                                <Copy className="h-4 w-4 mr-2" />
                                {t('contextMenu.shareFromHere')}
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
