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
// Stable across renders, as the hook's state is: a new array each render would read as a new list.
const mockSuggestions = [
    { id: 'p1', placeId: 'p1', text: 'Φηρά, Θήρα, Ελλάδα' },
    { id: 'p2', placeId: 'p2', text: 'Οία, Θήρα, Ελλάδα' },
    { id: 'p3', placeId: 'p3', text: 'Πύργος, Θήρα, Ελλάδα' },
];
const mockSelect = jest.fn(async (suggestion: { text: string }) => ({ ...searchPlace, text: suggestion.text }));
const mockClear = jest.fn();
jest.mock('@/components/onboarding/selectors/useLocationSearch', () => ({
    useLocationSearch: () => ({
        inputValue: 'Θήρα',
        changeInput: jest.fn(),
        clear: mockClear,
        suggestions: mockSuggestions,
        select: mockSelect,
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
            fireEvent.click(screen.getByRole('option', { name: /Φηρά/ }));
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

    it('moves through the suggestions with the arrow keys, wrapping at both ends, and picks with Enter', async () => {
        const onAdd = jest.fn();
        render(<PlacePicker city={city} locations={[]} onAdd={onAdd} onRemove={jest.fn()} />);
        const input = screen.getByRole('combobox');
        const activeText = () => document.getElementById(input.getAttribute('aria-activedescendant') ?? '')?.textContent;

        expect(input).toHaveAttribute('aria-expanded', 'true');
        expect(input).not.toHaveAttribute('aria-activedescendant');

        fireEvent.keyDown(input, { key: 'ArrowDown' });
        expect(activeText()).toContain('Φηρά');
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        expect(activeText()).toContain('Οία');
        expect(screen.getByRole('option', { name: /Οία/ })).toHaveAttribute('aria-selected', 'true');
        fireEvent.keyDown(input, { key: 'ArrowUp' });
        fireEvent.keyDown(input, { key: 'ArrowUp' });
        expect(activeText()).toContain('Πύργος');
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        expect(activeText()).toContain('Φηρά');

        // Each key press is its own event, as in a browser, so React renders between them.
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        await act(async () => {
            fireEvent.keyDown(input, { key: 'Enter' });
        });
        expect(onAdd).toHaveBeenCalledWith({ ...searchPlace, text: 'Οία, Θήρα, Ελλάδα' });
    });

    it('does not pick anything on Enter before an arrow key, and clears on Escape', async () => {
        const onAdd = jest.fn();
        render(<PlacePicker city={city} locations={[]} onAdd={onAdd} onRemove={jest.fn()} />);
        const input = screen.getByRole('combobox');

        await act(async () => {
            fireEvent.keyDown(input, { key: 'Enter' });
        });
        expect(onAdd).not.toHaveBeenCalled();

        fireEvent.keyDown(input, { key: 'Escape' });
        expect(mockClear).toHaveBeenCalled();
    });
});
