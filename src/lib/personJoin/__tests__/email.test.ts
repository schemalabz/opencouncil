import { isLikelyEmail, normalizeEmail, suggestEmailFix } from '@/lib/personJoin/email';

describe('join email helpers', () => {
    it('normalises what a phone keyboard adds', () => {
        expect(normalizeEmail('  Maria.P@Gmail.COM ')).toBe('maria.p@gmail.com');
    });

    it('tells an address from what is not one', () => {
        expect(isLikelyEmail('maria@gmail.com')).toBe(true);
        expect(isLikelyEmail(' maria@dimos.gov.gr ')).toBe(true);
        for (const bad of ['', 'maria', 'maria@', 'maria@gmail', '@gmail.com', 'maria @gmail.com', 'maria@gmail.c']) {
            expect(isLikelyEmail(bad)).toBe(false);
        }
    });

    it('suggests a fix for a known slip in the domain, and nothing otherwise', () => {
        expect(suggestEmailFix('Maria@gmial.com')).toBe('maria@gmail.com');
        expect(suggestEmailFix('maria@hotmail.con')).toBe('maria@hotmail.com');
        expect(suggestEmailFix('maria@gmail.com')).toBeNull();
        expect(suggestEmailFix('maria@dimos.gr')).toBeNull();
        expect(suggestEmailFix('maria')).toBeNull();
        expect(suggestEmailFix('@gmial.com')).toBeNull();
    });
});
