import {
    detectCountryFromPhone,
    isPhoneEmpty,
    isPhoneValid,
    normalizeMobilePhone,
    repairGreekNational,
    toMobileE164,
} from '../phone';

/**
 * Every rejected case below is a number that reached production before this
 * rule existed (the 2026-09-05 audit of User.phone), so a regression here is
 * a reader silent on both channels.
 */
describe('toMobileE164', () => {
    it('accepts a Greek mobile in E.164, with or without spacing', () => {
        expect(toMobileE164('+306943472297')).toEqual({ ok: true, e164: '+306943472297', country: 'GR' });
        expect(toMobileE164(' +30 694 347 2297 ')).toMatchObject({ ok: true, e164: '+306943472297' });
    });

    it('accepts foreign mobiles, and a US number the plan cannot type', () => {
        expect(toMobileE164('+35799551412')).toMatchObject({ ok: true, country: 'CY' });
        expect(toMobileE164('+33749306027')).toMatchObject({ ok: true, country: 'FR' });
        expect(toMobileE164('+16174613635')).toMatchObject({ ok: true, country: 'US' });
    });

    it('refuses a Greek mobile that lost its country code behind a bare plus', () => {
        expect(toMobileE164('+6943472297')).toEqual({ ok: false, reason: 'invalid' });
    });

    it('refuses a national number without any country code', () => {
        expect(toMobileE164('6943472297')).toEqual({ ok: false, reason: 'invalid' });
    });

    it('refuses a landline, naming it so the reader hears why', () => {
        expect(toMobileE164('+302106459454')).toEqual({ ok: false, reason: 'landline' });
        expect(toMobileE164('+302821341611')).toEqual({ ok: false, reason: 'landline' });
    });

    it('refuses a number that is not valid anywhere', () => {
        // Romania +40 needs nine national digits; this one has eight.
        expect(toMobileE164('+4074101434')).toEqual({ ok: false, reason: 'invalid' });
        expect(toMobileE164('+30')).toEqual({ ok: false, reason: 'invalid' });
    });

    it('treats blank input as empty, not invalid', () => {
        expect(toMobileE164('')).toEqual({ ok: false, reason: 'empty' });
        expect(toMobileE164('   ')).toEqual({ ok: false, reason: 'empty' });
        expect(toMobileE164(null)).toEqual({ ok: false, reason: 'empty' });
        expect(toMobileE164(undefined)).toEqual({ ok: false, reason: 'empty' });
    });
});

describe('repairGreekNational', () => {
    it('restores +30 on a Greek mobile or landline behind a bare plus or no prefix', () => {
        expect(repairGreekNational('+6943472297')).toBe('+306943472297');
        expect(repairGreekNational('6943472297')).toBe('+306943472297');
        expect(repairGreekNational('+2106459454')).toBe('+302106459454');
        expect(repairGreekNational('694 347 2297')).toBe('+306943472297');
    });

    it('leaves every other shape alone', () => {
        expect(repairGreekNational('+306943472297')).toBe('+306943472297');
        expect(repairGreekNational('+4074101434')).toBe('+4074101434');
        expect(repairGreekNational('+69434722')).toBe('+69434722');
    });
});

describe('normalizeMobilePhone (server entry)', () => {
    it('repairs then validates, so the legacy shape becomes a usable number', () => {
        expect(normalizeMobilePhone('+6943472297')).toMatchObject({ ok: true, e164: '+306943472297' });
        expect(normalizeMobilePhone('6943472297')).toMatchObject({ ok: true, e164: '+306943472297' });
    });

    it('still refuses a repaired landline', () => {
        expect(normalizeMobilePhone('+2106459454')).toEqual({ ok: false, reason: 'landline' });
    });

    it('reads null and undefined as empty', () => {
        expect(normalizeMobilePhone(null)).toEqual({ ok: false, reason: 'empty' });
        expect(normalizeMobilePhone(undefined)).toEqual({ ok: false, reason: 'empty' });
    });
});

describe('field helpers', () => {
    it('isPhoneValid is the same rule as toMobileE164', () => {
        expect(isPhoneValid('+306980000000')).toBe(true);
        expect(isPhoneValid('+6943472297')).toBe(false);
        expect(isPhoneValid('+302106459454')).toBe(false);
    });

    it('detectCountryFromPhone reads the flag off a full number only', () => {
        expect(detectCountryFromPhone('+306980000000')).toBe('GR');
        expect(detectCountryFromPhone('+35799551412')).toBe('CY');
        expect(detectCountryFromPhone('6980000000')).toBeNull();
    });

    it('isPhoneEmpty treats a bare dial code as empty, whatever its length', () => {
        expect(isPhoneEmpty('')).toBe(true);
        expect(isPhoneEmpty('+30')).toBe(true);
        expect(isPhoneEmpty('+30 ')).toBe(true);
        expect(isPhoneEmpty('+357')).toBe(true);
        expect(isPhoneEmpty('+1')).toBe(true);
        expect(isPhoneEmpty('+306')).toBe(false);
        expect(isPhoneEmpty('+306980000000')).toBe(false);
    });
});
