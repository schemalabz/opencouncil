export interface Source {
    title: string;
    url: string;
    description?: string;
}

export interface ReferenceFormat {
    pattern?: string; // Default: "{REF:([a-zA-Z][a-zA-Z0-9_-]*)}"
    syntax?: string;  // Default: "{REF:id}"
}

export interface GeoJSONPoint {
    type: 'Point';
    coordinates: [number, number] | [number, number, number]; // [lng, lat] or [lng, lat, elevation]
}

export interface GeoJSONPolygon {
    type: 'Polygon';
    coordinates: number[][][]; // Array of linear rings, first is exterior boundary
}

export interface GeoJSONMultiPolygon {
    type: 'MultiPolygon';
    coordinates: number[][][][]; // Array of polygons, each with array of linear rings
}

export interface BufferOperation {
    operation: 'buffer';
    sourceGeoSetId: string;
    radius: number;
    units?: 'meters' | 'kilometers'; // Default: 'meters'
}

export interface DifferenceOperation {
    operation: 'difference';
    baseGeoSetId: string;
    subtractGeoSetIds: string[];
}

export type GeometryDerivation = BufferOperation | DifferenceOperation;

// Base geometry interface
interface BaseGeometry {
    name: string;
    id: string; // Should match pattern: ^[a-zA-Z][a-zA-Z0-9_-]*$
    description?: string; // Semantic description (purpose, function, characteristics)
    textualDefinition?: string; // Geographic definition in words (address, boundaries, landmarks)
}

// Static geometry with GeoJSON
export interface StaticGeometry extends BaseGeometry {
    type: 'point' | 'circle' | 'polygon';
    geojson: GeoJSONPoint | GeoJSONPolygon | GeoJSONMultiPolygon;
}

// Derived geometry with operation definition
export interface DerivedGeometry extends BaseGeometry {
    type: 'derived';
    derivedFrom: GeometryDerivation;
}

// Union type for all geometries
export type Geometry = StaticGeometry | DerivedGeometry;

export interface Article {
    num: number;
    id: string; // Should match pattern: ^[a-zA-Z][a-zA-Z0-9_-]*$
    title: string;
    summary?: string;
    body: string; // Markdown with {REF:id} reference support
}

export interface RegulationItem {
    type: 'chapter' | 'geoset';
    id: string; // Should match pattern: ^[a-zA-Z][a-zA-Z0-9_-]*$

    // Chapter-specific fields
    num?: number; // Chapter number for chapters
    title?: string; // Chapter title
    summary?: string; // Chapter summary
    preludeBody?: string; // Introductory markdown text with {REF:id} support
    articles?: Article[];

    // GeoSet-specific fields
    name?: string; // GeoSet name
    description?: string; // GeoSet description
    color?: string; // GeoSet color in hex format (e.g. #FF5733)
    legend?: string; // short label for the map legend; a geoset without one gets no legend chip
    mapStyle?: GeoSetMapStyle;
    geometries?: Geometry[];
}

/** Per-geoset rendering hints for the consultation map. Every field is optional. */
export interface GeoSetMapStyle {
    fillOpacity?: number; // 0..1, default 0.4 for static polygons
    strokeWidth?: number; // px; polygons default 2, points (circle radius) default 4
    showLabels?: boolean; // default true; false draws no map label for this geoset's geometries
    hover?: boolean; // default true; false disables the hover highlight (still clickable)
}

/** Configures what a reader sees for their address ("Βρες τον δρόμο σου"). */
export interface AddressLookupConfig {
    zoneGeoSetId?: string; // area geoset that answers "which zone am I in"
    streetGeoSetIds?: string[]; // area geosets shown as "on your street"; default: every polygon geoset except the zone geoset
    streetRadiusMeters?: number; // default 30
    streetMaxItems?: number; // default 4
    nearbyGeoSetIds?: string[]; // geosets whose nearest geometry is shown as "near you"; default: every point geoset
    nearbyRadiusMeters?: number; // default 400
    noZoneText?: string; // markdown shown when no zone contains the address
}

/** One plain-language card of the "plan in two minutes" view. */
export interface OverviewCard {
    id: string; // Should match pattern: ^[a-zA-Z][a-zA-Z0-9_-]*$
    title: string;
    body: string; // markdown
    commentOn?: string; // id of the chapter, article, geoset or geometry that comments on this card go to
    commentLabel?: string; // default "Σχολιάστε"
    explains?: string[]; // geoset ids this card explains; a place of those geosets links here
    linkLabel?: string; // text of that link; default the card's title
}

export interface Definition {
    term: string; // The term being defined
    definition: string; // Markdown definition with {REF:id} support
}

export interface RegulationData {
    title: string;
    summary?: string; // Markdown summary of the entire regulation with {REF:id} support
    contactEmail: string; // Email for citizen comments (required in schema)
    ccEmails?: string[]; // Additional emails to CC on comments (optional)
    sources: Source[]; // Array of source documents (required in schema)
    referenceFormat?: ReferenceFormat;
    defaultView?: 'map' | 'document'; // Default view mode (defaults to 'document')
    defaultVisibleGeosets?: string[]; // Array of geoset IDs that should be visible by default
    addressLookup?: AddressLookupConfig; // What a reader sees for their address
    overview?: OverviewCard[]; // "The plan in two minutes": plain-language cards shown before the full text
    definitions?: Record<string, Definition>; // Map from English IDs to term definitions
    regulation: RegulationItem[];
}

// Shared interface for current user across consultation components
export interface CurrentUser {
    id?: string;
    name?: string | null;
    email?: string | null;
    isSuperAdmin?: boolean;
}

// Shared interface for geoset data used across consultation components
export interface GeoSetData {
    id: string;
    name: string;
    description?: string;
    color?: string;
    legend?: string;
    mapStyle?: GeoSetMapStyle;
    geometries: Geometry[];
}

// Colors for search location pins on the map
export const SEARCH_COLORS = ['#EF4444', '#8B5CF6', '#F59E0B', '#10B981', '#3B82F6']; 