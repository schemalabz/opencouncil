"use client";

// Client-side DOM → PNG rasterization for Instagram Story / Feed exports.
//
// Replaces the server-side /api/og?variant=story|feed pipeline, which used
// @vercel/og + satori. That stack hangs on Athens-scale data (85+ subjects
// with long Greek subject names) because yoga enters a non-converging
// measurement loop in WASM — synchronously, on the Node main thread,
// blocking the entire app. Chromium's layout engine has no equivalent
// failure mode, and each render here pays only the user's own CPU.
//
// The rendering happens in a hidden off-screen DOM node:
//   - position: fixed; left: -10000px  — render but never visible
//   - NOT display:none/visibility:hidden — those break webfont loading and
//     image decode timing
//   - wrapped with the app's next/font className(s) so html-to-image's
//     @font-face inlining picks up the correct hashed font family
// We wait for fonts + image decode before screenshot, then unmount and
// remove the container in a finally block.

import { createRoot, type Root } from "react-dom/client";
import { toBlob } from "html-to-image";
import { inter, roboto } from "@/lib/fonts";

export interface RenderStoryToBlobOptions {
    width: number;
    height: number;
    /** AbortController signal — checked between awaits. Aborts produce a `DOMException("AbortError")`. */
    signal?: AbortSignal;
}

const ABORT_ERROR = () => new DOMException("Render aborted", "AbortError");

function throwIfAborted(signal: AbortSignal | undefined) {
    if (signal?.aborted) throw ABORT_ERROR();
}

/**
 * Pre-fetch an external image URL and inline it as a base64 data URI.
 *
 * html-to-image rasterizes via canvas; a cross-origin <img> without CORS
 * headers will silently taint the canvas and produce a blank/black image.
 * Resolving to a data URI on our side eliminates that risk entirely.
 *
 * 5s AbortController timeout; null fallback on any error (templates render
 * gracefully without a logo).
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

async function waitForImages(container: HTMLElement, signal: AbortSignal | undefined): Promise<void> {
    const imgs = Array.from(container.querySelectorAll("img"));
    await Promise.all(
        imgs.map(async (img) => {
            // `img.decode()` returns once the image is fully decoded and ready to paint.
            // Catch silently — a single bad image shouldn't fail the whole render.
            try {
                await img.decode();
            } catch {
                // ignore
            }
        }),
    );
    throwIfAborted(signal);
}

async function rasterize(
    container: HTMLElement,
    width: number,
    height: number,
): Promise<Blob | null> {
    return toBlob(container, {
        width,
        height,
        // Lock to 1 so a 1080×1920 layout produces a 1080×1920 PNG even on
        // retina screens (default would multiply by window.devicePixelRatio).
        pixelRatio: 1,
        cacheBust: true,
        // Strip any inherited transforms from the wrapper context so the
        // capture box stays axis-aligned with the off-screen element.
        style: { transform: "none" },
    });
}

/**
 * Render a React element to a PNG Blob via off-screen DOM + html-to-image.
 * Caller is responsible for any post-processing (download via
 * src/lib/export/meetings.tsx's downloadFile, navigator.share, etc.).
 */
export async function renderStoryToBlob(
    element: React.ReactElement,
    opts: RenderStoryToBlobOptions,
): Promise<Blob> {
    const { width, height, signal } = opts;

    // Build the off-screen container. Off-screen via fixed + negative left so
    // it lays out and webfonts/images actually load (display:none would skip both).
    // Wrap with next/font class names so the hashed @font-face declarations
    // from src/lib/fonts.ts apply inside.
    const container = document.createElement("div");
    container.className = `${inter.className} ${roboto.className}`;
    Object.assign(container.style, {
        position: "fixed",
        top: "0",
        left: "-10000px",
        width: `${width}px`,
        height: `${height}px`,
        pointerEvents: "none",
        // Background unset — templates fill it themselves.
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(container);

    let root: Root | null = null;
    try {
        throwIfAborted(signal);

        // Mount the template into the off-screen container.
        root = createRoot(container);
        root.render(element);

        // Yield two animation frames so React commits the tree and the browser
        // has a chance to lay it out before we start measuring images / fonts.
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        throwIfAborted(signal);

        // Wait for all webfonts to load. fonts.ready resolves after every
        // currently-requested face has finished loading or failed.
        if (typeof document.fonts?.ready?.then === "function") {
            await document.fonts.ready;
        }
        throwIfAborted(signal);

        // Wait for <img> decode (city logo + watermark are the only ones today).
        await waitForImages(container, signal);

        // Rasterize. Retry once on null/tiny blob — html-to-image has a known
        // first-call race on iOS Safari where webfonts + images aren't always
        // hot in the canvas pipeline.
        let blob = await rasterize(container, width, height);
        throwIfAborted(signal);
        if (!blob || blob.size < 1024) {
            blob = await rasterize(container, width, height);
        }
        if (!blob) {
            throw new Error("Failed to rasterize story template (empty blob)");
        }
        return blob;
    } finally {
        if (root) root.unmount();
        container.remove();
    }
}
