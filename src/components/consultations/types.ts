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

export interface Geometry {
    type: 'point' | 'circle' | 'polygon';
    name: string;
    id: string; // Should match pattern: ^[a-zA-Z][a-zA-Z0-9_-]*$
    description?: string;
    geojson: GeoJSONPoint | GeoJSONPolygon;
}

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
    geometries?: Geometry[];
}

export interface RegulationData {
    title: string;
    contactEmail: string; // Email for citizen comments (required in schema)
    sources: Source[]; // Array of source documents (required in schema)
    referenceFormat?: ReferenceFormat;
    regulation: RegulationItem[];
} 