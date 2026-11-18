import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { getAdministrativeBodiesForCity, getPublicAdministrativeBodiesForCity, createAdministrativeBody } from '@/lib/db/administrativeBodies';
import { isUserAuthorizedToEdit, withUserAuthorizedToEdit } from '@/lib/auth';
import { administrativeBodySchema } from '@/lib/zod-schemas/administrativeBody';
import { handleApiError } from '@/lib/api/errors';
import { defaultNotificationBehavior, defaultTierOf } from '@/lib/utils/bodyTier';
import { getCityRealm } from '@/lib/db/cityRealm';
import { cityListTags } from '@/lib/db/cityListing';


export async function GET(request: NextRequest, props: { params: Promise<{ cityId: string }> }) {
    const params = await props.params;
    try {
        const { cityId } = params;

        // The route has no auth of its own (the proxy skips /api), so the
        // body's settings, with the addresses of its back office, go only to
        // an editor of the city: the body form in the city form edits them.
        // Everyone else, a body admin included, gets the public fields of
        // every body.
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
        const { name, name_en, type, tier, youtubeChannelUrl, notificationBehavior, showUnreviewedTranscript, diavgeiaUnitIds, place, documentSendSettings } = parsed;
        const bodyTier = tier ?? defaultTierOf(type);

        const newBody = await createAdministrativeBody({
            name,
            name_en,
            type,
            tier: bodyTier,
            cityId,
            youtubeChannelUrl: youtubeChannelUrl ?? null,
            notificationBehavior: notificationBehavior ?? defaultNotificationBehavior(bodyTier),
            showUnreviewedTranscript: showUnreviewedTranscript ?? true,
            diavgeiaUnitIds: diavgeiaUnitIds ?? [],
            place,
        }, documentSendSettings);

        revalidateTag(`city:${cityId}:administrativeBodies`, 'max');
        revalidatePath(`/${cityId}/people`);
        // Search reads the secondary bodies of the realm from a list under
        // these tags (getSecondaryBodyIdsCached).
        if (bodyTier === 'secondary') {
            const realm = await getCityRealm(cityId);
            if (realm) cityListTags(realm).forEach(tag => revalidateTag(tag, 'max'));
        }

        return NextResponse.json(newBody, { status: 201 });
    } catch (error) {
        return handleApiError(error, 'Failed to create administrative body');
    }
} 
