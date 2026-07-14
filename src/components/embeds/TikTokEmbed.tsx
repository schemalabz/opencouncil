"use client";

import { useEffect } from "react";

/**
 * Embeds a TikTok video via TikTok's official embed.js, which replaces the
 * blockquote with an iframe once it loads. The blockquote (caption + links)
 * stays as accessible, indexable fallback until the script processes it.
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
    useEffect(() => {
        const script = document.createElement("script");
        script.src = "https://www.tiktok.com/embed.js";
        script.async = true;
        document.body.appendChild(script);
        return () => {
            script.remove();
        };
    }, []);

    return (
        <blockquote
            className="tiktok-embed not-prose"
            cite={cite}
            data-video-id={videoId}
            style={{ maxWidth: 605, minWidth: 325 }}
        >
            <section>{children}</section>
        </blockquote>
    );
}
