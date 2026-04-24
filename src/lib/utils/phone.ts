// Phone validation adapted from libphonenumber-js metadata.
// Full spec (index 11 present) enables pattern validation; minimal entries (calling code only) support country detection only.
const countryPhoneData: Record<string, unknown[]> = {
    GR: [
        '30',
        '00',
        '5005000\\d{3}|8\\d{9}|(?:[269]\\d|70)\\d{8}',
        [10],
        [
            ['(\\d{2})(\\d{4})(\\d{4})', '$1 $2 $3', ['21|7']],
            ['(\\d{4})(\\d{6})', '$1 $2', ['2(?:2|3[2-57-9]|4[2-469]|5[2-59]|6[2-9]|7[2-69]|8[2-49])|5']],
            ['(\\d{3})(\\d{3})(\\d{4})', '$1 $2 $3', ['[2689]']],
            ['(\\d{3})(\\d{3,4})(\\d{5})', '$1 $2 $3', ['8']],
        ],
        0, 0, 0, 0, 0, 0,
        [
            ['2(?:1\\d\\d|2(?:2[1-46-9]|[36][1-8]|4[1-7]|5[1-4]|7[1-5]|[89][1-9])|3(?:1\\d|2[1-57]|[35][1-3]|4[13]|7[1-7]|8[124-6]|9[1-79])|4(?:1\\d|2[1-8]|3[1-4]|4[13-5]|6[1-578]|9[1-5])|5(?:1\\d|[29][1-4]|3[1-5]|4[124]|5[1-6])|6(?:1\\d|[269][1-6]|3[1245]|4[1-7]|5[13-9]|7[14]|8[1-5])|7(?:1\\d|2[1-5]|3[1-6]|4[1-7]|5[1-57]|6[135]|9[125-7])|8(?:1\\d|2[1-5]|[34][1-4]|9[1-57]))\\d{6}', [10]],
            ['68[57-9]\\d{7}|(?:69|94)\\d{8}', [10]],
            ['800\\d{7}', [10]],
            ['90[19]\\d{7}', [10]],
            ['70\\d{8}', [10]],
            0,
            ['5005000\\d{3}', [10]],
            0, 0,
            ['8(?:0[16]|12|[27]5|50)\\d{7}', [10]],
        ],
    ],
    // Minimal entries: [callingCode] — used for country detection only, validation is bypassed
    AF: ['93'], AL: ['355'], DZ: ['213'], AD: ['376'], AO: ['244'],
    AI: ['1264'], AQ: ['672'], AG: ['1268'], AR: ['54'], AM: ['374'],
    AW: ['297'], AU: ['61'], AT: ['43'], AZ: ['994'], BS: ['1242'],
    BH: ['973'], BD: ['880'], BB: ['1246'], BY: ['375'], BE: ['32'],
    BZ: ['501'], BJ: ['229'], BM: ['1441'], BT: ['975'], BO: ['591'],
    BA: ['387'], BW: ['267'], BR: ['55'], IO: ['246'], VG: ['1284'],
    BN: ['673'], BG: ['359'], BF: ['226'], BI: ['257'], KH: ['855'],
    CM: ['237'], CA: ['1'], CV: ['238'], KY: ['1345'], CF: ['236'],
    TD: ['235'], CL: ['56'], CN: ['86'], CO: ['57'], KM: ['269'],
    CK: ['682'], CR: ['506'], HR: ['385'], CU: ['53'], CW: ['599'],
    CY: ['357'], CZ: ['420'], CD: ['243'], DK: ['45'], DJ: ['253'],
    DM: ['1767'], DO: ['1809'], TL: ['670'], EC: ['593'], EG: ['20'],
    SV: ['503'], GQ: ['240'], ER: ['291'], EE: ['372'], ET: ['251'],
    FK: ['500'], FO: ['298'], FJ: ['679'], FI: ['358'], FR: ['33'],
    GF: ['594'], PF: ['689'], GA: ['241'], GM: ['220'], GE: ['995'],
    DE: ['49'], GH: ['233'], GI: ['350'], GL: ['299'], GD: ['1473'],
    GP: ['590'], GU: ['1671'], GT: ['502'], GN: ['224'], GW: ['245'],
    GY: ['592'], HT: ['509'], HN: ['504'], HK: ['852'], HU: ['36'],
    IS: ['354'], IN: ['91'], ID: ['62'], IR: ['98'], IQ: ['964'],
    IE: ['353'], IL: ['972'], IT: ['39'], CI: ['225'], JM: ['1876'],
    JP: ['81'], JO: ['962'], KZ: ['7'], KE: ['254'], KI: ['686'],
    XK: ['383'], KW: ['965'], KG: ['996'], LA: ['856'], LV: ['371'],
    LB: ['961'], LS: ['266'], LR: ['231'], LY: ['218'], LI: ['423'],
    LT: ['370'], LU: ['352'], MO: ['853'], MK: ['389'], MG: ['261'],
    MW: ['265'], MY: ['60'], MV: ['960'], ML: ['223'], MT: ['356'],
    MH: ['692'], MR: ['222'], MU: ['230'], YT: ['262'], MX: ['52'],
    FM: ['691'], MD: ['373'], MC: ['377'], MN: ['976'], ME: ['382'],
    MS: ['1664'], MA: ['212'], MZ: ['258'], MM: ['95'], NA: ['264'],
    NR: ['674'], NP: ['977'], NL: ['31'], NC: ['687'], NZ: ['64'],
    NI: ['505'], NE: ['227'], NG: ['234'], NU: ['683'], KP: ['850'],
    MP: ['1670'], NO: ['47'], OM: ['968'], PK: ['92'], PW: ['680'],
    PS: ['970'], PA: ['507'], PG: ['675'], PY: ['595'], PE: ['51'],
    PH: ['63'], PL: ['48'], PT: ['351'], PR: ['1787'], QA: ['974'],
    CG: ['242'], RE: ['262'], RO: ['40'], RU: ['7'], RW: ['250'],
    BL: ['590'], SH: ['290'], KN: ['1869'], LC: ['1758'], MF: ['590'],
    PM: ['508'], VC: ['1784'], WS: ['685'], SM: ['378'], ST: ['239'],
    SA: ['966'], SN: ['221'], RS: ['381'], SC: ['248'], SL: ['232'],
    SG: ['65'], SX: ['1721'], SK: ['421'], SI: ['386'], SB: ['677'],
    SO: ['252'], ZA: ['27'], KR: ['82'], SS: ['211'], ES: ['34'],
    LK: ['94'], SD: ['249'], SR: ['597'], SZ: ['268'], SE: ['46'],
    CH: ['41'], SY: ['963'], TW: ['886'], TJ: ['992'], TZ: ['255'],
    TH: ['66'], TG: ['228'], TK: ['690'], TO: ['676'], TT: ['1868'],
    TN: ['216'], TR: ['90'], TM: ['993'], TC: ['1649'], TV: ['688'],
    UG: ['256'], UA: ['380'], AE: ['971'], GB: ['44'], US: ['1'],
    UY: ['598'], UZ: ['998'], VU: ['678'], VA: ['379'], VE: ['58'],
    VN: ['84'], WF: ['681'], EH: ['212'], YE: ['967'], ZM: ['260'],
    ZW: ['263'],
};

interface PhoneSpec {
    hasFullSpec: boolean;
    fixedLine: { possibleLengths: { _national: string[] }; nationalNumberPattern: string };
    mobile: { nationalNumberPattern: string };
    id: string;
    countryCode: string;
    internationalPrefix: string;
}

const EMPTY_PATTERN = { nationalNumberPattern: '' };

function expandPhoneNumberStructure(compressed: Record<string, unknown[]>): Record<string, PhoneSpec> {
    const expanded: Record<string, PhoneSpec> = {};
    for (const country of Object.keys(compressed)) {
        const data = compressed[country];
        const hasFullSpec = data.length > 1 && Array.isArray(data[11]);
        const types = hasFullSpec ? data[11] as unknown[][] : null;
        expanded[country] = {
            hasFullSpec,
            id: country,
            countryCode: data[0] as string,
            internationalPrefix: hasFullSpec ? data[1] as string : '00',
            fixedLine: hasFullSpec
                ? { possibleLengths: { _national: (data[3] as number[]).map(String) }, nationalNumberPattern: types![0][0] as string }
                : { possibleLengths: { _national: [] }, nationalNumberPattern: '' },
            mobile: hasFullSpec ? { nationalNumberPattern: types![1][0] as string } : EMPTY_PATTERN,
        };
    }
    return expanded;
}

const phoneNumberSpec = expandPhoneNumberStructure(countryPhoneData);

function discoverPhoneType(phoneNumber: string, config: PhoneSpec): string {
    const cleanNumber = phoneNumber
        .replace(/\D/g, '')
        .replace(/\s/g, '')
        .replace(/^\+/, '')
        .replace(new RegExp('^' + config.internationalPrefix), '')
        .replace(new RegExp('^' + config.countryCode), '');

    const categories: Record<string, { nationalNumberPattern: string }> = {
        landline: config.fixedLine,
        mobile: config.mobile,
    };

    for (const [categoryName, categoryDetails] of Object.entries(categories)) {
        const pattern = new RegExp('^(' + categoryDetails.nationalNumberPattern.replace(/\s/g, '') + ')$');
        if (cleanNumber.match(pattern)) {
            return categoryName;
        }
    }
    return 'unknown';
}

function getNumberType(phoneNumber: string, country: string): string {
    const spec = phoneNumberSpec[country.toUpperCase()];
    if (!spec) return 'unknown';
    return discoverPhoneType(phoneNumber, spec);
}

export function detectCountryFromPhone(phoneNumber: string): string | null {
    const digits = phoneNumber.replace(/\D/g, '').replace(/^\+/, '');
    for (const [country, spec] of Object.entries(phoneNumberSpec)) {
        if (digits.startsWith(spec.countryCode)) {
            return country;
        }
    }
    return null;
}

export function isPhoneValid(
    phoneNumber: string,
    countries: string[] = ['GR'],
    types = ['mobile', 'landline']
): boolean {
    return countries.some((country) => {
        const spec = phoneNumberSpec[country.toUpperCase()];
        if (!spec || !spec.hasFullSpec) return true;
        return types.includes(getNumberType(phoneNumber, country));
    });
}

export function isPhoneEmpty(phone: string): boolean {
    if (!phone || phone === '') return true;
    return false;
}
