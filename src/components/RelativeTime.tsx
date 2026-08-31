"use client";

import { useEffect, useReducer, useState } from "react";
import { useLocale } from "next-intl";
import { formatRelativeTime } from "@/lib/formatters/time";

// The rendered strings have at best minute granularity.
const REFRESH_MS = 60_000;

/**
 * Distance-to-now text ("περίπου 2 ώρες", "πριν από 5 λεπτά") that is safe to
 * server-render. The string depends on the clock at render time, so the server
 * and the hydrating client routinely disagree and React reports hydration
 * error #418. suppressHydrationWarning keeps the server text instead of
 * erroring, and the interval keeps the text fresh from the client's clock.
 */
export function RelativeTime({ date, addSuffix = true }: { date: Date | string; addSuffix?: boolean }) {
    const locale = useLocale();
    const [mounted, setMounted] = useState(false);
    const [, tick] = useReducer((n: number) => n + 1, 0);

    useEffect(() => {
        setMounted(true);
        const id = setInterval(tick, REFRESH_MS);
        return () => clearInterval(id);
    }, []);

    // The key swaps the node once after mount. Hydration adopted the server
    // string (suppressed above), but React diffs later renders against its own
    // client string — while the two stay equal it never writes the DOM, so an
    // adopted stale string could survive until the next wording change.
    // Remounting guarantees the client's value from the first paint after
    // hydration.
    return (
        <span key={mounted ? "live" : "ssr"} suppressHydrationWarning>
            {formatRelativeTime(new Date(date), locale, { addSuffix })}
        </span>
    );
}
