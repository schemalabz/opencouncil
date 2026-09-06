const mockEnv = { NEXTAUTH_URL: 'https://opencouncil.gr' };

jest.mock('@/env.mjs', () => ({ env: mockEnv }));

import { embedBaseUrl } from '../embedBaseUrl';

describe('embedBaseUrl', () => {
    beforeEach(() => {
        mockEnv.NEXTAUTH_URL = 'https://opencouncil.gr';
    });

    it("uses the city's realm domain when the configured host is a realm apex", () => {
        expect(embedBaseUrl('cyprus')).toBe('https://opencouncil.cy');
        expect(embedBaseUrl('greece')).toBe('https://opencouncil.gr');
    });

    it('keeps a preview host so links stay on the host under review', () => {
        mockEnv.NEXTAUTH_URL = 'https://pr-12.opencouncil.dev';
        expect(embedBaseUrl('cyprus')).toBe('https://pr-12.opencouncil.dev');
    });

    it('keeps localhost, port included', () => {
        mockEnv.NEXTAUTH_URL = 'http://localhost:3000/';
        expect(embedBaseUrl('cyprus')).toBe('http://localhost:3000');
    });

    it('falls back to the configured URL without a realm, trailing slash stripped', () => {
        mockEnv.NEXTAUTH_URL = 'https://opencouncil.gr/';
        expect(embedBaseUrl(null)).toBe('https://opencouncil.gr');
        expect(embedBaseUrl()).toBe('https://opencouncil.gr');
    });
});
