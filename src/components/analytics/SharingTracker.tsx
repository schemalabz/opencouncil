'use client';

import { useEffect, type AnchorHTMLAttributes } from 'react';
import { useSharingTracker, type SharingContext } from '@/lib/analytics/sharing';

export function SharingViewTracker({ analytics }: { analytics: SharingContext }) {
    const track = useSharingTracker(analytics);
    useEffect(() => { track('sharing_received'); }, [track]);
    return null;
}

export function SharingSourceLink({ analytics, action, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { analytics: SharingContext; action: 'open_transcript' | 'listen' | 'open_subject' }) {
    const track = useSharingTracker(analytics);
    return <a {...props} onClick={event => { track('sharing_source_opened', { action }); props.onClick?.(event); }} />;
}
