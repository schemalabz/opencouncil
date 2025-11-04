import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { withUserAuthorizedToEdit } from '@/lib/auth';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
    await withUserAuthorizedToEdit({});
    const id = params.id;
    const body = await req.json();
    const { code, url, name, isActive } = body as { code?: string; url?: string; name?: string | null; isActive?: boolean };

    try {
        const updated = await prisma.qrCampaign.update({
            where: { id },
            data: { code, url, name, isActive },
            select: { id: true, code: true, url: true, name: true, isActive: true },
        });
        return NextResponse.json(updated);
    } catch (error) {
        if ((error as { code?: string })?.code === 'P2002') {
            return NextResponse.json({ error: `A campaign with code "${code}" already exists` }, { status: 409 });
        }
        if ((error as { code?: string })?.code === 'P2025') {
            return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
        }
        return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 });
    }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
    await withUserAuthorizedToEdit({});
    const id = params.id;
    try {
        await prisma.qrCampaign.delete({ where: { id } });
        return NextResponse.json({ ok: true });
    } catch (error) {
        if ((error as { code?: string })?.code === 'P2025') {
            return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
        }
        return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 });
    }
}





