import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { DEFAULT_LOCALE, LOCALES, urlPrefixForLocale } from '@/i18n/config';
import { env } from '@/env.mjs';

// URL prefixes of the non-default locales (en, fr, sr, lat) — the segment is
// matched from the referer path and echoed back into the redirect URL, so it
// must be compared as a URL prefix, not a locale id (sr-Latn lives at /lat).
const NON_DEFAULT_LOCALE_PREFIXES = new Set(
    LOCALES.filter((locale) => locale !== DEFAULT_LOCALE).map(urlPrefixForLocale),
);

/**
 * Extracts the locale URL prefix from the Referer header
 * Returns the prefix if it's non-default, otherwise returns null
 */
function getLocalePrefixFromReferer(referer: string | null): string | null {
    if (!referer) return null;

    try {
        const url = new URL(referer);
        const pathSegments = url.pathname.split('/').filter(Boolean);

        // Check if first segment is a supported locale prefix
        if (pathSegments.length > 0 && NON_DEFAULT_LOCALE_PREFIXES.has(pathSegments[0])) {
            return pathSegments[0];
        }
    } catch {
        // Invalid URL, ignore
    }

    return null;
}

export async function GET(request: NextRequest, props: { params: Promise<{ utteranceId: string }> }) {
    const params = await props.params;
    try {
        const { utteranceId } = params;

        // Find the utterance and get its speaker segment, then the meeting
        const utterance = await prisma.utterance.findUnique({
            where: { id: utteranceId },
            select: {
                startTimestamp: true,
                speakerSegment: {
                    select: {
                        meetingId: true,
                        cityId: true
                    }
                }
            }
        });

        if (!utterance) {
            return NextResponse.json(
                { error: 'Utterance not found' },
                { status: 404 }
            );
        }

        const { cityId, meetingId } = utterance.speakerSegment;
        const time = Math.floor(utterance.startTimestamp);

        // Get locale from Referer header to preserve user's language preference
        const referer = request.headers.get('referer');
        const localePrefix = getLocalePrefixFromReferer(referer);

        // Build redirect URL with locale prefix if needed (non-default locale)
        const redirectUrl = localePrefix
            ? `/${localePrefix}/${cityId}/${meetingId}/transcript?t=${time}`
            : `/${cityId}/${meetingId}/transcript?t=${time}`;

        return NextResponse.redirect(new URL(redirectUrl, env.NEXTAUTH_URL));
    } catch (error) {
        console.error('Error redirecting utterance:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
