"use client";
import { SpeakerTag, Utterance } from "@prisma/client";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import React, { useEffect, useState, useMemo } from "react";
import { useVideo } from "../VideoProvider";
import { useTranscriptOptions } from "../options/OptionsContext";
import { editUtterance } from "@/lib/db/utterance";
import { HighlightWithUtterances } from "@/lib/db/highlights";
import { useCouncilMeetingData } from "../CouncilMeetingDataContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { ArrowLeftToLine, ArrowRightToLine } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
    }, [currentTime, localUtterance.startTimestamp, localUtterance.endTimestamp]);

    const isHighlighted = options.selectedHighlight?.highlightedUtterances.some(hu => hu.utteranceId === localUtterance.id);

    let className = `cursor-pointer hover:bg-accent utterance ${isActive ? 'bg-accent' : ''} ${isHighlighted ? 'font-bold underline' : ''}`;
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

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            setIsEditing(false);
            setEditedText(localUtterance.text);
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
        return <span id={localUtterance.id} className="hover:bg-accent utterance" />;
    }

    if (isEditing) {
        // Calculate a reasonable width based on text length
        const minWidth = 200; // minimum width in pixels
        const charWidth = 8; // approximate width per character in pixels
        const width = Math.max(minWidth, editedText.length * charWidth);

        return (
            <form onSubmit={handleEdit} className="inline-block">
                <input
                    type="text"
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="border border-gray-300 rounded px-1 py-0.5 text-sm"
                    style={{ width: `${width}px` }}
                    autoFocus
                />
            </form>
        );
    }

    return (
        <span className="group relative inline">
            <span className={className} id={localUtterance.id} onClick={handleClick}>
                {localUtterance.text + ' '}
            </span>
            {options.editable && (
                <span className="absolute top-6 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2" style={{ zIndex: 9999 }}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex gap-2">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 bg-white hover:bg-gray-100 border border-gray-200"
                                    onClick={handleMoveUtterancesToPrevious}
                                >
                                    <ArrowLeftToLine className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 bg-white hover:bg-gray-100 border border-gray-200"
                                    onClick={handleMoveUtterancesToNext}
                                >
                                    <ArrowRightToLine className="h-4 w-4" />
                                </Button>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Move utterances between segments (← to previous, → to next)</p>
                        </TooltipContent>
                    </Tooltip>
                </span>
            )}
        </span>
    );
});

UtteranceC.displayName = 'UtteranceC';

export default UtteranceC;