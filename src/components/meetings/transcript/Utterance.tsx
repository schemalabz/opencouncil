"use client";
import { SpeakerTag, Utterance, Word } from "@prisma/client";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import React, { useEffect, useState } from "react";
import { useVideo } from "../VideoProvider";
import { useTranscriptOptions } from "../options/OptionsContext";
import { editWord } from "@/lib/db/word";

export default function UtteranceC({ utterance }: { utterance: Utterance & { words: Word[] } }) {
    let { currentTime, seekTo } = useVideo()
    let [isActive, setIsActive] = useState(false)
    let { options } = useTranscriptOptions();
    let maxDrift = options.maxUtteranceDrift;

    useEffect(() => {
        let isActive = currentTime >= utterance.startTimestamp && currentTime <= utterance.endTimestamp;
        setIsActive(isActive)
    }, [currentTime, utterance.startTimestamp, utterance.endTimestamp])

    if (utterance.drift > maxDrift) {
        return <span id={utterance.id} className="over:bg-accent utterance" />
    }

    if (isActive) {
        return <span className={`hover:bg-accent utterance ${isActive ? 'bg-accent' : ''}`} id={utterance.id}>
            {utterance.words.map((word) => {
                return <WordC word={word} key={word.id} />
            })}
        </span>
    }
    return <span className={`cursor-pointer hover:bg-accent utterance`} id={utterance.id} onClick={() => seekTo(utterance.startTimestamp)}>
        {utterance.text + " "}
    </span>
}

function WordC({ word }: { word: Word }) {
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

function getConfidenceColor(confidence: number): string {
    // Convert confidence to a value between 0 and 255
    const redValue = Math.round(255 * (1 - confidence));
    return `rgb(${redValue}, 0, 0)`;
}