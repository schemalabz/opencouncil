import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { env } from '@/env.mjs';
import { appendUtmParams } from '@/lib/utils/qr';

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
    const code = params.code;
    if (!code) {
        return NextResponse.redirect(new URL('/', env.NEXTAUTH_URL), 302);
    }

    const campaign = await prisma.qrCampaign.findUnique({
        where: { code },
        select: { url: true, isActive: true },
    });

    if (!campaign || !campaign.isActive) {
        // Fallback to homepage if not found/inactive
        const locale = 'el';
        return NextResponse.redirect(new URL(`/${locale}`, env.NEXTAUTH_URL), 302);
    }

    const destination = appendUtmParams(campaign.url, code, req.nextUrl.searchParams);

    return NextResponse.redirect(destination, 307);
}
