import { NextRequest, NextResponse, after } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { editAdministrativeBody, editAdministrativeBodyContacts, deleteAdministrativeBody, getBodyPageRow } from '@/lib/db/administrativeBodies';
import { confirmDecisionConventions } from '@/lib/db/administrativeBodiesInternal';
import { getCityRealm } from '@/lib/db/cityRealm';
import { cityListTags, upcomingMeetingsTag } from '@/lib/db/meetings';
import { landingSubjectsTag } from '@/lib/db/subject';
import { rederiveMeetingsOfBody } from '@/lib/derivation/rederive';
import { isUserAuthorizedToEdit, withUserAuthorizedToEdit } from '@/lib/auth';
import { administrativeBodyContactsSchema, updateAdministrativeBodyRequestSchema } from '@/lib/zod-schemas/administrativeBody';
import { handleApiError } from '@/lib/api/errors';


export async function PUT(
    request: NextRequest,
    props: { params: Promise<{ cityId: string, bodyId: string }> }
) {
    const params = await props.params;
    try {
        const body = await request.json();

        // An admin of the body, not of the city, changes the YouTube channel,
        // the contact emails and, on a secondary body, the updates switch, and
        // nothing else (#828, #829). The page of the body sends those fields
        // alone, for an admin of the city as well.
        const contactsOnly = body && typeof body === 'object' && !('name' in body) && !body.confirmConventions;
        if (contactsOnly || !(await isUserAuthorizedToEdit({ cityId: params.cityId }))) {
            await withUserAuthorizedToEdit({ cityId: params.cityId, administrativeBodyId: params.bodyId });
            const { youtubeChannelUrl, contactEmails, notificationBehavior } = administrativeBodyContactsSchema.parse(body);
            const updatedBody = await editAdministrativeBodyContacts(params.bodyId, { youtubeChannelUrl, contactEmails, notificationBehavior });
            revalidateTag(`city:${params.cityId}:administrativeBodies`, 'max');
            return NextResponse.json(updatedBody);
        }

        // A malformed body throws a ZodError, which the handler below answers 400.
        const parsed = updateAdministrativeBodyRequestSchema.parse(body);

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

        const previous = await getBodyPageRow(params.cityId, params.bodyId);
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
        // A new type can move the meetings of the body, and its members, to
        // the other tier (#829): every list that reads the tier learns it now,
        // the city's route to the public lists with them.
        if (previous && previous.type !== updatedBody.type) {
            revalidateTag(`city:${params.cityId}:meetings`, 'max');
            revalidateTag(`city:${params.cityId}:people`, 'max');
            revalidatePath(`/${params.cityId}`, 'layout');
            const realm = await getCityRealm(params.cityId);
            if (realm) {
                [...cityListTags(realm), landingSubjectsTag(realm), upcomingMeetingsTag(realm)].forEach(tag => revalidateTag(tag, 'max'));
            }
        }

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
        await withUserAuthorizedToEdit({});
        await deleteAdministrativeBody(params.bodyId);
        revalidateTag(`city:${params.cityId}:administrativeBodies`, 'max');
        revalidatePath(`/${params.cityId}/people`);
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        return handleApiError(error, 'Failed to delete administrative body');
    }
} 