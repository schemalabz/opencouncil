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
    geometries?: Geometry[];
}

export interface RegulationData {
    title: string;
    contactEmail: string; // Email for citizen comments (required in schema)
    ccEmails?: string[]; // Additional emails to CC on comments (optional)
    sources: Source[]; // Array of source documents (required in schema)
    referenceFormat?: ReferenceFormat;
    regulation: RegulationItem[];
} 