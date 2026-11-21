/**
 * The text that a region page shows must not name a municipality (#993).
 * A paired message keeps the region text in its `region` leaf, and the
 * messages that only a region reads have "region" or "governor" in their own
 * key.
 *
 * `fr` and `sr` are out of the word check: most of their region leaves copy
 * the municipal text for now.
 */
import { loadLocaleStrings } from './catalogStrings';

// A key starts with the path of its file, `el/cityOverview.json.` or `el.json.`.
const messagePath = (key: string) => key.replace(/^[^.]*\.json\./, '');

/**
 * A segment `region` at any depth (`X.region`, `X.region.0`, `X.region.title`),
 * or a last segment that names a region or its head (`regionBodyType_council`,
 * `regionalGovernor`, `supportBadgeOfficialRegion`).
 */
const REGION_KEY = /(^|\.)region(\.|$)|(^|\.)[^.]*(region|governor)[^.]*$/i;
const isRegionKey = (key: string) => REGION_KEY.test(messagePath(key));

/** Lower case with no accent, and one form of the sigma: «ΔΗΜΟΣ», «Δήμος» and «δημος» read the same. */
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ς/g, 'σ');

const MUNICIPAL_WORDS: Record<'el' | 'en', RegExp> = {
    // δήμος and its cases, δήμαρχος, αντιδήμαρχος, δημαρχείο, δημοτικός, δημότης.
    // The cases of «δήμος» must end the word: «δημόσιος», «δημοσίευση» and «δημοκρατία» pass.
    el: /δημ(?:αρχ|οτ|(?:οσ|ου|ο|οι|ων|ουσ|ε)(?![α-ω]))/,
    en: /municipal|mayor|city council|city hall|town hall/,
};
const hasMunicipalWord = (locale: 'el' | 'en', text: string) => MUNICIPAL_WORDS[locale].test(fold(text));

describe.each(['el', 'en'] as const)('region texts of the %s catalog', locale => {
    const regionTexts = loadLocaleStrings(locale).filter(([key]) => isRegionKey(key));

    it('finds the region texts', () => {
        const keys = regionTexts.map(([key]) => key);
        expect(keys).toEqual(expect.arrayContaining([
            `${locale}/cityOverview.json.councilEyebrow.region`,
            `${locale}/metadata.json.people.keywords.region.0`,
            `${locale}.json.Common.regionBodyType_council`,
            `${locale}.json.Person.regionalGovernor`,
            `${locale}.json.Person.independentRegionalCouncilMember`,
            `${locale}.json.City.supportBadgeOfficialRegion`,
        ]));
    });

    it('has no municipal word', () => {
        const municipal = regionTexts
            .filter(([, text]) => hasMunicipalWord(locale, text))
            .map(([key, text]) => `${key}: ${text}`);
        expect(municipal).toEqual([]);
    });
});

describe('the region keys', () => {
    it.each([
        'el/body.json.aboutPrimary.region',
        'el/metadata.json.people.keywords.region.0',
        'el/x.json.card.region.title',
        'el.json.Common.regionBodyType_council',
        'el.json.Person.regionalGovernor',
        'el.json.Person.governor',
        'el.json.City.supportBadgeOfficialRegion',
    ])('reads %s as a region text', key => {
        expect(isRegionKey(key)).toBe(true);
    });

    it.each(['el/body.json.aboutPrimary.municipality', 'el.json.Person.mayor', 'el/region.json.title'])('reads %s as no region text', key => {
        expect(isRegionKey(key)).toBe(false);
    });
});

describe('the municipal words', () => {
    it.each([
        'Δήμος', 'του δήμου', 'στον δήμο', 'οι δήμοι', 'των δήμων', 'τους δήμους', 'ΔΗΜΟΣ ΑΘΗΝΑΙΩΝ', 'Δήμαρχος', 'Αντιδήμαρχος',
        'του δημάρχου', 'Δημαρχείο', 'Δημοτικό Συμβούλιο', 'ΔΗΜΟΤΙΚΟ ΣΥΜΒΟΥΛΙΟ', 'δημότες',
    ])('finds «%s»', word => {
        expect(hasMunicipalWord('el', word)).toBe(true);
    });

    it.each([
        'Δημόσια διαβούλευση', 'δημοσίευση', 'Ελληνική Δημοκρατία', 'δημιουργία', 'Περιφερειακό Συμβούλιο', 'Αντιπεριφερειάρχης',
    ])('passes «%s»', word => {
        expect(hasMunicipalWord('el', word)).toBe(false);
    });

    it.each(['Municipality', 'municipal council', 'Mayor', 'deputy mayors', 'City Council', 'Town Hall'])('finds "%s"', word => {
        expect(hasMunicipalWord('en', word)).toBe(true);
    });

    it.each(['Regional Council', 'the city', 'Regional Governor'])('passes "%s"', word => {
        expect(hasMunicipalWord('en', word)).toBe(false);
    });
});

/**
 * The code gives one set of values to both leaves of a pair. A leaf that takes
 * an argument that the code does not give prints the name of the argument.
 * So the two leaves take the same arguments, or the pair is in this list and
 * each call gives the values of both leaves.
 */
const PAIRS_WITH_OWN_ARGUMENTS = [
    // The municipality text takes the bare name, the region text takes the name with its article.
    'el/metadata.json.city.description', 'el/metadata.json.city.ogAlt', 'el/metadata.json.city.author',
    'el/metadata.json.meetings.description', 'el/metadata.json.meetings.ogAlt', 'el/metadata.json.meetings.author',
    'el/metadata.json.people.ogAlt', 'el/metadata.json.people.author',
    'el/metadata.json.parties.description',
    'el/metadata.json.party.description', 'el/metadata.json.party.ogAlt', 'el/metadata.json.party.author',
];

const argumentsOf = (text: string) =>
    [...new Set([...text.matchAll(/\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*[,}]/g)].map(match => match[1]))].sort().join(', ');

describe('the two leaves of a pair', () => {
    const differing = (['el', 'en', 'fr', 'sr'] as const).flatMap(locale => {
        const texts = new Map(loadLocaleStrings(locale));
        return [...texts].flatMap(([key, municipal]) => {
            const pair = key.match(/^(.*)\.municipality((?:\.\d+)?)$/);
            if (!pair) return [];
            const region = texts.get(`${pair[1]}.region${pair[2]}`);
            if (region === undefined) return [];
            return argumentsOf(municipal) === argumentsOf(region) ? [] : [`${pair[1]}${pair[2]}`];
        });
    });

    it('take the same arguments', () => {
        expect(differing.sort()).toEqual([...PAIRS_WITH_OWN_ARGUMENTS].sort());
    });

    it('reads the arguments of a message', () => {
        expect(argumentsOf('{count, plural, one {# θέμα} other {# θέματα}} του {cityName}')).toBe('cityName, count');
    });
});
