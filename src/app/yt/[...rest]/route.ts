import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/env.mjs';
import { findCouncilMeetingByYouTubeVideoId } from '@/lib/db/meetings';
import {
    isValidYouTubeUrl,
    extractYouTubeVideoId,
    extractYouTubeTimestamp,
} from '@/lib/utils/youtube';

/**
 * URL-prefix redirect: prepend `opencouncil.gr/yt/` to any YouTube meeting link
 * to land on the corresponding OpenCouncil meeting transcript at the same
 * timestamp (12ft.io / github1s.com style).
 *
 * Example:
 *   /yt/https://www.youtube.com/watch?v=abc123&t=90
 *     -> /<cityId>/<meetingId>/transcript?t=90
 *
 * The embedded YouTube URL keeps its own query string (?v=…&t=…). A catch-all
 * segment only captures the path, so we recover the full URL from request.url.
 */
export async function GET(request: NextRequest) {
    try {
        // Recover everything after the literal "/yt/" prefix, including the
        // embedded YouTube URL's query string.
        const marker = '/yt/';
        const markerIndex = request.url.indexOf(marker);
        if (markerIndex === -1) {
            return NextResponse.redirect(new URL('/', env.NEXTAUTH_URL));
        }

        const rawTarget = request.url.slice(markerIndex + marker.length);
        if (!rawTarget) {
            return NextResponse.redirect(new URL('/', env.NEXTAUTH_URL));
        }

        // Tolerate links that were URL-encoded when prefixed.
        let youtubeUrl = rawTarget;
        if (!/^https?:\/\//i.test(youtubeUrl)) {
            try {
                youtubeUrl = decodeURIComponent(rawTarget);
            } catch {
                youtubeUrl = rawTarget;
            }
        }

        if (!isValidYouTubeUrl(youtubeUrl)) {
            return new NextResponse('Not a valid YouTube URL', { status: 404 });
        }

        const videoId = extractYouTubeVideoId(youtubeUrl);
        if (!videoId) {
            return new NextResponse('Could not extract YouTube video id', { status: 404 });
        }

        const meeting = await findCouncilMeetingByYouTubeVideoId(videoId);
        if (!meeting) {
            return new NextResponse('No OpenCouncil meeting found for this YouTube link', {
                status: 404,
            });
        }

        const timestamp = extractYouTubeTimestamp(youtubeUrl);
        const target = `/${meeting.cityId}/${meeting.id}/transcript${timestamp != null ? `?t=${timestamp}` : ''}`;

        return NextResponse.redirect(new URL(target, env.NEXTAUTH_URL));
    } catch (error) {
        console.error('Error redirecting YouTube link:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
