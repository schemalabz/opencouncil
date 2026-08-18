'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    getReviewCompletionState,
    type MarkHumanReviewCompleteOptions,
    type ReviewCompletionState,
    type ReviewFollowUpOutcomes,
} from '@/lib/tasks/humanReview';

/**
 * The follow-ups that the reviewer asked for and that did not run. The review is
 * complete either way, so this is what separates a full success from a partial one.
 */
export function failedFollowUps(outcomes: ReviewFollowUpOutcomes): Array<keyof ReviewFollowUpOutcomes> {
    return (Object.keys(outcomes) as Array<keyof ReviewFollowUpOutcomes>)
        .filter((key) => outcomes[key] === 'failed');
}

export interface ReviewCompletionControls {
    state: ReviewCompletionState | null;
    isLoading: boolean;
    error: string | null;
    sendTranscript: boolean;
    setSendTranscript: (checked: boolean) => void;
    runSummarize: boolean;
    setRunSummarize: (checked: boolean) => void;
    /** Load the state again after a failure, without closing and reopening the dialog. */
    reload: () => void;
    /** The reviewer's choices, in the shape that markHumanReviewComplete expects. */
    completionOptions: Pick<MarkHumanReviewCompleteOptions, 'sendTranscript' | 'runSummarize'>;
}

/**
 * Whether summarize starts without a second confirmation and reaches subscribers.
 * handleSummarizeResult releases the notifications at once for this behavior.
 */
export function summarizeNotifiesSubscribers(state: ReviewCompletionState): boolean {
    return state.notificationBehavior === 'NOTIFICATIONS_AUTO';
}

/**
 * Summarize notifies subscribers about a meeting that the public cannot open.
 * The notification links to a page that only a user with edit rights can see.
 */
export function summarizeNotifiesBeforeRelease(state: ReviewCompletionState): boolean {
    return summarizeNotifiesSubscribers(state) && !state.released;
}

/**
 * Load the state for the review completion dialog and hold the reviewer's choices.
 *
 * Each option defaults to on when it can do something: the transcript email needs
 * contact emails, and summarize needs a meeting that no summarize task covers yet.
 * Summarize defaults to off when it notifies subscribers before the release,
 * because that send has no undo.
 *
 * @param isOpen - Load the state while the dialog is open, and reload it on each open.
 */
export function useReviewCompletion(cityId: string, meetingId: string, isOpen: boolean): ReviewCompletionControls {
    const [state, setState] = useState<ReviewCompletionState | null>(null);
    // Starts true with an open dialog: the effect runs after the first paint, and
    // an idle-looking first frame would let the reviewer confirm with no choices loaded
    const [isLoading, setIsLoading] = useState(isOpen);
    const [error, setError] = useState<string | null>(null);
    const [sendTranscript, setSendTranscript] = useState(false);
    const [runSummarize, setRunSummarize] = useState(false);
    const [reloadCount, setReloadCount] = useState(0);

    const reload = useCallback(() => setReloadCount((count) => count + 1), []);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        // A stale response must not overwrite the state of the dialog that is open now
        let cancelled = false;
        setIsLoading(true);
        setError(null);
        // Drop the previous answer, so no frame of this dialog shows another meeting's choices
        setState(null);
        setSendTranscript(false);
        setRunSummarize(false);

        getReviewCompletionState(cityId, meetingId)
            .then((result) => {
                if (cancelled) return;
                setState(result);
                setSendTranscript(result.contactEmails.length > 0);
                setRunSummarize(result.summarizeAvailability === 'available' && !summarizeNotifiesBeforeRelease(result));
            })
            .catch((err) => {
                if (cancelled) return;
                console.error('Failed to load review completion state:', err);
                setError(err instanceof Error ? err.message : 'Failed to load review completion state');
            })
            .finally(() => {
                // Guarded like the writes above. Without it a cancelled request clears
                // the flag while its replacement is still in flight, and that frame
                // renders as "loaded with no state" — an empty dialog, or a
                // municipality with contacts reported as having none.
                // The effect early-returns while the dialog is closed, so it never
                // reads a flag that a cancelled request left set.
                if (cancelled) return;
                setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [isOpen, cityId, meetingId, reloadCount]);

    return {
        state,
        isLoading,
        error,
        sendTranscript,
        setSendTranscript,
        runSummarize,
        setRunSummarize,
        reload,
        completionOptions: { sendTranscript, runSummarize },
    };
}
