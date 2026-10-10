import { RegulationData } from "./types";

/**
 * The screens of a consultation. `home` asks for the reader's address, `street` answers for it,
 * `map` shows every place (with `entity` the selected one), `comment` is the form for `entity`,
 * `plan` is the two-minute summary (with `entity` a card to scroll to), `comments` lists what
 * others said, and `document` is the full text (with `entity` a chapter or article).
 */
export type ConsultationView = "home" | "street" | "map" | "comment" | "plan" | "comments" | "document";

const VIEWS: readonly ConsultationView[] = ["home", "street", "map", "comment", "plan", "comments", "document"];

/** Views whose `entity` is not a place to open but the subject of the view: any entity type is valid. */
const VIEWS_WITH_OWN_ENTITY = new Set<ConsultationView>(["comment", "plan"]);

/** Views that take no entity. */
const VIEWS_WITHOUT_ENTITY = new Set<ConsultationView>(["home", "street", "comments"]);
export type ConsultationEntityType = "chapter" | "article" | "geoset" | "geometry";

interface SearchParamsLike {
    get(name: string): string | null;
    toString(): string;
}

interface ResolveConsultationUrlStateOptions {
    pathname: string;
    defaultView: ConsultationView;
    regulationData?: RegulationData | null;
    searchParams?: SearchParamsLike | null;
    liveSearch?: string;
    liveHash?: string;
}

interface BuildConsultationUrlOptions {
    view: ConsultationView;
    entityId?: string | null;
}

export interface ConsultationUrlState {
    view: ConsultationView;
    entityId: string | null;
    entityType: ConsultationEntityType | null;
    canonicalUrl: string;
    needsCanonicalUrl: boolean;
}

function normalizeEntityId(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

function normalizeBasePath(pathnameOrUrl: string): string {
    return pathnameOrUrl.replace(/[?#].*$/, "");
}

function getValidConsultationView(value: string | null | undefined): ConsultationView | null {
    return VIEWS.find((view) => view === value) ?? null;
}

export function parseConsultationHash(hash: string | null | undefined): string | null {
    return normalizeEntityId(hash?.replace(/^#/, ""));
}

export function getConsultationViewForEntityType(entityType: ConsultationEntityType): ConsultationView {
    return entityType === "chapter" || entityType === "article" ? "document" : "map";
}

export function isConsultationEntityCompatibleWithView(
    entityType: ConsultationEntityType | null,
    view: ConsultationView,
): boolean {
    if (VIEWS_WITH_OWN_ENTITY.has(view)) {
        return true;
    }
    if (VIEWS_WITHOUT_ENTITY.has(view)) {
        return false;
    }
    if (!entityType) {
        return true;
    }

    return getConsultationViewForEntityType(entityType) === view;
}

export function resolveConsultationEntityType(
    regulationData: RegulationData | null | undefined,
    entityId: string | null | undefined,
): ConsultationEntityType | null {
    if (!regulationData || !entityId) {
        return null;
    }

    for (const item of regulationData.regulation) {
        if (item.id === entityId) {
            return item.type === "chapter" ? "chapter" : "geoset";
        }

        if (item.type === "chapter") {
            const article = item.articles?.find((candidate) => candidate.id === entityId);
            if (article) {
                return "article";
            }
        }

        if (item.type === "geoset") {
            const geometry = item.geometries?.find((candidate) => candidate.id === entityId);
            if (geometry) {
                return "geometry";
            }
        }
    }

    return null;
}

export function buildConsultationUrl(
    pathnameOrUrl: string,
    { view, entityId }: BuildConsultationUrlOptions,
): string {
    const basePath = normalizeBasePath(pathnameOrUrl);
    const params = new URLSearchParams();

    params.set("view", view);

    if (entityId) {
        params.set("entity", entityId);
    }

    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
}

export function resolveConsultationUrlState({
    pathname,
    defaultView,
    regulationData,
    searchParams,
    liveSearch,
    liveHash,
}: ResolveConsultationUrlStateOptions): ConsultationUrlState {
    const fallbackQuery = searchParams?.toString() ?? "";
    const liveParams = new URLSearchParams(liveSearch ?? fallbackQuery);
    const fallbackEntityId = normalizeEntityId(searchParams?.get("entity"));
    const hashEntityId = parseConsultationHash(liveHash);
    const explicitView =
        getValidConsultationView(liveParams.get("view")) ??
        getValidConsultationView(searchParams?.get("view"));
    const requestedEntityId = normalizeEntityId(liveParams.get("entity")) ?? fallbackEntityId ?? hashEntityId;
    const entityId = explicitView && VIEWS_WITHOUT_ENTITY.has(explicitView) ? null : requestedEntityId;
    const entityType = resolveConsultationEntityType(regulationData, entityId);
    // An entity decides the view, unless the view is about the entity (a comment on it, a card).
    const resolvedView = explicitView && VIEWS_WITH_OWN_ENTITY.has(explicitView)
        ? explicitView
        : entityType
            ? getConsultationViewForEntityType(entityType)
            : explicitView ?? defaultView;
    const canonicalUrl = buildConsultationUrl(pathname, { view: resolvedView, entityId });
    const currentUrl = buildConsultationUrl(pathname, {
        view: explicitView ?? defaultView,
        entityId: normalizeEntityId(liveParams.get("entity")) ?? fallbackEntityId,
    });

    return {
        view: resolvedView,
        entityId,
        entityType,
        canonicalUrl,
        needsCanonicalUrl: canonicalUrl !== currentUrl || Boolean(hashEntityId),
    };
}
