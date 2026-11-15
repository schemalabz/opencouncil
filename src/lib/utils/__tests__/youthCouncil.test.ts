import { isYouthCouncil, pipelineRunsUnattended, unattendedMeetingWhere, youthCouncilOnly } from '../youthCouncil';

// The bodies as the database returns them, with the type and the tier both
// set, so that a rule that reads the tier in place of the type fails here.
const council = { type: 'council' as const, tier: 'primary' as const };
const company = { type: 'council' as const, tier: 'secondary' as const };
const youth = { type: 'youthCouncil' as const, tier: 'secondary' as const };
const youthPrimary = { type: 'youthCouncil' as const, tier: 'primary' as const };

describe('the rules of a youth council read the type, not the tier (#829)', () => {
    it.each([
        ['a council', false, council],
        ['a council set to secondary', false, company],
        ['a youth council at its default tier', true, youth],
        ['a youth council set to primary', true, youthPrimary],
    ])('%s: runs unattended %s', (_name, unattended, body) => {
        expect(isYouthCouncil(body)).toBe(unattended);
        expect(pipelineRunsUnattended(body)).toBe(unattended);
    });

    it('keeps the review step for a meeting with no body', () => {
        expect(pipelineRunsUnattended(null)).toBe(false);
        expect(pipelineRunsUnattended(undefined)).toBe(false);
    });

    it('selects the meetings of the youth councils in the where clause, whatever their tier', () => {
        expect(unattendedMeetingWhere).toEqual({ administrativeBody: { type: 'youthCouncil' } });
    });

    it.each([
        ['every role on a youth council', true, [youth]],
        ['two youth roles', true, [youth, youthPrimary]],
        ['a youth council set to primary', true, [youthPrimary]],
        ['a youth role and a council role', false, [youth, council]],
        ['a youth role and a party role', false, [youth, null]],
        ['a role on a council set to secondary', false, [company]],
        ['no role', false, []],
    ])('own-account consent and photo for %s: %s', (_name, ownAccount, bodies) => {
        expect(youthCouncilOnly(bodies.map(administrativeBody => ({ administrativeBody })))).toBe(ownAccount);
    });
});
