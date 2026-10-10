import * as z from 'zod';
import { zodErrorMap } from '@/lib/zod-schemas/locales';

type IssueCode = z.core.$ZodIssueCode;

/** A schema and an input that fail with the given issue code. */
const failures: Record<IssueCode, [z.ZodType, unknown]> = {
    invalid_type: [z.string(), 5],
    too_big: [z.string().max(2), 'abcd'],
    too_small: [z.string().min(2), 'a'],
    invalid_format: [z.email(), 'not an email'],
    not_multiple_of: [z.number().multipleOf(3), 4],
    unrecognized_keys: [z.strictObject({}), { extra: 1 }],
    invalid_union: [z.union([z.string(), z.number()]), true],
    invalid_key: [z.record(z.string().min(3), z.number()), { a: 1 }],
    // A value fails as invalid_element only under a key that cannot be a path segment.
    invalid_element: [z.map(z.object({}), z.number()), new Map([[{}, 'x']])],
    invalid_value: [z.enum(['a', 'b']), 'c'],
    custom: [z.string().refine(() => false), 'x'],
};

function messageOf(code: string, locale: string): string {
    const [schema, input] = failures[code as IssueCode];
    const result = schema.safeParse(input, { error: zodErrorMap(locale) });
    if (result.success) throw new Error(`${code}: expected a failure`);
    const issue = result.error.issues[0];
    expect(issue.code).toBe(code);
    return issue.message;
}

const CYRILLIC = /[Ѐ-ӿ]/;

// Every code zod can emit, read at runtime: a code that a future zod adds has no
// failure case here, and the test fails until the Serbian map covers it.
describe.each(Object.values(z.ZodIssueCode))('the Serbian message of %s', (code) => {
    it('has a failure case', () => {
        expect(failures).toHaveProperty(code);
    });

    it('is Cyrillic in sr', () => {
        const message = messageOf(code, 'sr');
        expect(message).toMatch(CYRILLIC);
        expect(message).not.toBe(messageOf(code, 'en'));
    });

    it('is the Latin transliteration in sr-Latn', () => {
        const message = messageOf(code, 'sr-Latn');
        expect(message).not.toMatch(CYRILLIC);
        expect(message).not.toBe(messageOf(code, 'en'));
    });
});

describe('the Serbian size messages', () => {
    it.each([
        [1, 'Премало: текст мора имати најмање 1 знак'],
        [2, 'Премало: текст мора имати најмање 2 знака'],
        [5, 'Премало: текст мора имати најмање 5 знакова'],
        [21, 'Премало: текст мора имати најмање 21 знак'],
    ])('uses the plural form for %i', (minimum, expected) => {
        const result = z.string().min(minimum).safeParse('', { error: zodErrorMap('sr') });
        expect(result.error?.issues[0].message).toBe(expected);
    });

    it('names a format in Serbian', () => {
        const result = z.email().safeParse('x', { error: zodErrorMap('sr') });
        expect(result.error?.issues[0].message).toBe('Неисправан формат: очекивано адреса е-поште');
    });
});

describe('zodErrorMap', () => {
    it('leaves English to the zod default', () => {
        expect(zodErrorMap('en')).toBeUndefined();
    });

    it('gives Greek and French from the zod locales', () => {
        expect(z.string().safeParse(5, { error: zodErrorMap('el') }).error?.issues[0].message).toMatch(/^Μη έγκυρη είσοδος/);
        expect(z.string().safeParse(5, { error: zodErrorMap('fr') }).error?.issues[0].message).toMatch(/^Entrée invalide/);
    });

    it('does not override a message that the schema sets', () => {
        const result = z.string().min(2, { error: 'Custom' }).safeParse('a', { error: zodErrorMap('sr') });
        expect(result.error?.issues[0].message).toBe('Custom');
    });
});
