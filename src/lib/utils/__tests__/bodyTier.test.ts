import { AdministrativeBodyType } from '@prisma/client';
import {
    PRIMARY_BODY_TYPES,
    pipelineRunsUnattended,
    voiceprintNeedsOwnConsent,
    SECONDARY_BODY_TYPES,
    bodyTier,
    defaultNotificationBehavior,
    hasPrimaryPresence,
    isSecondaryBody,
    primaryMeetingWhere,
    primaryPresenceWhere,
} from '../bodyTier';

describe('bodyTier', () => {
    it('places every body type in exactly one tier', () => {
        const all = Object.values(AdministrativeBodyType);
        expect([...PRIMARY_BODY_TYPES, ...SECONDARY_BODY_TYPES].sort()).toEqual([...all].sort());
        expect(PRIMARY_BODY_TYPES.filter(type => SECONDARY_BODY_TYPES.includes(type))).toEqual([]);
    });

    it('keeps the municipality\'s own bodies primary, and the youth council secondary', () => {
        expect(bodyTier('council')).toBe('primary');
        expect(bodyTier('committee')).toBe('primary');
        expect(bodyTier('community')).toBe('primary');
        expect(bodyTier('youthCouncil')).toBe('secondary');
    });

    it('reads a missing body as the council\'s', () => {
        expect(bodyTier(null)).toBe('primary');
        expect(bodyTier(undefined)).toBe('primary');
        expect(isSecondaryBody(null)).toBe(false);
        expect(isSecondaryBody({ type: 'youthCouncil' })).toBe(true);
    });

    it('keeps a meeting with no body inside the primary where clause', () => {
        expect(primaryMeetingWhere.OR).toContainEqual({ administrativeBodyId: null });
        expect(primaryMeetingWhere.OR).toContainEqual({ administrativeBody: { type: { in: ['council', 'committee', 'community'] } } });
    });

    it('starts a secondary body with its notifications off, and a primary one on approval', () => {
        expect(defaultNotificationBehavior('youthCouncil')).toBe('NOTIFICATIONS_DISABLED');
        for (const type of PRIMARY_BODY_TYPES) expect(defaultNotificationBehavior(type)).toBe('NOTIFICATIONS_APPROVAL');
    });

    it('runs the pipeline of a secondary body with no operator, and keeps the review step for a primary one', () => {
        expect(pipelineRunsUnattended({ type: 'youthCouncil' })).toBe(true);
        expect(pipelineRunsUnattended({ type: 'council' })).toBe(false);
        expect(pipelineRunsUnattended(null)).toBe(false);
    });

    it('asks the own consent of a person whose every role is on a secondary body before a voiceprint', () => {
        const youth = { administrativeBody: { type: 'youthCouncil' as const } };
        const council = { administrativeBody: { type: 'council' as const } };
        expect(voiceprintNeedsOwnConsent([youth])).toBe(true);
        expect(voiceprintNeedsOwnConsent([youth, council])).toBe(false);
        expect(voiceprintNeedsOwnConsent([])).toBe(false);
    });

    it('counts a person on the municipality\'s roster unless every role is on a secondary body', () => {
        const youth = { administrativeBody: { type: 'youthCouncil' as const } };
        const council = { administrativeBody: { type: 'council' as const } };
        const party = { administrativeBody: null };
        expect(hasPrimaryPresence([])).toBe(true);
        expect(hasPrimaryPresence([party])).toBe(true);
        expect(hasPrimaryPresence([youth, council])).toBe(true);
        expect(hasPrimaryPresence([youth])).toBe(false);
        expect(hasPrimaryPresence([youth, youth])).toBe(false);
    });
});

describe('primaryPresenceWhere', () => {
    it('is the database twin of hasPrimaryPresence: no role, or a role off the secondary tier', () => {
        expect(primaryPresenceWhere).toEqual({
            OR: [
                { roles: { none: {} } },
                { roles: { some: { OR: [{ administrativeBodyId: null }, { administrativeBody: { type: { in: ['council', 'committee', 'community'] } } }] } } },
            ],
        });
    });
});
