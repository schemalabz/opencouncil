"use client";

import React from "react";
import PlausibleProvider from "next-plausible";
import { usePathname } from "next/navigation";

// Matches embed routes with or without a locale prefix, e.g.
// /embed/meetings, /en/embed/meetings. These are loaded inside iframes
// on third-party sites and must not be counted as pageviews.
const EMBED_PATH = /^\/(?:en\/|el\/)?embed(?:\/|$)/;

export default function PlausibleAnalytics({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isEmbed = EMBED_PATH.test(pathname ?? "");

    // On embed routes force the script off; otherwise pass undefined so
    // next-plausible applies its own default (production-only) behaviour.
    return (
        <PlausibleProvider domain="opencouncil.gr" enabled={isEmbed ? false : undefined}>
            {children}
        </PlausibleProvider>
    );
}
