import { NextRequest, NextResponse, after } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { editAdministrativeBody, deleteAdministrativeBody } from '@/lib/db/administrativeBodies';
import { confirmDecisionConventions } from '@/lib/db/administrativeBodiesInternal';
import { rederiveMeetingsOfBody } from '@/lib/derivation/rederive';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { updateAdministrativeBodyRequestSchema } from '@/lib/zod-schemas/administrativeBody';
import { handleApiError } from '@/lib/api/errors';


export async function PUT(
    request: NextRequest,
    props: { params: Promise<{ cityId: string, bodyId: string }> }
) {
    const params = await props.params;
    try {
        await withUserAuthorizedToEdit({ cityId: params.cityId });
        // A malformed body throws a ZodError, which the handler below answers 400.
        const parsed = updateAdministrativeBodyRequestSchema.parse(await request.json());

        // Confirming the conventions is its own write: it carries only the
        // conventions, and the writer stamps who confirmed them.
        if (parsed.confirmConventions === true) {
            const confirmed = await confirmDecisionConventions(params.bodyId, parsed.decisionConventions);
            revalidateTag(`city:${params.cityId}:administrativeBodies`, 'max');
            // Through after(): a body can hold hundreds of meetings, and the
            // person waits for none of them.
            after(() => rederiveMeetingsOfBody(params.bodyId));
            return NextResponse.json(confirmed);
        }

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
        return handleApiError(error, 'Failed to update administrative body');
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
        return handleApiError(error, 'Failed to delete administrative body');
    }
} 