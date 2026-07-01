import { useCallback, useEffect, useState } from 'react';

type Options = {
    /** how many rows to add per page (initial render + each "load more") */
    pageSize?: number;
    /** an index that must stay rendered (e.g. the selected row) even if it's past the window */
    ensureIndex?: number;
};

/**
 * Windows a long list: renders only the first `pageSize` rows and grows by `pageSize` as the
 * user scrolls near the bottom of the (scrollable) container the returned `onScroll` is
 * attached to. The window resets to the first page whenever `items` changes (e.g. the map
 * viewport / filters change), so the list always starts fresh. `ensureIndex` keeps a pinned
 * row (the selected subject) in view even when it sits past the current window.
 */
export function useInfiniteScroll<T>(items: T[], options?: Options): {
    visible: T[];
    onScroll: (e: React.UIEvent<HTMLElement>) => void;
} {
    const pageSize = options?.pageSize ?? 10;
    const ensureIndex = options?.ensureIndex ?? -1;
    const [count, setCount] = useState(pageSize);

    // A new list (pan/zoom/filter/query) starts over at the first page.
    useEffect(() => {
        setCount(pageSize);
    }, [items, pageSize]);

    const onScroll = useCallback(
        (e: React.UIEvent<HTMLElement>) => {
            const el = e.currentTarget;
            // within ~400px of the bottom → reveal the next page (no-op once everything shows)
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 400) {
                setCount((c) => (c < items.length ? c + pageSize : c));
            }
        },
        [items.length, pageSize],
    );

    const effective = ensureIndex >= 0 ? Math.max(count, ensureIndex + 1) : count;
    return { visible: items.slice(0, effective), onScroll };
}
