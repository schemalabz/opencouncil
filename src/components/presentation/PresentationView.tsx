"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Maximize, Minimize, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "@/i18n/routing";
import { CouncilMeetingWithAdminBody } from "@/lib/db/meetings";
import { CityWithGeometry } from "@/lib/db/cities";
import { SubjectWithRelations } from "@/lib/db/subject";
import MeetingInfoSlide from "./MeetingInfoSlide";
import SlideHeader from "./SlideHeader";
import SubjectSlide from "./SubjectSlide";

interface PresentationViewProps {
    meeting: CouncilMeetingWithAdminBody;
    city: CityWithGeometry;
    agendaSubjects: SubjectWithRelations[];
    backHref: string;
}

export default function PresentationView({
    meeting,
    city,
    agendaSubjects,
    backHref,
}: PresentationViewProps) {
    const router = useRouter();
    const containerRef = useRef<HTMLDivElement>(null);
    const [index, setIndex] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const total = agendaSubjects.length + 1;

    const goPrev = useCallback(() => {
        setIndex((i) => Math.max(0, i - 1));
    }, []);

    const goNext = useCallback(() => {
        setIndex((i) => Math.min(total - 1, i + 1));
    }, [total]);

    const exit = useCallback(() => {
        if (typeof document !== "undefined" && document.fullscreenElement) {
            document.exitFullscreen().catch(() => { });
        }
        router.push(backHref);
    }, [router, backHref]);

    useEffect(() => {
        const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
        onChange();
        document.addEventListener("fullscreenchange", onChange);
        return () => document.removeEventListener("fullscreenchange", onChange);
    }, []);

    const requestFs = useCallback(() => {
        const el = containerRef.current;
        if (!el || !el.requestFullscreen) return Promise.resolve();
        if (document.fullscreenElement) return Promise.resolve();
        return el.requestFullscreen().catch(() => { });
    }, []);

    const toggleFullscreen = useCallback(() => {
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => { });
        } else {
            requestFs();
        }
    }, [requestFs]);

    // Browsers require a user gesture to enter fullscreen. Try once on mount,
    // then fall back to the first user interaction if that initial call was
    // blocked (e.g. direct URL navigation without a click).
    useEffect(() => {
        let cleaned = false;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            window.removeEventListener("pointerdown", onFirstGesture);
            window.removeEventListener("keydown", onFirstGesture);
        };
        const onFirstGesture = () => {
            requestFs();
            cleanup();
        };

        requestFs().then(() => {
            if (!cleaned && document.fullscreenElement) cleanup();
        });
        window.addEventListener("pointerdown", onFirstGesture);
        window.addEventListener("keydown", onFirstGesture);

        return cleanup;
    }, [requestFs]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (
                e.key === "ArrowLeft" ||
                e.key === "ArrowUp" ||
                e.key === "PageUp"
            ) {
                e.preventDefault();
                goPrev();
            } else if (
                e.key === "ArrowRight" ||
                e.key === "ArrowDown" ||
                e.key === " " ||
                e.key === "PageDown"
            ) {
                e.preventDefault();
                goNext();
            }
            // Esc is left for the browser to exit fullscreen; use the X button to exit the presentation.
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [goPrev, goNext]);

    const canGoPrev = index > 0;
    const canGoNext = index < total - 1;

    const currentSubject = index > 0 ? agendaSubjects[index - 1] : null;
    const positionLabel = index === 0
        ? "INTRO"
        : `Θέμα ${index} / ${agendaSubjects.length}`;

    const iconButtonClass = "p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-accent/10 transition-colors cursor-pointer";
    const fullscreenLabel = isFullscreen ? "Έξοδος πλήρους οθόνης" : "Πλήρης οθόνη";

    return (
        <div
            ref={containerRef}
            className="fixed inset-0 bg-background text-foreground flex flex-col overflow-hidden"
        >
            <NavClickZone side="left" onClick={goPrev} enabled={canGoPrev} />
            <NavClickZone side="right" onClick={goNext} enabled={canGoNext} />

            <div className="absolute top-3 right-3 z-30 flex items-center gap-1">
                <button
                    type="button"
                    onClick={toggleFullscreen}
                    aria-label={fullscreenLabel}
                    title={fullscreenLabel}
                    className={iconButtonClass}
                >
                    {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                </button>
                <button
                    type="button"
                    onClick={exit}
                    aria-label="Έξοδος από την παρουσίαση"
                    title="Έξοδος"
                    className={iconButtonClass}
                >
                    <X className="w-4 h-4" />
                    <span className="sr-only">Έξοδος</span>
                </button>
            </div>

            <div className="relative z-10 pointer-events-none flex-shrink-0">
                <SlideHeader city={city} />
            </div>

            <div className="relative z-10 flex-1 min-h-0 overflow-hidden pointer-events-none">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={index}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="absolute inset-0 [&_button]:pointer-events-auto"
                    >
                        {currentSubject ? (
                            <SubjectSlide key={currentSubject.id} subject={currentSubject} />
                        ) : (
                            <MeetingInfoSlide
                                meeting={meeting}
                                city={city}
                                agendaCount={agendaSubjects.length}
                            />
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            <div className="absolute bottom-3 right-4 z-20 text-base text-muted-foreground font-mono tabular-nums pointer-events-none">
                {positionLabel}
            </div>

            <div className="relative z-20 flex items-center justify-center gap-2 py-3 flex-shrink-0 pointer-events-none">
                <div className="relative w-7 h-7">
                    <Image
                        src="/logo.png"
                        alt="OpenCouncil"
                        fill
                        sizes="28px"
                        style={{ objectFit: "contain" }}
                    />
                </div>
                <span className="text-sm text-muted-foreground">OpenCouncil</span>
            </div>
        </div>
    );
}

function NavClickZone({
    side,
    onClick,
    enabled,
}: {
    side: "left" | "right";
    onClick: () => void;
    enabled: boolean;
}) {
    const Chevron = side === "left" ? ChevronLeft : ChevronRight;
    const cursor = enabled
        ? side === "left" ? "cursor-w-resize" : "cursor-e-resize"
        : "cursor-default";
    const position = side === "left" ? "left-0" : "right-0";
    const chevronPosition = side === "left" ? "left-6" : "right-6";
    return (
        <button
            type="button"
            aria-label={side === "left" ? "Previous slide" : "Next slide"}
            onClick={onClick}
            disabled={!enabled}
            className={`absolute inset-y-0 ${position} w-1/2 z-0 group ${cursor}`}
        >
            {enabled && (
                <Chevron
                    className={`absolute ${chevronPosition} top-1/2 -translate-y-1/2 w-16 h-16 opacity-20 group-hover:opacity-60 transition-opacity pointer-events-none`}
                    strokeWidth={1.5}
                />
            )}
        </button>
    );
}
