const mockEnv = { NEXTAUTH_URL: 'https://opencouncil.gr' };

jest.mock('@/env.mjs', () => ({ env: mockEnv }));

import { realmBaseUrl } from '../realmBaseUrl';

describe('realmBaseUrl', () => {
    beforeEach(() => {
        mockEnv.NEXTAUTH_URL = 'https://opencouncil.gr';
    });

    it("uses the realm's own domain when the configured host is a realm apex", () => {
        expect(realmBaseUrl('cyprus')).toBe('https://opencouncil.cy');
        expect(realmBaseUrl('france')).toBe('https://opencouncil.fr');
        expect(realmBaseUrl('serbia')).toBe('https://opencouncil.rs');
        expect(realmBaseUrl('greece')).toBe('https://opencouncil.gr');
    });

    it('rewrites away from whichever realm apex is configured, not just .gr', () => {
        mockEnv.NEXTAUTH_URL = 'https://opencouncil.fr';
        expect(realmBaseUrl('greece')).toBe('https://opencouncil.gr');
    });

    it('keeps a preview host so links stay on the host under review', () => {
        mockEnv.NEXTAUTH_URL = 'https://pr-12.opencouncil.dev';
        expect(realmBaseUrl('cyprus')).toBe('https://pr-12.opencouncil.dev');
    });

    it('keeps localhost, port included', () => {
        mockEnv.NEXTAUTH_URL = 'http://localhost:3000/';
        expect(realmBaseUrl('cyprus')).toBe('http://localhost:3000');
    });

    it('falls back to the realm domain when the configured URL is unusable', () => {
        mockEnv.NEXTAUTH_URL = 'not-a-url';
        expect(realmBaseUrl('france')).toBe('https://opencouncil.fr');
    });

    it('falls back to the configured URL without a realm, trailing slash stripped', () => {
        mockEnv.NEXTAUTH_URL = 'https://opencouncil.gr/';
        expect(realmBaseUrl(null)).toBe('https://opencouncil.gr');
        expect(realmBaseUrl()).toBe('https://opencouncil.gr');
    });
});
