import { NextRequest, NextResponse } from 'next/server';
import { notFound } from 'next/navigation';
import { findCouncilMeetingByYouTubeVideoId } from '@/lib/db/meetings';
import { watchUrl } from '@/lib/youtube';
import { realmBaseUrl } from '@/lib/utils/realmBaseUrl';
import { parseYouTubeLink } from '@/lib/utils/youtube';

/**
 * Resolves a pasted YouTube link to the meeting transcript at the same second.
 * A reader writes `opencouncil.gr/<link>`; the rewrites in
 * `videoLinkRewrites.mjs` send that here as `/yt/<link>`.
 *
 *   /https://www.youtube.com/watch?v=<id>&t=90
 *     -> <realm domain>/<cityId>/<meetingId>/transcript?t=90
 *
 * A link that matches no released meeting goes on to the video on YouTube, at
 * the same second.
 *
 * The link is rebuilt from the catch-all segments plus the query string, which
 * belongs to the embedded YouTube URL. Nothing here depends on the domain, so a
 * short domain pointed at the app works as is.
 */
export async function GET(request: NextRequest, props: { params: Promise<{ rest: string[] }> }) {
    const { rest } = await props.params;
    const link = parseYouTubeLink(rest.join('/') + request.nextUrl.search);
    if (!link) notFound();

    const meeting = await findCouncilMeetingByYouTubeVideoId(link.videoId);
    const target = meeting
        ? new URL(`/${meeting.cityId}/${meeting.id}/transcript`, realmBaseUrl(meeting.city.realm))
        : new URL(watchUrl(link.videoId));
    if (link.startSeconds !== null) target.searchParams.set('t', String(link.startSeconds));
    return NextResponse.redirect(target);
}
