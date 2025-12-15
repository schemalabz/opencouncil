"use client";
import { Utterance } from "@prisma/client";
import React, { useEffect, useState } from "react";
import { useTranslations } from 'next-intl';
import { useVideo } from "../VideoProvider";
import { useTranscriptOptions } from "../options/OptionsContext";
import { useHighlight } from "../HighlightContext";
import { editUtterance } from "@/lib/db/utterance";
import { useCouncilMeetingData } from "../CouncilMeetingDataContext";
import { Button } from "@/components/ui/button";
import { ArrowLeftToLine, ArrowRightToLine, Copy, Star, Scissors, Loader2, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
    ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useShare } from "@/contexts/ShareContext";
import { useEditing } from "../EditingContext";
import { ACTIONS, useKeyboardShortcut } from "@/contexts/KeyboardShortcutsContext";

const UtteranceC: React.FC<{
    utterance: Utterance,
    onUpdate?: (updatedUtterance: Utterance) => void
}> = React.memo(({ utterance, onUpdate }) => {
    const { currentTime, seekTo } = useVideo();
    const [isActive, setIsActive] = useState(false);
    const { options } = useTranscriptOptions();
    const { editingHighlight, updateHighlightUtterances, createHighlight } = useHighlight();
    const { moveUtterancesToPrevious, moveUtterancesToNext } = useCouncilMeetingData();
    const { selectedUtteranceIds, toggleSelection, clearSelection, extractSelectedSegment, isProcessing } = useEditing();
    
    const [isEditing, setIsEditing] = useState(false);
    const [localUtterance, setLocalUtterance] = useState(utterance);
    const [editedText, setEditedText] = useState(utterance.text);
    const [pendingShareAction, setPendingShareAction] = useState<number | null>(null);
    const { toast } = useToast();
    const { openShareDropdownAndCopy } = useShare();
    const canEdit = options.editsAllowed;
    const t = useTranslations('transcript.utterance');

    const hasEditOptions = canEdit || options.editable;
    const hasShareOption = !editingHighlight;
    const hasContextMenuOptions = hasEditOptions || hasShareOption;

    // Check if selected in Editing Context
    const isSelected = selectedUtteranceIds.has(localUtterance.id);

    // Update local state when prop changes
    useEffect(() => {
        setLocalUtterance(utterance);
        setEditedText(utterance.text);
    }, [utterance]);

    useEffect(() => {
        const isActive = currentTime >= localUtterance.startTimestamp && currentTime <= localUtterance.endTimestamp;
        setIsActive(isActive);

        // Check if this utterance should be initially active based on URL param
        const urlParams = new URLSearchParams(window.location.search);
        const timeParam = urlParams.get('t');
        if (timeParam) {
            const seconds = parseInt(timeParam, 10);
            if (!isNaN(seconds) && seconds >= localUtterance.startTimestamp && seconds <= localUtterance.endTimestamp) {
                setIsActive(true);
                // If this is the target utterance, ensure it's visible
                const element = document.getElementById(localUtterance.id);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        }
    }, [currentTime, localUtterance.startTimestamp, localUtterance.endTimestamp, localUtterance.id]);

    // Check if this utterance is highlighted in the current editing highlight
    const isHighlighted = editingHighlight?.highlightedUtterances.some(hu => hu.utteranceId === localUtterance.id) || false;

    const isTaskModified = localUtterance.lastModifiedBy === 'task' && options.editable && !editingHighlight;
    const isUserModified = localUtterance.lastModifiedBy && localUtterance.lastModifiedBy !== 'task' && options.editable && !editingHighlight;
    const isUncertain = localUtterance.uncertain && options.editable && !editingHighlight;

    const className = cn(
        "cursor-pointer hover:bg-accent utterance transcript-text transition-colors duration-100",
        {
            "bg-accent": isActive,
            "font-semibold": isSelected,
            "font-bold underline": isHighlighted,
            "underline decoration-blue-500 decoration-2": isTaskModified,
            "decoration-green-500 underline decoration-2": isUserModified,
            "text-red-500 font-bold": isUncertain,
            "select-none": options.editable || editingHighlight, // Prevent text selection in modes with range selection
        }
    );

    const handleClick = (e: React.MouseEvent) => {
        // If we're in highlight editing mode, handle highlight toggling and seek to utterance
        if (editingHighlight) {
            // Pass shift modifier for range selection
            updateHighlightUtterances(
                localUtterance.id, 
                isHighlighted ? 'remove' : 'add',
                { shift: e.shiftKey }
            );
            // Seek to the utterance timestamp so user can easily play and listen to what they highlighted
            seekTo(localUtterance.startTimestamp);
        } else if (options.editable) {
            // Editing Mode: Handle Selection Logic
            // Prevent text editing if modifiers are present (intent is selection)
            if (e.shiftKey || e.ctrlKey || e.metaKey) {
                toggleSelection(localUtterance.id, {
                    shift: e.shiftKey,
                    ctrl: e.ctrlKey || e.metaKey
                });
            } else if (isSelected) {
                // Click on selected utterance: enable editing
                setIsEditing(true);
                seekTo(localUtterance.startTimestamp);
            } else {
                 // Standard click: Seek & Edit
                 setIsEditing(true);
                 seekTo(localUtterance.startTimestamp);
            }
        } else {
            seekTo(localUtterance.startTimestamp);
        }
    };

    const handleEdit = async (e: React.FormEvent | React.MouseEvent) => {
        e.preventDefault();
        const originalText = localUtterance.text;
        
        // Optimistic update - immediate
        setLocalUtterance({ ...localUtterance, text: editedText });
        setIsEditing(false);
        
        // Background save
        try {
            const updatedUtterance = await editUtterance(localUtterance.id, editedText);
            setLocalUtterance(updatedUtterance);
            onUpdate?.(updatedUtterance);
        } catch (error) {
            console.error('Failed to edit utterance:', error);
            // Silent revert
            setLocalUtterance({ ...localUtterance, text: originalText });
            setEditedText(originalText);
            toast({
                title: t('common.error'),
                description: t('toasts.editError'),
                variant: 'destructive'
            });
        }
    };

    const handleCancel = () => {
        setIsEditing(false);
        setEditedText(localUtterance.text);
    };

    const handleMoveUtterancesToPrevious = (e: React.MouseEvent) => {
        e.stopPropagation();
        toast({
            title: t('toasts.moveUtterances'),
            description: t('toasts.moveToPreviousDescription'),
            action: (
                <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                        moveUtterancesToPrevious(localUtterance.id, localUtterance.speakerSegmentId);
                        toast({
                            description: t('toasts.utterancesMovedSuccessfully'),
                        });
                    }}
                >
                    {t('toasts.confirm')}
                </Button>
            ),
        });
    };

    const handleMoveUtterancesToNext = (e: React.MouseEvent) => {
        e.stopPropagation();
        toast({
            title: t('toasts.moveUtterances'),
            description: t('toasts.moveToNextDescription'),
            action: (
                <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                        moveUtterancesToNext(localUtterance.id, localUtterance.speakerSegmentId);
                        toast({
                            description: t('toasts.utterancesMovedSuccessfully'),
                        });
                    }}
                >
                    {t('toasts.confirm')}
                </Button>
            ),
        });
    };

    const handleShareFromHere = (e: React.MouseEvent) => {
        e.stopPropagation();
        // Set pending action - will be executed when context menu closes
        setPendingShareAction(localUtterance.startTimestamp);
    };

    const handleStartHighlightHere = async (e: React.MouseEvent) => {
        e.stopPropagation();

        await createHighlight({
            preSelectedUtteranceId: localUtterance.id,
            onSuccess: (highlight) => {
                toast({
                    title: t('toasts.highlightCreated'),
                    description: t('toasts.highlightCreatedDescription'),
                    variant: "default",
                });
            },
            onError: (error) => {
                toast({
                    title: t('common.error'),
                    description: t('toasts.createHighlightError'),
                    variant: "destructive",
                });
            }
        });
    };
    
    const handleExtractSegment = async (e: React.MouseEvent) => {
        e.stopPropagation();
        
        // Extract the current selection (state is already updated from context menu open)
        await extractSelectedSegment();
    };

    if (localUtterance.drift > options.maxUtteranceDrift) {
        return <span id={localUtterance.id} className="hover:bg-accent utterance transcript-text" />;
    }

    if (isEditing) {
        return (
            <div className="relative w-full py-1">
                <form onSubmit={handleEdit}>
                    <textarea
                        spellCheck={true}
                        lang="el"
                        value={editedText}
                        onChange={(e) => setEditedText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleEdit(e);
                            } else if (e.key === 'Escape') {
                                handleCancel();
                            }
                        }}
                        className="w-full resize-none border border-gray-300 rounded px-2 py-1 pr-16 text-sm min-h-[2.5em] transcript-text"
                        autoFocus
                        rows={Math.max(1, editedText.split('\n').length)}
                        style={{
                            height: 'auto',
                            overflow: 'hidden'
                        }}
                        onInput={(e) => {
                            const target = e.target as HTMLTextAreaElement;
                            target.style.height = 'auto';
                            target.style.height = target.scrollHeight + 'px';
                        }}
                    />
                </form>
                <div className="absolute top-2 right-2 flex gap-1">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 hover:bg-green-100"
                                onClick={handleEdit}
                            >
                                <Check className="h-3.5 w-3.5 text-green-600" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{t('editing.saveShortcut')}</p>
                        </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 hover:bg-red-100"
                                onClick={handleCancel}
                            >
                                <X className="h-3.5 w-3.5 text-red-600" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{t('editing.cancelShortcut')}</p>
                        </TooltipContent>
                    </Tooltip>
                </div>
            </div>
        );
    }

    if (!hasContextMenuOptions) {
        return (
            <span className={className} id={localUtterance.id} onClick={handleClick}>
                {localUtterance.text + ' '}
            </span>
        );
    }

    return (
        <ContextMenu onOpenChange={(open) => {
            if (open) {
                // Context menu opened - select this utterance if not already selected
                // This provides visual feedback for what will be operated on
                if (!isSelected) {
                    toggleSelection(localUtterance.id, { shift: false, ctrl: false });
                }
                // Clear any stale pending share action
                if (pendingShareAction) {
                    setPendingShareAction(null);
                }
            } else {
                // Context menu closed
                if (pendingShareAction) {
                    // Execute pending share action first
                    openShareDropdownAndCopy(pendingShareAction);
                    setPendingShareAction(null);
                }
                // Only clear selection if there's just one selected (the temporary right-click selection)
                // If multiple utterances are selected, preserve the user's deliberate selection
                if (selectedUtteranceIds.size === 1) {
                    clearSelection();
                }
            }
        }}>
            <ContextMenuTrigger>
                <span className={className} id={localUtterance.id} onClick={handleClick}>
                    {localUtterance.text + ' '}
                </span>
            </ContextMenuTrigger>
            <ContextMenuContent>
                {canEdit && !editingHighlight && (
                    <ContextMenuItem onClick={handleStartHighlightHere}>
                        <Star className="h-4 w-4 mr-2" />
                        {t('contextMenu.startHighlightFromHere')}
                    </ContextMenuItem>
                )}
                {options.editable && (
                    <>
                        <ContextMenuSeparator />
                        <ContextMenuItem 
                            onClick={handleExtractSegment} 
                            disabled={isProcessing || (!isSelected && selectedUtteranceIds.size > 0)}
                        >
                            {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Scissors className="h-4 w-4 mr-2" />}
                            {t('contextMenu.extractSegment', { defaultValue: 'Extract Segment' })}
                            {isSelected && <span className="ml-auto text-xs text-muted-foreground pl-4">e</span>}
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem onClick={handleMoveUtterancesToPrevious}>
                            <ArrowLeftToLine className="h-4 w-4 mr-2" />
                            {t('contextMenu.moveToPreviousSegment')}
                        </ContextMenuItem>
                        <ContextMenuItem onClick={handleMoveUtterancesToNext}>
                            <ArrowRightToLine className="h-4 w-4 mr-2" />
                            {t('contextMenu.moveToNextSegment')}
                        </ContextMenuItem>
                    </>
                )}
                {!editingHighlight && (
                    <ContextMenuItem onClick={handleShareFromHere}>
                        <Copy className="h-4 w-4 mr-2" />
                        {t('contextMenu.shareFromHere')}
                    </ContextMenuItem>
                )}
            </ContextMenuContent>
        </ContextMenu>
    );
});

UtteranceC.displayName = 'UtteranceC';

export default UtteranceC;
