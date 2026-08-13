import { CityStatus } from '@prisma/client';
import {
    isPublic,
    isCustomer,
    isOutOfNetwork,
    isPetitionable,
    PUBLIC_CITY_WHERE,
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

describe('where-clause fragments agree with the predicates', () => {
    // These fragments are spread into Prisma queries at ~10 call sites; if they
    // drift from the predicates, the DB filters one set and the UI another.
    it('PUBLIC_CITY_WHERE selects exactly the statuses isPublic accepts', () => {
        expect([...PUBLIC_CITY_WHERE.status.in].sort())
            .toEqual(ALL_STATUSES.filter(isPublic).sort());
    });

    it('CUSTOMER_CITY_WHERE selects exactly the statuses isCustomer accepts', () => {
        expect(ALL_STATUSES.filter((s) => s === CUSTOMER_CITY_WHERE.status))
            .toEqual(ALL_STATUSES.filter(isCustomer));
    });

    it('OUT_OF_NETWORK_CITY_WHERE selects exactly the statuses isOutOfNetwork accepts', () => {
        expect(ALL_STATUSES.filter((s) => s === OUT_OF_NETWORK_CITY_WHERE.status))
            .toEqual(ALL_STATUSES.filter(isOutOfNetwork));
    });
});
