import { isPhoneValid, isPhoneEmpty, detectCountryFromPhone } from '../phone';

describe('isPhoneEmpty', () => {
    it('returns true for empty string', () => {
        expect(isPhoneEmpty('')).toBe(true);
    });

    it('returns true for null-ish values', () => {
        expect(isPhoneEmpty(undefined as unknown as string)).toBe(true);
    });

    it('returns false for a number with digits after country code', () => {
        expect(isPhoneEmpty('+306980000000')).toBe(false);
    });
});

describe('isPhoneValid - Greek mobile numbers', () => {
    it('returns false for just the country code +30', () => {
        expect(isPhoneValid('+30', ['GR'])).toBe(false);
    });

    it('returns false while typing (fewer than 10 digits)', () => {
        expect(isPhoneValid('+3069', ['GR'])).toBe(false);
        expect(isPhoneValid('+30698', ['GR'])).toBe(false);
        expect(isPhoneValid('+306980000', ['GR'])).toBe(false); // 9 digits
    });

    it('returns true for a valid 69X mobile number (10 digits)', () => {
        expect(isPhoneValid('+306980000000', ['GR'])).toBe(true);
    });

    it('returns true for a valid 68X mobile number (10 digits)', () => {
        expect(isPhoneValid('+306851234567', ['GR'])).toBe(true);
    });

    it('returns false for more than 10 digits', () => {
        expect(isPhoneValid('+30698000000000', ['GR'])).toBe(false);
    });

    it('returns false for a landline when only mobile type is passed', () => {
        expect(isPhoneValid('+302100000000', ['GR'], ['mobile'])).toBe(false);
    });

    it('returns true for unsupported country (bypass)', () => {
        expect(isPhoneValid('+12120000000', ['US'])).toBe(true);
    });
});

describe('detectCountryFromPhone', () => {
    it('detects GR from +30 prefix', () => {
        expect(detectCountryFromPhone('+306980000000')).toBe('GR');
    });

    it('returns null for unknown prefix', () => {
        expect(detectCountryFromPhone('+999000000000')).toBeNull();
    });
});
