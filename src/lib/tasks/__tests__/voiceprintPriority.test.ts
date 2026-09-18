import { voiceprintPriorityGroup } from '../voiceprintPriority';
import { PersonWithRelations } from '@/lib/db/people';

type Role = PersonWithRelations['roles'][number];

const MEETING_DATE = new Date('2026-09-14T07:30:00Z');
const ENDED = { endDate: new Date('2025-12-31') };

const role = (over: Partial<Role>): Role => ({
    id: 'role', personId: 'p', cityId: null, partyId: null, administrativeBodyId: null, isHead: false,
    name: null, name_en: null, electedOrder: null, startDate: null, endDate: null,
    createdAt: new Date(0), updatedAt: new Date(0), party: null, administrativeBody: null, city: null,
    ...over,
} as Role);

const cityLevel = (over: Partial<Role> = {}) => role({ cityId: 'city-1', ...over });
const inBody = (id: string, over: Partial<Role> = {}) => role({ administrativeBodyId: id, ...over });
const person = (roles: Role[]) => ({ id: 'p', name: 'p', roles } as PersonWithRelations);
const groupOf = (roles: Role[], bodyId: string | null = 'committee') => voiceprintPriorityGroup(person(roles), bodyId, MEETING_DATE);

describe('voiceprintPriorityGroup', () => {
    it('puts city-level roles first, then the body\'s members, then everyone else', () => {
        expect(groupOf([cityLevel({ isHead: true })])).toBe(0);
        expect(groupOf([cityLevel()])).toBe(0);
        expect(groupOf([inBody('committee')])).toBe(1);
        expect(groupOf([inBody('council')])).toBe(2);
        expect(groupOf([])).toBe(2);
    });

    it('counts only roles held on the meeting date', () => {
        // A former deputy mayor who now sits on another body does not go ahead of a current member.
        expect(groupOf([cityLevel(ENDED), inBody('council')])).toBe(2);
        expect(groupOf([cityLevel(ENDED), inBody('committee')])).toBe(1);
        expect(groupOf([inBody('committee', ENDED)])).toBe(2);
        expect(groupOf([cityLevel({ startDate: new Date('2027-01-01') })])).toBe(2);
    });

    it('has no members to put first when the meeting has no body', () => {
        expect(groupOf([inBody('committee')], null)).toBe(2);
        expect(groupOf([cityLevel()], null)).toBe(0);
    });
});
