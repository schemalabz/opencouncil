import type { AdministrativeBodyType, BodyTier, NotificationBehavior, Prisma } from '@prisma/client';
import { meetingBodyTypeWhere } from '@/lib/db/meetingBodyFilter';

/**
 * The two tiers of administrative body (#829). Each body stores its tier
 * (`AdministrativeBody.tier`). A new body takes the default of its type, and a
 * superadmin can change it (see tierNeedsSuperadmin).
 *
 * A primary body's content is what a reader gets when they ask for nothing in
 * particular: the landing map, the hot subjects, the MCP, the city page.
 * A secondary body's content shows only when the reader asks for it: with a
 * `tier` (see BodyScope), or with the id of the body.
 *
 * What reads what:
 * - Where content shows, the counts, the notifications and Diavgeia read the tier.
 *   The type does not decide where content shows. The search index holds the
 *   id of a body and not its tier, so search names the secondary bodies by id
 *   (see searchTierFilter in lib/search/query.ts).
 * - The rules that exist for youth councils read the type (youthCouncil.ts).
 *
 * Type-only Prisma imports, so this is safe in client components too.
 */

// A Record, so a new enum value does not compile until it has a default tier.
const NEW_BODY_TIER: Record<AdministrativeBodyType, BodyTier> = {
    council: 'primary',
    committee: 'primary',
    community: 'primary',
    youthCouncil: 'secondary',
};

/**
 * The tier a new body of `type` starts with. A stored body keeps its own
 * tier, and a type change without a superadmin must keep this default equal
 * to it (tierNeedsSuperadmin).
 */
export function defaultTierOf(type: AdministrativeBodyType): BodyTier {
    return NEW_BODY_TIER[type];
}

type TypeAndTier = { type: AdministrativeBodyType; tier: BodyTier };

/**
 * Whether a write that leaves a body as `next` needs a superadmin. Only a
 * superadmin decides the tier: it decides whether a pending city is public,
 * which meetings the contract report bills, and the Diavgeia poll. The rule
 * reads the body after the write, not the request: a new type with no tier
 * changes which tier the type stands for. Without a superadmin, a new body
 * takes the default tier of its type, and an edit keeps the stored tier and
 * changes the type only to a type whose default tier is that tier.
 */
export function tierNeedsSuperadmin(next: TypeAndTier, stored: TypeAndTier | null): boolean {
    if (!stored) return next.tier !== defaultTierOf(next.type);
    return next.tier !== stored.tier
        || (next.type !== stored.type && defaultTierOf(next.type) !== stored.tier);
}

/** A meeting with no body is the council's, which is how every list reads it. */
export function isSecondaryBody(body: { tier: BodyTier } | null | undefined): boolean {
    return body?.tier === 'secondary';
}

/**
 * What a new body's notifications do until an admin says otherwise. A
 * secondary body starts with them off: its meetings are not what the
 * municipality's subscribers signed up for. Every path that creates a body
 * reads this, so the three defaults that existed before cannot disagree.
 */
export function defaultNotificationBehavior(tier: BodyTier): NotificationBehavior {
    return tier === 'secondary' ? 'NOTIFICATIONS_DISABLED' : 'NOTIFICATIONS_APPROVAL';
}

/**
 * Whether a body sends notifications at all: the one fact of its notification
 * behaviour that a reader may know (#829). Whether a notification waits for an
 * approval stays the municipality's own setting.
 */
export function bodySendsUpdates(notificationBehavior: NotificationBehavior): boolean {
    return notificationBehavior !== 'NOTIFICATIONS_DISABLED';
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
    body: { tier: BodyTier; sendsUpdates: boolean } | null | undefined,
): boolean {
    if (body && !body.sendsUpdates) return false;
    return city.supportsNotifications || isSecondaryBody(body);
}

/**
 * Whether a reader may follow a body (#829): a secondary body that sends
 * updates and has released a meeting. A secondary body sends to its
 * followers whatever the city (bodyOffersUpdates), so the city plays no part.
 * The signup offers the tick of such a body, and the page of the body links
 * to that tick.
 */
export function bodyOffersFollow(
    body: { tier: BodyTier; sendsUpdates: boolean },
    { hasReleasedMeeting }: { hasReleasedMeeting: boolean },
): boolean {
    return hasReleasedMeeting && isSecondaryBody(body) && body.sendsUpdates;
}

/**
 * The meetings of a city's primary bodies, as a Prisma where clause. It keeps
 * a meeting with no body: cities imported before bodies existed have many, and
 * they are the council's. A relation filter alone would drop them.
 */
export const primaryMeetingWhere = {
    OR: [
        { administrativeBodyId: null },
        { administrativeBody: { tier: 'primary' as const } },
    ],
} satisfies Prisma.CouncilMeetingWhereInput;

export const secondaryMeetingWhere = {
    administrativeBody: { tier: 'secondary' as const },
} satisfies Prisma.CouncilMeetingWhereInput;

/** Which tiers a reader asks for. `all` spans both. */
export type TierScope = BodyTier | 'all';

export const TIER_SCOPES = ['primary', 'secondary', 'all'] as const satisfies readonly TierScope[];

/**
 * Which bodies' content a reader query covers. Every builder of a reader query
 * takes one, and an absent scope is the primary tier.
 * - `tier` is the only switch between the tiers. Absent, it is `primary`.
 * - `types` narrows inside the tier. It never widens: a youth council in the
 *   secondary tier needs `tier` as well as its type.
 * - `ids` names bodies, in any tier. It overrides `tier` and `types`.
 */
export interface BodyScope {
    tier?: TierScope;
    types?: AdministrativeBodyType[];
    ids?: string[];
}

/** Every tier: for a reader who asked for one item by its URL. */
export const ALL_SCOPE = { tier: 'all' } as const satisfies BodyScope;

function meetingTierWhere(tier: TierScope): Prisma.CouncilMeetingWhereInput {
    if (tier === 'all') return {};
    return tier === 'primary' ? primaryMeetingWhere : secondaryMeetingWhere;
}

/** The meetings that `scope` covers, as a Prisma where clause. A meeting with no body is primary. */
export function bodyScopeWhere(scope: BodyScope = {}): Prisma.CouncilMeetingWhereInput {
    if (scope.ids?.length) return { administrativeBodyId: { in: scope.ids } };
    const tierWhere = meetingTierWhere(scope.tier ?? 'primary');
    if (!scope.types?.length) return tierWhere;
    return { AND: [tierWhere, meetingBodyTypeWhere(scope.types)] };
}

/**
 * The tier of a meeting list, for the REST list and MCP `list_meetings`. A
 * `tier` that the caller sends decides. With no tier, a caller who sees the
 * unreleased meetings gets every tier: the secretary of a youth council must
 * find the meeting that a new one replaces. Every other caller gets the
 * primary tier.
 */
export function meetingListTier(tier: TierScope | undefined, seesUnreleased: boolean): TierScope {
    return tier ?? (seesUnreleased ? 'all' : 'primary');
}

/**
 * The tier that a city surface opens on (#829): the meetings and people tabs,
 * `/latest` and the ranking of the overview. A surface with nothing of the
 * secondary tier shows the primary tier. Otherwise the tier in the URL
 * decides. With none, the surface widens to every tier for the admin of a
 * secondary body, whose drafts must be reachable without a click they cannot
 * know to make, and for a city with no public content of the primary tier,
 * whose surface would otherwise be empty. `primaryEmpty` reads the city counts
 * (`city._count`), which count the primary tier.
 */
export function tabTier({ requested, secondaryAvailable, administersSecondary, primaryEmpty }: {
    requested: TierScope | null;
    secondaryAvailable: boolean;
    administersSecondary: boolean;
    primaryEmpty: boolean;
}): TierScope {
    if (!secondaryAvailable) return 'primary';
    return requested ?? (administersSecondary || primaryEmpty ? 'all' : 'primary');
}

/**
 * The URL parameter that carries the tier of a reader surface: the city tabs,
 * the reader meetings API, the feed and the embeds. `?tier=all` widens to the
 * secondary tier, and `?tier=secondary` shows it alone. On a city tab,
 * `?tier=primary` keeps the primary tier where the tab would widen by itself
 * (a body admin, a city with secondary content alone). Absent or anything
 * else, the surface decides.
 */
export const TIER_PARAM = 'tier';

export function readTier(value: string | string[] | null | undefined): TierScope | null {
    return typeof value === 'string' && (TIER_SCOPES as readonly string[]).includes(value) ? value as TierScope : null;
}

/**
 * The people of the municipality's own roster, as a Prisma filter on Person:
 * at least one role that is not on a secondary body (a party, a city office, a
 * primary body), or no role at all. A person whose every role is on a
 * secondary body shows only where that body's content shows. The city counts
 * and the people listing read it (#829), so a listing counts the same people
 * as the identity band.
 */
export const primaryPresenceWhere = {
    OR: [
        { roles: { none: {} } },
        { roles: { some: { OR: [{ administrativeBodyId: null }, { administrativeBody: { tier: 'primary' as const } }] } } },
    ],
} satisfies Prisma.PersonWhereInput;

/** The people whose every role is on a secondary body: the complement of primaryPresenceWhere. */
const secondaryPresenceWhere = {
    roles: { some: {}, every: { administrativeBody: { tier: 'secondary' as const } } },
} satisfies Prisma.PersonWhereInput;

/** The people that a tier covers, as a Prisma where clause. An absent tier is primary. */
export function personTierWhere(tier: TierScope = 'primary'): Prisma.PersonWhereInput {
    if (tier === 'all') return {};
    return tier === 'primary' ? primaryPresenceWhere : secondaryPresenceWhere;
}

/**
 * The audience rule of a meeting (#829), defined once here: a preference of
 * the city receives a meeting when the body is secondary and the preference
 * follows it, or when the body is primary or absent and the city supports
 * notifications. In a city without notifications the meetings of its own
 * bodies reach nobody.
 *
 * The rule has four forms, and an integration test
 * (tests/integration/notis-views.test.ts) holds them to the same answers:
 * - preferenceCoversBody: one row, for a page that holds the reader's preference.
 * - meetingAudienceWhere: the Prisma where of the send and of every preview.
 * - The notis_meeting_events view (migration 20261120120000): it leaves out the
 *   event of a primary body in a city without notifications.
 * - processMeetingEvents in services/notis/src/lib/poller.ts: it wakes the
 *   followers of a secondary body, and every reader of the city otherwise.
 *
 * The four forms do not read the notification behaviour of the body. A body
 * with its notifications off (NOTIFICATIONS_DISABLED) sends to nobody, and
 * other places check that: the DISABLED clause of the notis_meeting_events
 * view, notificationOutcome (src/lib/notifications/freshness.ts) for the
 * automatic send, requireManualNotificationsAllowed (src/lib/db/notifications.ts)
 * for the manual send and its preview, and bodyOffersUpdates for the strip.
 * A new send path must run one of these checks before it reads the audience.
 *
 * Two places describe the rule to an admin before anything is sent, through
 * bodyOffersUpdates (the meeting-level form of the rule and of the DISABLED
 * check together): notificationOutcome says that an email of a primary body
 * in a city without notifications goes to nobody (`cityUnsupported`), and
 * releaseNews (src/lib/notifications/meetingNotifications.ts) says when Notis
 * has no event. The same integration test holds bodyOffersUpdates to the view.
 */
export function preferenceCoversBody(
    preference: { bodies: { id: string }[] },
    body: { id: string; tier: BodyTier } | null | undefined,
    city: { supportsNotifications: boolean },
): boolean {
    return body && isSecondaryBody(body)
        ? preference.bodies.some(followed => followed.id === body.id)
        : city.supportsNotifications;
}

/** The preferences that receive a meeting of `body` in `cityId`: preferenceCoversBody as a Prisma where. */
export function meetingAudienceWhere(
    cityId: string,
    body: { id: string; tier: BodyTier } | null | undefined,
): Prisma.NotificationPreferenceWhereInput {
    return body && isSecondaryBody(body)
        ? { cityId, bodies: { some: { id: body.id } } }
        : { cityId, city: { supportsNotifications: true } };
}
