"use client";

import { useVideo } from './VideoProvider';
import { useTranscriptOptions } from './options/OptionsContext';
import { useCouncilMeetingData } from './CouncilMeetingDataContext';
import { useKeyboardShortcut, ACTIONS } from '@/contexts/KeyboardShortcutsContext';

export function KeyboardShortcuts() {
    const { currentTime, seekTo, handleSpeedChange, togglePlayPause } = useVideo();
    const { options, updateOptions } = useTranscriptOptions();
    const { transcript } = useCouncilMeetingData();

    // Play / Pause
    useKeyboardShortcut(ACTIONS.PLAY_PAUSE.id, () => {
        togglePlayPause();
    }, options.editable);

    // Edit Next Utterance (Enter)
    useKeyboardShortcut(ACTIONS.EDIT_NEXT_UTTERANCE.id, () => {
        // Get all utterances
        const allUtterances = transcript.flatMap(segment => segment.utterances || []);
        const sortedUtterances = allUtterances.sort((a, b) => a.startTimestamp - b.startTimestamp);
        
        // Find current utterance
        const currentUtterance = sortedUtterances.find(u =>
            currentTime >= u.startTimestamp && currentTime <= u.endTimestamp
        );

        if (currentUtterance) {
            const utteranceElement = document.getElementById(currentUtterance.id);
            utteranceElement?.click();
        }
    }, options.editable);

    // Seek Previous (ArrowLeft)
    useKeyboardShortcut(ACTIONS.SEEK_PREVIOUS.id, () => {
        const allUtterances = transcript.flatMap(segment => segment.utterances || []);
        const sortedUtterances = allUtterances.sort((a, b) => a.startTimestamp - b.startTimestamp);
        
        // Find utterances before current time
        const prevUtterances = [...sortedUtterances]
            .reverse()
            .filter(u => u.startTimestamp < currentTime)
            .slice(0, 2);

        const currentUtterance = sortedUtterances.find(u =>
            currentTime >= u.startTimestamp && currentTime <= u.endTimestamp
        );

        if (prevUtterances.length > 0) {
            const targetUtterance = currentUtterance ? prevUtterances[1] || prevUtterances[0] : prevUtterances[0];
            seekTo(targetUtterance.startTimestamp);
        }
    }, options.editable);

    // Seek Next (ArrowRight)
    useKeyboardShortcut(ACTIONS.SEEK_NEXT.id, () => {
        const allUtterances = transcript.flatMap(segment => segment.utterances || []);
        const sortedUtterances = allUtterances.sort((a, b) => a.startTimestamp - b.startTimestamp);
        
        const nextUtterance = sortedUtterances
            .find(u => u.startTimestamp > currentTime);
        if (nextUtterance) {
            seekTo(nextUtterance.startTimestamp);
        }
    }, options.editable);

    // Speed Up (ArrowUp)
    useKeyboardShortcut(ACTIONS.SPEED_UP.id, () => {
        const newSpeedUp = Math.min(4, options.playbackSpeed + 0.1);
        handleSpeedChange(newSpeedUp.toString());
        updateOptions({ playbackSpeed: newSpeedUp });
    }, options.editable);

    // Speed Down (ArrowDown)
    useKeyboardShortcut(ACTIONS.SPEED_DOWN.id, () => {
        const newSpeedDown = Math.max(0.5, options.playbackSpeed - 0.1);
        handleSpeedChange(newSpeedDown.toString());
        updateOptions({ playbackSpeed: newSpeedDown });
    }, options.editable);

    // Skip Backward (Shift + ArrowLeft)
    useKeyboardShortcut(ACTIONS.SKIP_BACKWARD.id, () => {
        const newTime = Math.max(0, currentTime - options.skipInterval);
        seekTo(newTime);
    }, options.editable);

    // Skip Forward (Shift + ArrowRight)
    useKeyboardShortcut(ACTIONS.SKIP_FORWARD.id, () => {
        seekTo(currentTime + options.skipInterval);
    }, options.editable);

    return null;
} 
