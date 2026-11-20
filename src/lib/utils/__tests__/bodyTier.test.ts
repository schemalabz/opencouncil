import {
    ALL_SCOPE,
    bodyOffersFollow,
    bodyOffersUpdates,
    bodyScopeWhere,
    bodySendsUpdates,
    defaultTierOf,
    defaultNotificationBehavior,
    isSecondaryBody,
    meetingAudienceWhere,
    meetingListTier,
    personTierWhere,
    preferenceCoversBody,
    primaryMeetingWhere,
    primaryPresenceWhere,
    readTier,
    secondaryMeetingWhere,
    tabTier,
} from '../bodyTier';

describe('defaultTierOf', () => {
    it('starts the municipality\'s own bodies primary, and the youth council secondary', () => {
        expect(defaultTierOf('council')).toBe('primary');
        expect(defaultTierOf('committee')).toBe('primary');
        expect(defaultTierOf('community')).toBe('primary');
        expect(defaultTierOf('youthCouncil')).toBe('secondary');
    });
});

describe('the tier of a body', () => {
    it('is the stored tier, whatever the type', () => {
        expect(isSecondaryBody({ tier: 'secondary' })).toBe(true);
        expect(isSecondaryBody({ tier: 'primary' })).toBe(false);
        expect(isSecondaryBody(null)).toBe(false);
        expect(isSecondaryBody(undefined)).toBe(false);
    });

    it('reads the tier in the where clauses, and keeps a meeting with no body primary', () => {
        expect(primaryMeetingWhere.OR).toContainEqual({ administrativeBodyId: null });
        expect(primaryMeetingWhere.OR).toContainEqual({ administrativeBody: { tier: 'primary' } });
        expect(secondaryMeetingWhere).toEqual({ administrativeBody: { tier: 'secondary' } });
    });

    it('starts a secondary body with its notifications off, and a primary one on approval', () => {
        expect(defaultNotificationBehavior('secondary')).toBe('NOTIFICATIONS_DISABLED');
        expect(defaultNotificationBehavior('primary')).toBe('NOTIFICATIONS_APPROVAL');
    });
});

describe('bodyScopeWhere', () => {
    const councilType = { OR: [{ administrativeBody: { type: { in: ['council'] } } }, { administrativeBodyId: null }] };

    it('is the primary tier when no scope is given', () => {
        expect(bodyScopeWhere()).toEqual(primaryMeetingWhere);
        expect(bodyScopeWhere({})).toEqual(primaryMeetingWhere);
        expect(bodyScopeWhere({ tier: 'primary' })).toEqual(primaryMeetingWhere);
    });

    it('widens through the tier alone', () => {
        expect(bodyScopeWhere({ tier: 'secondary' })).toEqual(secondaryMeetingWhere);
        expect(bodyScopeWhere(ALL_SCOPE)).toEqual({});
    });

    it('narrows inside the tier with a type, and never widens', () => {
        expect(bodyScopeWhere({ types: ['youthCouncil'] })).toEqual({
            AND: [primaryMeetingWhere, { administrativeBody: { type: { in: ['youthCouncil'] } } }],
        });
        expect(bodyScopeWhere({ tier: 'all', types: ['council'] })).toEqual({ AND: [{}, councilType] });
        expect(bodyScopeWhere({ tier: 'secondary', types: ['council'] })).toEqual({ AND: [secondaryMeetingWhere, councilType] });
    });

    it('names bodies by id in any tier, over the tier and the types', () => {
        expect(bodyScopeWhere({ ids: ['b1'] })).toEqual({ administrativeBodyId: { in: ['b1'] } });
        expect(bodyScopeWhere({ tier: 'primary', types: ['council'], ids: ['b1'] })).toEqual({ administrativeBodyId: { in: ['b1'] } });
    });
});

describe('personTierWhere', () => {
    it('is the primary roster when no tier is given: no role, or a role off the secondary tier', () => {
        expect(primaryPresenceWhere).toEqual({
            OR: [
                { roles: { none: {} } },
                { roles: { some: { OR: [{ administrativeBodyId: null }, { administrativeBody: { tier: 'primary' } }] } } },
            ],
        });
        expect(personTierWhere()).toEqual(primaryPresenceWhere);
        expect(personTierWhere('primary')).toEqual(primaryPresenceWhere);
    });

    it('widens through the tier alone', () => {
        expect(personTierWhere('secondary')).toEqual({ roles: { some: {}, every: { administrativeBody: { tier: 'secondary' } } } });
        expect(personTierWhere('all')).toEqual({});
    });
});

describe('meetingListTier', () => {
    it('takes the tier that the caller sends', () => {
        expect(meetingListTier('primary', true)).toBe('primary');
        expect(meetingListTier('secondary', false)).toBe('secondary');
    });

    it('with no tier, gives every tier to a caller who sees the unreleased meetings, and the primary tier to the rest', () => {
        expect(meetingListTier(undefined, true)).toBe('all');
        expect(meetingListTier(undefined, false)).toBe('primary');
    });
});

describe('tabTier', () => {
    const reader = { requested: null, secondaryAvailable: true, administersSecondary: false, primaryEmpty: false };

    it('keeps the primary tier when the surface has nothing of the secondary tier', () => {
        expect(tabTier({ ...reader, secondaryAvailable: false, requested: 'all', primaryEmpty: true })).toBe('primary');
    });

    it('takes the tier in the URL', () => {
        expect(tabTier({ ...reader, requested: 'secondary' })).toBe('secondary');
        expect(tabTier({ ...reader, requested: 'primary', administersSecondary: true })).toBe('primary');
    });

    it('widens for the admin of a secondary body and for a city with no primary content', () => {
        expect(tabTier(reader)).toBe('primary');
        expect(tabTier({ ...reader, administersSecondary: true })).toBe('all');
        expect(tabTier({ ...reader, primaryEmpty: true })).toBe('all');
    });
});

describe('readTier', () => {
    it('reads the three choices and leaves the rest to the surface', () => {
        expect(readTier('all')).toBe('all');
        expect(readTier('primary')).toBe('primary');
        expect(readTier('secondary')).toBe('secondary');
        expect(readTier(undefined)).toBeNull();
        expect(readTier(null)).toBeNull();
        expect(readTier('x')).toBeNull();
        expect(readTier(['all'])).toBeNull();
    });
});

describe('bodyOffersFollow', () => {
    const youth = (sendsUpdates: boolean) => ({ tier: 'secondary' as const, sendsUpdates });
    const released = { hasReleasedMeeting: true };

    it('offers the follow of a secondary body that sends updates and has released a meeting', () => {
        expect(bodyOffersFollow(youth(true), released)).toBe(true);
        // The same answer as the meeting-level rule, in either kind of city.
        for (const supportsNotifications of [true, false]) {
            expect(bodyOffersUpdates({ supportsNotifications }, youth(true))).toBe(true);
        }
    });

    it('offers no follow before the first released meeting, with the updates off, or for a primary body', () => {
        expect(bodyOffersFollow(youth(true), { hasReleasedMeeting: false })).toBe(false);
        expect(bodyOffersFollow(youth(false), released)).toBe(false);
        expect(bodyOffersFollow({ tier: 'primary', sendsUpdates: true }, released)).toBe(false);
    });
});

describe('preferenceCoversBody', () => {
    const supported = { supportsNotifications: true };
    const unsupported = { supportsNotifications: false };
    const follows = { bodies: [{ id: 'youth' }] };
    const nobody = { bodies: [] };

    it('reaches every preference of a city that supports notifications for a primary body or no body', () => {
        expect(preferenceCoversBody(nobody, { id: 'council', tier: 'primary' }, supported)).toBe(true);
        expect(preferenceCoversBody(nobody, null, supported)).toBe(true);
        // The accepted flip: a follower of a youth council gets the council's meetings too.
        expect(preferenceCoversBody(follows, { id: 'council', tier: 'primary' }, supported)).toBe(true);
    });

    it('reaches nobody for a primary body or no body in a city without notifications', () => {
        expect(preferenceCoversBody(nobody, { id: 'council', tier: 'primary' }, unsupported)).toBe(false);
        expect(preferenceCoversBody(follows, { id: 'council', tier: 'primary' }, unsupported)).toBe(false);
        expect(preferenceCoversBody(follows, null, unsupported)).toBe(false);
    });

    it('reaches the followers of a secondary body alone, whatever the city', () => {
        for (const city of [supported, unsupported]) {
            expect(preferenceCoversBody(follows, { id: 'youth', tier: 'secondary' }, city)).toBe(true);
            expect(preferenceCoversBody(nobody, { id: 'youth', tier: 'secondary' }, city)).toBe(false);
            expect(preferenceCoversBody(follows, { id: 'other', tier: 'secondary' }, city)).toBe(false);
        }
    });
});

describe('meetingAudienceWhere', () => {
    it('asks for the followers of a secondary body, and for the city flag otherwise', () => {
        expect(meetingAudienceWhere('chania', { id: 'youth', tier: 'secondary' })).toEqual({ cityId: 'chania', bodies: { some: { id: 'youth' } } });
        expect(meetingAudienceWhere('chania', { id: 'council', tier: 'primary' })).toEqual({ cityId: 'chania', city: { supportsNotifications: true } });
        expect(meetingAudienceWhere('chania', null)).toEqual({ cityId: 'chania', city: { supportsNotifications: true } });
    });
});

describe('bodyOffersUpdates', () => {
    const supported = { supportsNotifications: true };
    const unsupported = { supportsNotifications: false };
    const council = (notificationBehavior: 'NOTIFICATIONS_AUTO' | 'NOTIFICATIONS_DISABLED') => ({ tier: 'primary' as const, sendsUpdates: bodySendsUpdates(notificationBehavior) });
    const youth = (notificationBehavior: 'NOTIFICATIONS_AUTO' | 'NOTIFICATIONS_DISABLED') => ({ tier: 'secondary' as const, sendsUpdates: bodySendsUpdates(notificationBehavior) });

    it('sends nothing for a body with its notifications off', () => {
        expect(bodyOffersUpdates(supported, council('NOTIFICATIONS_DISABLED'))).toBe(false);
        expect(bodyOffersUpdates(supported, youth('NOTIFICATIONS_DISABLED'))).toBe(false);
    });

    it('sends for a primary body, or no body, only in a municipality that supports notifications', () => {
        expect(bodyOffersUpdates(supported, council('NOTIFICATIONS_AUTO'))).toBe(true);
        expect(bodyOffersUpdates(supported, null)).toBe(true);
        expect(bodyOffersUpdates(unsupported, council('NOTIFICATIONS_AUTO'))).toBe(false);
        expect(bodyOffersUpdates(unsupported, null)).toBe(false);
    });

    it('sends for a secondary body wherever it is: its admin switched its updates on', () => {
        expect(bodyOffersUpdates(unsupported, youth('NOTIFICATIONS_AUTO'))).toBe(true);
    });
});

describe('bodySendsUpdates with an approval step', () => {
    it('counts a body whose notifications wait for an approval as a body that sends, as the send does', () => {
        // NOTIFICATIONS_APPROVAL is the default of a primary body, and a body
        // moved from primary to secondary keeps it. Its notifications go out
        // after an approval, so a reader may sign up for them.
        expect(bodySendsUpdates('NOTIFICATIONS_APPROVAL')).toBe(true);
        expect(bodySendsUpdates('NOTIFICATIONS_APPROVAL')).toBe(bodySendsUpdates('NOTIFICATIONS_AUTO'));
        expect(bodySendsUpdates('NOTIFICATIONS_APPROVAL')).not.toBe(bodySendsUpdates('NOTIFICATIONS_DISABLED'));
        const unsupported = { supportsNotifications: false };
        expect(bodyOffersUpdates(unsupported, { tier: 'secondary', sendsUpdates: bodySendsUpdates('NOTIFICATIONS_APPROVAL') })).toBe(true);
    });
});
