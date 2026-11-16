import { describeEntity, entityLabel, extractGeoSets, findExplainingCard } from './entityDisplay';
import type { RegulationData } from './types';

const regulation: RegulationData = {
    title: 'ΣΕΣ',
    contactEmail: 'a@b.gr',
    sources: [],
    overview: [
        { id: 'who', title: 'Ποιος παρκάρει πού', body: '…', explains: ['residents'], linkLabel: 'Τι σημαίνει;' },
        { id: 'prices', title: 'Τιμές', body: '…', commentOn: 'visitor-parking' },
    ],
    regulation: [
        {
            type: 'geoset', id: 'residents', name: 'Θέσεις κατοίκων', color: '#1E4FE0', legend: 'Κάτοικοι',
            geometries: [{
                type: 'polygon', id: 'res-1', name: 'Βουτσινά, δεξιά πλευρά', textualDefinition: 'περίπου 12 θέσεις',
                description: 'Μόνο με κάρτα κατοίκου.', geojson: { type: 'Polygon', coordinates: [] },
            }],
        },
        { type: 'chapter', id: 'categories', num: 4, title: 'Κατηγορίες', articles: [{ id: 'visitor-parking', num: 1, title: 'Στάθμευση Επισκεπτών', body: '…' }] },
    ],
};
const geoSets = extractGeoSets(regulation);

describe('describeEntity', () => {
    it('names a geometry by its geoset (what) and itself (where)', () => {
        expect(describeEntity(regulation, geoSets, 'res-1')).toEqual({
            id: 'res-1', type: 'geometry', commentType: 'GEOMETRY', what: 'Θέσεις κατοίκων', where: 'Βουτσινά, δεξιά πλευρά',
            detail: 'περίπου 12 θέσεις', meaning: 'Μόνο με κάρτα κατοίκου.', color: '#1E4FE0', geoSetId: 'residents',
        });
    });

    it('names geosets, chapters and articles', () => {
        expect(describeEntity(regulation, geoSets, 'residents')).toMatchObject({ type: 'geoset', commentType: 'GEOSET', what: 'Θέσεις κατοίκων' });
        expect(describeEntity(regulation, geoSets, 'categories')).toMatchObject({ type: 'chapter', what: 'Κατηγορίες', where: 'Κεφάλαιο 4 της μελέτης' });
        expect(describeEntity(regulation, geoSets, 'visitor-parking')).toMatchObject({ type: 'article', what: 'Στάθμευση Επισκεπτών', where: 'Ενότητα 4.1 της μελέτης' });
    });

    it('names the articles and the paragraphs of a regulation', () => {
        const draft: RegulationData = {
            ...regulation,
            documentType: 'regulation',
            regulation: [
                { type: 'chapter', id: 'art3', num: 3, title: 'Βασικό Ωράριο', preludeBody: '…', articles: [] },
                {
                    type: 'chapter', id: 'art4', num: 4, title: 'Άδεια Παράτασης', summary: 'Ποιος παίρνει άδεια.',
                    articles: [{ id: 'art4-1', num: 1, title: 'Διαδικασία Χορήγησης', summary: 'Απόφαση σε 15 ημέρες.', body: '…' }],
                },
            ],
        };
        const chapter = describeEntity(draft, [], 'art4');
        const article = describeEntity(draft, [], 'art4-1');
        expect(chapter).toMatchObject({ type: 'chapter', commentType: 'CHAPTER', where: 'Άρθρο 4 του σχεδίου', meaning: 'Ποιος παίρνει άδεια.' });
        expect(article).toMatchObject({ type: 'article', commentType: 'ARTICLE', where: 'Παράγραφος 4.1 του σχεδίου', meaning: 'Απόφαση σε 15 ημέρες.' });
        expect(entityLabel(article!)).toBe('Παράγραφος 4.1 του σχεδίου: Διαδικασία Χορήγησης');
        // The short reference and the comment button name the item too.
        expect(chapter).toMatchObject({ reference: 'Άρθρο 4', commentLabel: 'Σχολιάστε όλο το άρθρο 4' });
        expect(article).toMatchObject({ reference: 'Παράγραφος 4.1', commentLabel: 'Σχολιάστε την παράγραφο 4.1' });
        expect(describeEntity(draft, [], 'art3')).toMatchObject({ reference: 'Άρθρο 3', commentLabel: 'Σχολιάστε το άρθρο 3' });
    });

    it('returns null for an unknown id or no regulation', () => {
        expect(describeEntity(regulation, geoSets, 'nope')).toBeNull();
        expect(describeEntity(null, geoSets, 'res-1')).toBeNull();
    });
});

describe('findExplainingCard and extractGeoSets', () => {
    it('finds the card that explains a geoset', () => {
        expect(findExplainingCard(regulation.overview, 'residents')?.id).toBe('who');
        expect(findExplainingCard(regulation.overview, 'paid')).toBeUndefined();
        expect(findExplainingCard(undefined, 'residents')).toBeUndefined();
    });

    it('carries the legend label', () => {
        expect(geoSets[0]).toMatchObject({ id: 'residents', legend: 'Κάτοικοι' });
    });
});

describe('entityLabel', () => {
    it('names a place, a section and a chapter in one line', () => {
        const label = (id: string) => entityLabel(describeEntity(regulation, geoSets, id)!);
        expect(label('res-1')).toBe('Θέσεις κατοίκων · Βουτσινά, δεξιά πλευρά');
        expect(label('visitor-parking')).toBe('Ενότητα 4.1 της μελέτης: Στάθμευση Επισκεπτών');
        expect(label('categories')).toBe('Κεφάλαιο 4 της μελέτης: Κατηγορίες');
        expect(label('residents')).toBe('Θέσεις κατοίκων');
    });
});
