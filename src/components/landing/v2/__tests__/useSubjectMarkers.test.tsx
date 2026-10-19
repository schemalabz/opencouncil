import { act, renderHook } from '@testing-library/react';
import { useSubjectMarkers } from '../hooks/useMapMarkers';
import type { LandingSubject } from '@/lib/landing/landingData';
import { SUBJECT_DOT_THRESHOLD, type SubjectPin } from '@/lib/landing/landingCore';
import { createSubjectPin } from '../mapMarkers';

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
jest.mock('@/lib/analytics/capture', () => ({ captureMapAction: jest.fn() }));
jest.mock('../mapMarkers', () => ({
    createSubjectPin: jest.fn(),
    createGeneralCityMarker: jest.fn(),
    createMunicipalityCountMarker: jest.fn(),
    createMunicipalityViewMarker: jest.fn(),
    DONUT_INK_HEIGHT: 1,
    DONUT_INK_WIDTH: 1,
    MUNICIPALITY_VIEW_MARKER_DIAMETER: 1,
    MUNICIPALITY_VIEW_MARKER_RING_SPREAD: 1,
}));

const createPinMock = createSubjectPin as jest.Mock;
/** The ids of the pins taken off the map so far ('group' for a "+N" pin). */
const removedIds = () =>
    createPinMock.mock.results
        .map((r) => r.value as SubjectPin)
        .filter((pin) => (pin.marker.remove as jest.Mock).mock.calls.length > 0)
        .map((pin) => pin.subject?.id ?? 'group');

type Bounds = { w: number; s: number; e: number; n: number };

/** A map that only knows its bounds and its listeners. */
function fakeMap(initial: Bounds) {
    let bounds = initial;
    const listeners = new Map<string, Array<() => void>>();
    return {
        on: (event: string, fn: () => void) => listeners.set(event, [...(listeners.get(event) ?? []), fn]),
        off: (event: string, fn: () => void) => listeners.set(event, (listeners.get(event) ?? []).filter((f) => f !== fn)),
        getBounds: () => ({ getWest: () => bounds.w, getSouth: () => bounds.s, getEast: () => bounds.e, getNorth: () => bounds.n }),
        getZoom: () => 12,
        getCenter: () => ({ lng: (bounds.w + bounds.e) / 2, lat: (bounds.s + bounds.n) / 2 }),
        project: () => ({ x: 0, y: 0 }),
        easeTo: jest.fn(),
        /** move the view and end the gesture */
        moveTo(next: Bounds) {
            bounds = next;
            listeners.get('moveend')?.slice().forEach((fn) => fn());
        },
    };
}

// Minimal LandingSubject — only the fields the layer and the pin restyle read.
const at = (id: string, lng: number, lat: number): LandingSubject =>
    ({ id, lng, lat, hot: false, topic: { name: '', color: '#4f46e5', icon: null } } as unknown as LandingSubject);

/** Pins created so far, as the ids of their first subject, with the shape each was born in. */
const created = () => createPinMock.mock.calls.map(([, group, opts]) => ({ id: group[0].id, dot: opts.dot as boolean }));
const createdIds = () => created().map((p) => p.id);

function renderLayer(map: ReturnType<typeof fakeMap>, subjects: LandingSubject[], selectedId: string | null = null) {
    return renderHook(
        ({ selected }: { selected: string | null }) =>
            useSubjectMarkers({
                mapInstance: map as unknown as Parameters<typeof useSubjectMarkers>[0]['mapInstance'],
                active: true,
                visibleSubjects: subjects,
                selectedId: selected,
                previewId: null,
                onSelect: jest.fn(),
                onClearSelection: jest.fn(),
                suppressViewCaptureRef: { current: false },
                pendingCoLocatedRef: { current: null },
                setCoLocated: jest.fn(),
            }),
        { initialProps: { selected: selectedId } },
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    createPinMock.mockImplementation((_map, group: LandingSubject[], opts: { dot: boolean }): SubjectPin => ({
        el: document.createElement('button'),
        rootEl: document.createElement('div'),
        marker: { remove: jest.fn() } as unknown as SubjectPin['marker'],
        subject: group.length > 1 ? null : group[0],
        dot: opts.dot,
        setDot: jest.fn(),
        setSelection: jest.fn(),
    }));
});

describe('useSubjectMarkers', () => {
    // The viewport is (0..2, 0..2); the pin window pads it by half a viewport each way (-1..3).
    const view: Bounds = { w: 0, s: 0, e: 2, n: 2 };
    const subjects = [at('in', 1, 1), at('rim', 2.5, 2.5), at('far', 10, 10)];

    it('builds pins for the groups inside the pin window only', () => {
        renderLayer(fakeMap(view), subjects);
        expect(createdIds().sort()).toEqual(['in', 'rim']);
    });

    it('adds the groups that came near and drops the ones that left at moveend', () => {
        const map = fakeMap(view);
        renderLayer(map, subjects);

        act(() => map.moveTo({ w: 9, s: 9, e: 11, n: 11 }));

        expect(createdIds().sort()).toEqual(['far', 'in', 'rim']);
        expect(removedIds()).toHaveLength(2);
        expect(removedIds().sort()).toEqual(['in', 'rim']);
    });

    it('keeps the pin of a subject selected from outside the window', () => {
        const map = fakeMap(view);
        const { rerender } = renderLayer(map, subjects);
        expect(createdIds()).not.toContain('far');

        rerender({ selected: 'far' });

        expect(createdIds()).toContain('far');
        // born highlighted: the factory gets the ids, not a stale boolean
        expect(createPinMock.mock.calls.at(-1)?.[2]).toMatchObject({ selectedId: 'far' });
        // it stays while selected, even after the view moves away from it
        act(() => map.moveTo({ w: 0, s: 0, e: 1, n: 1 }));
        expect(removedIds()).not.toContain('far');
    });

    it('settles the dot mode before the pins a moveend creates, so they are born in shape', () => {
        // Sparse at first (badges); the next view holds a crowd, so its pins must be born as dots.
        const crowd = Array.from({ length: SUBJECT_DOT_THRESHOLD + 10 }, (_, i) => at(`c${i}`, 20 + (i % 10) * 0.01, 20 + Math.floor(i / 10) * 0.01));
        const map = fakeMap(view);
        renderLayer(map, [...subjects, ...crowd]);
        expect(created().every((p) => !p.dot)).toBe(true);

        act(() => map.moveTo({ w: 19, s: 19, e: 21, n: 21 }));

        const born = created().filter((p) => p.id.startsWith('c'));
        expect(born).toHaveLength(crowd.length);
        expect(born.every((p) => p.dot)).toBe(true);
    });

    it('removes every live pin when the layer goes away', () => {
        const map = fakeMap(view);
        const { unmount } = renderLayer(map, subjects);
        unmount();
        expect(removedIds()).toHaveLength(2);
    });
});
