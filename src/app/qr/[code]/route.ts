import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { env } from '@/env.mjs';

function isExternalUrl(url: string): boolean {
    return url.startsWith('http://') || url.startsWith('https://');
}

function appendUtmParams(urlString: string, code: string): string {
    try {
        // For relative URLs, construct full URL using configured base URL
        const fullUrl = isExternalUrl(urlString) 
            ? new URL(urlString)
            : new URL(urlString, env.NEXT_PUBLIC_BASE_URL);
        
        if (!fullUrl.searchParams.has('utm_source')) fullUrl.searchParams.set('utm_source', 'qr');
        if (!fullUrl.searchParams.has('utm_medium')) fullUrl.searchParams.set('utm_medium', 'offline');
        if (!fullUrl.searchParams.has('utm_campaign')) fullUrl.searchParams.set('utm_campaign', code);
        
        // Always return full URL (NextResponse.redirect requires absolute URLs)
        return fullUrl.toString();
    } catch {
        return urlString;
    }
}

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
    const code = params.code;
    if (!code) {
        return NextResponse.redirect(new URL('/', env.NEXT_PUBLIC_BASE_URL), 302);
    }

    const campaign = await prisma.qrCampaign.findUnique({
        where: { code },
        select: { url: true, isActive: true },
    });

    if (!campaign || !campaign.isActive) {
        // Fallback to homepage if not found/inactive
        const locale = 'el';
        return NextResponse.redirect(new URL(`/${locale}`, env.NEXT_PUBLIC_BASE_URL), 302);
    }

    const destination = appendUtmParams(campaign.url, code);

    return NextResponse.redirect(destination, 307);
}


