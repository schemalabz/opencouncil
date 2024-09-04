"use client";
import { SpeakerTag, Utterance, Word } from "@prisma/client";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import React, { useEffect, useState } from "react";
import { useVideo } from "../VideoProvider";

export default function UtteranceC({ utterance }: { utterance: Utterance & { words: Word[] } }) {
    return <span className="hover:bg-accent" >
        {utterance.words.map((word) => {
            return <WordC word={word} key={word.id} />
        })}
    </span>
}

function WordC({ word }: { word: Word }) {
    let { currentTime, seekTo } = useVideo()
    let [isActive, setIsActive] = useState(false)

    useEffect(() => {
        let isActive = currentTime >= word.startTimestamp && currentTime <= word.endTimestamp;
        setIsActive(isActive)
    }, [currentTime, word.startTimestamp, word.endTimestamp])

    const confidenceColor = getConfidenceColor(word.confidence);
    return <span>
        <span onClick={() => seekTo(word.startTimestamp)} style={{ color: confidenceColor }} className={`cursor-pointer hover:underline ${isActive ? 'underline font-bold' : ''}`}>{word.text.trim()}</span> </span>
}

function getConfidenceColor(confidence: number): string {
    // Convert confidence to a value between 0 and 255
    const redValue = Math.round(255 * (1 - confidence));
    return `rgb(${redValue}, 0, 0)`;
}