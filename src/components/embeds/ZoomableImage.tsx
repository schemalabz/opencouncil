"use client";

import { useState } from "react";
import { ZoomIn } from "lucide-react";
import { ZoomLightbox } from "./ZoomLightbox";

/**
 * An image with a zoom button that opens it full-screen in a gesture-driven
 * lightbox (pinch/wheel to zoom, drag to pan). Reusable across article figures.
 */
export function ZoomableImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <div className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={src}
                    alt={alt}
                    loading="lazy"
                    onClick={() => setOpen(true)}
                    className={`w-full cursor-zoom-in rounded-xl border border-border ${className ?? ""}`}
                />
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    aria-label="Μεγέθυνση εικόνας"
                    className="absolute right-2 top-2 rounded-lg bg-background/80 p-1.5 text-foreground shadow-sm ring-1 ring-border backdrop-blur transition-opacity hover:bg-background focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                >
                    <ZoomIn className="h-4 w-4" />
                </button>
            </div>

            {open && <ZoomLightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
        </>
    );
}
