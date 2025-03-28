"use client";
import { SpeakerTag, Utterance } from "@prisma/client";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import React, { useEffect, useState, useMemo } from "react";
import { useVideo } from "../VideoProvider";
import { useTranscriptOptions } from "../options/OptionsContext";
import { editUtterance } from "@/lib/db/utterance";
import { HighlightWithUtterances } from "@/lib/db/highlights";
import { useCouncilMeetingData } from "../CouncilMeetingDataContext";
import { Button } from "@/components/ui/button";
import { ArrowLeftToLine, ArrowRightToLine } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";

const UtteranceC: React.FC<{
    utterance: Utterance,
    onUpdate?: (updatedUtterance: Utterance) => void
}> = React.memo(({ utterance, onUpdate }) => {
    const { currentTime, seekTo } = useVideo();
    const [isActive, setIsActive] = useState(false);
    const { options, updateOptions } = useTranscriptOptions();
    const { moveUtterancesToPrevious, moveUtterancesToNext } = useCouncilMeetingData();
    const [isEditing, setIsEditing] = useState(false);
    const [localUtterance, setLocalUtterance] = useState(utterance);
    const [editedText, setEditedText] = useState(utterance.text);
    const { toast } = useToast();

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

    const isHighlighted = options.selectedHighlight?.highlightedUtterances.some(hu => hu.utteranceId === localUtterance.id);

    let className = `cursor-pointer hover:bg-accent utterance transcript-text ${isActive ? 'bg-accent' : ''} ${isHighlighted ? 'font-bold underline' : ''}`;
    if (localUtterance.lastModifiedBy && options.editable && !options.selectedHighlight) {
        if (localUtterance.lastModifiedBy === 'task') {
            className += ' text-blue-500 font-bold underline';
        } else {
            className += ' text-green-500 font-bold underline';
        }
    }
    if (localUtterance.uncertain && options.editable && !options.selectedHighlight) {
        className += ' text-red-500 font-bold';
    }

    const handleClick = () => {
        if (options.selectedHighlight) {
            if (isHighlighted) {
                // Remove from highlight
                const updatedHighlight = {
                    ...options.selectedHighlight,
                    highlightedUtterances: options.selectedHighlight.highlightedUtterances.filter(hu => hu.utteranceId !== localUtterance.id)
                };
                updateOptions({ selectedHighlight: updatedHighlight });
            } else {
                // Add to highlight
                const updatedHighlight = {
                    ...options.selectedHighlight,
                    highlightedUtterances: [...options.selectedHighlight.highlightedUtterances, { utteranceId: localUtterance.id }]
                };
                updateOptions({ selectedHighlight: updatedHighlight as HighlightWithUtterances });
            }
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
            title: "Move utterances?",
            description: "Move this and previous utterances to the previous segment?",
            action: (
                <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                        moveUtterancesToPrevious(localUtterance.id, localUtterance.speakerSegmentId);
                        toast({
                            description: "Utterances moved successfully",
                        });
                    }}
                >
                    Confirm
                </Button>
            ),
        });
    };

    const handleMoveUtterancesToNext = (e: React.MouseEvent) => {
        e.stopPropagation();
        toast({
            title: "Move utterances?",
            description: "Move this and following utterances to the next segment?",
            action: (
                <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                        moveUtterancesToNext(localUtterance.id, localUtterance.speakerSegmentId);
                        toast({
                            description: "Utterances moved successfully",
                        });
                    }}
                >
                    Confirm
                </Button>
            ),
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

    return (
        <ContextMenu>
            <ContextMenuTrigger>
                <span className={className} id={localUtterance.id} onClick={handleClick}>
                    {localUtterance.text + ' '}
                </span>
            </ContextMenuTrigger>
            {options.editable && (
                <ContextMenuContent>
                    <ContextMenuItem onClick={handleMoveUtterancesToPrevious}>
                        <ArrowLeftToLine className="h-4 w-4 mr-2" />
                        Move to previous segment
                    </ContextMenuItem>
                    <ContextMenuItem onClick={handleMoveUtterancesToNext}>
                        <ArrowRightToLine className="h-4 w-4 mr-2" />
                        Move to next segment
                    </ContextMenuItem>
                </ContextMenuContent>
            )}
        </ContextMenu>
    );
});

UtteranceC.displayName = 'UtteranceC';

export default UtteranceC;