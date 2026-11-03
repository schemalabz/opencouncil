import { NextRequest, NextResponse, after } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { editAdministrativeBody, editAdministrativeBodyContacts, deleteAdministrativeBody } from '@/lib/db/administrativeBodies';
import { confirmDecisionConventions } from '@/lib/db/administrativeBodiesInternal';
import { rederiveMeetingsOfBody } from '@/lib/derivation/rederive';
import { hasRight, withRight } from '@/lib/auth';
import { administrativeBodyContactsSchema, administrativeBodySchema, confirmConventionsRequestSchema } from '@/lib/zod-schemas/administrativeBody';
import { handleApiError } from '@/lib/api/errors';

/**
 * The discriminator of updateAdministrativeBodyRequestSchema, read before any
 * parse so the right is checked first. A flag that is neither absent nor
 * `false` is a confirmation, and one that is not `true` fails its parse on
 * the flag.
 */
function isConventionsConfirmation(body: unknown): boolean {
    if (typeof body !== 'object' || body === null) return false;
    const flag = (body as { confirmConventions?: unknown }).confirmConventions;
    return flag !== undefined && flag !== false;
}

export async function PUT(
    request: NextRequest,
    props: { params: Promise<{ cityId: string, bodyId: string }> }
) {
    const params = await props.params;
    try {
        const body: unknown = await request.json();

        // Each write checks its own right. Confirming the conventions is the
        // records keeper's: it carries only the conventions, and the writer
        // stamps who confirmed them. The contacts are the body admin's. The
        // rest of the body is the city admin's.
        if (isConventionsConfirmation(body)) {
            await withRight('records.edit', { cityId: params.cityId, administrativeBodyId: params.bodyId });
            // A malformed body throws a ZodError, which the handler below answers 400.
            const { decisionConventions } = confirmConventionsRequestSchema.parse(body);
            const confirmed = await confirmDecisionConventions(params.bodyId, decisionConventions);
            revalidateTag(`city:${params.cityId}:administrativeBodies`, 'max');
            // Through after(): a body can hold hundreds of meetings, and the
            // person waits for none of them.
            after(() => rederiveMeetingsOfBody(params.bodyId));
            return NextResponse.json(confirmed);
        }

        // An admin of the body, not of the city, changes the YouTube channel
        // and the contact emails and nothing else (#828).
        if (!(await hasRight('admin', { cityId: params.cityId }))) {
            await withRight('admin', { cityId: params.cityId, administrativeBodyId: params.bodyId });
            const { youtubeChannelUrl, contactEmails } = administrativeBodyContactsSchema.parse(body);
            const updatedBody = await editAdministrativeBodyContacts(params.bodyId, { youtubeChannelUrl, contactEmails });
            revalidateTag(`city:${params.cityId}:administrativeBodies`, 'max');
            return NextResponse.json(updatedBody);
        }

        const { name, name_en, type, youtubeChannelUrl, contactEmails, notificationBehavior, showUnreviewedTranscript, diavgeiaUnitIds, place } = administrativeBodySchema.parse(body);

        // A field that the request leaves out keeps its value.
        const updatedBody = await editAdministrativeBody(params.bodyId, {
            name,
            name_en,
            type,
            youtubeChannelUrl,
            contactEmails,
            notificationBehavior,
            showUnreviewedTranscript,
            diavgeiaUnitIds,
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
        await deleteAdministrativeBody(params.bodyId, params.cityId);
        revalidateTag(`city:${params.cityId}:administrativeBodies`, 'max');
        revalidatePath(`/${params.cityId}/people`);
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        return handleApiError(error, 'Failed to delete administrative body');
    }
} 