import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { editAdministrativeBody, deleteAdministrativeBody } from '@/lib/db/administrativeBodies';
import { z } from 'zod';
import { withUserAuthorizedToEdit } from '@/lib/auth';

const bodySchema = z.object({
    name: z.string().min(2, {
        message: "Name must be at least 2 characters.",
    }),
    name_en: z.string().min(2, {
        message: "Name (English) must be at least 2 characters.",
    }),
    type: z.enum(['council', 'committee', 'community']),
    youtubeChannelUrl: z.union([
        z.string().url({
            message: "Must be a valid URL.",
        }),
        z.literal('')
    ]).optional().transform(val => val === '' ? undefined : val),
    notificationBehavior: z.enum(['NOTIFICATIONS_DISABLED', 'NOTIFICATIONS_AUTO', 'NOTIFICATIONS_APPROVAL']).optional(),
    diavgeiaUnitId: z.string().optional().transform(val => val === '' ? undefined : val),
});

export async function PUT(
    request: NextRequest,
    { params }: { params: { cityId: string, bodyId: string } }
) {
    try {
        await withUserAuthorizedToEdit({ cityId: params.cityId });
        const body = await request.json();
        const parsed = bodySchema.parse(body);
        const { name, name_en, type, youtubeChannelUrl, notificationBehavior, diavgeiaUnitId } = parsed;

        const updatedBody = await editAdministrativeBody(params.bodyId, {
            name,
            name_en,
            type,
            youtubeChannelUrl: youtubeChannelUrl && youtubeChannelUrl.trim() !== '' ? youtubeChannelUrl : null,
            notificationBehavior: notificationBehavior,
            diavgeiaUnitId: diavgeiaUnitId || null,
        });

        revalidateTag(`city:${params.cityId}:administrativeBodies`);
        revalidatePath(`/${params.cityId}/people`);

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
        await withUserAuthorizedToEdit({ cityId: params.cityId });
        await deleteAdministrativeBody(params.bodyId);
        revalidateTag(`city:${params.cityId}:administrativeBodies`);
        revalidatePath(`/${params.cityId}/people`);
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error('Failed to delete administrative body:', error);
        return NextResponse.json(
            { error: 'Failed to delete administrative body' },
            { status: 500 }
        );
    }
} 