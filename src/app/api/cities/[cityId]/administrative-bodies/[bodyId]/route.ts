import { NextRequest, NextResponse } from 'next/server';
import { editAdministrativeBody, deleteAdministrativeBody } from '@/lib/db/administrativeBodies';
import { z } from 'zod';

const bodySchema = z.object({
    name: z.string().min(2, {
        message: "Name must be at least 2 characters.",
    }),
    name_en: z.string().min(2, {
        message: "Name (English) must be at least 2 characters.",
    }),
    type: z.enum(['council', 'committee', 'community'])
});

export async function PUT(
    request: NextRequest,
    { params }: { params: { cityId: string, bodyId: string } }
) {
    try {
        const body = await request.json();
        const { name, name_en, type } = bodySchema.parse(body);

        const updatedBody = await editAdministrativeBody(params.bodyId, {
            name,
            name_en,
            type,
        });

        return NextResponse.json(updatedBody);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors }, { status: 400 });
        }
        console.error('Failed to update administrative body:', error);
        return NextResponse.json(
            { error: 'Failed to update administrative body' },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: { cityId: string, bodyId: string } }
) {
    try {
        await deleteAdministrativeBody(params.bodyId);
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error('Failed to delete administrative body:', error);
        return NextResponse.json(
            { error: 'Failed to delete administrative body' },
            { status: 500 }
        );
    }
} 