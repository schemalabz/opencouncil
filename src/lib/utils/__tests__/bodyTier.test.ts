import { AdministrativeBodyType } from '@prisma/client';
import {
    PRIMARY_BODY_TYPES,
    SECONDARY_BODY_TYPES,
    bodyTier,
    hasPrimaryPresence,
    isSecondaryBody,
    primaryMeetingWhere,
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
