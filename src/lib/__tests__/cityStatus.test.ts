import { CityStatus } from '@prisma/client';
import {
    isPublic,
    isCustomer,
    isOutOfNetwork,
    isPetitionable,
    isPublicCity,
    isOutOfNetworkCity,
    isPublicThroughSecondaryOnly,
    PUBLIC_STATUSES,
    PUBLIC_CITY_WHERE,
    PUBLIC_THROUGH_SECONDARY_WHERE,
    CUSTOMER_CITY_WHERE,
    OUT_OF_NETWORK_CITY_WHERE,
} from '../cityStatus';

const ALL_STATUSES = Object.values(CityStatus);

describe('cityStatus predicates', () => {
    // The full truth table, one row per status. Every visibility decision in the
    // app reduces to one of these cells; a wrong cell is a wrong page.
    it.each([
        // status            isPublic  isCustomer  isOutOfNetwork  isPetitionable
        ['pending' as const, false, false, true, true],
        ['demo' as const, true, false, false, true],
        ['supported' as const, true, true, false, false],
    ])('%s: public=%s customer=%s outOfNetwork=%s petitionable=%s',
        (status, pub, customer, oon, petitionable) => {
            expect(isPublic(status)).toBe(pub);
            expect(isCustomer(status)).toBe(customer);
            expect(isOutOfNetwork(status)).toBe(oon);
            expect(isPetitionable(status)).toBe(petitionable);
        });

    it('covers every CityStatus value (extend the table when the enum grows)', () => {
        expect(ALL_STATUSES.sort()).toEqual(['pending', 'demo', 'supported'].sort());
    });

    // getCities relies on this: every status is either public or out-of-network,
    // never both, never neither. A fourth enum value added without updating the
    // predicates breaks it immediately.
    it('isPublic and isOutOfNetwork partition the enum', () => {
        for (const status of ALL_STATUSES) {
            expect(isPublic(status)).toBe(!isOutOfNetwork(status));
        }
    });

    it('petitionable is exactly the non-customers', () => {
        for (const status of ALL_STATUSES) {
            expect(isPetitionable(status)).toBe(!isCustomer(status));
        }
    });
});

// The second route to publicness (#829): a released meeting of a secondary
// body. It changes what is public and what is out of network; it changes
// nothing about who is a customer or who can petition.
describe('row-level predicates', () => {
    it.each([
        // status, publicThroughSecondary → isPublicCity, isOutOfNetworkCity, isPublicThroughSecondaryOnly
        ['pending' as const, false, false, true, false],
        ['pending' as const, true, true, false, true],
        ['demo' as const, false, true, false, false],
        ['demo' as const, true, true, false, false],
        ['supported' as const, true, true, false, false],
    ])('%s with secondary=%s: public=%s outOfNetwork=%s secondaryOnly=%s',
        (status, publicThroughSecondary, pub, oon, secondaryOnly) => {
            const city = { status, publicThroughSecondary };
            expect(isPublicCity(city)).toBe(pub);
            expect(isOutOfNetworkCity(city)).toBe(oon);
            expect(isPublicThroughSecondaryOnly(city)).toBe(secondaryOnly);
            // A row is public or out of network, never both, never neither.
            expect(isPublicCity(city)).toBe(!isOutOfNetworkCity(city));
        });
});

describe('where-clause fragments agree with the predicates', () => {
    // These fragments are spread into Prisma queries at ~10 call sites; if they
    // drift from the predicates, the DB filters one set and the UI another.
    it('PUBLIC_CITY_WHERE accepts the statuses isPublic accepts, or the second route', () => {
        expect([...PUBLIC_STATUSES].sort()).toEqual(ALL_STATUSES.filter(isPublic).sort());
        expect(PUBLIC_CITY_WHERE.OR).toEqual([
            { status: { in: [...PUBLIC_STATUSES] } },
            PUBLIC_THROUGH_SECONDARY_WHERE,
        ]);
    });

    it('the second route is a released meeting of a secondary body', () => {
        expect(PUBLIC_THROUGH_SECONDARY_WHERE.councilMeetings.some).toEqual({
            released: true,
            administrativeBody: { type: { in: ['youthCouncil'] } },
        });
    });

    it('CUSTOMER_CITY_WHERE selects exactly the statuses isCustomer accepts', () => {
        expect(ALL_STATUSES.filter((s) => s === CUSTOMER_CITY_WHERE.status))
            .toEqual(ALL_STATUSES.filter(isCustomer));
    });

    it('OUT_OF_NETWORK_CITY_WHERE selects the status isOutOfNetwork accepts, minus the second route', () => {
        expect(ALL_STATUSES.filter((s) => s === OUT_OF_NETWORK_CITY_WHERE.status))
            .toEqual(ALL_STATUSES.filter(isOutOfNetwork));
        expect(OUT_OF_NETWORK_CITY_WHERE.NOT).toBe(PUBLIC_THROUGH_SECONDARY_WHERE);
    });
});
