"use client";

import { useEffect, useRef } from "react";

const EMBED_SCRIPT = "https://www.tiktok.com/embed.js";

/**
 * Embeds a TikTok video via TikTok's official embed.js, which replaces the
 * blockquote with an iframe once it loads. The blockquote (caption + links)
 * stays as accessible, indexable fallback until the script processes it.
 *
 * On a long page like /explain the video sits thousands of pixels below the
 * fold, and booting the player at page load blocks the main thread while the
 * reader is still reading the first sections. The script therefore loads once
 * the reader comes within four viewports of the video. The player needs about
 * two viewports of scrolling to appear on a slow device, so a shorter lead
 * leaves the reader looking at the caption instead of the video.
 *
 * Reusable: pass the video id, its canonical URL (`cite`) and the caption
 * markup as children.
 */
export function TikTokEmbed({
    videoId,
    cite,
    children,
}: {
    videoId: string;
    cite: string;
    children: React.ReactNode;
}) {
    const holder = useRef<HTMLQuoteElement>(null);

    useEffect(() => {
        const el = holder.current;
        if (!el) return;

        // embed.js scans the document when it runs, and it does not watch for
        // blockquotes added later. A client-side navigation back to this page
        // mounts a blockquote the earlier run never saw, so each mount carries
        // its own tag and takes it away again: appending a fresh element is
        // what re-runs the script, and the file itself comes from the cache.
        let script: HTMLScriptElement | null = null;
        const load = () => {
            script = document.createElement("script");
            script.src = EMBED_SCRIPT;
            script.async = true;
            document.body.appendChild(script);
        };

        // Without an observer there is no way to tell how far the video is, and
        // a reader who never gets the player is worse off than one who pays for
        // it at load.
        if (typeof IntersectionObserver === "undefined") {
            load();
            return () => script?.remove();
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    load();
                    observer.disconnect();
                }
            },
            { rootMargin: "400% 0px" },
        );
        observer.observe(el);

        return () => {
            observer.disconnect();
            script?.remove();
        };
    }, []);

    return (
        <blockquote
            ref={holder}
            className="tiktok-embed not-prose"
            cite={cite}
            data-video-id={videoId}
            style={{ maxWidth: 605, minWidth: 325 }}
        >
            <section>{children}</section>
        </blockquote>
    );
}
