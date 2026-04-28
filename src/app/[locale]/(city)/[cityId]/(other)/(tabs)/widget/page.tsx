import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { isUserAuthorizedToEdit } from '@/lib/auth';
import prisma from '@/lib/db/prisma';
import { AdministrativeBodyType } from '@prisma/client';
import { EmbedConfigurator } from '@/components/embed/EmbedConfigurator';

const ADMIN_BODY_TYPE_ORDER: AdministrativeBodyType[] = ['council', 'committee', 'community'];

export default async function WidgetPage({
    params: { cityId },
}: {
    params: { cityId: string };
}) {
    const canEdit = await isUserAuthorizedToEdit({ cityId });
    if (!canEdit) notFound();

    const tCommon = await getTranslations('Common');

    // Get distinct body types for this city (lightweight — no meeting data)
    const bodies = await prisma.administrativeBody.findMany({
        where: { cityId },
        select: { type: true },
        distinct: ['type'],
    });
    const typesPresent = new Set(bodies.map(b => b.type));
    const bodyTypeOptions = ADMIN_BODY_TYPE_ORDER
        .filter(type => typesPresent.has(type))
        .map(type => ({ value: type, label: tCommon(`adminBodyType_${type}`) }));

    return <EmbedConfigurator cityId={cityId} bodyTypeOptions={bodyTypeOptions} />;
}
