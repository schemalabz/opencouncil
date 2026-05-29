"use client";

import React from "react";
import PlausibleProvider from "next-plausible";
import { usePathname } from "next/navigation";

// Matches embed routes with or without a locale prefix, e.g.
// /embed/meetings, /en/embed/meetings. These are loaded inside iframes
// on third-party sites and must not be counted as pageviews.
//
// Note: must use next/navigation's usePathname (not next-intl's), because
// this component renders in the root layout, which also wraps /_not-found —
// a route outside the [locale] segment with no NextIntlClientProvider.
// next-intl's usePathname throws there and breaks the static export.
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
