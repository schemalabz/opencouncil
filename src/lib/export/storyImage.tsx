"use client";

// Client-side DOM → PNG rasterization for Story exports.
//
// The render happens in an off-screen DOM node positioned at left: -10000px
// rather than display:none / visibility:hidden — the latter would skip
// webfont loading and image decode, which we depend on before screenshot.
// The container is wrapped with the next/font class names so html-to-image's
// @font-face inlining picks up the hashed font family.

import { createRoot, type Root } from "react-dom/client";
import { toBlob } from "html-to-image";
import { inter, roboto } from "@/lib/fonts";

export interface RenderStoryToBlobOptions {
    width: number;
    height: number;
}

/**
 * Pre-fetch an external image URL and inline it as a base64 data URI.
 * html-to-image rasterizes via canvas, and a cross-origin <img> without
 * CORS headers silently taints the canvas and produces a blank PNG.
 * 5s timeout; null fallback (templates render gracefully without a logo).
 */
export async function resolveImageToDataUri(
    url: string | null | undefined,
    timeoutMs = 5000,
): Promise<string | null> {
    if (!url) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return null;
        const blob = await res.blob();
        return await new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

async function waitForImages(container: HTMLElement): Promise<void> {
    const imgs = Array.from(container.querySelectorAll("img"));
    // A single failed decode shouldn't fail the whole render.
    await Promise.all(imgs.map((img) => img.decode().catch(() => {})));
}

async function rasterize(container: HTMLElement, width: number, height: number): Promise<Blob | null> {
    return toBlob(container, {
        width,
        height,
        // Lock to 1 so a 1080×1920 layout produces a 1080×1920 PNG even on
        // retina screens (default multiplies by window.devicePixelRatio).
        pixelRatio: 1,
        cacheBust: true,
        style: { transform: "none" },
    });
}

/** Render a React element to a PNG Blob via off-screen DOM + html-to-image. */
export async function renderStoryToBlob(
    element: React.ReactElement,
    { width, height }: RenderStoryToBlobOptions,
): Promise<Blob> {
    const container = document.createElement("div");
    container.className = `${inter.className} ${roboto.className}`;
    // position: absolute (not fixed) + top: 0/left: -10000px is the well-trodden
    // off-screen pattern for html-to-image. position: fixed has been observed to
    // produce blank captures when the source is outside the viewport.
    Object.assign(container.style, {
        position: "absolute",
        top: "0",
        left: "-10000px",
        width: `${width}px`,
        height: `${height}px`,
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(container);

    let root: Root | null = null;
    try {
        root = createRoot(container);
        root.render(element);

        // Two animation frames: one for React to commit, one for the browser to lay out.
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

        if (typeof document.fonts?.ready?.then === "function") {
            await document.fonts.ready;
        }
        await waitForImages(container);

        // Retry once on null/tiny blob — known iOS Safari first-call race
        // where webfonts/images aren't yet hot in the canvas pipeline.
        let blob = await rasterize(container, width, height);
        if (!blob || blob.size < 1024) {
            blob = await rasterize(container, width, height);
        }
        if (!blob) throw new Error("Failed to rasterize story template (empty blob)");
        return blob;
    } finally {
        if (root) root.unmount();
        container.remove();
    }
}
