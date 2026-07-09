import { useEffect, useRef, useState } from 'react';
import type { MunicipalityInterest, UpcomingMeeting } from '@/lib/landing/landingData';
import { captureLanding } from '@/lib/landing/analytics';

type Args = {
    /** the municipality the visitor seems interested in (filter / search / clicked subject) */
    interested: MunicipalityInterest | null;
    upcoming: UpcomingMeeting[];
    /** next-auth session status — authenticated visitors are never prompted */
    sessionStatus: string;
};

export type NotifyPromptState = {
    /** whether to render the notification prompt now */
    showNotifyPrompt: boolean;
    /** the interested municipality's next meeting, if any */
    nextMeeting: UpcomingMeeting | undefined;
    /** dismiss for this session only */
    onClose: () => void;
    /** "Όχι τώρα" — persist an opt-out so we never prompt again */
    onOptOut: () => void;
};

/**
 * Drives the one-time "enable notifications" prompt: after a few minutes, a not-logged-in
 * visitor with a municipality of interest is offered to subscribe — unless they've already
 * opted out (persisted in localStorage) or dismissed it this session.
 */
export function useNotifyPrompt({ interested, upcoming, sessionStatus }: Args): NotifyPromptState {
    const [elapsed, setElapsed] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const [optedOut, setOptedOut] = useState(false);

    // After a few minutes, allow the prompt.
    useEffect(() => {
        const t = setTimeout(() => setElapsed(true), 4 * 60 * 1000);
        return () => clearTimeout(t);
    }, []);
    // Persisted opt-out — once the visitor chose "Όχι τώρα", never prompt again.
    useEffect(() => {
        if (typeof window !== 'undefined' && window.localStorage.getItem('enableNotifications') === 'false') {
            setOptedOut(true);
        }
    }, []);

    const onOptOut = () => {
        setDismissed(true);
        setOptedOut(true);
        if (typeof window !== 'undefined') window.localStorage.setItem('enableNotifications', 'false');
    };

    const showNotifyPrompt =
        elapsed && !dismissed && !optedOut && sessionStatus !== 'authenticated' && interested !== null;

    // Fire once when the prompt first becomes visible — the funnel's entry step.
    const promptShownRef = useRef(false);
    useEffect(() => {
        if (showNotifyPrompt && !promptShownRef.current) {
            promptShownRef.current = true;
            captureLanding('notify_prompt_shown', {
                city_id: interested?.kind === 'known' ? interested.cityId : null,
                municipality_kind: interested?.kind ?? null,
                seconds_since_load: Math.round(performance.now() / 1000),
            });
        }
    }, [showNotifyPrompt, interested]);

    const nextMeeting =
        interested?.kind === 'known' ? upcoming.find((m) => m.cityId === interested.cityId) : undefined;

    return { showNotifyPrompt, nextMeeting, onClose: () => setDismissed(true), onOptOut };
}
