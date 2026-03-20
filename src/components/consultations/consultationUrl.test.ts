import {
    buildConsultationUrl,
    getConsultationViewForEntityType,
    isConsultationEntityCompatibleWithView,
    resolveConsultationEntityType,
    resolveConsultationUrlState,
} from "./consultationUrl";
import { RegulationData } from "./types";

const regulationData: RegulationData = {
    title: "Test Regulation",
    contactEmail: "test@example.com",
    sources: [],
    defaultView: "map",
    regulation: [
        {
            type: "chapter",
            id: "chapter-1",
            num: 1,
            title: "General Rules",
            articles: [
                {
                    id: "article-1",
                    num: 1,
                    title: "First Article",
                    body: "Body",
                },
            ],
        },
        {
            type: "geoset",
            id: "geoset-1",
            name: "Central Zone",
            geometries: [
                {
                    id: "geometry-1",
                    name: "Main Square",
                    type: "point",
                    geojson: {
                        type: "Point",
                        coordinates: [23.7, 37.9],
                    },
                },
            ],
        },
    ],
};

describe("consultationUrl", () => {
    describe("resolveConsultationEntityType", () => {
        it("resolves chapter, article, geoset, and geometry ids", () => {
            expect(resolveConsultationEntityType(regulationData, "chapter-1")).toBe("chapter");
            expect(resolveConsultationEntityType(regulationData, "article-1")).toBe("article");
            expect(resolveConsultationEntityType(regulationData, "geoset-1")).toBe("geoset");
            expect(resolveConsultationEntityType(regulationData, "geometry-1")).toBe("geometry");
        });

        it("returns null for unknown ids", () => {
            expect(resolveConsultationEntityType(regulationData, "missing")).toBeNull();
        });
    });

    describe("view helpers", () => {
        it("maps entity types to the correct view", () => {
            expect(getConsultationViewForEntityType("chapter")).toBe("document");
            expect(getConsultationViewForEntityType("article")).toBe("document");
            expect(getConsultationViewForEntityType("geoset")).toBe("map");
            expect(getConsultationViewForEntityType("geometry")).toBe("map");
        });

        it("checks whether an entity is compatible with a view", () => {
            expect(isConsultationEntityCompatibleWithView("article", "document")).toBe(true);
            expect(isConsultationEntityCompatibleWithView("article", "map")).toBe(false);
            expect(isConsultationEntityCompatibleWithView(null, "map")).toBe(true);
        });
    });

    describe("buildConsultationUrl", () => {
        it("builds canonical query-based consultation URLs", () => {
            expect(
                buildConsultationUrl("/athens/consultation/abc", {
                    view: "document",
                    entityId: "article-1",
                }),
            ).toBe("/athens/consultation/abc?view=document&entity=article-1");
        });

        it("removes existing query params and hashes before rebuilding", () => {
            expect(
                buildConsultationUrl("/athens/consultation/abc?view=map#geometry-1", {
                    view: "map",
                    entityId: "geoset-1",
                }),
            ).toBe("/athens/consultation/abc?view=map&entity=geoset-1");
        });
    });

    describe("resolveConsultationUrlState", () => {
        it("infers document view from a document entity even if defaultView is map", () => {
            const state = resolveConsultationUrlState({
                pathname: "/athens/consultation/abc",
                defaultView: "map",
                regulationData,
                liveSearch: "?entity=article-1",
            });

            expect(state.view).toBe("document");
            expect(state.entityId).toBe("article-1");
            expect(state.entityType).toBe("article");
            expect(state.canonicalUrl).toBe("/athens/consultation/abc?view=document&entity=article-1");
            expect(state.needsCanonicalUrl).toBe(true);
        });

        it("prefers the live URL over stale search params during navigation", () => {
            const staleSearchParams = new URLSearchParams("entity=article-1");
            const state = resolveConsultationUrlState({
                pathname: "/athens/consultation/abc",
                defaultView: "map",
                regulationData,
                searchParams: staleSearchParams,
                liveSearch: "?view=map&entity=geometry-1",
            });

            expect(state.view).toBe("map");
            expect(state.entityId).toBe("geometry-1");
            expect(state.entityType).toBe("geometry");
            expect(state.canonicalUrl).toBe("/athens/consultation/abc?view=map&entity=geometry-1");
            expect(state.needsCanonicalUrl).toBe(false);
        });

        it("normalizes legacy hash links to canonical query URLs", () => {
            const state = resolveConsultationUrlState({
                pathname: "/athens/consultation/abc",
                defaultView: "map",
                regulationData,
                liveHash: "#chapter-1",
            });

            expect(state.view).toBe("document");
            expect(state.entityId).toBe("chapter-1");
            expect(state.entityType).toBe("chapter");
            expect(state.canonicalUrl).toBe("/athens/consultation/abc?view=document&entity=chapter-1");
            expect(state.needsCanonicalUrl).toBe(true);
        });

        it("keeps explicit map view when the entity is a map entity", () => {
            const state = resolveConsultationUrlState({
                pathname: "/athens/consultation/abc",
                defaultView: "document",
                regulationData,
                liveSearch: "?view=map&entity=geoset-1",
            });

            expect(state.view).toBe("map");
            expect(state.entityId).toBe("geoset-1");
            expect(state.entityType).toBe("geoset");
            expect(state.needsCanonicalUrl).toBe(false);
        });
    });
});
