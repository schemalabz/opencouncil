import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { appendUtmParams } from '@/lib/utils/qr';

/**
 * Home, on whichever realm domain the scan arrived on.
 *
 * Relative Location on purpose — no absolute base is correct: `NEXTAUTH_URL`
 * names one realm, and `req.nextUrl` resolves to the server's bind address
 * behind the proxy. Same reasoning as `src/app/api/utterance/[utteranceId]`.
 * No locale segment either: each realm serves its default unprefixed.
 */
function homeOnScannedRealm(): NextResponse {
    return new NextResponse(null, { status: 302, headers: { Location: '/' } });
}

export async function GET(req: NextRequest, props: { params: Promise<{ code: string }> }) {
    const params = await props.params;
    const code = params.code;
    if (!code) {
        return homeOnScannedRealm();
    }

    const campaign = await prisma.qrCampaign.findUnique({
        where: { code },
        select: { url: true, isActive: true },
    });

    if (!campaign || !campaign.isActive) {
        // Fallback to homepage if not found/inactive
        return homeOnScannedRealm();
    }

    const destination = appendUtmParams(campaign.url, code, req.nextUrl.searchParams);

    return NextResponse.redirect(destination, 307);
}
