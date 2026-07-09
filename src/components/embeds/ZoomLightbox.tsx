"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

const MAX_SCALE = 6;

/**
 * Full-screen, gesture-driven image zoom shared by article figures and the
 * agenda viewer. Works on desktop (wheel to zoom, drag to pan, double-click to
 * toggle) and touch (pinch to zoom, drag to pan, double-tap). Esc, backdrop and
 * the close button all dismiss.
 */
export function ZoomLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
    const imgRef = useRef<HTMLImageElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const st = useRef({ scale: 1, tx: 0, ty: 0 });
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const pinch = useRef<{ dist: number; scale: number } | null>(null);
    const [showHint, setShowHint] = useState(true);

    const clamp = (s: number) => Math.min(MAX_SCALE, Math.max(1, s));
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
    const apply = () => {
        const img = imgRef.current;
        if (!img) return;
        const { scale, tx, ty } = st.current;
        img.style.transform = `translate(-50%, -50%) translate(${tx}px, ${ty}px) scale(${scale})`;
    };
    const resetIfSmall = () => {
        if (st.current.scale <= 1) {
            st.current.tx = 0;
            st.current.ty = 0;
        }
    };

    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => {
            document.body.style.overflow = prev;
            document.removeEventListener("keydown", onKey);
        };
    }, [onClose]);

    // Wheel zoom (desktop) — non-passive so we can preventDefault.
    useEffect(() => {
        const stage = stageRef.current;
        if (!stage) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const s = st.current;
            s.scale = clamp(s.scale + -e.deltaY * 0.0016 * s.scale);
            resetIfSmall();
            apply();
            setShowHint(false);
        };
        stage.addEventListener("wheel", onWheel, { passive: false });
        return () => stage.removeEventListener("wheel", onWheel);
    }, []);

    const onPointerDown = (e: React.PointerEvent) => {
        stageRef.current?.setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 2) {
            const [p1, p2] = [...pointers.current.values()];
            pinch.current = { dist: dist(p1, p2), scale: st.current.scale };
        }
    };
    const onPointerMove = (e: React.PointerEvent) => {
        const prev = pointers.current.get(e.pointerId);
        if (!prev) return;
        const cur = { x: e.clientX, y: e.clientY };
        pointers.current.set(e.pointerId, cur);
        const pts = [...pointers.current.values()];
        if (pts.length >= 2 && pinch.current) {
            // pinch: scale relative to the initial finger distance
            st.current.scale = clamp(pinch.current.scale * (dist(pts[0], pts[1]) / pinch.current.dist));
            resetIfSmall();
        } else if (pts.length === 1 && st.current.scale > 1) {
            // single-finger / mouse drag: pan
            st.current.tx += cur.x - prev.x;
            st.current.ty += cur.y - prev.y;
        }
        apply();
        setShowHint(false);
    };
    const onPointerUp = (e: React.PointerEvent) => {
        pointers.current.delete(e.pointerId);
        if (pointers.current.size < 2) pinch.current = null;
        resetIfSmall();
        apply();
    };
    const onDoubleClick = () => {
        st.current.scale = st.current.scale > 1 ? 1 : 2.6;
        resetIfSmall();
        apply();
        setShowHint(false);
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={alt}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            className="fixed inset-0 z-[1000] touch-none bg-[rgba(15,12,8,0.92)]"
        >
            <div
                ref={stageRef}
                onClick={(e) => {
                    if (e.target === stageRef.current) onClose();
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onDoubleClick={onDoubleClick}
                className="absolute inset-0 cursor-grab touch-none overflow-hidden active:cursor-grabbing"
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    ref={imgRef}
                    src={src}
                    alt={alt}
                    draggable={false}
                    style={{ transform: "translate(-50%, -50%)" }}
                    className="absolute left-1/2 top-1/2 max-h-[92vh] max-w-[92vw] select-none rounded-lg will-change-transform"
                />
            </div>
            <button
                type="button"
                onClick={onClose}
                aria-label="Κλείσιμο"
                className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/30"
            >
                <X className="h-5 w-5" />
            </button>
            {showHint && (
                <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-4 py-1.5 text-center text-[13px] text-white/85">
                    Τσίμπησε ή κύλησε για zoom · σύρε για μετακίνηση
                </div>
            )}
        </div>
    );
}
