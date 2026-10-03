import { act, fireEvent, render, screen } from '@testing-library/react';
import type { CityWithGeometry } from '@/lib/db/cities';
import type { ReverseGeocodeResult } from '@/lib/actions/signupPlaces';
import { PlacePicker } from '../PlacePicker';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key,
    useLocale: () => 'el',
}));
jest.mock('@/lib/analytics/capture', () => ({ captureEvent: jest.fn() }));

let resolveGeocode: (result: ReverseGeocodeResult) => void = () => {};
jest.mock('@/lib/actions/signupPlaces', () => ({
    reverseGeocodePlace: () => new Promise<ReverseGeocodeResult>((resolve) => (resolveGeocode = resolve)),
}));

const searchPlace = { text: 'Φηρά, Θήρα, Ελλάδα', coordinates: [25.43, 36.41] as [number, number] };
jest.mock('@/components/onboarding/selectors/useLocationSearch', () => ({
    useLocationSearch: () => ({
        inputValue: 'Φηρά',
        changeInput: jest.fn(),
        clear: jest.fn(),
        suggestions: [{ id: 'p1', placeId: 'p1', text: 'Φηρά, Θήρα, Ελλάδα' }],
        select: async () => searchPlace,
        error: null,
        isSelecting: false,
        busy: false,
    }),
}));

const city = {
    id: 'thira',
    name: 'Θήρα',
    name_en: 'Thira',
    name_municipality: 'Δήμος Θήρας',
    name_municipality_en: 'Municipality of Thira',
    authorityType: 'municipality',
    realm: 'greece',
} as CityWithGeometry;

beforeEach(() => {
    Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
            getCurrentPosition: (success: PositionCallback) =>
                success({ coords: { latitude: 36.42, longitude: 25.44 } } as GeolocationPosition),
        },
    });
});

describe('PlacePicker', () => {
    it('drops a current-location answer that arrives after the reader picked a search result', async () => {
        const onAdd = jest.fn();
        render(<PlacePicker city={city} locations={[]} onAdd={onAdd} onRemove={jest.fn()} />);

        fireEvent.click(await screen.findByRole('button', { name: 'places.locate' }));
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Φηρά/ }));
        });
        expect(onAdd).toHaveBeenCalledWith(searchPlace);

        await act(async () => {
            resolveGeocode({ ok: true, location: { text: 'Καρτεράδος, Ελλάδα', coordinates: [25.44, 36.42] } });
        });
        expect(onAdd).toHaveBeenCalledTimes(1);
    });

    it('drops a current-location answer that arrives after the reader left the step', async () => {
        const onAdd = jest.fn();
        const { unmount } = render(<PlacePicker city={city} locations={[]} onAdd={onAdd} onRemove={jest.fn()} />);

        fireEvent.click(await screen.findByRole('button', { name: 'places.locate' }));
        unmount();
        await act(async () => {
            resolveGeocode({ ok: true, location: { text: 'Καρτεράδος, Ελλάδα', coordinates: [25.44, 36.42] } });
        });
        expect(onAdd).not.toHaveBeenCalled();
    });

    it('adds the current-location answer when nothing else was picked', async () => {
        const onAdd = jest.fn();
        render(<PlacePicker city={city} locations={[]} onAdd={onAdd} onRemove={jest.fn()} />);

        fireEvent.click(await screen.findByRole('button', { name: 'places.locate' }));
        const located = { text: 'Καρτεράδος, Ελλάδα', coordinates: [25.44, 36.42] as [number, number] };
        await act(async () => {
            resolveGeocode({ ok: true, location: located });
        });
        expect(onAdd).toHaveBeenCalledWith(located);
    });
});
