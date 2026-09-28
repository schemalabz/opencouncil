import { render, screen } from '@testing-library/react';
import AddressLookupPanel from './AddressLookupPanel';
import type { AddressLookupResult } from './addressLookup';
import type { GeoSetData, Geometry } from './types';

// MarkdownContent pulls in react-markdown, which ships as ESM; the panel's own behaviour is what this tests.
jest.mock('./MarkdownContent', () => ({
    __esModule: true,
    default: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}));

const polygon = (id: string, name: string): Geometry => ({
    type: 'polygon',
    id,
    name,
    geojson: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
});

const zones: GeoSetData = { id: 'zones', name: 'Ζώνες', color: '#123456', geometries: [polygon('zone-b', 'Ζώνη Β')] };
const residents: GeoSetData = { id: 'residents', name: 'Στάθμευση κατοίκων', geometries: [polygon('res-1', 'Βουτσινά, δεξιά')] };

const baseResult: AddressLookupResult = {
    zone: null,
    zoneConfigured: false,
    street: [],
    nearby: [],
    config: { streetRadiusMeters: 30, streetMaxItems: 4, nearbyRadiusMeters: 400 },
};

describe('AddressLookupPanel', () => {
    it('shows the zone and the nearby units grouped by geoset', () => {
        const result: AddressLookupResult = {
            ...baseResult,
            zone: { geometry: { ...zones.geometries[0], description: 'Κάρτα κατοίκου 10 €.' }, geoSet: zones },
            zoneConfigured: true,
            street: [{ geometry: residents.geometries[0], geoSet: residents, distance: 42 }],
        };
        const onOpen = jest.fn();
        render(<AddressLookupPanel result={result} onOpenGeometryDetail={onOpen} />);

        expect(screen.getByText('Ζώνη Β')).toBeInTheDocument();
        expect(screen.getByText('Κάρτα κατοίκου 10 €.')).toBeInTheDocument();
        expect(screen.getByText('Στάθμευση κατοίκων')).toBeInTheDocument();
        expect(screen.getByText('42μ')).toBeInTheDocument();

        screen.getByText('Βουτσινά, δεξιά').click();
        expect(onOpen).toHaveBeenCalledWith('res-1');
    });

    it('tells the reader when the address is outside every zone', () => {
        const result: AddressLookupResult = {
            ...baseResult,
            zoneConfigured: true,
            config: { ...baseResult.config, noZoneText: 'Εκτός περιοχής ΣΕΣ.' },
        };
        render(<AddressLookupPanel result={result} />);
        expect(screen.getByText('Εκτός περιοχής ΣΕΣ.')).toBeInTheDocument();
    });

    it('shows an empty state when nothing is configured or nearby', () => {
        render(<AddressLookupPanel result={baseResult} />);
        expect(screen.getByText(/Δεν βρέθηκαν στοιχεία/)).toBeInTheDocument();
    });
});
