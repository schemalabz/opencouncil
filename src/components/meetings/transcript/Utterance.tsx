"use client";
import { SpeakerTag, Utterance, Word } from "@prisma/client";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import React, { useEffect, useState, useMemo } from "react";
import { useVideo } from "../VideoProvider";
import { useTranscriptOptions } from "../options/OptionsContext";
import { editWord } from "@/lib/db/word";
import { HighlightWithUtterances } from "@/lib/db/highlights";

const UtteranceC: React.FC<{ utterance: Utterance & { words: Word[] } }> = React.memo(({ utterance }) => {
    const { currentTime, seekTo } = useVideo();
    const [isActive, setIsActive] = useState(false);
    const { options, updateOptions } = useTranscriptOptions();
    const maxDrift = options.maxUtteranceDrift;
    const selectedHighlight = options.selectedHighlight;

    useEffect(() => {
        const isActive = currentTime >= utterance.startTimestamp && currentTime <= utterance.endTimestamp;
        setIsActive(isActive);
    }, [currentTime, utterance.startTimestamp, utterance.endTimestamp]);

    const isHighlighted = selectedHighlight?.highlightedUtterances.some(hu => hu.utteranceId === utterance.id);

    const handleClick = () => {
        if (selectedHighlight) {
            if (isHighlighted) {
                // Remove from highlight
                const updatedHighlight = {
                    ...selectedHighlight,
                    highlightedUtterances: selectedHighlight.highlightedUtterances.filter(hu => hu.utteranceId !== utterance.id)
                };
                updateOptions({ selectedHighlight: updatedHighlight });
            } else {
                // Add to highlight
                const updatedHighlight = {
                    ...selectedHighlight,
                    highlightedUtterances: [...selectedHighlight.highlightedUtterances, { utteranceId: utterance.id }]
                };
                updateOptions({ selectedHighlight: updatedHighlight as HighlightWithUtterances });
            }
        } else {
            seekTo(utterance.startTimestamp);
        }
    };
    const className = `cursor-pointer hover:bg-accent utterance ${isActive ? 'bg-accent' : ''} ${isHighlighted ? 'font-bold underline' : ''}`;

    const memoizedContent = useMemo(() => (
        <span className={className} id={utterance.id} onClick={handleClick}>
            {isActive ? (
                utterance.words.map((word) => <WordC word={word} key={word.id} />)
            ) : (
                utterance.text + " "
            )}
        </span>
    ), [isActive, utterance, className, handleClick]);

    if (utterance.drift > maxDrift) {
        return <span id={utterance.id} className="over:bg-accent utterance" />;
    }

    return memoizedContent;
});

UtteranceC.displayName = 'UtteranceC';

export default UtteranceC;

const WordC: React.FC<{ word: Word }> = ({ word }) => {
    let { currentTime, seekTo } = useVideo()
    let [isActive, setIsActive] = useState(false)
    let { options } = useTranscriptOptions();
    let editable = options.editable;
    let [isEditing, setIsEditing] = useState(false);
    let [editedText, setEditedText] = useState(word.text.trim());

    useEffect(() => {
        let isActive = currentTime >= word.startTimestamp && currentTime <= word.endTimestamp;
        setIsActive(isActive)
    }, [currentTime, word.startTimestamp, word.endTimestamp])

    let color = '#000';
    if (options.highlightLowConfidenceWords && word.confidence < 0.3) {
        color = getConfidenceColor(word.confidence);
    }

    const handleClick = () => {
        if (editable) {
            setIsEditing(true);
        } else {
            seekTo(word.startTimestamp);
        }
    }

    const handleEdit = (e: React.FormEvent) => {
        e.preventDefault();
        editWord(word.id, editedText);
        setIsEditing(false);
    }

    if (isEditing) {
        return (
            <form onSubmit={handleEdit} className="inline-block">
                <input
                    type="text"
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    className="border border-gray-300 rounded px-1 py-0.5 text-sm"
                    autoFocus
                    size={editedText.length + 2}
                />
            </form>
        );
    }

    return (
        <span>
            <span
                onClick={handleClick}
                style={{ color }}
                className={`cursor-pointer hover:underline ${isActive ? 'underline font-bold' : ''}`}
            >
                {editedText}
            </span>
            {' '}
        </span>
    );
}

WordC.displayName = 'WordC';

function getConfidenceColor(confidence: number): string {
    // Convert confidence to a value between 0 and 255
    const redValue = Math.round(255 * (1 - confidence));
    return `rgb(${redValue}, 0, 0)`;
}