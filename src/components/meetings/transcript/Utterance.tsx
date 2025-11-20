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
import { ArrowLeftToLine, ArrowRightToLine, Copy, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { useShare } from "@/contexts/ShareContext";

const UtteranceC: React.FC<{
    utterance: Utterance,
    onUpdate?: (updatedUtterance: Utterance) => void
}> = React.memo(({ utterance, onUpdate }) => {
    const { currentTime, seekTo } = useVideo();
    const [isActive, setIsActive] = useState(false);
    const { options } = useTranscriptOptions();
    const { editingHighlight, updateHighlightUtterances, createHighlight } = useHighlight();
    const { moveUtterancesToPrevious, moveUtterancesToNext } = useCouncilMeetingData();
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
        "cursor-pointer hover:bg-accent utterance transcript-text",
        {
            "bg-accent": isActive,
            "font-bold underline": isHighlighted,
            "text-blue-500 font-bold underline": isTaskModified,
            "decoration-green-500 underline decoration-2": isUserModified,
            "text-red-500 font-bold": isUncertain,
        }
    );

    const handleClick = () => {
        // If we're in highlight editing mode, handle highlight toggling and seek to utterance
        if (editingHighlight) {
            updateHighlightUtterances(localUtterance.id, isHighlighted ? 'remove' : 'add');
            // Seek to the utterance timestamp so user can easily play and listen to what they highlighted
            seekTo(localUtterance.startTimestamp);
        } else if (options.editable) {
            setIsEditing(true);
            seekTo(localUtterance.startTimestamp);
        } else {
            seekTo(localUtterance.startTimestamp);
        }
    };

    const handleEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const updatedUtterance = await editUtterance(localUtterance.id, editedText);
            setLocalUtterance(updatedUtterance);
            onUpdate?.(updatedUtterance);
            setIsEditing(false);
        } catch (error) {
            console.error('Failed to edit utterance:', error);
            // Optionally show an error message to the user
        }
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

    if (localUtterance.drift > options.maxUtteranceDrift) {
        return <span id={localUtterance.id} className="hover:bg-accent utterance transcript-text" />;
    }

    if (isEditing) {
        return (
            <form onSubmit={handleEdit} className="w-full py-1">
                <textarea
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleEdit(e);
                        } else if (e.key === 'Escape') {
                            setIsEditing(false);
                            setEditedText(localUtterance.text);
                        }
                    }}
                    className="w-full resize-none border border-gray-300 rounded px-2 py-1 text-sm min-h-[2.5em] transcript-text"
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
            if (!open && pendingShareAction) {
                // Context menu closed - execute pending share action
                openShareDropdownAndCopy(pendingShareAction);
                setPendingShareAction(null);
            } else if (open && pendingShareAction) {
                // Context menu opened again - clear any stale pending action
                setPendingShareAction(null);
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