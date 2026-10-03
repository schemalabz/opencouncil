/** @jest-environment node */
const mockProximity = jest.fn();
jest.mock('@/lib/db/notifications', () => ({
    calculateProximityMatches: (...args: unknown[]) => mockProximity(...args),
}));

import { matchUsersToSubjects } from '../matching';

const subject = { id: 's1', topicId: 'transport', locationId: null };
const normal = { s1: { topicImportance: 'normal' as const, proximityImportance: 'none' as const } };

const reasons = async (interests: { id: string }[]) => {
    const matches = await matchUsersToSubjects([subject], [{ userId: 'u1', locations: [], interests }], normal);
    return [...(matches.get('u1') ?? [])].map((m) => m.reason);
};

beforeEach(() => mockProximity.mockReset());

describe('matchUsersToSubjects, normal-importance topics', () => {
    it('matches a reader who picked the topic', async () => {
        expect(await reasons([{ id: 'transport' }])).toEqual(['topic']);
    });

    it('does not match a reader who picked only other topics', async () => {
        expect(await reasons([{ id: 'culture' }])).toEqual([]);
    });

    it('matches a reader who picked no topic, because none means every topic', async () => {
        expect(await reasons([])).toEqual(['topic']);
    });

    it('keeps the proximity reason for a reader with no topics who is near the subject', async () => {
        mockProximity.mockResolvedValue(true);
        const near = { id: 's1', topicId: 'transport', locationId: 'loc-s1' };
        const matches = await matchUsersToSubjects(
            [near],
            [{ userId: 'u1', locations: [{ id: 'loc-u1' }], interests: [] }],
            { s1: { topicImportance: 'normal', proximityImportance: 'near' } },
        );
        expect([...(matches.get('u1') ?? [])]).toEqual([{ subjectId: 's1', reason: 'proximity' }]);
    });

    it('falls back to the open choice when a reader with no topics is not near the subject', async () => {
        mockProximity.mockResolvedValue(false);
        const far = { id: 's1', topicId: 'transport', locationId: 'loc-s1' };
        const matches = await matchUsersToSubjects(
            [far],
            [{ userId: 'u1', locations: [{ id: 'loc-u1' }], interests: [] }],
            { s1: { topicImportance: 'normal', proximityImportance: 'near' } },
        );
        expect([...(matches.get('u1') ?? [])]).toEqual([{ subjectId: 's1', reason: 'topic' }]);
    });

    it('still skips a subject the editors marked do-not-notify', async () => {
        const matches = await matchUsersToSubjects(
            [subject],
            [{ userId: 'u1', locations: [], interests: [] }],
            { s1: { topicImportance: 'doNotNotify', proximityImportance: 'none' } },
        );
        expect([...(matches.get('u1') ?? [])]).toEqual([]);
    });
});
