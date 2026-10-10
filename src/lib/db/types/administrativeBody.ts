import type { AdministrativeBody, Prisma } from '@prisma/client';

/**
 * The fields of an administrative body that anyone may read.
 *
 * The rest of the row holds the municipality's settings for the body: the
 * addresses that receive its transcripts, its notification behaviour, its
 * Diavgeia scopes and its decision conventions. Only an editor of the city
 * reads those.
 */
export const publicAdministrativeBodySelect = {
    id: true,
    name: true,
    name_en: true,
    type: true,
    cityId: true,
} satisfies Prisma.AdministrativeBodySelect;

export type PublicAdministrativeBody = Prisma.AdministrativeBodyGetPayload<{
    select: typeof publicAdministrativeBodySelect;
}>;

/**
 * A public body with the one setting a reader acts on: whether its meetings
 * send updates (#829). The meeting strip and the signup read it.
 */
export type PublicAdministrativeBodyWithUpdates = PublicAdministrativeBody & Pick<AdministrativeBody, 'notificationBehavior'>;
