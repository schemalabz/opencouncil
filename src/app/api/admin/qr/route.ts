import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { handleApiError } from '@/lib/api/errors';

export async function GET() {
    try {
        // Authorization: superadmin or global admin access
        await withUserAuthorizedToEdit({});
        const items = await prisma.qrCampaign.findMany({
            orderBy: { createdAt: 'desc' },
            select: { id: true, code: true, url: true, name: true, isActive: true, createdAt: true },
        });
        return NextResponse.json(items);
    } catch (error) {
        return handleApiError(error, 'Failed to fetch campaigns');
    }
}

export async function POST(req: NextRequest) {
    // Read by the catch, which names the code that is already taken.
    let code: string | undefined;
    try {
        await withUserAuthorizedToEdit({});
        const body = await req.json() as { code: string; url: string; name?: string; isActive?: boolean };
        code = body.code;
        const { url, name, isActive } = body;

        if (!code || !url) {
            return NextResponse.json({ error: 'code and url are required' }, { status: 400 });
        }

        const created = await prisma.qrCampaign.create({
            data: { code, url, name: name || null, isActive: isActive ?? true },
            select: { id: true, code: true, url: true, name: true, isActive: true },
        });
        return NextResponse.json(created, { status: 201 });
    } catch (error) {
        if ((error as { code?: string })?.code === 'P2002') {
            return NextResponse.json({ error: `A campaign with code "${code}" already exists` }, { status: 409 });
        }
        return handleApiError(error, 'Failed to create campaign');
    }
}
