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

/** A map that knows its bounds and its listeners; a gesture is 'move' events, then one 'moveend'. */
function fakeMap(initial: Bounds) {
    let bounds = initial;
    const listeners = new Map<string, Array<() => void>>();
    const fire = (event: string) => listeners.get(event)?.slice().forEach((fn) => fn());
    return {
        on: (event: string, fn: () => void) => listeners.set(event, [...(listeners.get(event) ?? []), fn]),
        off: (event: string, fn: () => void) => listeners.set(event, (listeners.get(event) ?? []).filter((f) => f !== fn)),
        getBounds: () => ({ getWest: () => bounds.w, getSouth: () => bounds.s, getEast: () => bounds.e, getNorth: () => bounds.n }),
        getZoom: () => 12,
        getCenter: () => ({ lng: (bounds.w + bounds.e) / 2, lat: (bounds.s + bounds.n) / 2 }),
        project: () => ({ x: 0, y: 0 }),
        easeTo: jest.fn(),
        /** one frame of a gesture: the view changes and 'move' fires */
        moveFrame(next: Bounds) {
            bounds = next;
            fire('move');
        },
        /** the gesture ends where the view is */
        end() {
            fire('moveend');
        },
    };
}

const at = (id: string, lng: number, lat: number): LandingSubject =>
    ({ id, lng, lat, hot: false, topic: { name: '', color: '#4f46e5', icon: null } } as unknown as LandingSubject);

const created = () => createPinMock.mock.calls.map(([, group, opts]) => ({ id: group[0].id, dot: opts.dot as boolean }));
const createdIds = () => created().map((p) => p.id);

function renderLayer(map: ReturnType<typeof fakeMap>, subjects: LandingSubject[]) {
    return renderHook(() =>
        useSubjectMarkers({
            mapInstance: map as unknown as Parameters<typeof useSubjectMarkers>[0]['mapInstance'],
            active: true,
            visibleSubjects: subjects,
            selectedId: null,
            previewId: null,
            onSelect: jest.fn(),
            onClearSelection: jest.fn(),
            suppressViewCaptureRef: { current: false },
            pendingCoLocatedRef: { current: null },
            setCoLocated: jest.fn(),
        }),
    );
}

/** One animation frame passes. */
const frame = () => act(() => { jest.advanceTimersByTime(16); });

beforeEach(() => {
    jest.useFakeTimers();
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
afterEach(() => jest.useRealTimers());

describe('useSubjectMarkers during a gesture', () => {
    const view: Bounds = { w: 0, s: 0, e: 2, n: 2 };
    const farView: Bounds = { w: 9, s: 9, e: 11, n: 11 };
    const subjects = [at('in', 1, 1), at('far', 10, 10)];

    it('reconciles on a move frame, but at most once per layout interval', () => {
        const map = fakeMap(view);
        renderLayer(map, subjects);
        expect(createdIds()).toEqual(['in']);
        // the layer is older than one interval when the gesture starts
        act(() => { jest.advanceTimersByTime(1000); });

        map.moveFrame(farView);
        frame();
        expect(createdIds()).toEqual(['in', 'far']);
        expect(removedIds()).toHaveLength(1);

        // The next frame, well inside the interval: the view is back near 'in', but no pin changes.
        map.moveFrame(view);
        frame();
        expect(createdIds()).toEqual(['in', 'far']);
        expect(removedIds()).toHaveLength(1);

        // Past the interval the next frame reconciles again.
        act(() => { jest.advanceTimersByTime(100); });
        map.moveFrame(view);
        frame();
        expect(createdIds()).toEqual(['in', 'far', 'in']);
        expect(removedIds()).toHaveLength(2);
    });

    it('ends every gesture on the exact set, whatever the interval says', () => {
        const map = fakeMap(view);
        renderLayer(map, subjects);
        act(() => { jest.advanceTimersByTime(1000); });

        map.moveFrame(farView);
        frame();
        expect(createdIds()).toEqual(['in', 'far']);
        // Still inside the interval: a frame back home does nothing, the end of the gesture does.
        map.moveFrame(view);
        frame();
        expect(createdIds()).toEqual(['in', 'far']);
        act(() => map.end());
        expect(createdIds()).toEqual(['in', 'far', 'in']);
    });

    it('settles the dot mode before the pins a move frame creates', () => {
        const crowd = Array.from({ length: SUBJECT_DOT_THRESHOLD + 10 }, (_, i) => at(`c${i}`, 20 + (i % 10) * 0.01, 20 + Math.floor(i / 10) * 0.01));
        const map = fakeMap(view);
        renderLayer(map, [...subjects, ...crowd]);
        act(() => { jest.advanceTimersByTime(1000); });

        map.moveFrame({ w: 19, s: 19, e: 21, n: 21 });
        frame();
        const born = created().filter((p) => p.id.startsWith('c'));
        expect(born).toHaveLength(crowd.length);
        expect(born.every((p) => p.dot)).toBe(true);
    });
});

describe('useSubjectMarkers selection of a co-located subject outside the window', () => {
    // A "+N" pin has `subject: null`, so the selection restyle skips it: the highlight of a
    // co-located group rests on the shape the pin is born with.
    it('creates the group pin selected and intense', () => {
        const map = fakeMap({ w: 0, s: 0, e: 2, n: 2 });
        const group = [at('a', 10, 10), at('b', 10, 10)];
        const { rerender } = renderHook(
            ({ selected }: { selected: string | null }) =>
                useSubjectMarkers({
                    mapInstance: map as unknown as Parameters<typeof useSubjectMarkers>[0]['mapInstance'],
                    active: true,
                    visibleSubjects: group,
                    selectedId: selected,
                    previewId: null,
                    onSelect: jest.fn(),
                    onClearSelection: jest.fn(),
                    suppressViewCaptureRef: { current: false },
                    pendingCoLocatedRef: { current: null },
                    setCoLocated: jest.fn(),
                }),
            { initialProps: { selected: null as string | null } },
        );
        expect(createPinMock).not.toHaveBeenCalled();

        rerender({ selected: 'b' });

        expect(createPinMock).toHaveBeenCalledTimes(1);
        expect(createPinMock.mock.calls[0][2]).toMatchObject({ selectedId: 'b' });
    });
});
