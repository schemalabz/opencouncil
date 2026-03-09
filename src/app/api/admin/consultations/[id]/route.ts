import { NextRequest, NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { updateConsultation, deleteConsultation } from '@/lib/db/consultations';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
    await withUserAuthorizedToEdit({});
    const body = await req.json();
    const { name, jsonUrl, endDate, isActive } = body as {
        name?: string;
        jsonUrl?: string;
        endDate?: string;
        isActive?: boolean;
    };

    try {
        const updated = await updateConsultation(params.id, { name, jsonUrl, endDate, isActive });
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
    try {
        await deleteConsultation(params.id);
        return NextResponse.json({ ok: true });
    } catch (error) {
        if ((error as { code?: string })?.code === 'P2025') {
            return NextResponse.json({ error: 'Consultation not found' }, { status: 404 });
        }
        return NextResponse.json({ error: 'Failed to delete consultation' }, { status: 500 });
    }
}
