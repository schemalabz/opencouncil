import type { GrantRole } from '@prisma/client';
import {
    RIGHTS, GRANT_ROLES, ROLE_RIGHTS, roleHasRight, resolve, canGrant, reachOf, emptyReach, scopeInCity, adminRealms,
    grantStatus, activeGrants, actorOf, PENDING_GRANT_DAYS, type Right, type Target,
} from '../rights';
import { actorWith, bodyGrant, cityGrant, grant, realmGrant, superadmin } from './fixtures';

const CITY: Target = { level: 'city', cityId: 'athens' };
const BODY: Target = { level: 'body', cityId: 'athens', bodyId: 'youth' };
const PARTY: Target = { level: 'party', cityId: 'athens', partyId: 'p1' };
const PERSON: Target = { level: 'person', cityId: 'athens', personId: 'n1', roleBodyIds: ['youth'] };

describe('roles', () => {
    it('admin carries every right, and every other role a strict subset', () => {
        expect([...ROLE_RIGHTS.admin].sort()).toEqual([...RIGHTS].sort());
        for (const role of GRANT_ROLES.filter((role) => role !== 'admin')) {
            expect(ROLE_RIGHTS[role].size).toBeLessThan(RIGHTS.length);
            expect(roleHasRight(role, 'admin')).toBe(false);
        }
    });

    it('every role but admin reads the drafts, since the work of each is on a draft', () => {
        for (const role of GRANT_ROLES) expect(roleHasRight(role, 'drafts.read')).toBe(true);
    });

    // The matrix the issue (#875) fixes: one row per role, the rights it carries.
    const MATRIX: Record<GrantRole, Right[]> = {
        admin: [...RIGHTS],
        records: ['drafts.read', 'records.read', 'records.edit', 'minutes.export', 'transcript.export'],
        meetings: ['drafts.read', 'meeting.manage', 'meeting.release', 'tasks.run'],
        highlights: ['drafts.read', 'highlight.manage', 'notification.send'],
        viewer: ['drafts.read', 'records.read', 'transcript.export'],
    };

    it.each(GRANT_ROLES)('%s carries exactly the rights of the matrix', (role) => {
        expect([...ROLE_RIGHTS[role]].sort()).toEqual([...MATRIX[role]].sort());
    });
});

describe('resolve', () => {
    it('gives a viewer of a body no admin right on a member of that body', () => {
        const actor = actorWith([bodyGrant('youth', 'athens', 'viewer')]);
        expect(resolve(actor, 'admin', PERSON)).toBe(false);
        expect(resolve(actor, 'records.read', PERSON)).toBe(true);
    });

    it('gives a superadmin every right everywhere, the global target included', () => {
        for (const right of RIGHTS) {
            expect(resolve(superadmin(), right, { level: 'global' })).toBe(true);
            expect(resolve(superadmin(), right, CITY)).toBe(true);
        }
    });

    it('gives nobody else a right on the global target, whatever they hold', () => {
        expect(resolve(actorWith([realmGrant('greece'), cityGrant('athens')]), 'admin', { level: 'global' })).toBe(false);
    });

    it.each(GRANT_ROLES)('a %s grant on a city passes the rights of the role on the city and below it', (role) => {
        const actor = actorWith([cityGrant('athens', role)]);
        for (const right of RIGHTS) {
            const expected = roleHasRight(role, right);
            expect(resolve(actor, right, CITY)).toBe(expected);
            expect(resolve(actor, right, BODY)).toBe(expected);
            expect(resolve(actor, right, PARTY)).toBe(expected);
            expect(resolve(actor, right, PERSON)).toBe(expected);
        }
    });

    it('stops a city grant at the border of its city', () => {
        const actor = actorWith([cityGrant('argos')]);
        expect(resolve(actor, 'admin', CITY)).toBe(false);
        expect(resolve(actor, 'drafts.read', BODY)).toBe(false);
        expect(resolve(actor, 'admin', { level: 'realm', realm: 'greece' })).toBe(false);
    });

    it('a body grant passes its body, and not the city, another body or a body of the same id elsewhere', () => {
        const actor = actorWith([bodyGrant('youth', 'athens', 'meetings')]);
        expect(resolve(actor, 'meeting.manage', BODY)).toBe(true);
        expect(resolve(actor, 'admin', BODY)).toBe(false);
        expect(resolve(actor, 'meeting.manage', CITY)).toBe(false);
        expect(resolve(actor, 'meeting.manage', { ...BODY, bodyId: 'culture' })).toBe(false);
        expect(resolve(actor, 'meeting.manage', { ...BODY, cityId: 'argos' })).toBe(false);
    });

    it('a body grant owns the people whose every role sits on a body it holds', () => {
        const actor = actorWith([bodyGrant('youth', 'athens')]);
        expect(resolve(actor, 'admin', PERSON)).toBe(true);
        expect(resolve(actor, 'admin', { ...PERSON, roleBodyIds: ['youth', null] })).toBe(false);
        expect(resolve(actor, 'admin', { ...PERSON, roleBodyIds: ['culture'] })).toBe(false);
        expect(resolve(actor, 'admin', { ...PERSON, roleBodyIds: [] })).toBe(false);
        expect(resolve(actor, 'admin', { ...PERSON, cityId: 'argos' })).toBe(false);
    });

    it('a party or person grant passes that entity only', () => {
        const actor = actorWith([grant({ partyId: 'p1' }), grant({ personId: 'n1' })]);
        expect(resolve(actor, 'admin', PARTY)).toBe(true);
        expect(resolve(actor, 'admin', { ...PARTY, partyId: 'p2' })).toBe(false);
        expect(resolve(actor, 'admin', PERSON)).toBe(true);
        expect(resolve(actor, 'admin', { ...PERSON, personId: 'n2' })).toBe(false);
        expect(resolve(actor, 'admin', CITY)).toBe(false);
        expect(resolve(actor, 'drafts.read', BODY)).toBe(false);
    });

    it('a realm grant passes the realm and everything below it, when the target names the realm', () => {
        const actor = actorWith([realmGrant('greece')]);
        expect(resolve(actor, 'admin', { level: 'realm', realm: 'greece' })).toBe(true);
        expect(resolve(actor, 'admin', { level: 'realm', realm: 'france' })).toBe(false);
        expect(resolve(actor, 'admin', { ...CITY, realm: 'greece' })).toBe(true);
        expect(resolve(actor, 'admin', { ...BODY, realm: 'greece' })).toBe(true);
        expect(resolve(actor, 'admin', { ...PERSON, realm: 'greece' })).toBe(true);
        expect(resolve(actor, 'admin', { ...CITY, realm: 'france' })).toBe(false);
        // A target with no realm is a target the caller did not look up: closed.
        expect(resolve(actor, 'admin', CITY)).toBe(false);
    });

    it('any one grant that carries the right is enough', () => {
        const actor = actorWith([cityGrant('athens', 'viewer'), bodyGrant('youth', 'athens', 'meetings')]);
        expect(resolve(actor, 'meeting.manage', BODY)).toBe(true);
        expect(resolve(actor, 'records.read', BODY)).toBe(true);
        expect(resolve(actor, 'meeting.manage', CITY)).toBe(false);
    });
});

describe('canGrant', () => {
    it('refuses a realm admin a grant on a city of another realm', () => {
        const actor = actorWith([realmGrant('greece')]);
        expect(canGrant(actor, { level: 'city', realm: 'france', cityId: 'lyon' })).toBe(false);
    });

    it('is a superadmin\'s for the global and realm scopes, and the admin right elsewhere', () => {
        const realmAdmin = actorWith([realmGrant('greece')]);
        const cityAdmin = actorWith([cityGrant('athens')]);
        expect(canGrant(superadmin(), { level: 'global' })).toBe(true);
        expect(canGrant(superadmin(), { level: 'realm', realm: 'greece' })).toBe(true);
        expect(canGrant(realmAdmin, { level: 'realm', realm: 'greece' })).toBe(false);
        expect(canGrant(realmAdmin, { ...CITY, realm: 'greece' })).toBe(true);
        expect(canGrant(cityAdmin, CITY)).toBe(true);
        expect(canGrant(cityAdmin, BODY)).toBe(true);
        expect(canGrant(actorWith([cityGrant('athens', 'meetings')]), BODY)).toBe(false);
        expect(canGrant(actorWith([bodyGrant('youth', 'athens')]), BODY)).toBe(true);
        expect(canGrant(actorWith([bodyGrant('youth', 'athens')]), CITY)).toBe(false);
    });

    it('keeps a person a superadmin\'s, as the row speaks for the person', () => {
        expect(canGrant(superadmin(), PERSON)).toBe(true);
        expect(canGrant(actorWith([realmGrant('greece')]), { ...PERSON, realm: 'greece' })).toBe(false);
        expect(canGrant(actorWith([cityGrant('athens')]), PERSON)).toBe(false);
    });
});

describe('reachOf and scopeInCity', () => {
    it('lists only the bodies whose role carries the right', () => {
        const actor = actorWith([bodyGrant('youth', 'athens', 'viewer'), bodyGrant('culture', 'athens', 'admin')]);
        expect(scopeInCity(actor, 'admin', 'athens')).toEqual({ all: false, bodyIds: ['culture'] });
    });

    it('lists the realms, cities and bodies whose grant carries the right', () => {
        const actor = actorWith([
            realmGrant('greece', 'viewer'), cityGrant('argos', 'records'), bodyGrant('youth', 'athens', 'meetings'),
            grant({ partyId: 'p1' }), grant({ personId: 'n1' }),
        ]);
        expect(reachOf(actor, 'drafts.read')).toEqual({
            all: false, realms: new Set(['greece']), cityIds: new Set(['argos']), bodies: new Map([['youth', 'athens']]),
        });
        expect(reachOf(actor, 'records.edit')).toEqual({ ...emptyReach(), cityIds: new Set(['argos']) });
        expect(reachOf(actor, 'tasks.run')).toEqual({ ...emptyReach(), bodies: new Map([['youth', 'athens']]) });
        expect(reachOf(actor, 'admin')).toEqual(emptyReach());
    });

    it('gives a superadmin everything and lists nothing', () => {
        expect(reachOf(superadmin(), 'admin')).toEqual({ ...emptyReach(), all: true });
    });

    it('covers the city, or lists the held bodies of it, sorted', () => {
        const actor = actorWith([bodyGrant('youth', 'athens'), bodyGrant('culture', 'athens'), bodyGrant('argos-youth', 'argos'), realmGrant('france')]);
        expect(scopeInCity(actor, 'drafts.read', 'athens')).toEqual({ all: false, bodyIds: ['culture', 'youth'] });
        expect(scopeInCity(actor, 'drafts.read', 'patras')).toEqual({ all: false, bodyIds: [] });
        expect(scopeInCity(actor, 'drafts.read', 'athens', 'france')).toEqual({ all: true });
        expect(scopeInCity(actorWith([cityGrant('athens')]), 'drafts.read', 'athens')).toEqual({ all: true });
        expect(scopeInCity(superadmin(), 'drafts.read', 'athens')).toEqual({ all: true });
    });

    it('lists the realms of the admin grants, each once', () => {
        expect(adminRealms(actorWith([realmGrant('greece'), realmGrant('greece'), realmGrant('france', 'viewer'), cityGrant('athens')]))).toEqual(['greece']);
        expect(adminRealms(superadmin())).toEqual([]);
    });

    it('reads the actor off a user row', () => {
        const rows = [cityGrant('athens')];
        expect(actorOf({ isSuperAdmin: false, administers: rows })).toEqual({ isSuperAdmin: false, grants: rows });
    });
});

describe('the lifecycle of a grant', () => {
    const day = 24 * 60 * 60 * 1000;
    const createdAt = new Date('2026-11-01T00:00:00Z');
    const now = new Date(createdAt.getTime() + 3 * day);

    it('is pending until accepted, expired after the window, and revoked whatever else it is', () => {
        expect(grantStatus({ createdAt, acceptedAt: null, revokedAt: null }, now)).toBe('pending');
        expect(grantStatus({ createdAt, acceptedAt: null, revokedAt: null }, new Date(createdAt.getTime() + (PENDING_GRANT_DAYS + 1) * day))).toBe('expired');
        expect(grantStatus({ createdAt, acceptedAt: now, revokedAt: null }, now)).toBe('active');
        expect(grantStatus({ createdAt, acceptedAt: now, revokedAt: now }, now)).toBe('revoked');
        expect(grantStatus({ createdAt, acceptedAt: null, revokedAt: now }, now)).toBe('revoked');
    });

    it('keeps the active rows only', () => {
        const active = { id: 'a', createdAt, acceptedAt: now, revokedAt: null };
        const rows = [active, { id: 'p', createdAt, acceptedAt: null, revokedAt: null }, { id: 'r', createdAt, acceptedAt: now, revokedAt: now }];
        expect(activeGrants(rows, now)).toEqual([active]);
    });
});
