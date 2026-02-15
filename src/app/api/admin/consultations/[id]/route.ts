import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { withUserAuthorizedToEdit } from '@/lib/auth';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
    await withUserAuthorizedToEdit({});
    const id = params.id;
    const body = await req.json();
    const { name, jsonUrl, endDate, isActive } = body as {
        name?: string;
        jsonUrl?: string;
        endDate?: string;
        isActive?: boolean;
    };

    try {
        const updated = await prisma.consultation.update({
            where: { id },
            data: {
                ...(name !== undefined && { name }),
                ...(jsonUrl !== undefined && { jsonUrl }),
                ...(endDate !== undefined && { endDate: new Date(endDate) }),
                ...(isActive !== undefined && { isActive }),
            },
            include: {
                city: {
                    select: { id: true, name: true }
                }
            }
        });
        return NextResponse.json(updated);
    } catch (error) {
        if ((error as { code?: string })?.code === 'P2025') {
            return NextResponse.json({ error: 'Consultation not found' }, { status: 404 });
        }
        return NextResponse.json({ error: 'Failed to update consultation' }, { status: 500 });
    }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
    await withUserAuthorizedToEdit({});
    const id = params.id;
    try {
        await prisma.consultation.delete({ where: { id } });
        return NextResponse.json({ ok: true });
    } catch (error) {
        if ((error as { code?: string })?.code === 'P2025') {
            return NextResponse.json({ error: 'Consultation not found' }, { status: 404 });
        }
        return NextResponse.json({ error: 'Failed to delete consultation' }, { status: 500 });
    }
}
