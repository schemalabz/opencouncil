import type { AdministrativeBody, Prisma } from '@prisma/client';
import type { DecisionConventions } from '@/lib/decisionConventions';

/**
 * The fields of an administrative body that anyone may read.
 *
 * The rest of the row holds the municipality's settings for the body: the
 * addresses that receive its transcripts, its notification behaviour, whether
 * an unreviewed transcript shows, its Diavgeia scopes and its decision
 * conventions. Only an admin of the city, an admin of the body and the
 * server's own tasks read those.
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
 * read. Both pages are for an admin of the city or of the meeting's body
 * only, so these fields never travel with the public meeting.
 */
export const administrativeBodySettingsSelect = {
    id: true,
    notificationBehavior: true,
    diavgeiaUnitIds: true,
    decisionConventions: true,
} satisfies Prisma.AdministrativeBodySelect;

/** The settings of a body, with the conventions parsed as in AdministrativeBodyWithSettings. */
export type AdministrativeBodySettings = Omit<
    Prisma.AdministrativeBodyGetPayload<{ select: typeof administrativeBodySettingsSelect }>,
    'decisionConventions'
> & {
    decisionConventions: DecisionConventions | null;
};

/**
 * A whole AdministrativeBody row as the editor reads and writes answer it. The
 * conventions are the parsed record, with the current anchor names, or null.
 */
export type AdministrativeBodyWithSettings = Omit<AdministrativeBody, 'decisionConventions'> & {
    decisionConventions: DecisionConventions | null;
};

/**
 * A public body with the one fact of its settings that a reader acts on:
 * whether its meetings send updates (#829). The signup reads it. It carries
 * the fact, not the notification behaviour: whether a notification waits for
 * an approval is the municipality's own setting.
 */
export type PublicAdministrativeBodyWithUpdates = PublicAdministrativeBody & { sendsUpdates: boolean };
