"use client";

import { useEffect } from 'react';
import { useVideo } from './VideoProvider';
import { useTranscriptOptions } from './options/OptionsContext';
import { useCouncilMeetingData } from './CouncilMeetingDataContext';

export function KeyboardShortcuts() {
    const { currentTime, seekToWithoutScroll, handleSpeedChange, togglePlayPause } = useVideo();
    const { options, updateOptions } = useTranscriptOptions();
    const { transcript } = useCouncilMeetingData();

    useEffect(() => {
        if (!options.editable) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if user is typing in an input field
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            // Get all utterances from all segments
            const allUtterances = transcript.flatMap(segment => segment.utterances || []);

            // Sort utterances by start time
            const sortedUtterances = allUtterances.sort((a, b) => a.startTimestamp - b.startTimestamp);

            // Find current utterance for space key
            const currentUtterance = sortedUtterances.find(u =>
                currentTime >= u.startTimestamp && currentTime <= u.endTimestamp
            );

            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    togglePlayPause();
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (currentUtterance) {
                        // Find the utterance element and simulate a click
                        const utteranceElement = document.getElementById(currentUtterance.id);
                        utteranceElement?.click();
                    }
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    // Find the last two utterances that start before current time
                    const prevUtterances = [...sortedUtterances]
                        .reverse()
                        .filter(u => u.startTimestamp < currentTime)
                        .slice(0, 2);

                    if (prevUtterances.length > 0) {
                        // If we're currently in an utterance, go to the previous one
                        // If we're between utterances, go to the closest previous one
                        const targetUtterance = currentUtterance ? prevUtterances[1] || prevUtterances[0] : prevUtterances[0];
                        seekToWithoutScroll(targetUtterance.startTimestamp);
                    }
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    // Find the first utterance that starts after current time
                    const nextUtterance = sortedUtterances
                        .find(u => u.startTimestamp > currentTime);
                    if (nextUtterance) {
                        seekToWithoutScroll(nextUtterance.startTimestamp);
                    }
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    const newSpeedUp = Math.min(4, options.playbackSpeed + 0.1);
                    handleSpeedChange(newSpeedUp.toString());
                    updateOptions({ playbackSpeed: newSpeedUp });
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    const newSpeedDown = Math.max(0.5, options.playbackSpeed - 0.1);
                    handleSpeedChange(newSpeedDown.toString());
                    updateOptions({ playbackSpeed: newSpeedDown });
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentTime, options.editable, options.playbackSpeed, transcript, seekToWithoutScroll, handleSpeedChange, updateOptions, togglePlayPause]);

    return null;
} 
