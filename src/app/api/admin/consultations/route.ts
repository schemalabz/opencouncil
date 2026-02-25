import { NextRequest, NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { getConsultationsForAdmin, createConsultation } from '@/lib/db/consultations';

export async function GET() {
    await withUserAuthorizedToEdit({});
    const items = await getConsultationsForAdmin();
    return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
    await withUserAuthorizedToEdit({});
    const body = await req.json();
    const { name, jsonUrl, endDate, isActive, cityId } = body as {
        name: string;
        jsonUrl: string;
        endDate: string;
        isActive?: boolean;
        cityId: string;
    };

    if (!name || !jsonUrl || !endDate || !cityId) {
        return NextResponse.json(
            { error: 'name, jsonUrl, endDate, and cityId are required' },
            { status: 400 }
        );
    }

    try {
        const created = await createConsultation({ name, jsonUrl, endDate, isActive, cityId });
        return NextResponse.json(created, { status: 201 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create consultation';
        const status = message.includes('not found') ? 404 : 400;
        return NextResponse.json({ error: message }, { status });
    }
}
