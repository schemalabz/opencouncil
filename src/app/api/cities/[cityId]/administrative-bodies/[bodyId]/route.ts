import { NextRequest, NextResponse, after } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { editAdministrativeBody, editAdministrativeBodyContacts, deleteAdministrativeBody } from '@/lib/db/administrativeBodies';
import { confirmDecisionConventions } from '@/lib/db/administrativeBodiesInternal';
import { rederiveMeetingsOfBody } from '@/lib/derivation/rederive';
import { z } from 'zod';
import { isUserAuthorizedToEdit, withUserAuthorizedToEdit } from '@/lib/auth';
import { ApiError } from '@/lib/api/errors';
import { administrativeBodySchema, administrativeBodyContactsSchema } from '@/lib/zod-schemas/administrativeBody';


export async function PUT(
    request: NextRequest,
    props: { params: Promise<{ cityId: string, bodyId: string }> }
) {
    const params = await props.params;
    try {
        const body = await request.json();

        // An admin of the body, not of the city, changes the YouTube channel
        // and the contact emails and nothing else (#828).
        if (!(await isUserAuthorizedToEdit({ cityId: params.cityId }))) {
            await withUserAuthorizedToEdit({ cityId: params.cityId, administrativeBodyId: params.bodyId });
            const { youtubeChannelUrl, contactEmails } = administrativeBodyContactsSchema.parse(body);
            const updatedBody = await editAdministrativeBodyContacts(params.bodyId, {
                youtubeChannelUrl: youtubeChannelUrl && youtubeChannelUrl.trim() !== '' ? youtubeChannelUrl : null,
                contactEmails: contactEmails || [],
            });
            revalidateTag(`city:${params.cityId}:administrativeBodies`, 'max');
            return NextResponse.json(updatedBody);
        }

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
        const { name, name_en, type, youtubeChannelUrl, contactEmails, notificationBehavior, showUnreviewedTranscript, diavgeiaUnitIds } = parsed;

        const updatedBody = await editAdministrativeBody(params.bodyId, {
            name,
            name_en,
            type,
            youtubeChannelUrl: youtubeChannelUrl && youtubeChannelUrl.trim() !== '' ? youtubeChannelUrl : null,
            contactEmails: contactEmails || [],
            notificationBehavior: notificationBehavior,
            ...(showUnreviewedTranscript !== undefined && { showUnreviewedTranscript }),
            diavgeiaUnitIds: diavgeiaUnitIds || [],
        });

        revalidateTag(`city:${params.cityId}:administrativeBodies`, 'max');
        revalidatePath(`/${params.cityId}/people`);

        return NextResponse.json(updatedBody);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors }, { status: 400 });
        }
        if (error instanceof ApiError) {
            return NextResponse.json({ error: error.message }, { status: error.statusCode });
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