"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Play, Star, Users, Tag, Quote, Clapperboard } from "lucide-react";
import { cn, formatTime, formatRelativeTime } from "@/lib/utils";
import { DownloadHighlightButton } from "./DownloadHighlightButton";
import { HighlightActionsMenu } from "./HighlightActionsMenu";
import { captureHighlight, type HighlightSurface } from "@/lib/highlights/analytics";

/** The rendered clip of a highlight. Absent while the video is still queued. */
export interface HighlightCardVideo {
    /** mp4 of the clip, which the download button saves. */
    url: string;
    /** Mux playback id, which supplies the still and the moving preview. */
    playbackId: string | null;
    /** Name of the saved file, without the extension. */
    fileName: string;
}

export interface HighlightCardData {
    id: string;
    name: string;
    /** The highlight detail view. */
    href: string;
    isShowcased: boolean;
    updatedAt: Date;
    duration: number;
    speakerCount: number;
    utteranceCount: number;
    /** Connected subject; null renders no subject line. */
    subjectName: string | null;
    /** Author, on surfaces that mix authors. Null hides the line. */
    creatorName: string | null;
    video?: HighlightCardVideo;
    /** Offers rename and delete. The server enforces the same rule. */
    canManage?: boolean;
}

// The still and the animation start at the same second, so that swapping one
// for the other does not jump. Mux renders both at the aspect ratio of the
// source, so a portrait clip gives a portrait image.
const PREVIEW_START_SECONDS = 1;
const PREVIEW_LENGTH_SECONDS = 5;

const POSTER_WIDTHS = [320, 480, 640, 800, 1080];

// The frame is about 270 CSS px at three columns and about 410 at two, so a
// fixed 800 wastes half the bytes on a standard display and falls short on a
// dense one. Let the browser pick.
const POSTER_SIZES = '(min-width: 1280px) 270px, (min-width: 640px) 410px, 100vw';

function posterUrl(playbackId: string, width = 640): string {
    return `https://image.mux.com/${playbackId}/thumbnail.webp?time=${PREVIEW_START_SECONDS}&width=${width}`;
}

function posterSrcSet(playbackId: string): string {
    return POSTER_WIDTHS.map(width => `${posterUrl(playbackId, width)} ${width}w`).join(', ');
}

// An animated still, not the mp4: a rendered highlight runs past a hundred
// megabytes, which is not a thing to spend on a pointer crossing a card. This
// is a few hundred kilobytes, needs no video element, and therefore plays under
// the same rules on a phone as on a desktop.
function previewUrl(playbackId: string): string {
    const end = PREVIEW_START_SECONDS + PREVIEW_LENGTH_SECONDS;
    return `https://image.mux.com/${playbackId}/animated.webp?width=320&start=${PREVIEW_START_SECONDS}&end=${end}`;
}

const prefersReducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Scrolling past a grid of cards must not spend a metered connection on motion
// the reader never asked for.
const prefersLessData = () =>
    typeof navigator !== 'undefined'
    && (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

/**
 * Shows the moving preview on intent and drops it on release.
 *
 * Intent is hover or keyboard focus on a pointer device, and enough of the card
 * being on screen on a touch device, which has no hover to give. Nothing is
 * fetched until the first intent, so a grid of cards costs a grid of stills. A
 * reader who asks for less motion, or for less data, keeps the still.
 */
const PREVIEW_DWELL_MS = 400;

function useClipPreview(playbackId: string | null | undefined) {
    const frameRef = useRef<HTMLDivElement>(null);
    const dwellRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Mounted on intent and dropped on release, so the animation opens on its
    // first frame every time rather than running on out of sight.
    const [armed, setArmed] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const start = useCallback(() => {
        if (!playbackId || prefersReducedMotion() || prefersLessData()) return;
        if (dwellRef.current) return;
        // A pointer crossing a card, or a scroll passing one, should cost
        // nothing. Only staying arms the fetch.
        dwellRef.current = setTimeout(() => setArmed(true), PREVIEW_DWELL_MS);
    }, [playbackId]);

    const stop = useCallback(() => {
        if (dwellRef.current) {
            clearTimeout(dwellRef.current);
            dwellRef.current = null;
        }
        setArmed(false);
        setLoaded(false);
    }, []);

    useEffect(() => () => {
        if (dwellRef.current) clearTimeout(dwellRef.current);
    }, []);

    useEffect(() => {
        if (!playbackId || prefersReducedMotion() || prefersLessData()) return;
        // A pointer device drives the preview from hover and focus, which the
        // card wires up directly. Only touch needs an observer.
        if (window.matchMedia('(hover: hover)').matches) return;

        const frame = frameRef.current;
        if (!frame) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                // A high threshold keeps this to the card the reader has
                // actually scrolled to, rather than every card on screen.
                if (entry.intersectionRatio >= 0.7) start();
                else stop();
            },
            { threshold: [0, 0.7] }
        );
        observer.observe(frame);
        return () => observer.disconnect();
    }, [playbackId, start, stop]);

    return { frameRef, armed, loaded, onLoaded: () => setLoaded(true), start, stop };
}

export function HighlightCard({
    data,
    surface,
    className,
    onRenamed,
    onDeleted,
}: {
    data: HighlightCardData;
    /** Where the card is rendered. Reported with every event. */
    surface: HighlightSurface;
    className?: string;
    /** Renamed, for a surface that holds its own copy of the highlight. */
    onRenamed?: (id: string, name: string) => void;
    /** Deleted, for a surface that holds its own copy of the highlight. */
    onDeleted?: (id: string) => void;
}) {
    const locale = useLocale();
    const t = useTranslations('highlights');
    const playbackId = data.video?.playbackId ?? null;
    const poster = playbackId ? posterUrl(playbackId) : null;
    const { frameRef, armed, loaded, onLoaded, start, stop } = useClipPreview(playbackId);
    // Read from the still once it decodes. A landscape clip fills the frame,
    // where a crop of a few percent costs nothing and a letterbox would look
    // like a mistake. A portrait clip is centred over the blurred backdrop
    // instead, because filling the frame with it would cut off the speaker.
    const [portrait, setPortrait] = useState<boolean | null>(null);
    const previewReported = useRef(false);
    const posterRef = useRef<HTMLImageElement>(null);
    // Read on load and again on mount: a cached still finishes decoding before
    // React attaches the handler, so onLoad alone never fires for it.
    const readOrientation = useCallback(() => {
        const poster = posterRef.current;
        if (!poster?.naturalWidth) return;
        setPortrait(poster.naturalHeight > poster.naturalWidth);
    }, []);
    useEffect(readOrientation, [readOrientation, playbackId]);
    const fit = portrait === false ? "object-cover" : "object-contain";

    const stats = [
        data.speakerCount > 0 ? { key: 'speakers', icon: Users, value: data.speakerCount, label: t('common.speakers') } : null,
        data.utteranceCount > 0 ? { key: 'utterances', icon: Quote, value: data.utteranceCount, label: t('common.utterances') } : null,
    ].filter(stat => stat !== null);

    return (
        // Not an anchor around everything: the download control is a button, and
        // a button inside a link is invalid and unreliable to click. The title
        // link stretches over the card instead, and the button sits above it.
        <div
            className={cn(
                "group/card relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card",
                "transition-shadow duration-200 hover:shadow-lg",
                "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                className
            )}
            onMouseEnter={start}
            onMouseLeave={stop}
        >
            <div ref={frameRef} className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
                {data.video ? (
                    <>
                        {/* Only for a portrait clip, which does not fill the frame:
                            a landscape one covers the backdrop completely, so
                            rendering it there costs a second decode and, because it
                            shares the poster URL, defeats the lazy load below.
                            Plain img, not next/image: Mux already serves these resized
                            over its own CDN, and image.mux.com is not a configured
                            optimizer host. */}
                        {poster && portrait === true && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                                src={poster}
                                alt=""
                                aria-hidden
                                loading="lazy"
                                decoding="async"
                                className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl saturate-150"
                            />
                        )}
                        {poster && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                                src={poster}
                                srcSet={posterSrcSet(playbackId!)}
                                sizes={POSTER_SIZES}
                                alt=""
                                ref={posterRef}
                                loading="lazy"
                                decoding="async"
                                onLoad={readOrientation}
                                className={cn("absolute inset-0 h-full w-full", fit)}
                            />
                        )}
                        {armed && playbackId && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                                src={previewUrl(playbackId)}
                                alt=""
                                aria-hidden
                                onLoad={() => {
                                    onLoaded();
                                    if (!previewReported.current) {
                                        previewReported.current = true;
                                        captureHighlight('preview_played', surface, { highlight_id: data.id });
                                    }
                                }}
                                className={cn(
                                    "absolute inset-0 h-full w-full transition-opacity duration-300",
                                    fit,
                                    loaded ? "opacity-100" : "opacity-0"
                                )}
                            />
                        )}

                        {/* Legibility floor for the pills, whatever the frame shows. */}
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />

                        <span
                            className={cn(
                                "pointer-events-none absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2",
                                "items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm",
                                "transition-all duration-300",
                                loaded ? "scale-90 opacity-0" : "opacity-100 group-hover/card:scale-110"
                            )}
                        >
                            <Play className="h-5 w-5 translate-x-[1px] fill-current" />
                        </span>
                    </>
                ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/60 px-4 text-center text-muted-foreground">
                        <Clapperboard className="h-7 w-7 opacity-60" />
                        <span className="text-xs">{t('details.generating')}</span>
                    </div>
                )}

                {data.duration > 0 && (
                    <span className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/65 px-1.5 py-0.5 font-mono text-[11px] font-medium text-white tabular-nums">
                        {formatTime(data.duration)}
                    </span>
                )}

                {/* Bottom right, clear of the speaker name that the rendered clip
                    burns into its own top left corner. */}
                {data.isShowcased && (
                    <span
                        className="pointer-events-none absolute bottom-2 right-2 flex items-center rounded-md bg-black/65 p-1"
                        title={t('details.showcased')}
                    >
                        <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                        <span className="sr-only">{t('details.showcased')}</span>
                    </span>
                )}

                {data.video && (
                    // Above the stretched title link, so the click reaches the button.
                    <div
                        className={cn(
                            "absolute right-2 top-2 z-10 flex items-center gap-1 transition-opacity duration-200",
                            "opacity-0 focus-within:opacity-100 group-hover/card:opacity-100",
                            // Nothing hovers on a touch screen, so keep it visible there.
                            "[@media(hover:none)]:opacity-100"
                        )}
                    >
                        <DownloadHighlightButton
                                videoUrl={data.video.url}
                                fileName={data.video.fileName}
                                showLabel={false}
                                size="icon"
                                className="h-8 w-8 border-transparent bg-black/65 text-white hover:bg-black/85 hover:text-white"
                            onDownload={() => captureHighlight('downloaded', surface, { highlight_id: data.id })}
                        />
                    </div>
                )}
            </div>

            <div className="flex flex-1 flex-col gap-1.5 p-3">
                <h3 className="text-sm font-semibold leading-snug text-foreground">
                    <Link
                        href={data.href}
                        onFocus={start}
                        onBlur={stop}
                        onClick={() => captureHighlight('opened', surface, {
                            highlight_id: data.id,
                            has_video: !!data.video,
                        })}
                        // Stretches the link over the whole card, so anywhere that
                        // is not the download button opens the highlight.
                        className="line-clamp-2 no-underline after:absolute after:inset-0 hover:no-underline focus:outline-none"
                    >
                        {data.name}
                    </Link>
                </h3>

                {data.subjectName && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Tag className="h-3 w-3 shrink-0" aria-hidden />
                        <span className="line-clamp-1">{data.subjectName}</span>
                    </p>
                )}

                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1.5 text-[11px] text-muted-foreground">
                    {stats.map(({ key, icon: Icon, value, label }) => (
                        <span key={key} className="flex items-center gap-1">
                            <Icon className="h-3 w-3" aria-hidden />
                            <span className="tabular-nums">{value}</span>
                            <span className="sr-only">{label}</span>
                        </span>
                    ))}
                    {data.creatorName && (
                        <span className="line-clamp-1 max-w-[45%]">{data.creatorName}</span>
                    )}
                    {/* Relative to the moment of render, so the server and the
                        client can land either side of a minute boundary. */}
                    <span className="ml-auto whitespace-nowrap text-muted-foreground/70" suppressHydrationWarning>
                        {formatRelativeTime(data.updatedAt, locale)}
                    </span>
                    {data.canManage && (
                        // In the footer and always visible: a control that only
                        // appears on hover, over the video, is one nobody finds.
                        // Raised above the stretched title link, so the click
                        // opens the menu rather than the highlight.
                        <div className="relative z-10 -my-1 -mr-1">
                            <HighlightActionsMenu
                                highlightId={data.id}
                                name={data.name}
                                surface={surface}
                                onRenamed={name => onRenamed?.(data.id, name)}
                                onDeleted={() => onDeleted?.(data.id)}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
