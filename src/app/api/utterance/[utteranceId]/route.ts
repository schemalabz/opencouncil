import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { routing } from '@/i18n/routing';

/**
 * Extracts locale from the Referer header
 * Returns the locale if it's non-default, otherwise returns null
 */
function getLocaleFromReferer(referer: string | null): string | null {
    if (!referer) return null;

    try {
        const url = new URL(referer);
        const pathSegments = url.pathname.split('/').filter(Boolean);

        // Check if first segment is a supported locale
        if (pathSegments.length > 0) {
            const potentialLocale = pathSegments[0];
            if (routing.locales.includes(potentialLocale as any) &&
                potentialLocale !== routing.defaultLocale) {
                return potentialLocale;
            }
        }
    } catch {
        // Invalid URL, ignore
    }

    return null;
}

export async function GET(
    request: NextRequest,
    { params }: { params: { utteranceId: string } }
) {
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
        const locale = getLocaleFromReferer(referer);

        // Build redirect URL with locale prefix if needed (non-default locale)
        const redirectUrl = locale
            ? `/${locale}/${cityId}/${meetingId}/transcript?t=${time}`
            : `/${cityId}/${meetingId}/transcript?t=${time}`;

        return NextResponse.redirect(new URL(redirectUrl, request.url));
    } catch (error) {
        console.error('Error redirecting utterance:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
