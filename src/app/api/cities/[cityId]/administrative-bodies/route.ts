import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { getAdministrativeBodiesForCity, getPublicAdministrativeBodiesForCity, createAdministrativeBody } from '@/lib/db/administrativeBodies';
import { z } from 'zod';
import { isUserAuthorizedToEdit, withUserAuthorizedToEdit } from '@/lib/auth';
import { administrativeBodySchema } from '@/lib/zod-schemas/administrativeBody';


export async function GET(request: NextRequest, props: { params: Promise<{ cityId: string }> }) {
    const params = await props.params;
    try {
        const { cityId } = params;

        // The route has no auth of its own (the proxy skips /api), so the
        // body's settings go only to an editor of the city: the body form in
        // the city form edits them.
        const administrativeBodies = await isUserAuthorizedToEdit({ cityId })
            ? await getAdministrativeBodiesForCity(cityId)
            : await getPublicAdministrativeBodiesForCity(cityId);

        return NextResponse.json(administrativeBodies);
    } catch (error) {
        console.error('Error fetching administrative bodies:', error);
        return NextResponse.json(
            { error: 'Failed to fetch administrative bodies' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest, props: { params: Promise<{ cityId: string }> }) {
    const params = await props.params;
    try {
        await withUserAuthorizedToEdit({ cityId: params.cityId });
        const cityId = params.cityId;
        const body = await request.json();
        const parsed = administrativeBodySchema.parse(body);
        const { name, name_en, type, youtubeChannelUrl, contactEmails, notificationBehavior, showUnreviewedTranscript, diavgeiaUnitIds } = parsed;

        const newBody = await createAdministrativeBody({
            name,
            name_en,
            type,
            cityId,
            youtubeChannelUrl: youtubeChannelUrl && youtubeChannelUrl.trim() !== '' ? youtubeChannelUrl : null,
            contactEmails: contactEmails || [],
            notificationBehavior: notificationBehavior || 'NOTIFICATIONS_APPROVAL',
            showUnreviewedTranscript: showUnreviewedTranscript ?? true,
            diavgeiaUnitIds: diavgeiaUnitIds || [],
        });

        revalidateTag(`city:${cityId}:administrativeBodies`, 'max');
        revalidatePath(`/${cityId}/people`);

        return NextResponse.json(newBody, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors }, { status: 400 });
        }
        console.error('Failed to create administrative body:', error);
        return NextResponse.json(
            { error: 'Failed to create administrative body' },
            { status: 500 }
        );
    }
} 
