import * as z from 'zod';

/**
 * The default zod messages in Serbian Cyrillic. zod ships no Serbian locale.
 * This file follows the shape of the zod locales (`zod/v4/locales/*.js`): one
 * message per issue code. sr-Latn is not a second copy: `zodErrorMap` converts
 * the output of this map with the transliteration of the app catalogs.
 */

type RawIssue = z.core.$ZodRawIssue;
type IssueCode = RawIssue['code'];
type IssueOf<C extends IssueCode> = Extract<RawIssue, { code: C }>;

/** One message function per issue code. The type fails to compile when zod adds a code. */
export type IssueMessages = { [C in IssueCode]: (issue: IssueOf<C>) => string };

const pluralRules = new Intl.PluralRules('sr');

/** A Serbian noun after a number: 1 знак, 2 знака, 5 знакова. */
type PluralForms = { one: string; few: string; other: string };

function counted(count: number | bigint, forms: PluralForms): string {
    const category = pluralRules.select(Number(count));
    return `${count} ${category === 'one' ? forms.one : category === 'few' ? forms.few : forms.other}`;
}

/** The unit of a size limit, by the origin of the issue. */
const SIZE_UNITS: Record<string, PluralForms> = {
    string: { one: 'знак', few: 'знака', other: 'знакова' },
    file: { one: 'бајт', few: 'бајта', other: 'бајтова' },
    array: { one: 'ставку', few: 'ставке', other: 'ставки' },
    set: { one: 'ставку', few: 'ставке', other: 'ставки' },
    map: { one: 'унос', few: 'уноса', other: 'уноса' },
};

const TYPE_NAMES: Record<string, string> = {
    string: 'текст',
    number: 'број',
    int: 'цео број',
    boolean: 'логичка вредност',
    bigint: 'велики цео број',
    symbol: 'симбол',
    undefined: 'недефинисано',
    null: 'null',
    never: 'ништа',
    void: 'ништа',
    date: 'датум',
    array: 'низ',
    object: 'објекат',
    tuple: 'торка',
    record: 'запис',
    map: 'мапа',
    set: 'скуп',
    file: 'датотека',
    nonoptional: 'вредност',
    nan: 'NaN',
    function: 'функција',
};

/** Every string format zod checks. The type fails to compile when zod adds a format. */
const FORMAT_NAMES: Record<z.core.$ZodStringFormats, string> & Record<string, string> = {
    email: 'адреса е-поште',
    url: 'URL',
    emoji: 'емоџи',
    uuid: 'UUID',
    uuidv4: 'UUIDv4',
    uuidv6: 'UUIDv6',
    guid: 'GUID',
    nanoid: 'nanoid',
    cuid: 'cuid',
    cuid2: 'cuid2',
    ulid: 'ULID',
    xid: 'XID',
    ksuid: 'KSUID',
    datetime: 'ISO датум и време',
    date: 'ISO датум',
    time: 'ISO време',
    duration: 'ISO трајање',
    ipv4: 'IPv4 адреса',
    ipv6: 'IPv6 адреса',
    mac: 'MAC адреса',
    cidrv4: 'IPv4 опсег',
    cidrv6: 'IPv6 опсег',
    base64: 'base64 текст',
    base64url: 'base64url текст',
    json_string: 'JSON текст',
    e164: 'E.164 број',
    credit_card: 'број платне картице',
    currency_code: 'код валуте',
    iban: 'IBAN',
    lowercase: 'текст малим словима',
    uppercase: 'текст великим словима',
    regex: 'унос',
    jwt: 'JWT',
    starts_with: 'унос',
    ends_with: 'унос',
    includes: 'унос',
    template_literal: 'унос',
};

const typeName = (type: string) => TYPE_NAMES[type] ?? type;

export const srIssueMessages: IssueMessages = {
    invalid_type: issue => {
        const received = typeName(z.core.util.parsedType(issue.input));
        return /^[A-Z]/.test(issue.expected)
            ? `Неисправан унос: очекивана инстанца ${issue.expected}, примљено ${received}`
            : `Неисправан унос: очекивано ${typeName(issue.expected)}, примљено ${received}`;
    },
    invalid_value: issue => issue.values.length === 1
        ? `Неисправна вредност: очекивано ${z.core.util.stringifyPrimitive(issue.values[0])}`
        : `Неисправна опција: очекивана једна од ${z.core.util.joinValues(issue.values, '|')}`,
    too_big: issue => {
        const unit = SIZE_UNITS[issue.origin];
        const limit = issue.inclusive ? 'највише' : 'мање од';
        return unit
            ? `Превелико: ${typeName(issue.origin)} може имати ${limit} ${counted(issue.maximum, unit)}`
            : `Превелико: ${typeName(issue.origin)} мора бити ${limit} ${issue.maximum}`;
    },
    too_small: issue => {
        const unit = SIZE_UNITS[issue.origin];
        const limit = issue.inclusive ? 'најмање' : 'више од';
        return unit
            ? `Премало: ${typeName(issue.origin)} мора имати ${limit} ${counted(issue.minimum, unit)}`
            : `Премало: ${typeName(issue.origin)} мора бити ${limit} ${issue.minimum}`;
    },
    invalid_format: issue => {
        switch (issue.format) {
            case 'starts_with': return `Неисправан текст: мора почињати са "${issue.prefix}"`;
            case 'ends_with': return `Неисправан текст: мора се завршавати са "${issue.suffix}"`;
            case 'includes': return `Неисправан текст: мора садржати "${issue.includes}"`;
            case 'regex': return `Неисправан текст: мора одговарати шаблону ${issue.pattern}`;
            default: return `Неисправан формат: очекивано ${FORMAT_NAMES[issue.format] ?? issue.format}`;
        }
    },
    not_multiple_of: issue => `Неисправан број: мора бити дељив са ${issue.divisor}`,
    unrecognized_keys: issue => issue.keys.length === 1
        ? `Непознат кључ: ${issue.keys[0]}`
        : `Непознати кључеви: ${z.core.util.joinValues(issue.keys, ', ')}`,
    invalid_key: issue => `Неисправан кључ у пољу типа ${typeName(issue.origin)}`,
    invalid_union: () => 'Неисправан унос',
    invalid_element: issue => `Неисправна вредност у пољу типа ${typeName(issue.origin)}`,
    custom: () => 'Неисправан унос',
};

/** The zod locale for Serbian Cyrillic, in the shape of `z.locales.*`. */
export default function sr(): { localeError: z.core.$ZodErrorMap } {
    return {
        localeError: issue => {
            const message = srIssueMessages[issue.code] as (issue: RawIssue) => string;
            return message(issue);
        },
    };
}
