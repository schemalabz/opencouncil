import { renderHook, act } from "@testing-library/react";
import { useSequentialDispatch } from "../useSequentialDispatch";

describe("useSequentialDispatch", () => {
    it("accumulates a success/failure outcome per item and ends in 'done'", async () => {
        const dispatch = jest.fn(async (n: number) => {
            if (n === 2) throw new Error("boom");
        });
        const { result } = renderHook(() => useSequentialDispatch<number>(dispatch));

        await act(async () => {
            await result.current.run([1, 2, 3]);
        });

        expect(result.current.phase).toBe("done");
        expect(result.current.results).toEqual([
            { item: 1, success: true },
            { item: 2, success: false, error: "boom" },
            { item: 3, success: true },
        ]);
    });

    it("stops dispatching once cancelled", async () => {
        const seen: number[] = [];
        const ref: { current: ReturnType<typeof useSequentialDispatch<number>> | null } = { current: null };
        const dispatch = jest.fn(async (n: number) => {
            seen.push(n);
            if (n === 1) ref.current!.cancel();
        });
        const { result } = renderHook(() => useSequentialDispatch<number>(dispatch));
        ref.current = result.current;

        await act(async () => {
            await result.current.run([1, 2, 3]);
        });

        expect(seen).toEqual([1]);
        expect(result.current.cancelled).toBe(true);
        expect(result.current.results).toEqual([{ item: 1, success: true }]);
    });

    it("reset returns to the idle phase with no results", async () => {
        const dispatch = jest.fn(async () => {});
        const { result } = renderHook(() => useSequentialDispatch<number>(dispatch));

        await act(async () => {
            await result.current.run([1]);
        });
        act(() => {
            result.current.reset();
        });

        expect(result.current.phase).toBe("idle");
        expect(result.current.results).toEqual([]);
    });
});
