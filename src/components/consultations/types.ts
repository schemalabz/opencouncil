export interface RegulationData {
    title: string;
    contactEmail?: string;
    regulation: RegulationItem[];
}

export interface RegulationItem {
    type: 'chapter' | 'geoset';
    id: string;
    title?: string;
    name?: string;
    summary?: string;
    description?: string;
    preludeBody?: string;
    articles?: Article[];
    geometries?: any[];
}

export interface Article {
    num: number;
    id: string;
    title: string;
    summary?: string;
    body: string;
} 