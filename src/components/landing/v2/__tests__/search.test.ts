import {
    classifySearchQuery,
    detectMunicipalityQuery,
    filterSubjectsByQuery,
    groupByLocation,
    nearestSubjects,
    normalizeGreek,
    subjectInViewport,
    type LandingSubject,
    type MapViewport,
} from '../landingData';

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

describe('normalizeGreek', () => {
    it('lowercases and strips accents', () => {
        expect(normalizeGreek('Γυθείου')).toBe('γυθειου');
        expect(normalizeGreek('  ΠΡΟΫΠΟΛΟΓΙΣΜΌΣ ')).toBe('προυπολογισμος');
    });
});

describe('classifySearchQuery', () => {
    it('returns empty for blank input', () => {
        expect(classifySearchQuery('', SUBJECTS)).toBe('empty');
        expect(classifySearchQuery('   ', SUBJECTS)).toBe('empty');
    });

    it('classifies a query that matches a location text as an address', () => {
        expect(classifySearchQuery('Ανδρούτσου', SUBJECTS)).toBe('address');
        expect(classifySearchQuery('αμπελοκηποι', SUBJECTS)).toBe('address'); // accent/case-insensitive
    });

    it('classifies a query that matches a subject title as a subject', () => {
        expect(classifySearchQuery('πεύκων', SUBJECTS)).toBe('subject');
        expect(classifySearchQuery('προϋπολογισμού', SUBJECTS)).toBe('subject');
    });

    it('treats anything with no data match as an address to locate', () => {
        // A query that doesn't match any subject title/address is treated as a place to find on
        // the map, so a bare street name behaves the same as one with a number.
        expect(classifySearchQuery('οδός Ερμού', SUBJECTS)).toBe('address'); // street keyword
        expect(classifySearchQuery('Πατησίων 42', SUBJECTS)).toBe('address'); // has a number
        expect(classifySearchQuery('Πυθαγόρα', SUBJECTS)).toBe('address'); // bare street name
    });
});

describe('filterSubjectsByQuery', () => {
    it('returns all subjects for an empty query', () => {
        expect(filterSubjectsByQuery(SUBJECTS, '')).toHaveLength(3);
    });

    it('matches against title or location text, accent-insensitive', () => {
        expect(filterSubjectsByQuery(SUBJECTS, 'σταθμευσης').map((s) => s.title)).toEqual(['Κατάργηση στάθμευσης']);
        expect(filterSubjectsByQuery(SUBJECTS, 'χαλανδρι').map((s) => s.title)).toEqual(['Κοπή πεύκων']);
    });
});

describe('viewport helpers', () => {
    const view: MapViewport = { w: 23.7, s: 37.9, e: 23.8, n: 38.0, clng: 23.75, clat: 37.95 };

    it('subjectInViewport tests inclusive bounds', () => {
        expect(subjectInViewport(at('in', 23.75, 37.95), view)).toBe(true);
        expect(subjectInViewport(at('out', 23.9, 37.95), view)).toBe(false);
    });

    it('nearestSubjects returns the N closest to a point, nearest first', () => {
        const subjects = [at('far', 23.79, 37.99), at('near', 23.751, 37.951), at('mid', 23.77, 37.97)];
        expect(nearestSubjects(subjects, 37.95, 23.75, 2).map((s) => s.id)).toEqual(['near', 'mid']);
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
