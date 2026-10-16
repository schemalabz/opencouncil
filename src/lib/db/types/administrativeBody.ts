import type { Prisma } from '@prisma/client';

/**
 * The fields of an administrative body that anyone may read.
 *
 * The rest of the row holds the municipality's settings for the body: its
 * notification behaviour, its Diavgeia scopes and its decision conventions.
 * Only an editor of the city reads those, as only an editor reads the
 * document send settings of the body.
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
