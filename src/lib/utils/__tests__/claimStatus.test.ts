import { claimMessageKey, isClaimFailure } from '../claimStatus';

describe('claimMessageKey', () => {
    it('maps every status /api/join sends and ignores anything else', () => {
        expect(claimMessageKey('linked')).toBe('linked');
        expect(claimMessageKey('already_yours')).toBe('alreadyYours');
        expect(claimMessageKey('already_linked')).toBe('alreadyLinked');
        expect(claimMessageKey('not_found')).toBe('notFound');
        expect(claimMessageKey('invalid')).toBe('invalid');
        expect(claimMessageKey(undefined)).toBeNull();
        expect(claimMessageKey('toString')).toBeNull();
        expect(claimMessageKey('whatever')).toBeNull();
    });

    it('counts only the results that linked nobody as failures', () => {
        expect(isClaimFailure('linked')).toBe(false);
        expect(isClaimFailure('alreadyYours')).toBe(false);
        expect(['alreadyLinked', 'notFound', 'invalid'].every((k) => isClaimFailure(k as 'invalid'))).toBe(true);
    });
});
