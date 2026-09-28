import { authErrorKey } from '../authErrorKey';

const KEYS = { Verification: 'errors.verification' };

describe('authErrorKey', () => {
    it('maps a known code, falls back for an unknown one, and is null without a code', () => {
        expect(authErrorKey('Verification', KEYS, 'errors.generic')).toBe('errors.verification');
        expect(authErrorKey('Configuration', KEYS, 'errors.generic')).toBe('errors.generic');
        expect(authErrorKey(null, KEYS, 'errors.generic')).toBeNull();
    });

    it('does not resolve inherited object names as keys', () => {
        expect(authErrorKey('constructor', KEYS, 'errors.generic')).toBe('errors.generic');
        expect(authErrorKey('__proto__', KEYS, 'errors.generic')).toBe('errors.generic');
    });
});
