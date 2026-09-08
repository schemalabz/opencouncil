import { emailLocaleForRealm } from '../emailLocale';

describe('emailLocaleForRealm', () => {
    it('writes each realm’s email in that realm’s language', () => {
        expect(emailLocaleForRealm('greece')).toBe('el');
        expect(emailLocaleForRealm('serbia')).toBe('sr');
        expect(emailLocaleForRealm('france')).toBe('fr');
        expect(emailLocaleForRealm('cyprus')).toBe('el');
    });
});
