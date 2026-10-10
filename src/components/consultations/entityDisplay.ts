import type { ConsultationEntityType } from "./consultationUrl";
import type { GeoSetData, OverviewCard, RegulationData } from "./types";

export type CommentEntityType = 'CHAPTER' | 'ARTICLE' | 'GEOSET' | 'GEOMETRY';

/** How every screen names something a reader can comment on. */
export interface EntityDisplay {
    id: string;
    type: ConsultationEntityType;
    commentType: CommentEntityType;
    /** What it is: the geoset's name ("Θέσεις κατοίκων"), or a chapter or article title. */
    what: string;
    /** Where it is, for a geometry: "Βουτσινά, δεξιά πλευρά, από Κύπρου προς Αναστάσεως". */
    where?: string;
    /** One detail: "περίπου 12 θέσεις". */
    detail?: string;
    /** One sentence of meaning, markdown. */
    meaning?: string;
    color?: string;
    geoSetId?: string;
}

const COMMENT_TYPE: Record<ConsultationEntityType, CommentEntityType> = {
    chapter: 'CHAPTER',
    article: 'ARTICLE',
    geoset: 'GEOSET',
    geometry: 'GEOMETRY',
};

export function describeEntity(
    regulationData: RegulationData | null | undefined,
    geoSets: GeoSetData[],
    entityId: string | null | undefined
): EntityDisplay | null {
    if (!regulationData || !entityId) return null;

    for (const geoSet of geoSets) {
        if (geoSet.id === entityId) {
            return { id: entityId, type: 'geoset', commentType: COMMENT_TYPE.geoset, what: geoSet.name, meaning: geoSet.description, color: geoSet.color, geoSetId: geoSet.id };
        }
        const geometry = geoSet.geometries.find((g) => g.id === entityId);
        if (geometry) {
            return {
                id: entityId,
                type: 'geometry',
                commentType: COMMENT_TYPE.geometry,
                what: geoSet.name,
                where: geometry.name,
                detail: geometry.textualDefinition,
                meaning: geometry.description,
                color: geoSet.color,
                geoSetId: geoSet.id,
            };
        }
    }

    for (const item of regulationData.regulation) {
        if (item.type !== 'chapter') continue;
        if (item.id === entityId) {
            return { id: entityId, type: 'chapter', commentType: COMMENT_TYPE.chapter, what: item.title ?? '', where: `Κεφάλαιο ${item.num} της μελέτης` };
        }
        const article = item.articles?.find((a) => a.id === entityId);
        if (article) {
            return { id: entityId, type: 'article', commentType: COMMENT_TYPE.article, what: article.title, where: `Ενότητα ${item.num}.${article.num} της μελέτης` };
        }
    }
    return null;
}

/**
 * One line naming an entity: the same on the screens, in the email to the municipality and in the
 * printout of the comments. "Θέσεις κατοίκων · Βουτσινά, δεξιά πλευρά, από Κύπρου προς Αναστάσεως",
 * "Ενότητα 4.2 της μελέτης: Στάθμευση κατοίκων", "Θέσεις κατοίκων".
 */
export function entityLabel(display: EntityDisplay): string {
    if (!display.where) return display.what;
    return display.type === 'geometry' ? `${display.what} · ${display.where}` : `${display.where}: ${display.what}`;
}

/** The overview card that explains a geoset, for a "what does this mean?" link from one of its places. */
export function findExplainingCard(overview: OverviewCard[] | undefined, geoSetId: string | undefined): OverviewCard | undefined {
    if (!geoSetId) return undefined;
    return overview?.find((card) => card.explains?.includes(geoSetId));
}

/** Geosets from the regulation, in its order (which is also draw order: later ones draw on top). */
export function extractGeoSets(regulationData: RegulationData | null | undefined): GeoSetData[] {
    if (!regulationData) return [];
    return regulationData.regulation
        .filter((item) => item.type === 'geoset')
        .map((item) => ({
            id: item.id,
            name: item.name || item.title || 'Unnamed GeoSet',
            description: item.description,
            color: item.color,
            legend: item.legend,
            mapStyle: item.mapStyle,
            geometries: item.geometries || [],
        }));
}
