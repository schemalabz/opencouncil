import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { withUserAuthorizedToEdit } from '@/lib/auth';

export async function GET() {
    // Authorization: superadmin or global admin access
    await withUserAuthorizedToEdit({});
    const items = await prisma.qrCampaign.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, code: true, url: true, name: true, isActive: true, createdAt: true },
    });
    return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
    await withUserAuthorizedToEdit({});
    const body = await req.json();
    const { code, url, name, isActive } = body as { code: string; url: string; name?: string; isActive?: boolean };

    if (!code || !url) {
        return NextResponse.json({ error: 'code and url are required' }, { status: 400 });
    }

    try {
        const created = await prisma.qrCampaign.create({
            data: { code, url, name: name || null, isActive: isActive ?? true },
            select: { id: true, code: true, url: true, name: true, isActive: true },
        });
        return NextResponse.json(created, { status: 201 });
    } catch (error) {
        if ((error as { code?: string })?.code === 'P2002') {
            return NextResponse.json({ error: `A campaign with code "${code}" already exists` }, { status: 409 });
        }
        return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
    }
}





