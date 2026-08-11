const mockEnv: { NEXTAUTH_URL: string } = { NEXTAUTH_URL: 'https://opencouncil.gr' };
jest.mock('@/env.mjs', () => ({ env: mockEnv }));

import { emailBaseUrlForRealm, emailLocaleForRealm } from '../emailLocale';

const setNextAuthUrl = (value: string) => {
    mockEnv.NEXTAUTH_URL = value;
};

describe('emailLocaleForRealm', () => {
    it('writes each realm’s email in that realm’s language', () => {
        expect(emailLocaleForRealm('greece')).toBe('el');
        expect(emailLocaleForRealm('serbia')).toBe('sr');
        expect(emailLocaleForRealm('france')).toBe('fr');
        expect(emailLocaleForRealm('cyprus')).toBe('el');
    });
});

describe('emailBaseUrlForRealm', () => {
    afterEach(() => {
        setNextAuthUrl('https://opencouncil.gr');
    });

    it('links to the realm’s own domain in production', () => {
        setNextAuthUrl('https://opencouncil.gr');
        expect(emailBaseUrlForRealm('serbia')).toBe('https://opencouncil.rs');
        expect(emailBaseUrlForRealm('france')).toBe('https://opencouncil.fr');
        expect(emailBaseUrlForRealm('greece')).toBe('https://opencouncil.gr');
    });

    it('keeps a preview host, so preview emails point at the preview', () => {
        setNextAuthUrl('https://pr-577.preview.opencouncil.gr');
        expect(emailBaseUrlForRealm('serbia')).toBe('https://pr-577.preview.opencouncil.gr');
    });

    it('keeps a local dev host', () => {
        setNextAuthUrl('http://localhost:3000');
        expect(emailBaseUrlForRealm('serbia')).toBe('http://localhost:3000');
    });

    it('drops a trailing slash so the link has no double slash', () => {
        setNextAuthUrl('http://localhost:3000/');
        expect(emailBaseUrlForRealm('greece')).toBe('http://localhost:3000');
    });
});
