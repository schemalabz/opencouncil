import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { isUserAuthorizedToEdit } from '@/lib/auth';
import { getAdministrativeBodiesForCityCached } from '@/lib/cache/queries';
import { AdministrativeBodyType } from '@prisma/client';
import { EmbedConfigurator } from '@/components/embed/EmbedConfigurator';

const ADMIN_BODY_TYPE_ORDER: AdministrativeBodyType[] = ['council', 'committee', 'community'];

export default async function WidgetPage(
    props: {
        params: Promise<{ cityId: string }>;
    }
) {
    const params = await props.params;

    const {
        cityId
    } = params;

    const canEdit = await isUserAuthorizedToEdit({ cityId });
    if (!canEdit) notFound();

    const tCommon = await getTranslations('Common');

    const bodies = await getAdministrativeBodiesForCityCached(cityId);
    const typesPresent = new Set(bodies.map(b => b.type));
    const bodyTypeOptions = ADMIN_BODY_TYPE_ORDER
        .filter(type => typesPresent.has(type))
        .map(type => ({ value: type, label: tCommon(`adminBodyType_${type}`) }));

    return <EmbedConfigurator cityId={cityId} bodyTypeOptions={bodyTypeOptions} />;
}
