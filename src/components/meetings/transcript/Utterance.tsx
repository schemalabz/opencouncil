"use client";
import { Utterance } from "@prisma/client";
import React, { useEffect, useState } from "react";
import { useTranslations } from 'next-intl';
import { useVideoActions } from "../VideoProvider";
import { useTranscriptOptions } from "../options/OptionsContext";
import { useHighlight } from "../HighlightContext";
import { editUtterance, updateUtteranceTimestamps } from "@/lib/db/utterance";
import { useCouncilMeetingActions } from "../CouncilMeetingDataContext";
import { Button } from "@/components/ui/button";
import { Check, X, Trash2, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useEditing } from "../EditingContext";
import { formatTimestamp } from "@/lib/formatters/time";

const UtteranceC: React.FC<{
    utterance: Utterance,
    onUpdate?: (updatedUtterance: Utterance) => void
}> = React.memo(({ utterance, onUpdate }) => {
    const { currentTimeRef, seekToWithoutScroll, togglePlayPause, seekTo } = useVideoActions();
    const { options } = useTranscriptOptions();
    const { editingHighlight, updateHighlightUtterances } = useHighlight();
    // Stable actions context — see CouncilMeetingDataContext. With ~9K
    // utterances, anything that re-renders all of them defeats memoization.
    const { deleteUtterance, updateUtterance } = useCouncilMeetingActions();
    const { selectedUtteranceIds, toggleSelection } = useEditing();

    const [isEditing, setIsEditing] = useState(false);
    const [localUtterance, setLocalUtterance] = useState(utterance);
    const [editedText, setEditedText] = useState(utterance.text);
    const [editedStartTime, setEditedStartTime] = useState(utterance.startTimestamp);
    const [editedEndTime, setEditedEndTime] = useState(utterance.endTimestamp);
    const { toast } = useToast();
    const t = useTranslations('transcript.utterance');

    // Check if selected in Editing Context
    const isSelected = selectedUtteranceIds.has(localUtterance.id);

    // Update local state when prop changes
    useEffect(() => {
        setLocalUtterance(utterance);
        setEditedText(utterance.text);
        setEditedStartTime(utterance.startTimestamp);
        setEditedEndTime(utterance.endTimestamp);
    }, [utterance]);

    // Check if this utterance is highlighted in the current editing highlight
    const isHighlighted = editingHighlight?.highlightedUtterances.some(hu => hu.utteranceId === localUtterance.id) || false;

    const isTaskModified = localUtterance.lastModifiedBy === 'task' && options.editable && !editingHighlight;
    const isUserModified = localUtterance.lastModifiedBy && localUtterance.lastModifiedBy !== 'task' && options.editable && !editingHighlight;
    const isUncertain = localUtterance.uncertain && options.editable && !editingHighlight;

    const className = cn(
        "cursor-pointer hover:bg-accent utterance transcript-text transition-colors duration-100",
        {
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
            seekToWithoutScroll(localUtterance.startTimestamp);
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
                seekToWithoutScroll(localUtterance.startTimestamp);
            } else {
                 // Standard click: Seek & Edit
                 setIsEditing(true);
                 seekToWithoutScroll(localUtterance.startTimestamp);
            }
        } else {
            seekToWithoutScroll(localUtterance.startTimestamp);
        }
    };

    const handleEdit = async (e: React.FormEvent | React.MouseEvent) => {
        e.preventDefault();
        const originalText = localUtterance.text;
        const originalStart = localUtterance.startTimestamp;
        const originalEnd = localUtterance.endTimestamp;
        
        // Check what changed
        const textChanged = editedText !== originalText;
        const timestampsChanged = editedStartTime !== originalStart || editedEndTime !== originalEnd;

        // Nothing changed - just close the editor
        if (!textChanged && !timestampsChanged) {
            setIsEditing(false);
            return;
        }

        // Optimistic update - immediate
        setLocalUtterance({ 
            ...localUtterance, 
            text: editedText,
            startTimestamp: editedStartTime,
            endTimestamp: editedEndTime
        });
        setIsEditing(false);
        
        // Background save
        try {
            // Update text first
            const updatedUtterance = await editUtterance(localUtterance.id, editedText);
            
            // Then update timestamps if they changed
            if (timestampsChanged) {
                const { utterance: finalUtterance } = await updateUtteranceTimestamps(
                    localUtterance.id, 
                    editedStartTime, 
                    editedEndTime
                );
                setLocalUtterance(finalUtterance);
                
                // Update everything in context in one call
                // This will automatically recalculate and update segment timestamps
                updateUtterance(localUtterance.speakerSegmentId, localUtterance.id, {
                    text: editedText,
                    startTimestamp: editedStartTime,
                    endTimestamp: editedEndTime,
                    lastModifiedBy: finalUtterance.lastModifiedBy
                });
                
                // Call onUpdate if provided (for future extensibility)
                onUpdate?.(finalUtterance);
            } else {
                setLocalUtterance(updatedUtterance);
                
                // Update just the text in context
                updateUtterance(localUtterance.speakerSegmentId, localUtterance.id, { text: editedText, lastModifiedBy: updatedUtterance.lastModifiedBy });
                
                // Call onUpdate if provided (for future extensibility)
                onUpdate?.(updatedUtterance);
            }
        } catch (error) {
            console.error('Failed to edit utterance:', error);
            // Silent revert
            setLocalUtterance({ 
                ...localUtterance, 
                text: originalText,
                startTimestamp: originalStart,
                endTimestamp: originalEnd
            });
            setEditedText(originalText);
            setEditedStartTime(originalStart);
            setEditedEndTime(originalEnd);
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
        setEditedStartTime(localUtterance.startTimestamp);
        setEditedEndTime(localUtterance.endTimestamp);
    };

    const setStartTimeToCurrentVideo = () => {
        setEditedStartTime(currentTimeRef.current);
    };

    const setEndTimeToCurrentVideo = () => {
        setEditedEndTime(currentTimeRef.current);
    };

    const handleDeleteUtterance = async (e: React.MouseEvent) => {
        e.stopPropagation();
        
        // Delete immediately without confirmation since utterance is empty
        try {
            await deleteUtterance(localUtterance.id);
            toast({
                description: t('toasts.utteranceDeletedSuccessfully', { defaultValue: 'Utterance deleted successfully' }),
            });
        } catch (error) {
            toast({
                title: t('common.error'),
                description: t('toasts.deleteError', { defaultValue: 'Failed to delete utterance' }),
                variant: 'destructive'
            });
        }
    };

    if (localUtterance.drift > options.maxUtteranceDrift) {
        return <span id={localUtterance.id} className="hover:bg-accent utterance transcript-text" />;
    }

    if (isEditing) {
        return (
            <div className="relative w-full py-1 border border-blue-300 rounded-md p-2 bg-blue-50/30">
                {/* Text Editor */}
                <form onSubmit={handleEdit} className="relative">
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
                            } else if (e.code === 'BracketLeft' && e.shiftKey) {
                                e.preventDefault();
                                setStartTimeToCurrentVideo();
                            } else if (e.code === 'BracketRight' && e.shiftKey) {
                                e.preventDefault();
                                setEndTimeToCurrentVideo();
                            } else if (e.key === 'ArrowLeft' && e.shiftKey) {
                                e.preventDefault();
                                const newTime = Math.max(0, currentTimeRef.current - options.skipInterval);
                                seekTo(newTime);
                            } else if (e.key === 'ArrowRight' && e.shiftKey) {
                                e.preventDefault();
                                seekTo(currentTimeRef.current + options.skipInterval);
                            } else if (e.key === ' ' && e.shiftKey) {
                                e.preventDefault();
                                togglePlayPause();
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
                    <div className="absolute top-1 right-1 flex gap-1">
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
                </form>
                
                {/* Timestamp Controls - Bottom, subtle */}
                <div className="flex items-center justify-end gap-2 mt-1 pt-1 border-t border-gray-200">
                    <span className="text-[10px] text-gray-400 mr-1">⏱️</span>
                    <div className="flex items-center gap-0.5">
                        <span className="px-1.5 py-0.5 text-[10px] font-mono bg-gray-50 rounded text-gray-500">
                            {formatTimestamp(editedStartTime, true)}
                        </span>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-4 w-4 p-0 hover:bg-blue-50"
                                    onClick={setStartTimeToCurrentVideo}
                                >
                                    <Clock className="h-2.5 w-2.5 text-gray-400 hover:text-blue-500" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="text-xs">Set start to current time (Shift+[)</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                    <span className="text-[10px] text-gray-300">→</span>
                    <div className="flex items-center gap-0.5">
                        <span className="px-1.5 py-0.5 text-[10px] font-mono bg-gray-50 rounded text-gray-500">
                            {formatTimestamp(editedEndTime, true)}
                        </span>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-4 w-4 p-0 hover:bg-blue-50"
                                    onClick={setEndTimeToCurrentVideo}
                                >
                                    <Clock className="h-2.5 w-2.5 text-gray-400 hover:text-blue-500" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="text-xs">Set end to current time (Shift+])</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                </div>
            </div>
        );
    }

    // Show placeholder for empty utterances in editing mode
    const isEmptyUtterance = !localUtterance.text.trim();
    const displayText = options.editable && isEmptyUtterance
        ? '[Empty utterance - click to edit]'
        : localUtterance.text + ' ';

    const emptyUtteranceClass = options.editable && isEmptyUtterance
        ? 'text-muted-foreground italic'
        : '';

    // Right-click is handled by the single shared <UtteranceContextMenu> at
    // the Transcript level — it locates the target via these data-attributes
    // and renders one set of items instead of one Radix Menu per utterance.
    const utteranceSpan = (
        <span
            className={cn(className, emptyUtteranceClass)}
            id={localUtterance.id}
            data-utterance-id={localUtterance.id}
            data-segment-id={localUtterance.speakerSegmentId}
            data-start-timestamp={localUtterance.startTimestamp}
            onClick={handleClick}
        >
            {displayText}
        </span>
    );

    // Inline delete button for empty utterances in editing mode.
    if (options.editable && isEmptyUtterance && !isEditing) {
        return (
            <span className="inline-flex items-center gap-1 group">
                {utteranceSpan}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100"
                            onClick={handleDeleteUtterance}
                        >
                            <Trash2 className="h-3 w-3 text-red-600" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Delete empty utterance</p>
                    </TooltipContent>
                </Tooltip>
            </span>
        );
    }

    return utteranceSpan;
});

UtteranceC.displayName = 'UtteranceC';

export default UtteranceC;
