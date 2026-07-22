import { Offer } from '@prisma/client';
import { calculateOfferTotals } from '@/lib/pricing';
import { monthsBetween } from '@/lib/utils';

export type OfferState = 'pending' | 'active' | 'upcoming' | 'expired';

/** Display-level state: 'superseded' marks a dead pending proposal. */
export type OfferDisplayState = OfferState | 'superseded';

/** True iff the offer has been signed or unofficially agreed. */
export function isSigned(offer: Offer): boolean {
    return offer.agreed || !!offer.adam;
}

/**
 * Lifecycle state of an offer relative to `now`.
 * - pending:  not signed, regardless of dates
 * - upcoming: signed, startDate in the future
 * - active:   signed, now in [start, end]
 * - expired:  signed, endDate in the past
 */
export function getOfferState(offer: Offer, now: Date = new Date()): OfferState {
    if (!isSigned(offer)) return 'pending';
    if (now < offer.startDate) return 'upcoming';
    // End dates are stored at midnight (start of day) — a contract is still in
    // effect on its final day, so compare against end-of-day.
    const endOfDay = new Date(offer.endDate);
    endOfDay.setHours(23, 59, 59, 999);
    if (now > endOfDay) return 'expired';
    return 'active';
}

/** True iff the two offers' coverage periods overlap. */
export function periodsOverlap(a: Offer, b: Offer): boolean {
    return a.startDate <= b.endDate && a.endDate >= b.startDate;
}

/**
 * The signed offer that supersedes this pending one, if any: a signed offer
 * for the same city whose period overlaps means the negotiation for that
 * period is over — one of the proposals got signed, the rest are history.
 * Returns the most recently created such offer.
 */
export function getSupersedingSignedOffer(
    offer: Offer,
    cityOffers: Offer[]
): Offer | null {
    if (isSigned(offer)) return null;
    const superseders = cityOffers
        .filter((s) => s.id !== offer.id && isSigned(s) && periodsOverlap(offer, s))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return superseders[0] ?? null;
}

/**
 * The offer that supersedes this one, if any. Signed offers are permanent
 * records and are never superseded. A pending offer is superseded by, in
 * order of precedence:
 *   1. a signed offer covering an overlapping period (the negotiation for
 *      that period is over), or
 *   2. a newer pending offer covering an overlapping period (draft
 *      iteration for the same term).
 * Pending offers for non-overlapping periods (e.g. a renewal for a future
 * term vs. a draft for the current one) never supersede each other.
 *
 * This single definition drives the public offer-letter redirect, the admin
 * "Superseded" badges, the renewal chips, and the pipeline stat — keep them
 * consistent by never special-casing one of them.
 */
export function getSupersedingOffer(offer: Offer, cityOffers: Offer[]): Offer | null {
    if (isSigned(offer)) return null;
    const signedSuperseder = getSupersedingSignedOffer(offer, cityOffers);
    if (signedSuperseder) return signedSuperseder;
    const newerPendingOverlapping = cityOffers
        .filter(
            (o) =>
                o.id !== offer.id &&
                !isSigned(o) &&
                o.createdAt > offer.createdAt &&
                periodsOverlap(offer, o)
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return newerPendingOverlapping[0] ?? null;
}

/** A pending offer is superseded (dead) when any superseder exists. */
export function isSupersededPending(offer: Offer, cityOffers: Offer[]): boolean {
    return getSupersedingOffer(offer, cityOffers) !== null;
}

/** Display state: pending offers overlapped by a signed sibling show as superseded. */
export function getDisplayState(
    offer: Offer,
    cityOffers: Offer[],
    now: Date = new Date()
): OfferDisplayState {
    if (isSupersededPending(offer, cityOffers)) return 'superseded';
    return getOfferState(offer, now);
}

export type CityCategory = 'active' | 'upcoming' | 'expired' | 'prospects';

export type CityGroup = {
    cityId: string;
    offers: Offer[];           // all offers for this city, sorted by createdAt desc
    primaryOffer: Offer;       // the offer that determines the category
    pendingRenewals: Offer[];  // pending offers (excluding primary if pending) — for active/expired buckets
};

export type CategorizedOffers = {
    active: CityGroup[];
    upcoming: CityGroup[];
    expired: CityGroup[];
    prospects: CityGroup[];
    noCity: Offer[];
};

/**
 * Categorize offers by city into the four lifecycle buckets.
 * A city's bucket is determined by the *best* state of any of its offers,
 * with priority: active > upcoming > expired > pending.
 */
export function categorizeCities(
    offers: Offer[],
    now: Date = new Date()
): CategorizedOffers {
    const byCity = new Map<string, Offer[]>();
    const noCity: Offer[] = [];

    for (const offer of offers) {
        if (!offer.cityId) {
            noCity.push(offer);
            continue;
        }
        const list = byCity.get(offer.cityId) ?? [];
        list.push(offer);
        byCity.set(offer.cityId, list);
    }

    const result: CategorizedOffers = {
        active: [],
        upcoming: [],
        expired: [],
        prospects: [],
        noCity,
    };

    for (const [cityId, cityOffers] of byCity) {
        const sorted = [...cityOffers].sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
        );

        const states = sorted.map((o) => ({ offer: o, state: getOfferState(o, now) }));

        // Priority: active > upcoming > expired > pending
        const active = states.find((s) => s.state === 'active');
        const upcoming = states.find((s) => s.state === 'upcoming');
        const expired = states.find((s) => s.state === 'expired');
        const pending = states.find((s) => s.state === 'pending');

        let category: CityCategory;
        let primaryOffer: Offer;
        if (active) {
            category = 'active';
            primaryOffer = active.offer;
        } else if (upcoming) {
            category = 'upcoming';
            primaryOffer = upcoming.offer;
        } else if (expired) {
            category = 'expired';
            primaryOffer = expired.offer;
        } else if (pending) {
            category = 'prospects';
            // most-recent pending wins
            primaryOffer = pending.offer;
        } else {
            continue; // unreachable: every offer falls in one of the buckets
        }

        // Live proposals only — pending offers whose period is already covered
        // by a signed offer are superseded, not renewals.
        const pendingRenewals = sorted.filter(
            (o) =>
                o.id !== primaryOffer.id &&
                getOfferState(o, now) === 'pending' &&
                !isSupersededPending(o, sorted)
        );

        const group: CityGroup = {
            cityId,
            offers: sorted,
            primaryOffer,
            pendingRenewals,
        };

        result[category].push(group);
    }

    // Sort each section
    result.active.sort(
        (a, b) => a.primaryOffer.endDate.getTime() - b.primaryOffer.endDate.getTime()
    );
    result.upcoming.sort(
        (a, b) => a.primaryOffer.startDate.getTime() - b.primaryOffer.startDate.getTime()
    );
    result.expired.sort(
        (a, b) => b.primaryOffer.endDate.getTime() - a.primaryOffer.endDate.getTime()
    );
    result.prospects.sort(
        (a, b) => b.primaryOffer.createdAt.getTime() - a.primaryOffer.createdAt.getTime()
    );

    return result;
}

/**
 * Annualized revenue for a single offer:
 *   total / contractMonths × 12
 * Returns 0 for zero-month or zero-total contracts.
 */
export function annualizeOffer(offer: Offer): number {
    const months = monthsBetween(offer.startDate, offer.endDate);
    if (months === 0) return 0;
    const { total } = calculateOfferTotals(offer);
    return (total / months) * 12;
}

/** Sum of annualized revenue across the given offers. */
export function calculateARR(offers: Offer[]): number {
    return offers.reduce((sum, offer) => sum + annualizeOffer(offer), 0);
}

/** Sum of total contract value across the given offers. */
export function calculateTotalValue(offers: Offer[]): number {
    return offers.reduce((sum, offer) => sum + calculateOfferTotals(offer).total, 0);
}

/**
 * Live pending proposals across all cities: not signed, and not superseded by
 * a signed offer covering the same period. Offers without a city can't be
 * superseded (no siblings to compare against).
 */
export function getLivePendingOffers(offers: Offer[]): Offer[] {
    const byCity = new Map<string, Offer[]>();
    for (const o of offers) {
        if (!o.cityId) continue;
        const list = byCity.get(o.cityId) ?? [];
        list.push(o);
        byCity.set(o.cityId, list);
    }
    return offers.filter(
        (o) =>
            !isSigned(o) &&
            (!o.cityId || !isSupersededPending(o, byCity.get(o.cityId) ?? []))
    );
}
