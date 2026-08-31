"use client";

import { useVideo, useVideoActions } from './VideoProvider';
import { useTranscriptOptions } from './options/OptionsContext';
import { useCouncilMeetingData } from './CouncilMeetingDataContext';
import { useKeyboardShortcut, ACTIONS } from '@/contexts/KeyboardShortcutsContext';

export function KeyboardShortcuts() {
    const { seekTo, handleSpeedChange, togglePlayPause } = useVideo();
    const { currentTimeRef } = useVideoActions();
    const { options, updateOptions } = useTranscriptOptions();
    const { transcript } = useCouncilMeetingData();

    // Play / Pause
    // Playback belongs to every reader — only editing actions stay gated.
    useKeyboardShortcut(ACTIONS.PLAY_PAUSE.id, () => {
        togglePlayPause();
    });

    // Edit Next Utterance (Enter)
    useKeyboardShortcut(ACTIONS.EDIT_NEXT_UTTERANCE.id, () => {
        // Get all utterances
        const allUtterances = transcript.flatMap(segment => segment.utterances || []);
        const sortedUtterances = allUtterances.sort((a, b) => a.startTimestamp - b.startTimestamp);
        
        // Find current utterance
        const currentUtterance = sortedUtterances.find(u =>
            currentTimeRef.current >= u.startTimestamp && currentTimeRef.current <= u.endTimestamp
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
            .filter(u => u.startTimestamp < currentTimeRef.current)
            .slice(0, 2);

        const currentUtterance = sortedUtterances.find(u =>
            currentTimeRef.current >= u.startTimestamp && currentTimeRef.current <= u.endTimestamp
        );

        if (prevUtterances.length > 0) {
            const targetUtterance = currentUtterance ? prevUtterances[1] || prevUtterances[0] : prevUtterances[0];
            seekTo(targetUtterance.startTimestamp);
        }
    });

    // Seek Next (ArrowRight)
    useKeyboardShortcut(ACTIONS.SEEK_NEXT.id, () => {
        const allUtterances = transcript.flatMap(segment => segment.utterances || []);
        const sortedUtterances = allUtterances.sort((a, b) => a.startTimestamp - b.startTimestamp);
        
        const nextUtterance = sortedUtterances
            .find(u => u.startTimestamp > currentTimeRef.current);
        if (nextUtterance) {
            seekTo(nextUtterance.startTimestamp);
        }
    });

    // Speed Up (ArrowUp)
    useKeyboardShortcut(ACTIONS.SPEED_UP.id, () => {
        const newSpeedUp = Math.min(4, Math.round((options.playbackSpeed + 0.1) * 10) / 10);
        updateOptions({ playbackSpeed: newSpeedUp });
        handleSpeedChange(newSpeedUp.toString());
    });

    // Speed Down (ArrowDown)
    useKeyboardShortcut(ACTIONS.SPEED_DOWN.id, () => {
        const newSpeedDown = Math.max(0.5, Math.round((options.playbackSpeed - 0.1) * 10) / 10);
        updateOptions({ playbackSpeed: newSpeedDown });
        handleSpeedChange(newSpeedDown.toString());
    });

    // Skip Backward (Shift + ArrowLeft)
    useKeyboardShortcut(ACTIONS.SKIP_BACKWARD.id, () => {
        const newTime = Math.max(0, currentTimeRef.current - options.skipInterval);
        seekTo(newTime);
    });

    // Skip Forward (Shift + ArrowRight)
    useKeyboardShortcut(ACTIONS.SKIP_FORWARD.id, () => {
        seekTo(currentTimeRef.current + options.skipInterval);
    });

    return null;
} 
