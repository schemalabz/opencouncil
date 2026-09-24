import type { AdministrativeBodyType } from '@prisma/client';
import { bodySeatTotals, partyBodyColumns, partyComposition } from '../composition';
import type { PartyWithPersons, PersonWithRoles } from '@/lib/db/parties';

const OPEN = { startDate: null, endDate: null };
const ENDED = { startDate: null, endDate: new Date('2020-01-01') };

const COUNCIL = { id: 'council', name: 'Δημοτικό Συμβούλιο', type: 'council' as AdministrativeBodyType };
const COMMITTEE = { id: 'committee', name: 'Δημοτική Επιτροπή', type: 'committee' as AdministrativeBodyType };
const FIRST_COMMUNITY = { id: 'c1', name: '1η Δημοτική Κοινότητα', type: 'community' as AdministrativeBodyType };
const SECOND_COMMUNITY = { id: 'c2', name: '2η Δημοτική Κοινότητα', type: 'community' as AdministrativeBodyType };

type Body = typeof COUNCIL;
type Dates = typeof OPEN | typeof ENDED;

/** A role holds a party or a body, never both — validateRoles forbids a role that carries the two. */
const seatOn = (body: Body, dates: Dates = OPEN) => ({
    partyId: null, cityId: null, isHead: false, electedOrder: null, ...dates,
    administrativeBodyId: body.id, administrativeBody: body,
});
const memberOf = (partyId: string, dates: Dates = OPEN) => ({
    partyId, cityId: null, isHead: false, electedOrder: null, ...dates,
    administrativeBodyId: null, administrativeBody: null,
});

type RoleFixture = ReturnType<typeof seatOn> | ReturnType<typeof memberOf>;

const person = (id: string, ...roles: RoleFixture[]) => ({ id, name: id, roles }) as unknown as PersonWithRoles;

/** The rows getBodySeatTotals reads: every role, one row per role, with its holder. */
const rolesOf = (...people: PersonWithRoles[]) =>
    people.flatMap(p => p.roles.map(role => ({ ...role, personId: p.id })));

describe('bodySeatTotals', () => {
    it('counts every seat holder, whatever their party', () => {
        const totals = bodySeatTotals(rolesOf(
            person('a', memberOf('p1'), seatOn(COUNCIL)),
            person('b', memberOf('p2'), seatOn(COUNCIL)),
            person('independent', seatOn(COUNCIL)),
        ));
        expect(totals).toEqual({ council: 3, committee: 0, community: 0 });
    });

    it('counts a person once per type of body', () => {
        // Two κοινότητες are one community seat, as partyComposition counts them for the party.
        const totals = bodySeatTotals(rolesOf(
            person('both-communities', seatOn(FIRST_COMMUNITY), seatOn(SECOND_COMMUNITY)),
            person('council-and-committee', seatOn(COUNCIL), seatOn(COMMITTEE)),
        ));
        expect(totals).toEqual({ council: 1, committee: 1, community: 1 });
    });

    it('counts no ended seat and no role outside a body', () => {
        const totals = bodySeatTotals(rolesOf(
            person('former-councillor', seatOn(COUNCIL, ENDED)),
            person('member-without-seat', memberOf('p1')),
        ));
        expect(totals).toEqual({ council: 0, committee: 0, community: 0 });
    });

    it('holds the party counts as a part of the totals', () => {
        const councillor = person('councillor', memberOf('p1'), seatOn(COUNCIL), seatOn(COMMITTEE));
        const otherCouncillor = person('other-councillor', memberOf('p1'), seatOn(COUNCIL));
        // Still on the council, no longer in the party: a seat of the council, not of the party.
        const defector = person('defector', memberOf('p1', ENDED), seatOn(COUNCIL));
        const rival = person('rival', memberOf('p2'), seatOn(COUNCIL), seatOn(COMMITTEE));

        const party = { id: 'p1', people: [councillor, otherCouncillor, defector] } as unknown as PartyWithPersons;
        const { council, committee } = partyComposition(party);
        const totals = bodySeatTotals(rolesOf(councillor, otherCouncillor, defector, rival));

        expect({ council, committee }).toEqual({ council: 2, committee: 1 });
        expect({ council: totals.council, committee: totals.committee }).toEqual({ council: 4, committee: 2 });
    });
});

describe('partyBodyColumns', () => {
    it('shows a body type only where a current member holds an active seat on it', () => {
        const party = {
            id: 'p1',
            people: [
                person('councillor', memberOf('p1'), seatOn(COUNCIL), seatOn(COMMITTEE, ENDED)),
                person('defector', memberOf('p1', ENDED), seatOn(FIRST_COMMUNITY)),
            ],
        } as unknown as PartyWithPersons;
        expect(partyBodyColumns([party])).toEqual({ committee: false, community: false });
    });
});
