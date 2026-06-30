import { useCallback, useRef, useState } from "react";

export type DispatchPhase = "idle" | "executing" | "done";

export interface DispatchOutcome<T> {
    item: T;
    success: boolean;
    error?: string;
}

export interface SequentialDispatch<T> {
    phase: DispatchPhase;
    currentIndex: number;
    results: DispatchOutcome<T>[];
    cancelled: boolean;
    run: (items: T[]) => Promise<void>;
    cancel: () => void;
    reset: () => void;
}

/**
 * Drives a list of items through an async `dispatch` one at a time, tracking
 * progress for a batch-action dialog. `dispatch` throws to signal failure; the
 * hook records the error and continues with the next item.
 *
 * @param dispatch  Per-item async action. Throw to mark the item failed.
 * @param options.throttleMs  Delay between items (skipped after the last). Default 0.
 */
export function useSequentialDispatch<T>(
    dispatch: (item: T) => Promise<void>,
    options?: { throttleMs?: number },
): SequentialDispatch<T> {
    const [phase, setPhase] = useState<DispatchPhase>("idle");
    const [currentIndex, setCurrentIndex] = useState(0);
    const [results, setResults] = useState<DispatchOutcome<T>[]>([]);
    const [cancelled, setCancelled] = useState(false);
    const cancelledRef = useRef(false);

    const throttleMs = options?.throttleMs ?? 0;

    const run = useCallback(async (items: T[]) => {
        cancelledRef.current = false;
        setCancelled(false);
        setResults([]);
        setCurrentIndex(0);
        setPhase("executing");

        const acc: DispatchOutcome<T>[] = [];
        for (let i = 0; i < items.length; i++) {
            if (cancelledRef.current) break;
            setCurrentIndex(i);
            try {
                await dispatch(items[i]);
                acc.push({ item: items[i], success: true });
            } catch (error) {
                acc.push({
                    item: items[i],
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
            setResults([...acc]);
            if (i < items.length - 1 && throttleMs > 0) {
                await new Promise(resolve => setTimeout(resolve, throttleMs));
            }
        }
        setPhase("done");
    }, [dispatch, throttleMs]);

    const cancel = useCallback(() => {
        cancelledRef.current = true;
        setCancelled(true);
    }, []);

    const reset = useCallback(() => {
        cancelledRef.current = false;
        setCancelled(false);
        setResults([]);
        setCurrentIndex(0);
        setPhase("idle");
    }, []);

    return { phase, currentIndex, results, cancelled, run, cancel, reset };
}
