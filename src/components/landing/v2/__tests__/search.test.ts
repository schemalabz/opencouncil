import { buildSearchOptions } from '../hooks/useSearchOptions';
import {
    looksLikeAddress,
    detectMunicipalityQuery,
    groupByLocation,
    nearestSubjects,
    subjectInViewport,
    type LandingSubject,
    type MapViewport,
} from '@/lib/landing/landingData';
import { normalizeText } from '@/lib/utils';

const CITIES = [
    { id: 'athens', name: 'Αθήνα', name_municipality: 'Δήμος Αθηναίων' },
    { id: 'chalandri', name: 'Χαλάνδρι', name_municipality: 'Δήμος Χαλανδρίου' },
];

// Minimal fixtures — the search helpers only read `title` and `where`.
const subject = (title: string, where: string): LandingSubject =>
    ({ id: title, title, where } as LandingSubject);

const at = (id: string, lng: number, lat: number): LandingSubject => ({ id, title: id, lng, lat } as LandingSubject);

const SUBJECTS: LandingSubject[] = [
    subject('Κατάργηση στάθμευσης', 'Γυθείου, Αμπελόκηποι'),
    subject('Κοπή πεύκων', 'Ανδρούτσου, Χαλάνδρι'),
    subject('Έγκριση προϋπολογισμού 2026', 'Δημαρχείο Αθηνών'),
];

// The search helpers normalize with `normalizeText(x).trim()` — lowercase + strip accents + trim.
describe('normalizeText (search normalization)', () => {
    it('lowercases and strips accents', () => {
        expect(normalizeText('Γυθείου').trim()).toBe('γυθειου');
        expect(normalizeText('  ΠΡΟΫΠΟΛΟΓΙΣΜΌΣ ').trim()).toBe('προυπολογισμος');
    });
});

describe('detectMunicipalityQuery', () => {
    it('resolves a "δήμος X" search to a known city, accent/case-insensitive', () => {
        expect(detectMunicipalityQuery('δήμος Χαλανδρίου', CITIES)).toEqual({
            kind: 'known',
            cityId: 'chalandri',
            name: 'Χαλάνδρι',
            nameMunicipality: 'Δήμος Χαλανδρίου',
        });
        expect(detectMunicipalityQuery('αθηνα', CITIES)).toEqual({
            kind: 'known',
            cityId: 'athens',
            name: 'Αθήνα',
            nameMunicipality: 'Δήμος Αθηναίων',
        });
    });

    it('flags an out-of-network "δήμος X" search as unknown', () => {
        expect(detectMunicipalityQuery('δήμος Λάρισας', CITIES)).toEqual({ kind: 'unknown', name: 'Λάρισας' });
    });

    it('returns null for non-municipality queries', () => {
        expect(detectMunicipalityQuery('', CITIES)).toBeNull();
        expect(detectMunicipalityQuery('προϋπολογισμός', CITIES)).toBeNull();
        expect(detectMunicipalityQuery('στάθμευση', CITIES)).toBeNull();
    });
});

describe('groupByLocation', () => {
    it('merges subjects sharing an exact point and keeps distinct ones apart', () => {
        const groups = groupByLocation([
            at('a', 23.75, 37.95),
            at('b', 23.75, 37.95), // same spot as a
            at('c', 23.76, 37.96),
        ]);
        expect(groups).toHaveLength(2);
        expect(groups.find((g) => g.length === 2)?.map((s) => s.id)).toEqual(['a', 'b']);
    });
});

describe('looksLikeAddress', () => {
    // A house number is the one signal no subject title carries.
    it.each(['Πατησίων 76', 'Ερμού 12', 'λεωφ. Κηφισίας 200'])('reads %p as an address', (q) => {
        expect(looksLikeAddress(q)).toBe(true);
    });

    it.each(['οδός Σταδίου', 'Λεωφόρος Αλεξάνδρας', 'πλατεία Συντάγματος', 'Αγ. Παρασκευής'])(
        'reads %p as an address from the word it opens with',
        (q) => {
            expect(looksLikeAddress(q)).toBe(true);
        },
    );

    // Everything else is a question about the discussions. The address row is
    // still in the dropdown for whatever this misses.
    it.each(['κατοικίδια', 'ανακύκλωση', 'παιδικοί σταθμοί', 'Χάρης Δούκας', ''])(
        'reads %p as a search',
        (q) => {
            expect(looksLikeAddress(q)).toBe(false);
        },
    );

    // The prefixes are matched unaccented, on the first word only — a street
    // name that merely contains one of them is not an address.
    it('does not read a street word in the middle as an address', () => {
        expect(looksLikeAddress('ανάπλαση πλατείας')).toBe(false);
    });
});

describe('buildSearchOptions', () => {
    const TOPIC = { id: 't1', name: 'Καθαριότητα' } as Parameters<typeof buildSearchOptions>[0]['matchedTopic'];
    const CITY = { kind: 'known', cityId: 'chania', nameMunicipality: 'Δήμος Χανίων' } as Parameters<
        typeof buildSearchOptions
    >[0]['knownMunicipality'];
    const base = { matchedTopic: null, knownMunicipality: null, addressFirst: false, dateActive: false, anyFilterActive: false };
    const kinds = (matches: Parameters<typeof buildSearchOptions>[0]) =>
        buildSearchOptions(matches).map((o) => o.kind);

    // Nothing local can rule out that the index has an answer, so searching is
    // always offered — and it leads whenever nothing more specific matched.
    it('always offers a search, first when nothing else matched', () => {
        expect(kinds(base)).toEqual(['subjects', 'address']);
    });

    it('puts a matched category and municipality ahead of the search', () => {
        expect(kinds({ ...base, matchedTopic: TOPIC, knownMunicipality: CITY }))
            .toEqual(['category', 'municipality', 'subjects', 'address']);
    });

    // No rule recognises every place name, so the address option never
    // disappears — it just stays out of the way.
    it('keeps the address option last when the text is not address-shaped', () => {
        expect(kinds({ ...base, matchedTopic: TOPIC }).at(-1)).toBe('address');
    });

    // "Πατησίων 76" should fly to the address on Enter, not search for it.
    it('leads with the address when the text is address-shaped', () => {
        expect(kinds({ ...base, addressFirst: true })).toEqual(['address', 'subjects']);
    });

    it('offers every option exactly once', () => {
        const all = kinds({ ...base, matchedTopic: TOPIC, knownMunicipality: CITY, addressFirst: true });
        expect(new Set(all).size).toBe(all.length);
    });
});
