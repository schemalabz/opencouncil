import { assessRolloutPhones, isBatchablePhone, isEligiblePhone } from '../phone-eligibility';

const on = new Date('2026-08-30');

describe('assessRolloutPhones', () => {
    it('passes a clean Greek mobile and repairs the legacy bare-plus shape', () => {
        const issues = assessRolloutPhones([
            { id: 'a', phone: '+306943472297', notisEnabledAt: null },
            { id: 'b', phone: '+6986919333', notisEnabledAt: null },
        ]);
        expect(issues.get('a')).toBeNull();
        expect(issues.get('b')).toBeNull();
    });

    it('names a landline and an invalid number', () => {
        const issues = assessRolloutPhones([
            { id: 'landline', phone: '+302106459454', notisEnabledAt: null },
            { id: 'bare-landline', phone: '+2107753031', notisEnabledAt: null },
            { id: 'nowhere', phone: '+4074101434', notisEnabledAt: null },
            { id: 'none', phone: null, notisEnabledAt: null },
        ]);
        expect(issues.get('landline')).toBe('landline');
        expect(issues.get('bare-landline')).toBe('landline');
        expect(issues.get('nowhere')).toBe('invalid');
        expect(issues.get('none')).toBe('invalid');
    });

    it('marks the accounts that share a number, sparing the one already enabled', () => {
        const issues = assessRolloutPhones([
            { id: 'first', phone: '+33749306027', notisEnabledAt: null },
            { id: 'second', phone: '+33 7 49 30 60 27', notisEnabledAt: on },
        ]);
        expect(issues.get('second')).toBeNull();
        expect(issues.get('first')).toBe('duplicate');
    });

    it('marks every holder when none of them is enabled', () => {
        const issues = assessRolloutPhones([
            { id: 'x', phone: '+306980000001', notisEnabledAt: null },
            { id: 'y', phone: '+306980000001', notisEnabledAt: null },
        ]);
        expect(issues.get('x')).toBe('duplicate');
        expect(issues.get('y')).toBe('duplicate');
    });

    it('holds a +1 number back from batches without calling it ineligible', () => {
        const issues = assessRolloutPhones([{ id: 'us', phone: '+16174613635', notisEnabledAt: null }]);
        expect(issues.get('us')).toBe('us');
        expect(isEligiblePhone('us')).toBe(true);
        expect(isBatchablePhone('us')).toBe(false);
    });

    it('eligibility and batchability agree on the clean and refused cases', () => {
        expect(isEligiblePhone(null)).toBe(true);
        expect(isBatchablePhone(null)).toBe(true);
        for (const issue of ['invalid', 'landline', 'duplicate'] as const) {
            expect(isEligiblePhone(issue)).toBe(false);
            expect(isBatchablePhone(issue)).toBe(false);
        }
    });
});
