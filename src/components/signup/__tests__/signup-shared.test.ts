import { accountIssues, maskPhone, saveErrorKey } from '../signup-shared';

describe('accountIssues', () => {
    it('needs a name and something that looks like an email', () => {
        expect(accountIssues({ name: 'Μαρία', email: 'maria@example.com' })).toEqual([]);
        expect(accountIssues({ name: ' ', email: 'not-an-email' })).toEqual(['name_missing', 'email_invalid']);
    });
});

describe('saveErrorKey', () => {
    it("maps the save actions' codes to message keys and falls back to generic", () => {
        expect(saveErrorKey('phone_empty')).toBe('phoneMissing');
        expect(saveErrorKey('phone_not_mobile')).toBe('phoneNotMobile');
        expect(saveErrorKey('phone_in_use')).toBe('phoneInUse');
        expect(saveErrorKey('email_exists')).toBe('emailExists');
        expect(saveErrorKey('An unexpected error occurred.')).toBe('generic');
    });
});

describe('maskPhone', () => {
    it('keeps the country code, the prefix and the last four digits', () => {
        expect(maskPhone('+306943472297')).toBe('+30 694 ··· 2297');
        expect(maskPhone('+16174613635')).toBe('+1 617 ··· 3635');
    });
});
