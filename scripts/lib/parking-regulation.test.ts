import {
    assembleRegulation,
    checkRegulation,
    summarize,
    unitDescription,
    unitName,
    unitTextualDefinition,
    spotName,
    type AssemblyInput,
    type ConsultationConfig,
    type UnitProperties,
} from './parking-regulation';
import { validateRegulation } from './regulation-schema';

const config: ConsultationConfig = {
    title: 'ΣΕΣ',
    contactEmail: 'ses@example.org',
    sources: [{ title: 'Μελέτη', url: 'https://example.org/study.pdf' }],
    summary: 'Δείτε τις {REF:zones}.',
    geosetOrder: ['zones', 'residents', 'amea_shared'],
    geosets: {
        zones: { id: 'zones', name: 'Ζώνες', color: '#627BBC', mapStyle: { fillOpacity: 0.08, hover: false } },
        residents: { id: 'residents', name: 'Κάτοικοι', color: '#1E4FE0', mapStyle: { showLabels: false } },
        amea_shared: { id: 'amea-shared', name: 'ΑΜΕΑ', color: '#F07800' },
    },
    zoneDescription: 'Ζώνη {letter}: κάρτα κατοίκου ({REF:resident-cards}).',
    zoneNotes: { 'Α': 'Κοινή με Δ.' },
    addressLookup: { zoneGeoSetId: 'zones', nearbyGeoSetIds: ['residents'], noZoneText: 'Εκτός ({REF:area}).' },
    references: { residents: ['resident-parking', 'resident-cards'], calmTraffic: ['area'], amea_shared: ['amea-parking'] },
};

const unit: UnitProperties = {
    id: 'res-voutsina-kyprou-anastaseos-r', category: 'residents', street: 'Βουτσινά', from: 'Κύπρου', to: 'Αναστάσεως', side: 'r',
    zone: 'Β', zoneSource: 'p1-strips', lengthM: 66.4, estSpots: 12, calmTraffic: true, excludedReason: null, strips: 5,
};

const square: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[23.79, 38.0], [23.791, 38.0], [23.791, 38.001], [23.79, 38.001], [23.79, 38.0]]] };

const input: AssemblyInput = {
    report: {
        source: { file: 'report.docx', sha256: 'abc' },
        anomalies: [],
        chapters: [
            {
                num: 3, title: 'ΠΕΡΙΟΧΗ', preludeMd: '',
                articles: [{ num: 1, title: 'Περιοχή Ελεγχόμενης Στάθμευσης', bodyMd: 'Η περιοχή ορίζεται από οδούς. Δεύτερη πρόταση.\n\n| α | β |\n|---|---|\n| 1 | 2 |\n' }],
            },
            {
                num: 4, title: 'ΚΑΤΗΓΟΡΙΕΣ', preludeMd: 'Εισαγωγή κεφαλαίου.',
                articles: [
                    { num: 2, title: 'Στάθμευση Κατοίκων', bodyMd: 'Οι κάτοικοι σταθμεύουν δωρεάν με γρμματοσειρά.' },
                    { num: 4, title: 'Στάθμευση ΑΜΕΑ', bodyMd: 'ΑΜΕΑ δωρεάν.' },
                ],
            },
            { num: 5, title: 'ΠΛΗΡΩΜΗ', preludeMd: '', articles: [{ num: 3, title: 'Κάρτες Κατοίκων', bodyMd: 'Κάρτα 10 €.' }] },
        ],
    },
    units: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: unit, geometry: square }] },
    spots: {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: { id: 'amea-kyprou-tsigante', category: 'amea_shared', street: 'Κύπρου', cross: 'Τσιγάντε', address: 'ΚΥΠΡΟΥ (διαστ. με Τσιγάντε)', nSpots: 2, parts: 7 }, geometry: { type: 'Point', coordinates: [23.79, 38.0] } }],
    },
    zones: {
        type: 'FeatureCollection',
        features: [
            { type: 'Feature', properties: { id: 'zone-b', letter: 'Β', name: 'Ζώνη Β', strips: 10 }, geometry: square },
            { type: 'Feature', properties: { id: 'zone-a', letter: 'Α', name: 'Ζώνη Α', strips: 10 }, geometry: square },
        ],
    },
    config,
    articles: {
        chapters: { '3': 'area-and-network', '4': 'categories', '5': 'payment' },
        articles: {
            '3.1': { id: 'area', titleStartsWith: 'Περιοχή', refs: ['zones'] },
            '4.2': { id: 'resident-parking', titleStartsWith: 'Στάθμευση Κατοίκων', refs: ['residents'] },
            '4.4': { id: 'amea-parking', titleStartsWith: 'Στάθμευση ΑΜΕΑ' },
            '5.3': { id: 'resident-cards' },
        },
    },
    patches: [{ article: '4.2', find: 'γρμματοσειρά', replace: 'γραμματοσειρά' }],
};

describe('unit naming', () => {
    it('names a block side by street, cross-streets and side', () => {
        expect(unitName(unit)).toBe('Βουτσινά (Κύπρου – Αναστάσεως), δεξιά πλευρά');
        expect(unitTextualDefinition(unit)).toBe('δεξιά πλευρά με κατεύθυνση από Κύπρου προς Αναστάσεως · Ζώνη Β');
        expect(unitName({ ...unit, from: null })).toBe('Βουτσινά (έως Αναστάσεως), δεξιά πλευρά');
    });

    it('describes the unit with its zone, estimate, calm-traffic note and links', () => {
        const description = unitDescription(unit, config);
        expect(description).toContain('Ζώνη Β');
        expect(description).toContain('περίπου 12 (μήκος 66 μ.)');
        expect(description).toContain('ήπιας κυκλοφορίας');
        expect(description).toContain('{REF:resident-parking} · {REF:resident-cards} · {REF:zone-b} · {REF:area}');
    });

    it('links the shared stretch to both zones', () => {
        expect(unitDescription({ ...unit, zone: 'Α-Δ', calmTraffic: false }, config)).toContain('{REF:zone-a} · {REF:zone-d}');
    });

    it('names a spot with its count', () => {
        expect(spotName({ id: 'x', category: 'amea_shared', street: 'Κύπρου', cross: 'Τσιγάντε', address: null, nSpots: 2, parts: 7 })).toBe('Θέση ΑΜΕΑ κοινής χρήσης: Κύπρου / Τσιγάντε (2 θέσεις)');
    });
});

describe('summarize', () => {
    it('keeps the first sentences and drops tables, figures and markup', () => {
        expect(summarize('Πρώτη **πρόταση**. Δεύτερη {REF:zones}.\n\n| α |\n|---|\n\n![Εικόνα 1](/x.png)\n\n*Εικόνα 1: κάτι*')).toBe('Πρώτη πρόταση. Δεύτερη .');
    });

    it('cuts a long text with an ellipsis', () => {
        const text = 'Α'.repeat(300);
        expect(summarize(text, 50)).toHaveLength(50);
        expect(summarize(text, 50).endsWith('…')).toBe(true);
    });
});

describe('assembleRegulation', () => {
    it('builds a regulation that validates, links and checks clean', () => {
        const { data, warnings } = assembleRegulation(input);
        expect(warnings).toEqual([]);
        expect(data.regulation.map((i) => i.id)).toEqual(['zones', 'residents', 'amea-shared', 'area-and-network', 'categories', 'payment']);
        const zones = data.regulation[0];
        expect(zones.geometries?.map((g) => g.id)).toEqual(['zone-a', 'zone-b']);
        expect(zones.geometries?.[0].description).toContain('Κοινή με Δ.');
        const area = data.regulation[3].articles?.[0];
        expect(area?.body).toContain('**Δείτε στον χάρτη:** {REF:zones}');
        expect(area?.summary).toBe('Η περιοχή ορίζεται από οδούς. Δεύτερη πρόταση.');
        expect(data.regulation[4].articles?.[0].body).toContain('γραμματοσειρά');
        expect(data.regulation[4].preludeBody).toBe('Εισαγωγή κεφαλαίου.');
        expect(checkRegulation(data)).toEqual([]);
        expect(validateRegulation(data)).toEqual({ valid: true, errors: [] });
    });

    it('warns when a section title no longer matches its configured prefix', () => {
        const renumbered = { ...input, articles: { ...input.articles, articles: { ...input.articles.articles, '4.2': { id: 'resident-parking', titleStartsWith: 'Στάθμευση Δικύκλων' } } } };
        expect(assembleRegulation(renumbered).warnings[0]).toMatch(/renumbered/);
    });

    it('fails a patch whose text is gone', () => {
        expect(() => assembleRegulation({ ...input, patches: [{ article: '4.2', find: 'nope', replace: 'x' }] })).toThrow(/not found/);
    });

    it('reports duplicate ids and dangling references', () => {
        const { data } = assembleRegulation(input);
        data.regulation[1].geometries?.push({ ...(data.regulation[1].geometries?.[0] as object), description: 'Δείτε {REF:missing}.' } as never);
        const problems = checkRegulation(data);
        expect(problems).toContain('id "res-voutsina-kyprou-anastaseos-r" is used 2 times');
        expect(problems.some((p) => p.includes('{REF:missing}'))).toBe(true);
    });
});
