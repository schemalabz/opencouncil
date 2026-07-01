import { notFound } from 'next/navigation';
import { isUserAuthorizedToEdit } from '@/lib/auth';
import { getCityCached, getAdministrativeBodiesWithPublicMeetingsCached } from '@/lib/cache';
import { AdministrativeBodyType } from '@prisma/client';
import { EmbedConfigurator, type EmbedBodyGroup } from '@/components/embed/EmbedConfigurator';

const ADMIN_BODY_TYPE_ORDER: AdministrativeBodyType[] = ['council', 'committee', 'community'];

export default async function WidgetPage(
    props: {
        params: Promise<{ cityId: string }>;
    }
) {
    const { cityId } = await props.params;

    const canEdit = await isUserAuthorizedToEdit({ cityId });
    if (!canEdit) notFound();

    const [city, bodies] = await Promise.all([
        getCityCached(cityId),
        // Only bodies that have released meetings — the widget is public, so the
        // filter shouldn't offer bodies a visitor can't see any meetings for.
        getAdministrativeBodiesWithPublicMeetingsCached(cityId),
    ]);

    const bodyGroups: EmbedBodyGroup[] = ADMIN_BODY_TYPE_ORDER
        .map(type => ({
            type,
            bodies: bodies
                .filter(b => b.type === type)
                .map(b => ({ id: b.id, name: b.name, name_en: b.name_en })),
        }))
        .filter(group => group.bodies.length > 0);

    return <EmbedConfigurator cityId={cityId} cityName={city?.name} bodyGroups={bodyGroups} />;
}
