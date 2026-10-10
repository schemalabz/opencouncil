import { NextRequest, NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { updateConsultation, deleteConsultation } from '@/lib/db/consultations';
import { handleApiError } from '@/lib/api/errors';

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        await withUserAuthorizedToEdit({});
        const body = await req.json();
        const { name, jsonUrl, endDate, isActive } = body as {
            name?: string;
            jsonUrl?: string;
            endDate?: string;
            isActive?: boolean;
        };

        const updated = await updateConsultation(params.id, { name, jsonUrl, endDate, isActive });
        return NextResponse.json(updated);
    } catch (error) {
        if ((error as { code?: string })?.code === 'P2025') {
            return NextResponse.json({ error: 'Consultation not found' }, { status: 404 });
        }
        return handleApiError(error, 'Failed to update consultation');
    }
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        await withUserAuthorizedToEdit({});
        await deleteConsultation(params.id);
        return NextResponse.json({ ok: true });
    } catch (error) {
        if ((error as { code?: string })?.code === 'P2025') {
            return NextResponse.json({ error: 'Consultation not found' }, { status: 404 });
        }
        return handleApiError(error, 'Failed to delete consultation');
    }
}
