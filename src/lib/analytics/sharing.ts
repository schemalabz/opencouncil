'use client';

import { useMemo } from 'react';
import { captureEvent } from '@/lib/analytics/capture';

export interface SharingContext {
    content_type: 'meeting' | 'subject' | 'contribution' | 'excerpt' | 'segment';
    surface: string;
    city_id: string;
    meeting_id: string;
    subject_id?: string;
    contribution_id?: string;
    locale?: string;
    utterance_count?: number;
    character_count?: number;
    reviewed?: boolean;
    editable?: boolean;
}
type SharingEvent = 'sharing_opened' | 'sharing_action_started' | 'sharing_action_succeeded' | 'sharing_action_failed' | 'sharing_action_cancelled'
    | 'sharing_destination_selected' | 'sharing_story_opened' | 'sharing_story_ready' | 'sharing_story_failed'
    | 'sharing_download_clicked' | 'sharing_selection_failed' | 'sharing_received' | 'sharing_source_opened';
interface SharingDetails {
    action?: 'copy_link' | 'copy_text' | 'native_share' | 'share_image' | 'copy_embed' | 'preview_image' | 'retry_image' | 'change_embed_theme' | 'open_transcript' | 'listen' | 'open_subject';
    mode?: 'menu' | 'link' | 'story' | 'embed';
    destination?: 'whatsapp' | 'facebook' | 'email';
    reason?: 'invalid' | 'too-long' | 'empty' | 'source-changed' | 'unavailable' | 'failed';
    file_sharing_supported?: boolean;
    theme?: 'light' | 'dark';
    duration_ms?: number;
    includes_timestamp?: boolean;
}

export function captureSharingEvent(event: SharingEvent, context: SharingContext | undefined, details: SharingDetails = {}) {
    if (!context) return;
    // Explicit fields prevent transcript text, names, URLs and error messages
    // from leaking into custom analytics properties through a spread.
    const { content_type, surface, city_id, meeting_id, subject_id, contribution_id, locale, utterance_count, character_count, reviewed, editable } = context;
    const { action, mode, destination, reason, file_sharing_supported, theme, duration_ms, includes_timestamp } = details;
    captureEvent(event, { content_type, surface, city_id, meeting_id, subject_id, contribution_id, locale, utterance_count, character_count, reviewed, editable, action, mode, destination, reason, file_sharing_supported, theme, duration_ms, includes_timestamp });
}

export function useSharingTracker(context: SharingContext | undefined) {
    // Callers can pass inline context objects. Keep the tracker stable while
    // preserving the original context for in-flight asynchronous operations.
    const key = JSON.stringify(context);
    return useMemo(() => {
        const snapshot: SharingContext | undefined = key ? JSON.parse(key) : undefined;
        return (event: SharingEvent, details?: SharingDetails) => captureSharingEvent(event, snapshot, details);
    }, [key]);
}
