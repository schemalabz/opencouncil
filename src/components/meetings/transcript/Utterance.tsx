"use client";
import { SpeakerTag, Utterance } from "@prisma/client";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import React, { useEffect, useState, useMemo } from "react";
import { useVideo } from "../VideoProvider";
import { useTranscriptOptions } from "../options/OptionsContext";
import { editUtterance } from "@/lib/db/utterance";
import { HighlightWithUtterances } from "@/lib/db/highlights";

const UtteranceC: React.FC<{
    utterance: Utterance,
    onUpdate?: (updatedUtterance: Utterance) => void
}> = React.memo(({ utterance, onUpdate }) => {
    const { currentTime, seekTo } = useVideo();
    const [isActive, setIsActive] = useState(false);
    const { options, updateOptions } = useTranscriptOptions();
    const maxDrift = options.maxUtteranceDrift;
    const selectedHighlight = options.selectedHighlight;
    const [isEditing, setIsEditing] = useState(false);
    const [localUtterance, setLocalUtterance] = useState(utterance);
    const [editedText, setEditedText] = useState(utterance.text);

    // Update local state when prop changes
    useEffect(() => {
        setLocalUtterance(utterance);
        setEditedText(utterance.text);
    }, [utterance]);

    useEffect(() => {
        const isActive = currentTime >= localUtterance.startTimestamp && currentTime <= localUtterance.endTimestamp;
        setIsActive(isActive);
    }, [currentTime, localUtterance.startTimestamp, localUtterance.endTimestamp]);

    const isHighlighted = selectedHighlight?.highlightedUtterances.some(hu => hu.utteranceId === localUtterance.id);

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
        if (selectedHighlight) {
            if (isHighlighted) {
                // Remove from highlight
                const updatedHighlight = {
                    ...selectedHighlight,
                    highlightedUtterances: selectedHighlight.highlightedUtterances.filter(hu => hu.utteranceId !== localUtterance.id)
                };
                updateOptions({ selectedHighlight: updatedHighlight });
            } else {
                // Add to highlight
                const updatedHighlight = {
                    ...selectedHighlight,
                    highlightedUtterances: [...selectedHighlight.highlightedUtterances, { utteranceId: localUtterance.id }]
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

    if (localUtterance.drift > maxDrift) {
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
        <span className={className} id={localUtterance.id} onClick={handleClick}>
            {localUtterance.text + " "}
        </span>
    );
});

UtteranceC.displayName = 'UtteranceC';

export default UtteranceC;