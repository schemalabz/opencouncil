import { googleSignInAvailableFor } from '../googleSignIn';

// The module reads env.mjs for the deployment's values; the pure function under test does not.
jest.mock('@/env.mjs', () => ({ env: {} }));

describe('googleSignInAvailableFor', () => {
    it('is available on the host the base URL names and on every realm apex', () => {
        expect(googleSignInAvailableFor('opencouncil.gr', 'https://opencouncil.gr', true)).toBe(true);
        expect(googleSignInAvailableFor('OpenCouncil.gr', 'https://opencouncil.gr', true)).toBe(true);
        expect(googleSignInAvailableFor('opencouncil.rs', 'https://opencouncil.gr', true)).toBe(true);
        expect(googleSignInAvailableFor('opencouncil.fr', 'https://opencouncil.gr', true)).toBe(true);
    });

    it('is not available on any other host', () => {
        expect(googleSignInAvailableFor('pr-7.opencouncil.dev', 'https://opencouncil.gr', true)).toBe(false);
        expect(googleSignInAvailableFor('data.opencouncil.gr', 'https://opencouncil.gr', true)).toBe(false);
        expect(googleSignInAvailableFor('www.opencouncil.rs', 'https://opencouncil.gr', true)).toBe(false);
    });

    it('compares the port, because the dev session cookie is per port', () => {
        expect(googleSignInAvailableFor('localhost:3000', 'http://localhost:3000', true)).toBe(true);
        expect(googleSignInAvailableFor('localhost:3001', 'http://localhost:3000', true)).toBe(false);
    });

    it('is never available without a configured client or a host', () => {
        expect(googleSignInAvailableFor('opencouncil.gr', 'https://opencouncil.gr', false)).toBe(false);
        expect(googleSignInAvailableFor(null, 'https://opencouncil.gr', true)).toBe(false);
        expect(googleSignInAvailableFor('localhost:3000', 'not a url', true)).toBe(false);
    });
});
