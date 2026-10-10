import { NextRequest, NextResponse, after } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { editAdministrativeBody, editAdministrativeBodyContacts, deleteAdministrativeBody, getBodyPageRow } from '@/lib/db/administrativeBodies';
import { confirmDecisionConventions } from '@/lib/db/administrativeBodiesInternal';
import { getCityRealm } from '@/lib/db/cityRealm';
import { cityListTags, upcomingMeetingsTag } from '@/lib/db/meetings';
import { landingSubjectsTag } from '@/lib/db/subject';
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

        const previous = await getBodyPageRow(params.cityId, params.bodyId);
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
        // A new type can move the meetings of the body to the other tier
        // (#829): every list that reads the tier learns it now, the city's
        // route to the public lists with them.
        if (previous && previous.type !== updatedBody.type) {
            revalidateTag(`city:${params.cityId}:meetings`, 'max');
            revalidatePath(`/${params.cityId}`, 'layout');
            const realm = await getCityRealm(params.cityId);
            if (realm) {
                [...cityListTags(realm), landingSubjectsTag(realm), upcomingMeetingsTag(realm)].forEach(tag => revalidateTag(tag, 'max'));
            }
        }

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