import { NextRequest, NextResponse, after } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { editAdministrativeBody, deleteAdministrativeBody } from '@/lib/db/administrativeBodies';
import { confirmDecisionConventions } from '@/lib/db/administrativeBodiesInternal';
import { rederiveMeetingsOfBody } from '@/lib/derivation/rederive';
import { z } from 'zod';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { administrativeBodySchema } from '@/lib/zod-schemas/administrativeBody';


export async function PUT(
    request: NextRequest,
    props: { params: Promise<{ cityId: string, bodyId: string }> }
) {
    const params = await props.params;
    try {
        await withUserAuthorizedToEdit({ cityId: params.cityId });
        const body = await request.json();

        // Confirming the conventions is its own write: it carries only the
        // conventions, and the writer parses them and stamps who confirmed them.
        // A malformed record throws a ZodError, which the handler below answers 400.
        if (body?.confirmConventions) {
            const confirmed = await confirmDecisionConventions(params.bodyId, body.decisionConventions);
            revalidateTag(`city:${params.cityId}:administrativeBodies`, 'max');
            // Through after(): a body can hold hundreds of meetings, and the
            // person waits for none of them.
            after(() => rederiveMeetingsOfBody(params.bodyId));
            return NextResponse.json(confirmed);
        }

        const parsed = administrativeBodySchema.parse(body);
        const { name, name_en, type, youtubeChannelUrl, contactEmails, notificationBehavior, showUnreviewedTranscript, diavgeiaUnitIds, place } = parsed;

        const updatedBody = await editAdministrativeBody(params.bodyId, {
            name,
            name_en,
            type,
            youtubeChannelUrl: youtubeChannelUrl && youtubeChannelUrl.trim() !== '' ? youtubeChannelUrl : null,
            contactEmails: contactEmails || [],
            notificationBehavior: notificationBehavior,
            ...(showUnreviewedTranscript !== undefined && { showUnreviewedTranscript }),
            diavgeiaUnitIds: diavgeiaUnitIds || [],
            place,
        });

        revalidateTag(`city:${params.cityId}:administrativeBodies`, 'max');
        revalidatePath(`/${params.cityId}/people`);

        return NextResponse.json(updatedBody);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
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
    props: { params: Promise<{ cityId: string, bodyId: string }> }
) {
    const params = await props.params;
    try {
        await withUserAuthorizedToEdit({ cityId: params.cityId });
        await deleteAdministrativeBody(params.bodyId);
        revalidateTag(`city:${params.cityId}:administrativeBodies`, 'max');
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