import type { AdministrativeBodyType, NotificationBehavior, Prisma } from '@prisma/client';

/**
 * The two tiers of administrative body (#829). Logic reads the tier; labels and
 * the roster rules read the type.
 *
 * A primary body's content is what a reader gets when they ask for nothing in
 * particular: the landing map, the hot subjects, search, the MCP, the city page.
 * A secondary body's content shows only when the reader asks for it, by body
 * type, by body id, or through the checkbox a surface offers for it.
 *
 * Type-only Prisma imports, so this is safe in client components too.
 */
export type BodyTier = 'primary' | 'secondary';

// A Record, so a new enum value does not compile until it has a tier. Nothing
// reaches a default scope by accident.
const TIER_OF_TYPE: Record<AdministrativeBodyType, BodyTier> = {
    council: 'primary',
    committee: 'primary',
    community: 'primary',
    youthCouncil: 'secondary',
};

const typesOfTier = (tier: BodyTier): AdministrativeBodyType[] =>
    (Object.keys(TIER_OF_TYPE) as AdministrativeBodyType[]).filter(type => TIER_OF_TYPE[type] === tier);

export const PRIMARY_BODY_TYPES: readonly AdministrativeBodyType[] = typesOfTier('primary');
export const SECONDARY_BODY_TYPES: readonly AdministrativeBodyType[] = typesOfTier('secondary');

/** A meeting with no body is the council's, which is how every list reads it. */
export function bodyTier(type: AdministrativeBodyType | null | undefined): BodyTier {
    return type ? TIER_OF_TYPE[type] : 'primary';
}

export function isSecondaryBody(body: { type: AdministrativeBodyType } | null | undefined): boolean {
    return bodyTier(body?.type) === 'secondary';
}

/**
 * What a new body's notifications do until an admin says otherwise. A
 * secondary body starts with them off: its meetings are not what the
 * municipality's subscribers signed up for. Every path that creates a body
 * reads this, so the three defaults that existed before cannot disagree.
 */
export function defaultNotificationBehavior(type: AdministrativeBodyType): NotificationBehavior {
    return bodyTier(type) === 'secondary' ? 'NOTIFICATIONS_DISABLED' : 'NOTIFICATIONS_APPROVAL';
}

/**
 * Whether the meetings of a body send updates that a reader can sign up for
 * (#829). A body with its notifications off sends none. A primary body, or a
 * meeting with no body, sends only in a municipality that supports
 * notifications. A secondary body sends to its followers wherever it is: its
 * admin switches its updates on without the municipality, and the signup is
 * the readers' only way to them.
 */
export function bodyOffersUpdates(
    city: { supportsNotifications: boolean },
    body: { type: AdministrativeBodyType; notificationBehavior: NotificationBehavior } | null | undefined,
): boolean {
    if (body?.notificationBehavior === 'NOTIFICATIONS_DISABLED') return false;
    return city.supportsNotifications || isSecondaryBody(body);
}

/**
 * Whether the pipeline of a body's meetings runs with no operator (#829). A
 * secondary body runs its own meetings: a recording starts the transcription,
 * the summary follows the corrected transcript, and the meeting is released
 * when the summary lands. Nobody reviews the transcript first, so the page
 * shows it unreviewed. A primary body keeps the human review step.
 */
export function pipelineRunsUnattended(body: { type: AdministrativeBodyType } | null | undefined): boolean {
    return isSecondaryBody(body);
}

/**
 * The meetings of a city's primary bodies, as a Prisma where clause. It keeps
 * a meeting with no body: cities imported before bodies existed have many, and
 * they are the council's. A relation filter alone would drop them.
 */
export const primaryMeetingWhere = {
    OR: [
        { administrativeBodyId: null },
        { administrativeBody: { type: { in: [...PRIMARY_BODY_TYPES] } } },
    ],
} satisfies Prisma.CouncilMeetingWhereInput;

export const secondaryMeetingWhere = {
    administrativeBody: { type: { in: [...SECONDARY_BODY_TYPES] } },
} satisfies Prisma.CouncilMeetingWhereInput;

/**
 * The URL parameter a city tab reads to widen its scope to the secondary tier:
 * `?tier=all`. Absent or anything else means the primary tier.
 */
export const TIER_PARAM = 'tier';

export function readTier(value: string | string[] | undefined): BodyTier | 'all' {
    return value === 'all' ? 'all' : 'primary';
}

/**
 * Whether a person belongs on the municipality's own roster: at least one role
 * that is not on a secondary body (a party, a city office, a primary body), or
 * no role at all. A person whose every role is on a secondary body shows only
 * where that body's content shows.
 */
export function hasPrimaryPresence(
    roles: { administrativeBody?: { type: AdministrativeBodyType } | null }[],
): boolean {
    return roles.length === 0 || roles.some(role => bodyTier(role.administrativeBody?.type) === 'primary');
}

/**
 * `hasPrimaryPresence` as a Prisma filter on Person: the people of the
 * municipality's own roster. The city counts read it (#829), so a listing
 * counts the same people its roster shows.
 */
export const primaryPresenceWhere = {
    OR: [
        { roles: { none: {} } },
        { roles: { some: { OR: [{ administrativeBodyId: null }, { administrativeBody: { type: { in: [...PRIMARY_BODY_TYPES] } } }] } } },
    ],
} satisfies Prisma.PersonWhereInput;

/**
 * Whether a voiceprint of the person needs the person's own consent, given
 * from their account (#829). True for a person whose every role is on a
 * secondary body: a youth council has members under 18, so nobody records a
 * consent for them, and no admin starts a voiceprint without one. A person
 * with a seat on the municipality's own roster keeps the rules of today.
 */
export function voiceprintNeedsOwnConsent(
    roles: { administrativeBody?: { type: AdministrativeBodyType } | null }[],
): boolean {
    return !hasPrimaryPresence(roles);
}

/**
 * Whether a preference of the city receives the meetings of a body (#829):
 * every preference does for a primary body or a meeting with no body; a
 * secondary body reaches the preferences that follow it. The audience query
 * in db/notifications.ts and the Notis poller apply the same rule.
 */
export function preferenceCoversBody(
    preference: { bodies: { id: string }[] },
    body: { id: string; type: AdministrativeBodyType } | null | undefined,
): boolean {
    return !isSecondaryBody(body) || preference.bodies.some(followed => followed.id === body?.id);
}
