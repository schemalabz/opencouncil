import { NextRequest, NextResponse, after } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { editAdministrativeBody, editAdministrativeBodyContacts, deleteAdministrativeBody, getBodyPageRow } from '@/lib/db/administrativeBodies';
import { confirmDecisionConventions } from '@/lib/db/administrativeBodiesInternal';
import { getCityRealm } from '@/lib/db/cityRealm';
import { cityListTags } from '@/lib/db/cityListing';
import { upcomingMeetingsTag } from '@/lib/db/meetings';
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

        // An admin of the body, not of the city, changes the YouTube channel
        // and the document send settings, and nothing else (#828, #874). The page
        // of the body sends those fields alone, for an admin of the city as well.
        // A request with any other field is a full update, which answers 400
        // without the required fields rather than 200 with nothing written.
        const contactsOnly = !!body && typeof body === 'object' && Object.keys(body).every(key => key in administrativeBodyContactsSchema.shape);
        if (contactsOnly || !(await isUserAuthorizedToEdit({ cityId: params.cityId }))) {
            await withUserAuthorizedToEdit({ cityId: params.cityId, administrativeBodyId: params.bodyId });
            const { youtubeChannelUrl, documentSendSettings } = administrativeBodyContactsSchema.parse(body);
            const updatedBody = await editAdministrativeBodyContacts(params.bodyId, { youtubeChannelUrl }, documentSendSettings);
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

        const { name, name_en, type, tier, youtubeChannelUrl, notificationBehavior, showUnreviewedTranscript, diavgeiaUnitIds, place, documentSendSettings } = parsed;

        const previous = await getBodyPageRow(params.cityId, params.bodyId);
        // A field that the request leaves out keeps its value.
        const updatedBody = await editAdministrativeBody(params.bodyId, {
            name,
            name_en,
            type,
            tier,
            youtubeChannelUrl,
            notificationBehavior,
            showUnreviewedTranscript,
            diavgeiaUnitIds,
            place,
        }, documentSendSettings);

        revalidateTag(`city:${params.cityId}:administrativeBodies`, 'max');
        revalidatePath(`/${params.cityId}/people`);
        // A new tier moves the meetings of the body, and its members, to the
        // other tier (#829): every list that reads the tier learns it now, the
        // city's route to the public lists with them. A new type changes the
        // labels and the rules of a youth council.
        if (previous && (previous.tier !== updatedBody.tier || previous.type !== updatedBody.type)) {
            revalidateTag(`city:${params.cityId}:meetings`, 'max');
            revalidateTag(`city:${params.cityId}:people`, 'max');
            revalidateTag(`city:${params.cityId}:basic`, 'max');
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