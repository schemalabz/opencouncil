import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { appendUtmParams } from '@/lib/utils/qr';
import { relativeRedirect } from '@/lib/utils/relativeRedirect';

export async function GET(req: NextRequest, props: { params: Promise<{ code: string }> }) {
    const params = await props.params;
    const code = params.code;
    if (!code) {
        return relativeRedirect('/');
    }

    const campaign = await prisma.qrCampaign.findUnique({
        where: { code },
        select: { url: true, isActive: true },
    });

    if (!campaign || !campaign.isActive) {
        // Fallback to homepage if not found/inactive
        return relativeRedirect('/');
    }

    const destination = appendUtmParams(campaign.url, code, req.nextUrl.searchParams);

    return NextResponse.redirect(destination, 307);
}
