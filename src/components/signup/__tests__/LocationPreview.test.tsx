import { render, screen } from '@testing-library/react';
import type { CityWithGeometry } from '@/lib/db/cities';
import type { StaticMapFeature } from '@/lib/map/staticMap';
import { LocationPreview } from '../LocationPreview';

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
jest.mock('next/dynamic', () => () => () => null);
jest.mock('@/env.mjs', () => ({ env: { NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: 'pk.test' } }));

const mockOverlay = jest.fn();
jest.mock('@/lib/map/staticMap', () => ({
    STATIC_MAP_STYLE: 'mapbox/light-v11',
    staticMapOverlayUrl: (args: { features: StaticMapFeature[] }) => mockOverlay(args),
}));

const city = {
    id: 'thira',
    realm: 'greece',
    geometry: { type: 'MultiPolygon', coordinates: [] },
} as unknown as CityWithGeometry;
const place = { text: 'Φηρά 847 00, Ελλάδα', coordinates: [25.4318, 36.4166] as [number, number] };
const drawsOutline = (args: { features: StaticMapFeature[] }) => args.features.some((f) => f.geometry.type === 'MultiPolygon');

const imageSrc = () => document.querySelector('img')?.getAttribute('src');

beforeEach(() => mockOverlay.mockReset());

describe('LocationPreview', () => {
    it('draws the outline with the places when it fits', () => {
        mockOverlay.mockImplementation((args) => (drawsOutline(args) ? 'outline-and-pins' : 'pins-only'));
        render(<LocationPreview city={city} locations={[place]} />);

        expect(imageSrc()).toBe('outline-and-pins');
    });

    it('keeps the places when the outline does not fit the URL', () => {
        mockOverlay.mockImplementation((args) => (drawsOutline(args) ? null : 'pins-only'));
        render(<LocationPreview city={city} locations={[place]} />);

        expect(imageSrc()).toBe('pins-only');
        expect(screen.getByRole('button', { name: 'map.open' })).toBeInTheDocument();
    });

    it('falls back to the realm view only when there is no place to keep', () => {
        mockOverlay.mockReturnValue(null);
        render(<LocationPreview city={city} locations={[]} emptyLabel="hint" />);

        expect(imageSrc()).toContain('/static/');
        expect(imageSrc()).toContain('access_token=pk.test');
    });
});
