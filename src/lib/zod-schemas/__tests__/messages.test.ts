import { IntlMessageFormat } from 'intl-messageformat';
import { validationMessageKey, vmsg, type ValidationMessageKey } from '@/lib/zod-schemas/messages';
import en from '../../../../messages/en/validation.json';
import el from '../../../../messages/el/validation.json';
import fr from '../../../../messages/fr/validation.json';
import sr from '../../../../messages/sr/validation.json';

const keys = Object.keys(en) as ValidationMessageKey[];

describe('validation messages', () => {
    // A form finds the key of a message by its English text, so two keys with
    // the same English text would show one translation for both.
    it('have a distinct English text per key', () => {
        expect(new Set(Object.values(en)).size).toBe(keys.length);
    });

    it.each(keys)('%s: vmsg gives a text that maps back to its key', (key) => {
        expect(validationMessageKey(vmsg(key))).toBe(key);
    });

    it('find no key for a message that vmsg did not give', () => {
        expect(validationMessageKey('Too small: expected string to have >=2 characters')).toBeUndefined();
    });

    // The form calls t(key) without values: a placeholder would print as a gap.
    it.each([['en', en], ['el', el], ['fr', fr], ['sr', sr]] as const)('%s: every message formats without values', (locale, catalog) => {
        for (const message of Object.values(catalog)) {
            expect(new IntlMessageFormat(message, locale).format()).toBe(message);
        }
    });
});
