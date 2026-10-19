import { act } from '@testing-library/react';
import { createGeneralCityMarker, createSubjectPin } from '../mapMarkers';
import type { LandingSubject } from '@/lib/landing/landingData';
import { MARKER_Z } from '@/lib/landing/landingCore';

const markerRemove = jest.fn();
jest.mock('mapbox-gl', () => ({
    __esModule: true,
    default: {
        Marker: class {
            element: HTMLElement | undefined;
            constructor(options?: { element?: HTMLElement }) { this.element = options?.element; }
            getElement() { return this.element; }
            setLngLat() { return this; }
            addTo() { return this; }
            remove = markerRemove;
        },
    },
}));
jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
jest.mock('../SubjectCard', () => ({ SubjectCard: () => null }));
// TopicIcon reaches lucide-react/dynamic, which is ESM-only under jest.
jest.mock('@/components/TopicIcon', () => ({ TopicIcon: () => null }));
jest.mock('@/lib/landing/analytics', () => ({ captureLandingAction: jest.fn() }));
// The icon loader goes through lucide-react's lazy modules (ESM); here it answers at once.
jest.mock('@/lib/landing/pinIcon', () => ({
    loadPinIconNode: jest.fn(async (name: string | null) => [['path', { d: name ?? 'none', key: 'k' }]]),
    createPinIcon: (node: [string, Record<string, string>][], size: number) => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', String(size));
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('data-d', node[0][1].d);
        return svg;
    },
}));

import { loadPinIconNode } from '@/lib/landing/pinIcon';
const loadMock = loadPinIconNode as jest.Mock;

const subject = (id: string, icon: string | null, hot = false): LandingSubject =>
    ({ id, title: 'Θέμα', lng: 23.7, lat: 37.9, hot, topic: { name: '', color: '#4f46e5', icon } } as unknown as LandingSubject);

const opts = (dot: boolean, selectedId: string | null = null, previewId: string | null = null) => ({
    selectedId,
    previewId,
    dot,
    onSelect: jest.fn(),
    onOpenCoLocated: jest.fn(),
    t: (key: string) => key,
});
const map = {} as unknown as Parameters<typeof createSubjectPin>[0];
const iconEl = (el: HTMLElement) => el.querySelector('span')!;
const settle = () => act(async () => {});

beforeEach(() => jest.clearAllMocks());

describe('createSubjectPin', () => {
    it('draws the topic icon as a static svg once its node lands, and owns no React root', async () => {
        const pin = createSubjectPin(map, [subject('s1', 'leaf')], opts(false));
        expect('root' in pin).toBe(false);
        expect(loadMock).toHaveBeenCalledWith('leaf');
        await settle();
        const svg = iconEl(pin.el).querySelector('svg')!;
        expect(svg.getAttribute('stroke')).toBe('currentColor');
        expect(svg.getAttribute('data-d')).toBe('leaf');
        expect(svg.getAttribute('width')).toBe('14');
    });

    it('sizes a hot pin\'s icon larger', async () => {
        const pin = createSubjectPin(map, [subject('s1', 'leaf', true)], opts(false));
        await settle();
        expect(iconEl(pin.el).querySelector('svg')!.getAttribute('width')).toBe('18');
    });

    it('asks for the icon on the first badge appearance only, and once', async () => {
        const pin = createSubjectPin(map, [subject('s1', 'leaf')], opts(true));
        expect(loadMock).not.toHaveBeenCalled();
        pin.setDot(false, null, null);
        pin.setDot(true, null, null);
        pin.setDot(false, null, null);
        await settle();
        expect(loadMock).toHaveBeenCalledTimes(1);
        expect(iconEl(pin.el).childElementCount).toBe(1);
        expect(iconEl(pin.el).style.opacity).toBe('1');
    });

    it('stays a plain badge when the icon chunk fails, and asks again on the next badge appearance', async () => {
        loadMock.mockRejectedValueOnce(new Error('offline'));
        const pin = createSubjectPin(map, [subject('s1', 'leaf')], opts(false));
        await settle();
        expect(iconEl(pin.el).childElementCount).toBe(0);
        pin.setDot(true, null, null);
        pin.setDot(false, null, null);
        await settle();
        expect(loadMock).toHaveBeenCalledTimes(2);
        expect(iconEl(pin.el).childElementCount).toBe(1);
    });

    it('keeps an icon that lands while the pin is a dot again, hidden', async () => {
        const pin = createSubjectPin(map, [subject('s1', 'leaf')], opts(false));
        pin.setDot(true, null, null);
        await settle();
        expect(iconEl(pin.el).childElementCount).toBe(1);
        expect(iconEl(pin.el).style.opacity).toBe('0');
    });

    it('is born highlighted when its group holds the selected subject, "+N" groups included', () => {
        const group = [subject('a', 'leaf'), subject('b', 'leaf')];
        const pin = createSubjectPin(map, group, opts(false, 'b'));
        expect(pin.subject).toBeNull();
        expect(pin.el.classList.contains('scale-110')).toBe(true);
        expect(pin.rootEl.style.zIndex).toBe(String(MARKER_Z.coLocatedPin));
    });

    it('restyles in place for a new selection, keeping its shape', () => {
        const pin = createSubjectPin(map, [subject('a', 'leaf'), subject('b', 'leaf')], opts(true));
        expect(pin.el.classList.contains('scale-110')).toBe(false);
        pin.setSelection('b', null);
        expect(pin.el.classList.contains('scale-110')).toBe(true);
        expect(pin.dot).toBe(true);
        expect(pin.el.classList.contains('h-4')).toBe(true);
        pin.setSelection(null, null);
        expect(pin.el.classList.contains('scale-110')).toBe(false);
    });

    it('gives the mobile preview the intense style without the selected one', () => {
        const pin = createSubjectPin(map, [subject('a', 'leaf')], opts(false, null, 'a'));
        expect(pin.el.style.borderWidth).toBe('2px');
        expect(pin.el.classList.contains('scale-110')).toBe(true);
    });
});

// Every layer that shares the map with the pins writes its own band (see MARKER_Z), so DOM order
// never decides which marker paints on top.
describe('marker z-index bands', () => {
    it('stacks a pin by its state: plain, hot, selected', () => {
        expect(createSubjectPin(map, [subject('p', 'leaf')], opts(false)).rootEl.style.zIndex).toBe(String(MARKER_Z.pin));
        expect(createSubjectPin(map, [subject('h', 'leaf', true)], opts(false)).rootEl.style.zIndex).toBe(String(MARKER_Z.hotPin));
        expect(createSubjectPin(map, [subject('s', 'leaf', true)], opts(false, 's')).rootEl.style.zIndex).toBe(String(MARKER_Z.selectedPin));
    });

    it('puts the city-hall marker in its own band', async () => {
        const city = { cityId: 'c', cityName: 'Πόλη', nameMunicipality: 'Δήμος', lng: 23.7, lat: 37.9, subjects: [subject('g', null)] };
        let made: ReturnType<typeof createGeneralCityMarker> | undefined;
        await act(async () => { made = createGeneralCityMarker(map, city, jest.fn(), (key: string) => key); });
        expect(made!.marker.getElement().style.zIndex).toBe(String(MARKER_Z.cityHall));
    });
});
