import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { handleApiError } from '@/lib/api/errors';

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    // Read by the catch, which names the code that is already taken.
    let code: string | undefined;
    try {
        await withUserAuthorizedToEdit({});
        const id = params.id;
        const body = await req.json() as { code?: string; url?: string; name?: string | null; isActive?: boolean };
        code = body.code;
        const { url, name, isActive } = body;

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
        return handleApiError(error, 'Failed to update campaign');
    }
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        await withUserAuthorizedToEdit({});
        await prisma.qrCampaign.delete({ where: { id: params.id } });
        return NextResponse.json({ ok: true });
    } catch (error) {
        if ((error as { code?: string })?.code === 'P2025') {
            return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
        }
        return handleApiError(error, 'Failed to delete campaign');
    }
}
