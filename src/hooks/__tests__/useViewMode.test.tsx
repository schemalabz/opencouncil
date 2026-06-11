import { act, renderHook } from '@testing-library/react';
import { useViewMode, __resetViewModeStoreForTests } from '../useViewMode';

const STORAGE_KEY = 'opencouncil.transcript.viewMode';

function setLocation(search: string) {
    window.history.replaceState(null, '', `/${search ? `?${search}` : ''}`);
}

describe('useViewMode', () => {
    beforeEach(() => {
        window.localStorage.clear();
        setLocation('');
        __resetViewModeStoreForTests();
    });

    it('defaults to default mode when neither URL nor storage is set', () => {
        const { result } = renderHook(() => useViewMode());
        expect(result.current[0]).toBe('default');
    });

    it('reads from localStorage on first mount', () => {
        window.localStorage.setItem(STORAGE_KEY, 'fisheye');
        const { result } = renderHook(() => useViewMode());
        expect(result.current[0]).toBe('fisheye');
    });

    it('URL param overrides localStorage and is mirrored to storage', () => {
        window.localStorage.setItem(STORAGE_KEY, 'default');
        setLocation('mode=fisheye');
        const { result } = renderHook(() => useViewMode());
        expect(result.current[0]).toBe('fisheye');
        expect(window.localStorage.getItem(STORAGE_KEY)).toBe('fisheye');
    });

    it('toggle updates both URL and storage', () => {
        const { result } = renderHook(() => useViewMode());
        act(() => result.current[1]('fisheye'));
        expect(result.current[0]).toBe('fisheye');
        expect(window.localStorage.getItem(STORAGE_KEY)).toBe('fisheye');
        expect(window.location.search).toContain('mode=fisheye');
    });

    it('toggle propagates to every consumer of the hook', () => {
        // Two independent useViewMode() calls in different components must
        // stay in sync — this is the bug that motivated the rewrite.
        const { result: a } = renderHook(() => useViewMode());
        const { result: b } = renderHook(() => useViewMode());
        expect(a.current[0]).toBe('default');
        expect(b.current[0]).toBe('default');
        act(() => a.current[1]('fisheye'));
        expect(a.current[0]).toBe('fisheye');
        expect(b.current[0]).toBe('fisheye');
    });

    it('removes mode param from URL when reverting to default', () => {
        setLocation('mode=fisheye&other=1');
        const { result } = renderHook(() => useViewMode());
        act(() => result.current[1]('default'));
        expect(window.location.search).not.toContain('mode=');
        expect(window.location.search).toContain('other=1');
        expect(window.localStorage.getItem(STORAGE_KEY)).toBe('default');
    });

    it('a second mount with no URL param keeps the active mode (no storage clobber)', () => {
        // Simulates navigating to a new transcript page after toggling fisheye.
        // The new page has no ?mode= in its URL — the preference must persist
        // without being reset by some lingering "default" value in storage.
        const { result, unmount } = renderHook(() => useViewMode());
        act(() => result.current[1]('fisheye'));
        unmount();
        setLocation('');
        const { result: next } = renderHook(() => useViewMode());
        expect(next.current[0]).toBe('fisheye');
    });

    it('a second mount with ?mode=default explicitly overrides current state', () => {
        const { result, unmount } = renderHook(() => useViewMode());
        act(() => result.current[1]('fisheye'));
        unmount();
        setLocation('mode=default');
        const { result: next } = renderHook(() => useViewMode());
        expect(next.current[0]).toBe('default');
        expect(window.localStorage.getItem(STORAGE_KEY)).toBe('default');
    });

    it('ignores unknown URL param values', () => {
        setLocation('mode=garbage');
        const { result } = renderHook(() => useViewMode());
        expect(result.current[0]).toBe('default');
    });

    it('syncs to a storage event from another tab', () => {
        const { result } = renderHook(() => useViewMode());
        expect(result.current[0]).toBe('default');
        act(() => {
            window.dispatchEvent(new StorageEvent('storage', {
                key: STORAGE_KEY,
                newValue: 'fisheye',
            }));
        });
        expect(result.current[0]).toBe('fisheye');
    });
});
