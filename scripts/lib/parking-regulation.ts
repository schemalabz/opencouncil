/**
 * Pure assembly of the Papagou-Cholargou parking regulation JSON from the pipeline's outputs
 * (scripts/parking-consultation/data) and its configuration. No I/O here, so the rules that
 * name, describe and link every unit are unit-tested.
 */
import type {
    AddressLookupConfig,
    GeoSetMapStyle,
    OverviewCard,
    RegulationData,
    RegulationItem,
    Source,
    StaticGeometry,
} from '@/components/consultations/types';

export interface UnitProperties {
    id: string;
    category: string;
    street: string;
    from: string | null;
    to: string | null;
    side: 'l' | 'r';
    zone: string | null;
    zoneSource: string | null;
    lengthM: number;
    estSpots: number;
    calmTraffic: boolean;
    excludedReason: string | null;
    strips: number;
}

export interface SpotProperties {
    id: string;
    category: string;
    street: string | null;
    cross: string | null;
    address: string | null;
    nSpots: number;
    parts: number;
}

export interface ZoneProperties {
    id: string;
    letter: string;
    name: string;
    strips: number;
}

export interface Feature<P> {
    type: 'Feature';
    properties: P;
    geometry: GeoJSON.Geometry;
}

export interface FeatureCollection<P> {
    type: 'FeatureCollection';
    features: Feature<P>[];
}

export interface ReportArticle {
    num: number;
    title: string;
    bodyMd: string;
}

export interface ReportChapter {
    num: number;
    title: string;
    preludeMd: string;
    articles: ReportArticle[];
}

export interface GeneratedReport {
    source: { file: string; sha256: string };
    chapters: ReportChapter[];
    anomalies: string[];
}

export interface ArticleConfig {
    id: string;
    titleStartsWith?: string;
    refs?: string[];
}

export interface ArticlesConfig {
    chapters: Record<string, string>;
    articles: Record<string, ArticleConfig>;
}

export interface Patch {
    article: string;
    find: string;
    replace: string;
}

export interface GeoSetConfig {
    id: string;
    name: string;
    description?: string;
    color: string;
    legend?: string;
    mapStyle?: GeoSetMapStyle;
}

export interface ConsultationConfig {
    title: string;
    contactEmail: string;
    ccEmails?: string[];
    sources: Source[];
    defaultView?: 'map' | 'document';
    summary: string;
    geosetOrder: string[];
    geosets: Record<string, GeoSetConfig>;
    zoneDescription: string;
    zoneNotes?: Record<string, string>;
    addressLookup: AddressLookupConfig;
    overview?: OverviewCard[];
}

export interface AssemblyInput {
    report: GeneratedReport;
    units: FeatureCollection<UnitProperties>;
    spots: FeatureCollection<SpotProperties>;
    zones: FeatureCollection<ZoneProperties>;
    config: ConsultationConfig;
    articles: ArticlesConfig;
    patches: Patch[];
    /** Summaries by section key ("4.2") or chapter key ("4"); missing ones fall back to `summarize`. */
    summaries?: Record<string, string>;
}

export interface AssemblyResult {
    data: RegulationData;
    warnings: string[];
}

const SIDE_LABEL: Record<'l' | 'r', string> = { l: 'αριστερή πλευρά', r: 'δεξιά πλευρά' };
export const UNIT_CATEGORIES = ['residents', 'paid', 'motorcycles', 'excluded'];
export const SPOT_CATEGORIES = ['amea_shared', 'amea_dedicated', 'ev', 'special'];
const REF_PATTERN = /\{REF:([a-zA-Z][a-zA-Z0-9_-]*)\}/g;
const ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

function refLinks(ids: string[]): string {
    return Array.from(new Set(ids)).map((id) => `{REF:${id}}`).join(' · ');
}

function capitalize(text: string): string {
    return text ? text[0].toLocaleUpperCase('el') + text.slice(1) : text;
}

/** Where a block side is: "Βουτσινά, δεξιά πλευρά, από Κύπρου προς Αναστάσεως". */
export function unitName(p: UnitProperties): string {
    const span = p.from && p.to ? `, από ${p.from} προς ${p.to}` : p.to ? `, προς ${p.to}` : p.from ? `, από ${p.from}` : '';
    return `${p.street}, ${SIDE_LABEL[p.side]}${span}`;
}

/** The one detail a reader wants after the "where": how many cars fit, or why none do. */
export function unitTextualDefinition(p: UnitProperties): string {
    if (p.category === 'excluded') return p.excludedReason ? capitalize(p.excludedReason.toLowerCase()) : '';
    if (p.estSpots <= 0) return '';
    return p.estSpots === 1 ? 'περίπου 1 θέση' : `περίπου ${p.estSpots} θέσεις`;
}

/** One plain sentence: who may park here, and on what terms. */
export function unitDescription(p: UnitProperties): string {
    let sentence: string;
    switch (p.category) {
        case 'residents': {
            const zone = p.zone === 'Α-Δ' ? ' Ζώνης Α ή Δ' : p.zone ? ` Ζώνης ${p.zone}` : '';
            sentence = `Μόνο με κάρτα κατοίκου${zone}, δωρεάν, όλο το 24ωρο.`;
            break;
        }
        case 'paid':
            sentence = 'Για επισκέπτες με πληρωμή, έως 3 ώρες. Κυριακές και αργίες δωρεάν.';
            break;
        case 'motorcycles':
            sentence = 'Για δίκυκλα, δωρεάν όλο το 24ωρο.';
            break;
        case 'excluded':
            sentence = 'Δεν επιτρέπεται η στάθμευση σε αυτό το κομμάτι του δρόμου.';
            break;
        default:
            sentence = '';
    }
    return p.calmTraffic ? `${sentence} Οδός ήπιας κυκλοφορίας.` : sentence;
}

/** Where a spot is: "Γωνία Κύπρου και Τσιγάντε", or just the street. */
export function spotName(p: SpotProperties): string {
    if (!p.street) return 'Χωρίς οδό';
    return p.cross ? `Γωνία ${p.street} και ${p.cross}` : p.street;
}

export function spotTextualDefinition(p: SpotProperties): string {
    return p.nSpots > 1 ? `${p.nSpots} θέσεις` : '';
}

export function spotDescription(p: SpotProperties): string {
    switch (p.category) {
        case 'amea_shared':
            return 'Για οχήματα με ευρωπαϊκή κάρτα ΑΜΕΑ, δωρεάν, όλο το 24ωρο.';
        case 'amea_dedicated':
            return 'Για ένα συγκεκριμένο όχημα ΑΜΕΑ, με παλαιότερη απόφαση του Δήμου. Μένει όπως είναι.';
        case 'ev':
            return 'Μόνο όσο φορτίζει ένα ηλεκτρικό όχημα.';
        case 'special':
            return 'Ειδική θέση που μένει όπως είναι σήμερα.';
        default:
            return '';
    }
}

export function zoneDescription(letter: string, config: ConsultationConfig): string {
    const base = config.zoneDescription.split('{letter}').join(letter);
    const note = config.zoneNotes?.[letter];
    return note ? `${base} ${note}` : base;
}

/** A plain-text summary of an article: its first sentences, without tables, figures or markup. */
export function summarize(markdown: string, maxLength = 220): string {
    const text = markdown
        .split('\n')
        .filter((line) => !/^\s*(\||!\[|#|\*(Πίνακας|Εικόνα))/.test(line))
        .map((line) => line.replace(/^\s*-\s+/, ''))
        .join(' ')
        .replace(REF_PATTERN, '')
        .replace(/\*\*|\*|`/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
    if (!text) return '';
    const sentences = text.match(/[^.;!?]+[.;!?]?/g) ?? [text];
    let summary = '';
    for (const sentence of sentences) {
        const candidate = (summary + sentence).trim();
        if (summary && candidate.length > maxLength) break;
        summary = candidate;
        if (summary.length > maxLength) break;
    }
    if (summary.length > maxLength) summary = `${summary.slice(0, maxLength - 1).trimEnd()}…`;
    return summary;
}

export function applyPatches(report: GeneratedReport, patches: Patch[]): GeneratedReport {
    const chapters = report.chapters.map((chapter) => ({ ...chapter, articles: chapter.articles.map((a) => ({ ...a })) }));
    for (const patch of patches) {
        const [chapterNum, articleNum] = patch.article.split('.').map(Number);
        const article = chapters.find((c) => c.num === chapterNum)?.articles.find((a) => a.num === articleNum);
        if (!article) throw new Error(`patch for unknown article ${patch.article}`);
        if (!article.bodyMd.includes(patch.find)) throw new Error(`patch for ${patch.article}: text not found: ${JSON.stringify(patch.find)}`);
        article.bodyMd = article.bodyMd.split(patch.find).join(patch.replace);
    }
    return { ...report, chapters };
}

export function buildChapters(report: GeneratedReport, articles: ArticlesConfig, summaries: Record<string, string> = {}): { items: RegulationItem[]; warnings: string[] } {
    const warnings: string[] = [];
    const items: RegulationItem[] = report.chapters.map((chapter) => {
        const chapterKey = String(chapter.num);
        const chapterId = articles.chapters[chapterKey] ?? `chapter-${chapter.num}`;
        if (!articles.chapters[chapterKey]) warnings.push(`chapter ${chapterKey} has no configured id; using ${chapterId}`);
        const articleItems = chapter.articles.map((article) => {
            const key = `${chapter.num}.${article.num}`;
            const config = articles.articles[key];
            const id = config?.id ?? `sec-${chapter.num}-${article.num}`;
            if (!config) warnings.push(`section ${key} "${article.title}" has no configured id; using ${id}`);
            else if (config.titleStartsWith && !article.title.startsWith(config.titleStartsWith)) {
                warnings.push(`section ${key} is titled "${article.title}" but the config expects it to start with "${config.titleStartsWith}"; the report may have been renumbered`);
            }
            const body = config?.refs?.length ? `${article.bodyMd.trimEnd()}\n\n**Δείτε στον χάρτη:** ${refLinks(config.refs)}\n` : article.bodyMd;
            return { num: article.num, id, title: article.title, summary: summaries[key] || summarize(article.bodyMd), body };
        });
        const chapterSummary = summaries[chapterKey]
            || (chapter.preludeMd.trim() ? summarize(chapter.preludeMd) : `Περιλαμβάνει: ${chapter.articles.map((a) => `${chapter.num}.${a.num} ${a.title}`).join(', ')}.`);
        return {
            type: 'chapter',
            num: chapter.num,
            id: chapterId,
            title: chapter.title,
            summary: chapterSummary,
            ...(chapter.preludeMd.trim() ? { preludeBody: chapter.preludeMd } : {}),
            articles: articleItems,
        };
    });
    return { items, warnings };
}

function geoSetItem(config: GeoSetConfig, geometries: StaticGeometry[]): RegulationItem {
    return {
        type: 'geoset',
        id: config.id,
        name: config.name,
        ...(config.description ? { description: config.description } : {}),
        color: config.color,
        ...(config.legend ? { legend: config.legend } : {}),
        ...(config.mapStyle ? { mapStyle: config.mapStyle } : {}),
        geometries,
    };
}

export function buildGeoSets(input: Pick<AssemblyInput, 'units' | 'spots' | 'zones' | 'config'>): RegulationItem[] {
    const { units, spots, zones, config } = input;
    return config.geosetOrder.map((category) => {
        const geoset = config.geosets[category];
        if (!geoset) throw new Error(`geosetOrder names "${category}" but geosets has no entry for it`);
        let geometries: StaticGeometry[];
        if (category === 'zones') {
            geometries = [...zones.features]
                .sort((a, b) => a.properties.letter.localeCompare(b.properties.letter, 'el'))
                .map((f) => ({
                    type: 'polygon',
                    id: f.properties.id,
                    name: f.properties.name,
                    description: zoneDescription(f.properties.letter, config),
                    geojson: f.geometry as StaticGeometry['geojson'],
                }));
        } else if (UNIT_CATEGORIES.includes(category)) {
            geometries = units.features
                .filter((f) => f.properties.category === category)
                .map((f) => ({
                    type: 'polygon',
                    id: f.properties.id,
                    name: unitName(f.properties),
                    description: unitDescription(f.properties),
                    ...(unitTextualDefinition(f.properties) ? { textualDefinition: unitTextualDefinition(f.properties) } : {}),
                    geojson: f.geometry as StaticGeometry['geojson'],
                }));
        } else {
            geometries = spots.features
                .filter((f) => f.properties.category === category)
                .map((f) => ({
                    type: 'point',
                    id: f.properties.id,
                    name: spotName(f.properties),
                    description: spotDescription(f.properties),
                    ...(spotTextualDefinition(f.properties) ? { textualDefinition: spotTextualDefinition(f.properties) } : {}),
                    geojson: f.geometry as StaticGeometry['geojson'],
                }));
        }
        return geoSetItem(geoset, geometries);
    });
}

export function assembleRegulation(input: AssemblyInput): AssemblyResult {
    const report = applyPatches(input.report, input.patches);
    const chapters = buildChapters(report, input.articles, input.summaries);
    const geosets = buildGeoSets(input);
    const { config } = input;
    const data: RegulationData = {
        title: config.title,
        summary: config.summary,
        contactEmail: config.contactEmail,
        ...(config.ccEmails?.length ? { ccEmails: config.ccEmails } : {}),
        sources: config.sources,
        defaultView: config.defaultView ?? 'map',
        addressLookup: config.addressLookup,
        ...(config.overview?.length ? { overview: config.overview } : {}),
        regulation: [...geosets, ...chapters.items],
    };
    return { data, warnings: chapters.warnings };
}

export function findReferenceIds(text: string | undefined): string[] {
    if (!text) return [];
    return Array.from(text.matchAll(REF_PATTERN), (m) => m[1]);
}

/** Rules the schema cannot express: unique ids, resolvable references, summaries present. */
export function checkRegulation(data: RegulationData): string[] {
    const problems: string[] = [];
    const ids = new Map<string, number>();
    const texts: Array<[string, string | undefined]> = [['summary', data.summary], ['addressLookup.noZoneText', data.addressLookup?.noZoneText]];
    const register = (id: string, where: string) => {
        if (!ID_PATTERN.test(id)) problems.push(`${where}: id "${id}" does not match ${ID_PATTERN}`);
        ids.set(id, (ids.get(id) ?? 0) + 1);
    };
    for (const item of data.regulation) {
        register(item.id, item.type);
        if (item.type === 'chapter') {
            if (!item.summary?.trim()) problems.push(`chapter ${item.id} has no summary`);
            texts.push([`chapter ${item.id}`, item.summary], [`chapter ${item.id} prelude`, item.preludeBody]);
            for (const article of item.articles ?? []) {
                register(article.id, `article in ${item.id}`);
                if (!article.summary?.trim()) problems.push(`article ${article.id} has no summary`);
                texts.push([`article ${article.id}`, article.body], [`article ${article.id} summary`, article.summary]);
            }
        } else {
            texts.push([`geoset ${item.id}`, item.description]);
            for (const geometry of item.geometries ?? []) {
                register(geometry.id, `geometry in ${item.id}`);
                texts.push([`geometry ${geometry.id}`, geometry.description], [`geometry ${geometry.id} definition`, geometry.textualDefinition]);
            }
        }
    }
    const geosetIds = new Set(data.regulation.filter((item) => item.type === 'geoset').map((item) => item.id));
    for (const card of data.overview ?? []) {
        if (!ID_PATTERN.test(card.id)) problems.push(`overview card id "${card.id}" does not match ${ID_PATTERN}`);
        texts.push([`overview ${card.id}`, card.body]);
        if (card.commentOn && !ids.has(card.commentOn)) problems.push(`overview ${card.id}: commentOn "${card.commentOn}" resolves to nothing`);
        for (const geoset of card.explains ?? []) if (!geosetIds.has(geoset)) problems.push(`overview ${card.id}: explains "${geoset}", which is not a geoset`);
    }
    for (const [id, count] of ids) if (count > 1) problems.push(`id "${id}" is used ${count} times`);
    for (const [where, text] of texts) {
        for (const ref of findReferenceIds(text)) if (!ids.has(ref)) problems.push(`${where}: reference {REF:${ref}} resolves to nothing`);
    }
    return problems;
}
