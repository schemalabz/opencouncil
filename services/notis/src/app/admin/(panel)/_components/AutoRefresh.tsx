"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-fetch the server component's data on an interval, but only while the
 *  tab is visible — countdowns tick client-side either way; this keeps the
 *  underlying rows fresh. */
export function AutoRefresh({ everyMs = 30_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs]);
  return null;
}
