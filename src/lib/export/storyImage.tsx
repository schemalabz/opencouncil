"use client";

// Client-side DOM → PNG rasterization for Story exports.
//
// The render happens in an off-screen DOM node positioned at left: -10000px
// rather than display:none / visibility:hidden — the latter would skip
// webfont loading and image decode, which we depend on before screenshot.
// The container is wrapped with the next/font class names so html-to-image's
// @font-face inlining picks up the hashed font family.
//
// We use renderToStaticMarkup + innerHTML rather than React's createRoot to
// mount the tree synchronously. createRoot schedules a render that commits
// asynchronously; without a strict flushSync, html-to-image can race and
// capture an empty container. Templates are pure render functions with no
// hooks or refs, so the static-markup path is a faithful equivalent.

import { renderToStaticMarkup } from "react-dom/server";
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
        // CRITICAL: override the off-screen positioning on the cloned root so the
        // captured SVG paints content at the origin instead of at left: -10000px
        // (which would put everything outside the canvas bounds → blank PNG).
        style: {
            position: "static",
            left: "0",
            top: "0",
            transform: "none",
            opacity: "1",
            visibility: "visible",
        },
    });
}

/** Render a React element to a PNG Blob via off-screen DOM + html-to-image. */
export async function renderStoryToBlob(
    element: React.ReactElement,
    { width, height }: RenderStoryToBlobOptions,
): Promise<Blob> {
    const container = document.createElement("div");
    container.className = `${inter.className} ${roboto.className}`;
    Object.assign(container.style, {
        position: "absolute",
        top: "0",
        left: "-10000px",
        width: `${width}px`,
        height: `${height}px`,
    } satisfies Partial<CSSStyleDeclaration>);
    container.innerHTML = renderToStaticMarkup(element);
    document.body.appendChild(container);

    try {
        // One animation frame so the browser has a chance to lay out and paint
        // the freshly-mounted tree before we ask html-to-image to serialize it.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

        if (typeof document.fonts?.ready?.then === "function") {
            await document.fonts.ready;
        }
        await waitForImages(container);

        console.log(
            `[story-export] container ready: ${container.children.length} children, ` +
                `markup=${container.innerHTML.length}b, imgs=${container.querySelectorAll("img").length}`,
        );

        // Retry once on null/tiny blob — known iOS Safari first-call race
        // where webfonts/images aren't yet hot in the canvas pipeline.
        let blob: Blob | null = null;
        try {
            blob = await rasterize(container, width, height);
        } catch (e) {
            console.error("[story-export] first toBlob threw:", e);
        }
        if (!blob || blob.size < 1024) {
            console.warn(`[story-export] first toBlob returned ${blob ? `${blob.size}b` : "null"}; retrying`);
            try {
                blob = await rasterize(container, width, height);
            } catch (e) {
                console.error("[story-export] retry toBlob threw:", e);
            }
        }
        if (!blob) throw new Error("Failed to rasterize story template (empty blob)");
        console.log(`[story-export] rendered ${width}×${height} → ${blob.size}b`);
        return blob;
    } finally {
        container.remove();
    }
}
