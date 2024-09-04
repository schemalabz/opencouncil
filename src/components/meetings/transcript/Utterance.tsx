"use client";
import { SpeakerTag, Utterance, Word } from "@prisma/client";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import React from "react";

export default function UtteranceC({ utterance }: { utterance: Utterance & { words: Word[] } }) {
    return <span className="hover:bg-gray-100">
        {utterance.words.map((word) => {
            return <WordC word={word} />
        })}
    </span>
}

function WordC({ word }: { word: Word }) {
    const confidenceColor = getConfidenceColor(word.confidence);
    return <span style={{ color: confidenceColor }}>{word.text} </span>
}

function getConfidenceColor(confidence: number): string {
    // Convert confidence to a value between 0 and 255
    const redValue = Math.round(255 * (1 - confidence));
    return `rgb(${redValue}, 0, 0)`;
}