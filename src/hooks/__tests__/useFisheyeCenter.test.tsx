import { renderHook } from '@testing-library/react';
import { useFisheyeCenter } from '../useFisheyeCenter';

describe('useFisheyeCenter', () => {
    it('mirrors the active segment index', () => {
        const { result, rerender } = renderHook(({ idx }: { idx: number | null }) => useFisheyeCenter(idx), {
            initialProps: { idx: 5 },
        });
        expect(result.current).toBe(5);
        rerender({ idx: 12 });
        expect(result.current).toBe(12);
    });

    it('returns null when no segment is active', () => {
        const { result } = renderHook(() => useFisheyeCenter(null));
        expect(result.current).toBeNull();
    });
});
