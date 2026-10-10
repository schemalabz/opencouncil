import type { Prisma } from '@prisma/client';

/**
 * The fields of an administrative body that anyone may read.
 *
 * The rest of the row holds the municipality's settings for the body: the
 * addresses that receive its transcripts, its notification behaviour, whether
 * an unreviewed transcript shows, its Diavgeia scopes and its decision
 * conventions. Only an editor of the city and the server's own tasks read
 * those.
 *
 * `youtubeChannelUrl` is the municipality's public channel. The meeting page,
 * the embed card and the notification page link to it. `place` is the hall
 * where the body meets as a rule: the meeting page shows it when the meeting
 * has no place of its own.
 */
export const publicAdministrativeBodySelect = {
    id: true,
    name: true,
    name_en: true,
    type: true,
    cityId: true,
    youtubeChannelUrl: true,
    place: true,
} satisfies Prisma.AdministrativeBodySelect;

export type PublicAdministrativeBody = Prisma.AdministrativeBodyGetPayload<{
    select: typeof publicAdministrativeBodySelect;
}>;

/**
 * The relation argument for a public read that includes a body: write
 * `administrativeBody: publicAdministrativeBodyRelation`, never `true`.
 */
export const publicAdministrativeBodyRelation = {
    select: publicAdministrativeBodySelect,
} satisfies Prisma.AdministrativeBodyDefaultArgs;

/**
 * The settings of a body that the meeting's admin page and decisions page
 * read. Both pages are for an editor of the city only, so these fields never
 * travel with the public meeting.
 */
export const administrativeBodySettingsSelect = {
    id: true,
    notificationBehavior: true,
    diavgeiaUnitIds: true,
    decisionConventions: true,
} satisfies Prisma.AdministrativeBodySelect;

export type AdministrativeBodySettings = Prisma.AdministrativeBodyGetPayload<{
    select: typeof administrativeBodySettingsSelect;
}>;
