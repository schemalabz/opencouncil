import {
    ALL_SCOPE,
    bodyScopeWhere,
    pipelineRunsUnattended,
    voiceprintNeedsOwnConsent,
    defaultTierOf,
    defaultNotificationBehavior,
    isSecondaryBody,
    isYouthCouncil,
    personTierWhere,
    primaryMeetingWhere,
    primaryPresenceWhere,
    readTier,
    secondaryMeetingWhere,
    youthCouncilOnly,
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

describe('the rules of a youth council', () => {
    it('read the type, not the tier: a secondary council of a company keeps the review step', () => {
        expect(isYouthCouncil({ type: 'youthCouncil' })).toBe(true);
        expect(isYouthCouncil({ type: 'council' })).toBe(false);
        expect(pipelineRunsUnattended({ type: 'youthCouncil' })).toBe(true);
        expect(pipelineRunsUnattended({ type: 'council' })).toBe(false);
        expect(pipelineRunsUnattended(null)).toBe(false);
    });

    it('ask the own consent of a person whose every role is on a youth council', () => {
        const youth = { administrativeBody: { type: 'youthCouncil' as const } };
        const council = { administrativeBody: { type: 'council' as const } };
        const party = { administrativeBody: null };
        expect(voiceprintNeedsOwnConsent([youth])).toBe(true);
        expect(voiceprintNeedsOwnConsent([youth, youth])).toBe(true);
        expect(voiceprintNeedsOwnConsent([youth, council])).toBe(false);
        expect(voiceprintNeedsOwnConsent([youth, party])).toBe(false);
        expect(voiceprintNeedsOwnConsent([])).toBe(false);
        expect(youthCouncilOnly([council])).toBe(false);
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
